import { BUILDING_KEYS, ENEMY_AI_ARCHETYPES, TURN_SIDES, UNIT_TAGS } from "../../core/constants.js";
import { MAP_GOAL_TYPES } from "../../content/mapGoals.js";
import { getBuildingSupplyPreview } from "../battleServicing.js";
import { canCaptureBuilding } from "../captureRules.js";
import { getMovementModifier } from "../commanderEffects.js";
import { getAttackRangeCap, getPositionArmorBonus } from "../combatResolver.js";
import {
  canUnitAttackTarget,
  getAttackProfileForTarget,
  getBuildingAt,
  getLivingUnits,
  getMovementDistanceMapToTiles,
  getReachableTiles,
  getUnitAt,
  getUnitMovementAllowance
} from "../selectors.js";
import { getSupportNeedScore, unitNeedsService } from "../supportScoring.js";
import {
  getScoredAttackOptions,
  isAttackAcceptable,
  pickBestAvailableAttack
} from "./attackScoring.js";
import { getEnemyAiArchetype, getEnemyAiProfile } from "./profiles.js";
import {
  compareSlipstreamCandidates,
  getNearestPlayerDistance,
  getPlayerAttackThreatMargin,
  getPlayerCommandBuilding,
  getPlayerMovementThreatMargin,
  takeRandomInt
} from "./shared.js";

const objectiveRouteDistanceMapsByState = new WeakMap();

function canRepairUnitAtBuilding(state, unit, building) {
  return getBuildingSupplyPreview(state, unit, building).changed;
}

function wantsRepairMode(state, unit) {
  if (!unit || unit.transport?.carriedByUnitId || !unitNeedsService(state, unit)) {
    return false;
  }

  const profile = getEnemyAiProfile(state);
  const healthRatio = unit.stats.maxHealth > 0 ? unit.current.hp / unit.stats.maxHealth : 1;
  const missingAmmoRatio =
    unit.stats.ammoMax > 0 ? (unit.stats.ammoMax - unit.current.ammo) / unit.stats.ammoMax : 0;
  const missingStaminaRatio =
    unit.stats.staminaMax > 0
      ? (unit.stats.staminaMax - unit.current.stamina) / unit.stats.staminaMax
      : 0;

  return (
    healthRatio <= profile.repairHealthRatio ||
    missingAmmoRatio >= 0.5 ||
    missingStaminaRatio >= 0.5 ||
    (unit.cooldowns?.repairMode ?? 0) > 0
  );
}

function getBuildingCapturePriority(building) {
  const typePriority = {
    [BUILDING_KEYS.SECTOR]: 40,
    [BUILDING_KEYS.BARRACKS]: 34,
    [BUILDING_KEYS.MOTOR_POOL]: 34,
    [BUILDING_KEYS.AIRFIELD]: 34,
    [BUILDING_KEYS.HOSPITAL]: 32,
    [BUILDING_KEYS.REPAIR_STATION]: 32,
    [BUILDING_KEYS.COMMAND]: 28
  };

  return (typePriority[building.type] ?? 20) + (building.owner === "neutral" ? 18 : 6);
}

function getObjectiveTileKey(tile) {
  return `${tile.x},${tile.y}`;
}

function getObjectiveRouteDistanceCacheKey(unit, targetTiles) {
  const gearSlot = unit.gear?.slot ?? "";
  const targetKey = targetTiles.map(getObjectiveTileKey).join("|");
  return `${unit.id}:${unit.unitTypeId}:${unit.family}:${gearSlot}:${targetKey}`;
}

function getObjectiveRouteDistanceMap(state, unit, targetTiles) {
  let distanceMaps = objectiveRouteDistanceMapsByState.get(state);

  if (!distanceMaps) {
    distanceMaps = new Map();
    objectiveRouteDistanceMapsByState.set(state, distanceMaps);
  }

  const cacheKey = getObjectiveRouteDistanceCacheKey(unit, targetTiles);
  const cachedDistanceMap = distanceMaps.get(cacheKey);

  if (cachedDistanceMap) {
    return cachedDistanceMap;
  }

  const distanceMap = getMovementDistanceMapToTiles(state, unit, targetTiles);
  distanceMaps.set(cacheKey, distanceMap);
  return distanceMap;
}

function getBestObjectiveRouteDistance(state, unit, tile, targetTiles) {
  const distanceMap = getObjectiveRouteDistanceMap(state, unit, targetTiles);
  return distanceMap.get(getObjectiveTileKey(tile)) ?? Number.POSITIVE_INFINITY;
}

function getRouteProgressInfo(state, unit, tile, targetTiles) {
  const routeDistance = getBestObjectiveRouteDistance(state, unit, tile, targetTiles);

  if (!Number.isFinite(routeDistance)) {
    return {
      routeDistance,
      routeImprovement: 0
    };
  }

  const currentRouteDistance = getBestObjectiveRouteDistance(
    state,
    unit,
    { x: unit.x, y: unit.y },
    targetTiles
  );

  return {
    routeDistance,
    routeImprovement: Number.isFinite(currentRouteDistance)
      ? currentRouteDistance - routeDistance
      : 0
  };
}

function scoreRouteProgress(
  state,
  unit,
  tile,
  targetTiles,
  {
    maxDistance = 16,
    distanceWeight = 10,
    improvementWeight = 20,
    arrivalBonus = 0
  } = {}
) {
  const { routeDistance, routeImprovement } = getRouteProgressInfo(
    state,
    unit,
    tile,
    targetTiles
  );

  if (!Number.isFinite(routeDistance)) {
    return 0;
  }

  return (
    (routeDistance === 0 ? arrivalBonus : 0) +
    Math.max(0, maxDistance - routeDistance) * distanceWeight +
    routeImprovement * improvementWeight
  );
}

function getCaptureObjectiveScore(state, unit, tile) {
  if (unit.family !== UNIT_TAGS.INFANTRY) {
    return Number.NEGATIVE_INFINITY;
  }

  return state.map.buildings
    .filter((building) => canCaptureBuilding(unit, building))
    .map((building) => {
      const targetTiles = [{ x: building.x, y: building.y }];
      const { routeDistance, routeImprovement } = getRouteProgressInfo(
        state,
        unit,
        tile,
        targetTiles
      );

      if (!Number.isFinite(routeDistance)) {
        return Number.NEGATIVE_INFINITY;
      }

      return (
        getBuildingCapturePriority(building) * 3 +
        (routeDistance === 0 ? 140 : 0) +
        Math.max(0, 9 - routeDistance) * 18 +
        routeImprovement * 26
      );
    })
    .sort((left, right) => right - left)[0] ?? Number.NEGATIVE_INFINITY;
}

function getTilesInRangeOfTarget(state, target, minimumRange, maximumRange) {
  const tiles = [];

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const distance = Math.abs(x - target.x) + Math.abs(y - target.y);

      if (distance >= minimumRange && distance <= maximumRange) {
        tiles.push({ x, y });
      }
    }
  }

  return tiles;
}

function getAttackStagingTilesForTarget(state, unit, target) {
  if (!canUnitAttackTarget(unit, target)) {
    return [];
  }

  const attackProfile = getAttackProfileForTarget(unit, target);

  if (!attackProfile) {
    return [];
  }

  return getTilesInRangeOfTarget(
    state,
    target,
    attackProfile.minRange,
    getAttackRangeCap(state, unit, attackProfile)
  );
}

function getPlayerPressureTargetTiles(state, unit) {
  const attackTiles = getLivingUnits(state, TURN_SIDES.PLAYER)
    .flatMap((playerUnit) => getAttackStagingTilesForTarget(state, unit, playerUnit));

  if (attackTiles.length > 0) {
    return attackTiles;
  }

  return getLivingUnits(state, TURN_SIDES.PLAYER)
    .flatMap((playerUnit) => [
      { x: playerUnit.x + 1, y: playerUnit.y },
      { x: playerUnit.x - 1, y: playerUnit.y },
      { x: playerUnit.x, y: playerUnit.y + 1 },
      { x: playerUnit.x, y: playerUnit.y - 1 }
    ])
    .filter((tile) => isInsideMap(state, tile));
}

function getNearestPlayerRouteDistance(state, unit, tile) {
  const targetTiles = getPlayerPressureTargetTiles(state, unit);

  if (targetTiles.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return getBestObjectiveRouteDistance(state, unit, tile, targetTiles);
}

function getPressureScore(state, unit, tile) {
  const nearestPlayerDistance = getNearestPlayerRouteDistance(state, unit, tile);

  if (!Number.isFinite(nearestPlayerDistance)) {
    return 0;
  }

  return Math.max(0, 18 - nearestPlayerDistance) * 9;
}

function getCommandRushScore(state, unit, tile) {
  const playerCommand = getPlayerCommandBuilding(state);

  if (!playerCommand) {
    return 0;
  }

  return scoreRouteProgress(
    state,
    unit,
    tile,
    [{ x: playerCommand.x, y: playerCommand.y }],
    {
      maxDistance: 18,
      distanceWeight: 12,
      improvementWeight: 24,
      arrivalBonus: 120
    }
  );
}

function isInsideMap(state, tile) {
  return (
    Number.isInteger(tile?.x) &&
    Number.isInteger(tile?.y) &&
    tile.x >= 0 &&
    tile.y >= 0 &&
    tile.x < state.map.width &&
    tile.y < state.map.height
  );
}

function getDefendTargetApproachTiles(state, target) {
  return [
    { x: target.x + 1, y: target.y },
    { x: target.x - 1, y: target.y },
    { x: target.x, y: target.y + 1 },
    { x: target.x, y: target.y - 1 }
  ].filter((tile) => isInsideMap(state, tile));
}

function getDefendTargetApproachScore(state, unit, tile, target) {
  const targetTiles = getDefendTargetApproachTiles(state, target);
  const directDistance = Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y);

  return (
    scoreRouteProgress(
      state,
      unit,
      tile,
      targetTiles,
      {
        maxDistance: 28,
        distanceWeight: 24,
        improvementWeight: 44,
        arrivalBonus: 560
      }
    ) +
    Math.max(0, 7 - directDistance) * 8
  );
}

function getMissionObjectiveScore(state, unit, tile) {
  const mission = state.mission;

  if (!mission) {
    return 0;
  }

  if (mission.type === MAP_GOAL_TYPES.HQ_CAPTURE) {
    return getCommandRushScore(state, unit, tile) * 1.5 + Math.max(0, getCaptureObjectiveScore(state, unit, tile)) * 0.4;
  }

  if (mission.type === MAP_GOAL_TYPES.RESCUE) {
    if (mission.rescue?.status === "carried") {
      const carrier = mission.rescue.carrierUnitId
        ? state.player.units.find((candidate) => candidate.id === mission.rescue.carrierUnitId) ?? null
        : null;
      const carrierTiles = carrier
        ? getAttackStagingTilesForTarget(state, unit, carrier)
        : [];
      const carrierScore = carrierTiles.length > 0
        ? scoreRouteProgress(state, unit, tile, carrierTiles, {
            maxDistance: 20,
            distanceWeight: 15,
            improvementWeight: 26,
            arrivalBonus: 90
          })
        : 0;
      const hqScore = mission.playerHq
        ? scoreRouteProgress(
            state,
            unit,
            tile,
            [{ x: mission.playerHq.x, y: mission.playerHq.y }],
            {
              maxDistance: 16,
              distanceWeight: 8,
              improvementWeight: 14
            }
          )
        : 0;

      return carrierScore + hqScore * 0.6;
    }

    if (mission.target) {
      return scoreRouteProgress(
        state,
        unit,
        tile,
        [{ x: mission.target.x, y: mission.target.y }],
        {
          maxDistance: 18,
          distanceWeight: 11,
          improvementWeight: 22,
          arrivalBonus: 80
        }
      );
    }

    return 0;
  }

  if (mission.type === MAP_GOAL_TYPES.DEFEND && mission.target) {
    return getDefendTargetApproachScore(state, unit, tile, mission.target);
  }

  if (mission.type === MAP_GOAL_TYPES.SURVIVE) {
    return getPressureScore(state, unit, tile) * 1.45 + getCommandRushScore(state, unit, tile) * 0.5;
  }

  return 0;
}

function getTileSafetyScore(state, unit, tile) {
  const positionedUnit = {
    ...unit,
    x: tile.x,
    y: tile.y
  };
  const attackThreatMargin = getPlayerAttackThreatMargin(state, positionedUnit, tile);
  const movementThreatMargin = getPlayerMovementThreatMargin(state, positionedUnit, tile);

  return (
    (attackThreatMargin > 0 ? 14 : attackThreatMargin * 7) +
    (movementThreatMargin > 0 ? 20 : movementThreatMargin * 8) +
    getPositionArmorBonus(state, positionedUnit) * 5
  );
}

// This is the AI's central map-position score. The tactical helpers all feed
// through it so each archetype can bias pressure, safety, and objectives without
// duplicating movement heuristics across every action picker.
export function getStrategicObjectiveScore(state, unit, tile) {
  const profile = getEnemyAiProfile(state);
  const archetype = getEnemyAiArchetype(state);
  const missionType = state.mission?.type ?? MAP_GOAL_TYPES.ROUT;

  if (missionType === MAP_GOAL_TYPES.HQ_CAPTURE) {
    const commandScore = getCommandRushScore(state, unit, tile);
    const safetyScore = getTileSafetyScore(state, unit, tile);
    const missionObjectiveScore = getMissionObjectiveScore(state, unit, tile);
    return commandScore * Math.max(1.3, profile.objectiveWeight) + missionObjectiveScore + safetyScore * profile.safetyWeight;
  }

  if (missionType === MAP_GOAL_TYPES.RESCUE) {
    const missionObjectiveScore = getMissionObjectiveScore(state, unit, tile);
    const pressureScore = getPressureScore(state, unit, tile);
    const safetyScore = getTileSafetyScore(state, unit, tile);
    return missionObjectiveScore + pressureScore * 0.7 + safetyScore * profile.safetyWeight;
  }

  if (missionType === MAP_GOAL_TYPES.DEFEND) {
    const missionObjectiveScore = getMissionObjectiveScore(state, unit, tile);
    const safetyScore = getTileSafetyScore(state, unit, tile);
    return (
      missionObjectiveScore * Math.max(1.4, profile.objectiveWeight) +
      safetyScore * profile.safetyWeight * 0.3
    );
  }

  if (missionType === MAP_GOAL_TYPES.SURVIVE) {
    const missionObjectiveScore = getMissionObjectiveScore(state, unit, tile);
    const pressureScore = getPressureScore(state, unit, tile);
    const commandScore = getCommandRushScore(state, unit, tile);
    const safetyScore = getTileSafetyScore(state, unit, tile);
    return missionObjectiveScore + pressureScore * 1.2 + commandScore * 0.4 + safetyScore * 0.7;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE) {
    const pressureScore = getPressureScore(state, unit, tile);
    const commandScore = getCommandRushScore(state, unit, tile);
    const safetyScore = getTileSafetyScore(state, unit, tile);
    return pressureScore * 1.3 + commandScore * 0.45 + safetyScore * profile.safetyWeight;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.TURTLE) {
    const captureScore = getCaptureObjectiveScore(state, unit, tile);
    const pressureScore = getPressureScore(state, unit, tile);
    const safetyScore = getTileSafetyScore(state, unit, tile);
    return safetyScore * profile.safetyWeight + pressureScore * 0.45 + Math.max(0, captureScore) * 0.3;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.CAPTURE) {
    const captureScore = getCaptureObjectiveScore(state, unit, tile);
    const pressureScore = getPressureScore(state, unit, tile);
    const safetyScore = getTileSafetyScore(state, unit, tile);
    return Math.max(0, captureScore) * profile.objectiveWeight + pressureScore * 0.45 + safetyScore;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HQ_RUSH) {
    const commandScore = getCommandRushScore(state, unit, tile);
    const pressureScore = getPressureScore(state, unit, tile);
    const safetyScore = getTileSafetyScore(state, unit, tile);
    return commandScore * profile.objectiveWeight + pressureScore * 0.6 + safetyScore * profile.safetyWeight;
  }

  const captureScore = getCaptureObjectiveScore(state, unit, tile);
  const pressureScore = getPressureScore(state, unit, tile);
  const commandScore = getCommandRushScore(state, unit, tile);
  const safetyScore = getTileSafetyScore(state, unit, tile);

  return (
    Math.max(0, captureScore) * 0.6 +
    pressureScore * profile.pressureWeight +
    commandScore * 0.35 +
    safetyScore * profile.safetyWeight
  );
}

export function getBestSupportPlan(state, unit) {
  const targetFamily =
    unit.unitTypeId === "medic"
      ? UNIT_TAGS.INFANTRY
      : unit.unitTypeId === "mechanic"
        ? UNIT_TAGS.VEHICLE
        : null;

  if (!targetFamily || (unit.cooldowns?.support ?? 0) > 0 || unit.transport?.carriedByUnitId) {
    return null;
  }

  return getLivingUnits(state, unit.owner)
    .filter((candidate) => {
      if (
        candidate.id === unit.id ||
        candidate.family !== targetFamily ||
        candidate.transport?.carriedByUnitId ||
        !unitNeedsService(state, candidate)
      ) {
        return false;
      }

      return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
    })
    .map((target) => ({
      target,
      score: getSupportNeedScore(state, target) + Math.max(1, target.cost / 200)
    }))
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

export function getCapturePlans(state, unit, reachableTiles) {
  if (unit.family !== UNIT_TAGS.INFANTRY) {
    return [];
  }

  return state.map.buildings
    .filter((building) => canCaptureBuilding(unit, building))
    .map((building) => {
      const targetTiles = [{ x: building.x, y: building.y }];
      const occupant = getUnitAt(state, building.x, building.y);
      const directTile =
        (!occupant || occupant.id === unit.id) &&
        reachableTiles.find((tile) => tile.x === building.x && tile.y === building.y);
      const bestApproachTile = directTile
        ? directTile
        : reachableTiles
            .map((tile) => ({
              ...tile,
              routeDistance: getBestObjectiveRouteDistance(
                state,
                unit,
                tile,
                targetTiles
              )
            }))
            .filter((tile) => Number.isFinite(tile.routeDistance))
            .sort(
              (left, right) =>
                left.routeDistance - right.routeDistance ||
                left.y - right.y ||
                left.x - right.x
            )[0];

      if (!bestApproachTile) {
        return null;
      }

      const {
        routeDistance: distanceFromBuilding,
        routeImprovement: distanceImprovement
      } = getRouteProgressInfo(state, unit, bestApproachTile, targetTiles);
      const isCurrentTile = building.x === unit.x && building.y === unit.y;

      if (!directTile && distanceImprovement <= 0) {
        return null;
      }

      return {
        building,
        tile: bestApproachTile,
        canCaptureAfterMove: Boolean(directTile),
        score:
          getBuildingCapturePriority(building) +
          (directTile ? 120 : 0) +
          (isCurrentTile ? 80 : 0) +
          distanceImprovement * 4 -
          distanceFromBuilding * 1.5
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.building.id.localeCompare(right.building.id)
    );
}

export function getBestCapturePlan(state, unit, reachableTiles) {
  return getCapturePlans(state, unit, reachableTiles)[0] ?? null;
}

export function getRepairPlans(state, unit, reachableTiles) {
  if (!wantsRepairMode(state, unit)) {
    return [];
  }

  const currentBuilding = getBuildingAt(state, unit.x, unit.y);

  if (canRepairUnitAtBuilding(state, unit, currentBuilding)) {
    const preview = getBuildingSupplyPreview(state, unit, currentBuilding);
    return [
      {
        building: currentBuilding,
        tile: { x: unit.x, y: unit.y },
        canRepairAfterMove: true,
        isCurrentTile: true,
        needScore: preview.needScore,
        score: 999 + preview.needScore
      }
    ];
  }

  return state.map.buildings
    .filter((building) => canRepairUnitAtBuilding(state, unit, building))
    .map((building) => {
      const preview = getBuildingSupplyPreview(state, unit, building);
      const targetTiles = [{ x: building.x, y: building.y }];
      const occupant = getUnitAt(state, building.x, building.y);
      const directTile =
        (!occupant || occupant.id === unit.id) &&
        reachableTiles.find((tile) => tile.x === building.x && tile.y === building.y);
      const bestApproachTile = directTile
        ? directTile
        : reachableTiles
            .map((tile) => ({
              ...tile,
              routeDistance: getBestObjectiveRouteDistance(
                state,
                unit,
                tile,
                targetTiles
              )
            }))
            .filter((tile) => Number.isFinite(tile.routeDistance))
            .sort(
              (left, right) =>
                left.routeDistance - right.routeDistance ||
                left.y - right.y ||
                left.x - right.x
            )[0];

      if (!bestApproachTile) {
        return null;
      }

      const {
        routeDistance: distanceFromBuilding,
        routeImprovement: distanceImprovement
      } = getRouteProgressInfo(state, unit, bestApproachTile, targetTiles);

      if (!directTile && distanceImprovement <= 0) {
        return null;
      }

      return {
        building,
        tile: bestApproachTile,
        canRepairAfterMove: Boolean(directTile),
        isCurrentTile: false,
        needScore: preview.needScore,
        score:
          preview.needScore +
          (directTile ? 150 : 0) +
          (
            building.type === BUILDING_KEYS.REPAIR_STATION ||
            building.type === BUILDING_KEYS.HOSPITAL
              ? 18
              : building.type === BUILDING_KEYS.COMMAND
                ? 10
                : 0
          ) +
          distanceImprovement * 12 -
          distanceFromBuilding * 3
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.building.id.localeCompare(right.building.id)
    );
}

export function getBestRepairPlan(state, unit, reachableTiles) {
  return getRepairPlans(state, unit, reachableTiles)[0] ?? null;
}

export function getScoredMoveAttackOptions(
  state,
  unit,
  reachableTiles,
  { allowRisky = false, maxTilesPerTarget = Number.POSITIVE_INFINITY } = {}
) {
  const originalPosition = { x: unit.x, y: unit.y };
  const candidates = [];

  try {
    for (const tile of reachableTiles) {
      unit.x = tile.x;
      unit.y = tile.y;

      const scoredOptions = getScoredAttackOptions(state, unit);
      let attackOptions = scoredOptions.filter((option) =>
        isAttackAcceptable(state, option, { allowRisky })
      );

      if (allowRisky && attackOptions.length === 0 && scoredOptions[0]) {
        attackOptions = [scoredOptions[0]];
      }

      for (const attackOption of attackOptions) {
        const movementDistance =
          Math.abs(originalPosition.x - tile.x) +
          Math.abs(originalPosition.y - tile.y);
        const movementPenalty = attackOption.trade.isRangedAttack
          ? movementDistance * 0.35
          : movementDistance * 2.2;
        const score =
          attackOption.trade.score +
          (attackOption.trade.isEffective ? 5 : 0) +
          (attackOption.trade.isRangedAttack ? 4 : 0) +
          getStrategicObjectiveScore(state, unit, tile) * 0.08 -
          movementPenalty;

        candidates.push({
          ...attackOption,
          tile: { x: tile.x, y: tile.y },
          movementDistance,
          score
        });
      }
    }
  } finally {
    unit.x = originalPosition.x;
    unit.y = originalPosition.y;
  }

  const targetTileCounts = new Map();

  return candidates
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.target.id.localeCompare(right.target.id) ||
        left.tile.y - right.tile.y ||
        left.tile.x - right.tile.x
    )
    .filter((candidate) => {
      const count = targetTileCounts.get(candidate.target.id) ?? 0;

      if (count >= maxTilesPerTarget) {
        return false;
      }

      targetTileCounts.set(candidate.target.id, count + 1);
      return true;
    });
}

export function getBestMoveAttackOption(state, unit, reachableTiles, { allowRisky = false } = {}) {
  return getScoredMoveAttackOptions(state, unit, reachableTiles, { allowRisky })[0] ?? null;
}

export function pickEnemySlipstreamTile(state, unit, reachableTiles) {
  if (getLivingUnits(state, TURN_SIDES.PLAYER).length === 0) {
    return { x: unit.x, y: unit.y };
  }

  const candidateTiles = reachableTiles.length > 0
    ? reachableTiles
    : [{ x: unit.x, y: unit.y }];
  const rankedTiles = candidateTiles
    .map((tile) => {
      const positionedUnit = {
        ...unit,
        x: tile.x,
        y: tile.y
      };
      const attackThreatMargin = getPlayerAttackThreatMargin(state, positionedUnit, tile);
      const movementThreatMargin = getPlayerMovementThreatMargin(state, positionedUnit, tile);

      return {
        ...tile,
        nearestPlayerDistance: getNearestPlayerDistance(state, tile),
        attackThreatMargin,
        movementThreatMargin,
        positionArmorBonus: getPositionArmorBonus(state, positionedUnit),
        isSafeFromImmediateThreat: attackThreatMargin > 0,
        isSafeFromMovementThreat: movementThreatMargin > 0,
        isCurrentTile: tile.x === unit.x && tile.y === unit.y
      };
    })
    .sort(compareSlipstreamCandidates);

  return rankedTiles[0] ?? { x: unit.x, y: unit.y };
}

export function pickFallbackMovementTile(state, unit, reachableTiles) {
  if (getLivingUnits(state, TURN_SIDES.PLAYER).length === 0) {
    return { x: unit.x, y: unit.y, intent: "stage" };
  }

  const profile = getEnemyAiProfile(state);
  const currentTile = { x: unit.x, y: unit.y };
  const currentObjectiveScore = getStrategicObjectiveScore(state, unit, currentTile);
  const currentNearestDistance = getNearestPlayerRouteDistance(state, unit, currentTile);
  const currentMovementThreatMargin = getPlayerMovementThreatMargin(state, unit, currentTile);
  const shouldFallBack =
    currentMovementThreatMargin <= 0 &&
    unit.current.hp / Math.max(1, unit.stats.maxHealth) <= profile.repairHealthRatio;

  const rankedTiles = reachableTiles
    .map((tile) => {
      const nearestPlayerDistance = getNearestPlayerRouteDistance(state, unit, tile);
      const fallbackNearestPlayerDistance = Number.isFinite(nearestPlayerDistance)
        ? nearestPlayerDistance
        : getNearestPlayerDistance(state, tile);
      const movementDistance = Math.abs(tile.x - unit.x) + Math.abs(tile.y - unit.y);
      const attackThreatMargin = getPlayerAttackThreatMargin(state, unit, tile);
      const movementThreatMargin = getPlayerMovementThreatMargin(state, unit, tile);
      const distanceImprovement =
        Number.isFinite(currentNearestDistance) && Number.isFinite(nearestPlayerDistance)
          ? currentNearestDistance - nearestPlayerDistance
          : 0;
      const safetyScore = getTileSafetyScore(state, unit, tile);
      const strategicObjectiveScore = getStrategicObjectiveScore(state, unit, tile);
      const stagingScore =
        strategicObjectiveScore * profile.objectiveWeight +
        safetyScore * profile.safetyWeight +
        distanceImprovement * 6 * profile.pressureWeight -
        movementDistance * 0.35 +
        takeRandomInt(state, 0, 4);
      const fallbackScore =
        safetyScore * (profile.safetyWeight + 0.6) +
        fallbackNearestPlayerDistance * 4 -
        movementDistance -
        (attackThreatMargin > 0 ? 8 : 0) +
        (movementThreatMargin > 0 ? 16 : movementThreatMargin * 6) +
        takeRandomInt(state, 0, 4);

      return {
        ...tile,
        intent:
          shouldFallBack
            ? "fallback"
            : strategicObjectiveScore > currentObjectiveScore + 8
              ? "advance"
              : "stage",
        score: shouldFallBack ? fallbackScore : stagingScore
      };
    })
    .sort((left, right) => right.score - left.score);

  return rankedTiles[0] ?? currentTile;
}

export function isUnitPinnedByThreat(state, unit, reachableTiles) {
  const currentTile = { x: unit.x, y: unit.y };

  if (getPlayerMovementThreatMargin(state, unit, currentTile) > 0) {
    return false;
  }

  return !reachableTiles.some((tile) => getPlayerMovementThreatMargin(state, unit, tile) > 0);
}

export function hasEnemyAttackOpportunity(state) {
  const enemyUnits = getLivingUnits(state, TURN_SIDES.ENEMY)
    .filter((unit) => !unit.hasMoved && !unit.hasAttacked && !unit.transport?.carriedByUnitId);

  return enemyUnits.some((unit) => {
    if (pickBestAvailableAttack(state, unit)) {
      return true;
    }

    const movementBudget = getUnitMovementAllowance(
      unit,
      unit.stats.movement + getMovementModifier(state, unit)
    );
    const reachableTiles = getReachableTiles(state, unit, movementBudget);
    return Boolean(getBestMoveAttackOption(state, unit, reachableTiles, { allowRisky: true }));
  });
}
