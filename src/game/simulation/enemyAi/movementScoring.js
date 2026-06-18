import { BUILDING_KEYS, ENEMY_AI_ARCHETYPES, TURN_SIDES, UNIT_TAGS } from "../../core/constants.js";
import { MAP_GOAL_TYPES } from "../../content/mapGoals.js";
import { getBuildingSupplyPreview } from "../battleServicing.js";
import { canCaptureBuilding } from "../captureRules.js";
import { getMovementModifier } from "../commanderEffects.js";
import { getPositionArmorBonus } from "../combatResolver.js";
import {
  getBuildingAt,
  getLivingUnits,
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

function getCaptureObjectiveScore(state, unit, tile) {
  if (unit.family !== UNIT_TAGS.INFANTRY) {
    return Number.NEGATIVE_INFINITY;
  }

  return state.map.buildings
    .filter((building) => canCaptureBuilding(unit, building))
    .map((building) => {
      const distance = Math.abs(tile.x - building.x) + Math.abs(tile.y - building.y);
      return (
        getBuildingCapturePriority(building) * 3 +
        (distance === 0 ? 140 : 0) +
        Math.max(0, 7 - distance) * 14
      );
    })
    .sort((left, right) => right - left)[0] ?? Number.NEGATIVE_INFINITY;
}

function getPressureScore(state, tile) {
  const nearestPlayerDistance = getNearestPlayerDistance(state, tile);
  return Math.max(0, 14 - nearestPlayerDistance) * 8;
}

function getCommandRushScore(state, tile) {
  const playerCommand = getPlayerCommandBuilding(state);

  if (!playerCommand) {
    return 0;
  }

  const distance = Math.abs(tile.x - playerCommand.x) + Math.abs(tile.y - playerCommand.y);
  return Math.max(0, 16 - distance) * 9 + (distance === 0 ? 120 : 0);
}

function getMissionObjectiveScore(state, unit, tile) {
  const mission = state.mission;

  if (!mission) {
    return 0;
  }

  if (mission.type === MAP_GOAL_TYPES.HQ_CAPTURE) {
    return getCommandRushScore(state, tile) * 1.5 + Math.max(0, getCaptureObjectiveScore(state, unit, tile)) * 0.4;
  }

  if (mission.type === MAP_GOAL_TYPES.RESCUE) {
    if (mission.rescue?.status === "carried") {
      const carrier = mission.rescue.carrierUnitId
        ? state.player.units.find((candidate) => candidate.id === mission.rescue.carrierUnitId) ?? null
        : null;
      const carrierDistance = carrier
        ? Math.abs(tile.x - carrier.x) + Math.abs(tile.y - carrier.y)
        : Number.POSITIVE_INFINITY;
      const hqDistance = mission.playerHq
        ? Math.abs(tile.x - mission.playerHq.x) + Math.abs(tile.y - mission.playerHq.y)
        : Number.POSITIVE_INFINITY;

      return Math.max(0, 16 - carrierDistance) * 12 + Math.max(0, 12 - hqDistance) * 8;
    }

    if (mission.target) {
      const targetDistance = Math.abs(tile.x - mission.target.x) + Math.abs(tile.y - mission.target.y);
      return Math.max(0, 16 - targetDistance) * 11;
    }

    return 0;
  }

  if (mission.type === MAP_GOAL_TYPES.DEFEND && mission.target) {
    const targetDistance = Math.abs(tile.x - mission.target.x) + Math.abs(tile.y - mission.target.y);
    return (targetDistance === 1 ? 180 : 0) + Math.max(0, 10 - targetDistance) * 18;
  }

  if (mission.type === MAP_GOAL_TYPES.SURVIVE) {
    return getPressureScore(state, tile) * 1.45 + getCommandRushScore(state, tile) * 0.5;
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
  const captureScore = getCaptureObjectiveScore(state, unit, tile);
  const pressureScore = getPressureScore(state, tile);
  const commandScore = getCommandRushScore(state, tile);
  const safetyScore = getTileSafetyScore(state, unit, tile);
  const missionObjectiveScore = getMissionObjectiveScore(state, unit, tile);

  if (missionType === MAP_GOAL_TYPES.HQ_CAPTURE) {
    return commandScore * Math.max(1.3, profile.objectiveWeight) + missionObjectiveScore + safetyScore * profile.safetyWeight;
  }

  if (missionType === MAP_GOAL_TYPES.RESCUE) {
    return missionObjectiveScore + pressureScore * 0.7 + safetyScore * profile.safetyWeight;
  }

  if (missionType === MAP_GOAL_TYPES.DEFEND) {
    return missionObjectiveScore + pressureScore * 0.5 + safetyScore * profile.safetyWeight;
  }

  if (missionType === MAP_GOAL_TYPES.SURVIVE) {
    return missionObjectiveScore + pressureScore * 1.2 + commandScore * 0.4 + safetyScore * 0.7;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE) {
    return pressureScore * 1.3 + commandScore * 0.45 + safetyScore * profile.safetyWeight;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.TURTLE) {
    return safetyScore * profile.safetyWeight + pressureScore * 0.45 + Math.max(0, captureScore) * 0.3;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.CAPTURE) {
    return Math.max(0, captureScore) * profile.objectiveWeight + pressureScore * 0.45 + safetyScore;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HQ_RUSH) {
    return commandScore * profile.objectiveWeight + pressureScore * 0.6 + safetyScore * profile.safetyWeight;
  }

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
      const occupant = getUnitAt(state, building.x, building.y);
      const directTile =
        (!occupant || occupant.id === unit.id) &&
        reachableTiles.find((tile) => tile.x === building.x && tile.y === building.y);
      const bestApproachTile = directTile
        ? directTile
        : reachableTiles
            .map((tile) => ({
              ...tile,
              distance: Math.abs(tile.x - building.x) + Math.abs(tile.y - building.y)
            }))
            .sort((left, right) => left.distance - right.distance)[0];

      if (!bestApproachTile) {
        return null;
      }

      const distanceFromBuilding = Math.abs(bestApproachTile.x - building.x) + Math.abs(bestApproachTile.y - building.y);
      const distanceImprovement =
        Math.abs(unit.x - building.x) +
        Math.abs(unit.y - building.y) -
        distanceFromBuilding;
      const isCurrentTile = building.x === unit.x && building.y === unit.y;

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
      const occupant = getUnitAt(state, building.x, building.y);
      const directTile =
        (!occupant || occupant.id === unit.id) &&
        reachableTiles.find((tile) => tile.x === building.x && tile.y === building.y);
      const bestApproachTile = directTile
        ? directTile
        : reachableTiles
            .map((tile) => ({
              ...tile,
              distance: Math.abs(tile.x - building.x) + Math.abs(tile.y - building.y)
            }))
            .sort((left, right) => left.distance - right.distance)[0];

      if (!bestApproachTile) {
        return null;
      }

      const currentDistance = Math.abs(unit.x - building.x) + Math.abs(unit.y - building.y);
      const distanceFromBuilding =
        Math.abs(bestApproachTile.x - building.x) + Math.abs(bestApproachTile.y - building.y);
      const distanceImprovement = currentDistance - distanceFromBuilding;

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
  const currentNearestDistance = getNearestPlayerDistance(state, currentTile);
  const currentMovementThreatMargin = getPlayerMovementThreatMargin(state, unit, currentTile);
  const shouldFallBack =
    currentMovementThreatMargin <= 0 &&
    unit.current.hp / Math.max(1, unit.stats.maxHealth) <= profile.repairHealthRatio;

  const rankedTiles = reachableTiles
    .map((tile) => {
      const nearestPlayerDistance = getNearestPlayerDistance(state, tile);
      const movementDistance = Math.abs(tile.x - unit.x) + Math.abs(tile.y - unit.y);
      const attackThreatMargin = getPlayerAttackThreatMargin(state, unit, tile);
      const movementThreatMargin = getPlayerMovementThreatMargin(state, unit, tile);
      const distanceImprovement = currentNearestDistance - nearestPlayerDistance;
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
        nearestPlayerDistance * 4 -
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
