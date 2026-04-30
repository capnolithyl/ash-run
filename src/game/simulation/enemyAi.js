import {
  BUILDING_KEYS,
  ENEMY_AI_ARCHETYPES,
  ENEMY_RECRUITMENT_BASE_MAP_CAP,
  ENEMY_RECRUITMENT_EARLY_LIMIT,
  ENEMY_RECRUITMENT_MAP_CAP_STEP_INTERVAL,
  ENEMY_RECRUITMENT_MAX_MAP_CAP,
  ENEMY_RECRUITMENT_STANDARD_LIMIT,
  TURN_SIDES,
  UNIT_TAGS
} from "../core/constants.js";
import { randomInt } from "../core/random.js";
import { canCaptureBuilding } from "./captureRules.js";
import { canResupplyUnit, getMovementModifier } from "./commanderEffects.js";
import {
  getAttackForecast,
  getAttackRangeCap,
  getPositionArmorBonus,
  getTargetsForUnit
} from "./combatResolver.js";
import {
  canUnitAttackTarget,
  getBuildingAt,
  getValidUnloadTiles,
  getLivingUnits,
  getReachableTiles,
  getUnitMovementAllowance,
  getRecruitmentOptions,
  getUnitAt,
  getUnitAttackProfile
} from "./selectors.js";
import { canLoadUnit } from "./transportRules.js";

const ANTI_AIR_RECRUITS = new Set(["skyguard", "interceptor"]);
const ENEMY_AIR_RECRUITS = new Set(["gunship", "payload", "interceptor", "carrier"]);
const ANTI_VEHICLE_RECRUITS = new Set(["breaker", "juggernaut", "siege-gun", "payload"]);
const ANTI_INFANTRY_RECRUITS = new Set(["longshot", "runner", "bruiser", "gunship", "payload"]);
const FRONTLINE_RECRUITS = new Set(["grunt", "runner", "bruiser", "breaker", "juggernaut", "gunship"]);
const TURTLE_RECRUITS = new Set(["longshot", "juggernaut", "skyguard", "interceptor", "medic", "mechanic"]);
const CAPTURE_RECRUITS = new Set(["grunt", "runner", "longshot"]);
const HQ_RUSH_RECRUITS = new Set(["grunt", "runner", "breaker", "longshot", "gunship"]);
const SUPPORT_RECRUITS = new Set(["medic", "mechanic"]);
const ENEMY_AIR_UNLOCK_TIER = 4;

function getEnemyAiArchetype(state) {
  return state.enemy?.aiArchetype ?? ENEMY_AI_ARCHETYPES.BALANCED;
}

function getEnemyAiProfile(state) {
  switch (getEnemyAiArchetype(state)) {
    case ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE:
      return {
        repairHealthRatio: 0.42,
        objectiveWeight: 1.2,
        safetyWeight: 0.65,
        pressureWeight: 1.45,
        retreatDistanceWeight: 1.1
      };
    case ENEMY_AI_ARCHETYPES.TURTLE:
      return {
        repairHealthRatio: 0.72,
        objectiveWeight: 0.8,
        safetyWeight: 1.7,
        pressureWeight: 0.5,
        retreatDistanceWeight: 2.4
      };
    case ENEMY_AI_ARCHETYPES.CAPTURE:
      return {
        repairHealthRatio: 0.55,
        objectiveWeight: 1.55,
        safetyWeight: 0.95,
        pressureWeight: 0.9,
        retreatDistanceWeight: 1.6
      };
    case ENEMY_AI_ARCHETYPES.HQ_RUSH:
      return {
        repairHealthRatio: 0.5,
        objectiveWeight: 1.65,
        safetyWeight: 0.75,
        pressureWeight: 1.2,
        retreatDistanceWeight: 1.35
      };
    case ENEMY_AI_ARCHETYPES.BALANCED:
    default:
      return {
        repairHealthRatio: 0.55,
        objectiveWeight: 1,
        safetyWeight: 1,
        pressureWeight: 1,
        retreatDistanceWeight: 1.75
      };
  }
}

export function getEnemyRecruitmentLimit(state) {
  return (state.difficultyTier ?? 1) <= 2
    ? ENEMY_RECRUITMENT_EARLY_LIMIT
    : ENEMY_RECRUITMENT_STANDARD_LIMIT;
}

export function getEnemyRecruitmentMapCap(state) {
  const difficultyTier = Math.max(1, state.difficultyTier ?? 1);
  const capSteps = Math.floor((difficultyTier - 1) / ENEMY_RECRUITMENT_MAP_CAP_STEP_INTERVAL);

  return Math.min(
    ENEMY_RECRUITMENT_MAX_MAP_CAP,
    ENEMY_RECRUITMENT_BASE_MAP_CAP + capSteps
  );
}

function countUnitsByFamily(units, family) {
  return units.filter((unit) => unit.family === family).length;
}

function needsService(state, unit) {
  const canResupply = canResupplyUnit(state, unit);

  return (
    unit.current.hp < unit.stats.maxHealth ||
    (canResupply && unit.current.ammo < unit.stats.ammoMax) ||
    (canResupply && unit.current.stamina < unit.stats.staminaMax)
  );
}

function getSupportNeedScore(state, target) {
  const canResupply = canResupplyUnit(state, target);
  const missingHp = target.stats.maxHealth - target.current.hp;
  const missingAmmo = canResupply ? target.stats.ammoMax - target.current.ammo : 0;
  const missingStamina = canResupply ? target.stats.staminaMax - target.current.stamina : 0;

  return missingHp * 2 + missingAmmo * 3 + missingStamina * 2;
}

function canRepairUnitAtBuilding(unit, building) {
  if (!unit || !building || building.owner !== unit.owner) {
    return false;
  }

  if (building.type === BUILDING_KEYS.SECTOR) {
    return true;
  }

  return (
    building.type === BUILDING_KEYS.REPAIR_STATION &&
    unit.family === UNIT_TAGS.VEHICLE &&
    building.lastServiceOwner !== unit.owner
  );
}

function wantsRepairMode(state, unit) {
  if (!unit || unit.transport?.carriedByUnitId || unit.current.hp >= unit.stats.maxHealth) {
    return false;
  }

  const healthRatio = unit.stats.maxHealth > 0 ? unit.current.hp / unit.stats.maxHealth : 1;

  return healthRatio <= getEnemyAiProfile(state).repairHealthRatio || (unit.cooldowns?.repairMode ?? 0) > 0;
}

function countUnitsByType(units, unitTypeId) {
  return units.filter((unit) => unit.unitTypeId === unitTypeId).length;
}

function canEnemyFieldAir(state) {
  return (state.difficultyTier ?? 1) >= ENEMY_AIR_UNLOCK_TIER;
}

function canEnemyRecruitOption(state, option) {
  return canEnemyFieldAir(state) || !ENEMY_AIR_RECRUITS.has(option.id);
}

function scoreEnemyRecruitmentOption(state, option) {
  const archetype = getEnemyAiArchetype(state);
  const playerUnits = getLivingUnits(state, TURN_SIDES.PLAYER);
  const enemyUnits = getLivingUnits(state, TURN_SIDES.ENEMY);
  const fundsAfterPurchase = state.enemy.funds - option.adjustedCost;
  let score = Math.min(14, option.adjustedCost / 110);

  if (countUnitsByFamily(playerUnits, UNIT_TAGS.AIR) > 0 && ANTI_AIR_RECRUITS.has(option.id)) {
    score += 12;
  }

  if (countUnitsByFamily(playerUnits, UNIT_TAGS.VEHICLE) > 0 && ANTI_VEHICLE_RECRUITS.has(option.id)) {
    score += 5;
  }

  if (countUnitsByFamily(playerUnits, UNIT_TAGS.INFANTRY) > 0 && ANTI_INFANTRY_RECRUITS.has(option.id)) {
    score += 4;
  }

  if (countUnitsByFamily(enemyUnits, option.family) === 0) {
    score += 3;
  }

  if (option.id === "grunt") {
    score += countUnitsByFamily(enemyUnits, UNIT_TAGS.INFANTRY) === 0 ? 4 : -4;

    if (state.enemy.funds >= 500) {
      score -= 6;
    }
  }

  if (SUPPORT_RECRUITS.has(option.id)) {
    const targetFamily = option.id === "medic" ? UNIT_TAGS.INFANTRY : UNIT_TAGS.VEHICLE;
    const hasRelevantAlly = countUnitsByFamily(enemyUnits, targetFamily) > 0;
    const hasRelevantNeed = enemyUnits.some(
      (unit) => unit.family === targetFamily && needsService(state, unit)
    );
    const existingSupport = countUnitsByType(enemyUnits, option.id);

    score += hasRelevantNeed ? 10 : hasRelevantAlly ? 2 : -12;
    score -= existingSupport * 20;
    score -= enemyUnits.length < 4 ? 10 : 0;
  }

  if (!canEnemyFieldAir(state) && ENEMY_AIR_RECRUITS.has(option.id)) {
    score -= 30;
  }

  if (fundsAfterPurchase >= 300) {
    score += Math.min(4, fundsAfterPurchase / 300);
  }

  if (option.id === "carrier") {
    score -= 8;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE) {
    score += FRONTLINE_RECRUITS.has(option.id) ? 7 : 0;
    score += SUPPORT_RECRUITS.has(option.id) ? -5 : 0;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.TURTLE) {
    score += TURTLE_RECRUITS.has(option.id) ? 6 : 0;
    score += option.id === "grunt" || option.id === "runner" ? -2 : 0;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.CAPTURE) {
    score += CAPTURE_RECRUITS.has(option.id) ? 8 : 0;
    score += option.id === "runner" ? 4 : 0;
    score += SUPPORT_RECRUITS.has(option.id) ? -5 : 0;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HQ_RUSH) {
    score += HQ_RUSH_RECRUITS.has(option.id) ? 8 : 0;
    score += option.id === "runner" ? 5 : 0;
    score += SUPPORT_RECRUITS.has(option.id) ? -4 : 0;
  }

  return score;
}

function takeRandomInt(state, minimum, maximum) {
  const roll = randomInt(state.seed, minimum, maximum);
  state.seed = roll.seed;
  return roll.value;
}

export function pickEnemyRecruitmentCandidate(state, productionSites, usedBuildingIds) {
  const candidates = productionSites
    .filter((building) => !usedBuildingIds.has(building.id))
    .flatMap((building) =>
      getRecruitmentOptions(state, building, state.enemy)
        .filter((option) => canEnemyRecruitOption(state, option))
        .filter((option) => option.adjustedCost <= state.enemy.funds)
        .map((option) => ({
          building,
          option,
          score: scoreEnemyRecruitmentOption(state, option) + takeRandomInt(state, 0, 6)
        }))
    )
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return right.option.adjustedCost - left.option.adjustedCost;
    });

  if (candidates.length === 0) {
    return null;
  }

  const topScore = candidates[0].score;
  const topBand = candidates.filter((candidate) => candidate.score >= topScore - 5);

  return topBand[takeRandomInt(state, 0, topBand.length - 1)];
}

function getAverageDamage(damageRange) {
  return (damageRange.min + damageRange.max) / 2;
}

function getPlayerCommandBuilding(state) {
  return state.map.buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.PLAYER
  ) ?? null;
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

function getStrategicObjectiveScore(state, unit, tile) {
  const profile = getEnemyAiProfile(state);
  const archetype = getEnemyAiArchetype(state);
  const captureScore = getCaptureObjectiveScore(state, unit, tile);
  const pressureScore = getPressureScore(state, tile);
  const commandScore = getCommandRushScore(state, tile);
  const safetyScore = getTileSafetyScore(state, unit, tile);

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

function scoreAttackTrade(state, attacker, defender) {
  const forecast = getAttackForecast(state, attacker, defender);
  const dealtAverage = getAverageDamage(forecast.dealt);
  const receivedAverage = forecast.received ? getAverageDamage(forecast.received) : 0;
  const killsTarget = forecast.dealt.max >= defender.current.hp;
  const damageRatio = defender.stats.maxHealth > 0 ? dealtAverage / defender.stats.maxHealth : 0;
  const targetValue = Math.max(1, defender.cost / 300);
  const attackProfile = getUnitAttackProfile(attacker);
  const attackDistance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
  const isRangedAttack = Boolean(attackProfile && attackDistance > 1);
  const isEffective = attacker.effectiveAgainstTags.includes(defender.family);
  const canCounter = Boolean(forecast.received);
  const netDamage = dealtAverage - receivedAverage;
  const attackThreatMargin = getPlayerAttackThreatMargin(state, attacker, { x: attacker.x, y: attacker.y });
  const movementThreatMargin = getPlayerMovementThreatMargin(state, attacker, { x: attacker.x, y: attacker.y });
  const positionArmorBonus = getPositionArmorBonus(state, attacker);
  const playerCommand = getPlayerCommandBuilding(state);
  const defenderCommandDistance = playerCommand
    ? Math.abs(defender.x - playerCommand.x) + Math.abs(defender.y - playerCommand.y)
    : Number.POSITIVE_INFINITY;
  const score =
    dealtAverage * 2.35 -
    receivedAverage * 2.1 +
    damageRatio * 13 +
    targetValue +
    (isEffective ? 8 : 0) +
    (isRangedAttack ? 6 : 0) +
    (!canCounter ? 6 : 0) +
    (killsTarget ? 55 : 0) +
    (movementThreatMargin > 0 ? 5 : 0) +
    positionArmorBonus * 1.8 +
    (defenderCommandDistance <= 2 ? 8 : 0);

  return {
    forecast,
    dealtAverage,
    receivedAverage,
    netDamage,
    killsTarget,
    isEffective,
    isRangedAttack,
    canCounter,
    positionArmorBonus,
    attackThreatMargin,
    movementThreatMargin,
    safeFromImmediateThreat: attackThreatMargin > 0,
    safeFromMovementThreat: movementThreatMargin > 0,
    canEscapeThreatAfterAttack: movementThreatMargin > 0,
    defenderCommandDistance,
    isFavorable:
      killsTarget ||
      (!canCounter && dealtAverage >= 3) ||
      (isEffective && dealtAverage >= 3) ||
      (dealtAverage >= Math.max(5, defender.stats.maxHealth * 0.3) &&
        dealtAverage >= receivedAverage + 1) ||
      (dealtAverage >= 4 && dealtAverage >= receivedAverage * 1.15 + 1),
    score
  };
}

function getScoredAttackOptions(state, unit) {
  return getTargetsForUnit(state, unit)
    .map((target) => ({
      target,
      trade: scoreAttackTrade(state, unit, target),
      objectiveScore: getStrategicObjectiveScore(state, unit, { x: unit.x, y: unit.y })
    }))
    .sort((left, right) => right.trade.score - left.trade.score);
}

function isAttackAcceptable(state, option, { allowRisky = false } = {}) {
  if (!option) {
    return false;
  }

  const archetype = getEnemyAiArchetype(state);
  const trade = option.trade;
  const hqRushPressure = trade.defenderCommandDistance <= 2;
  const effectiveBias = trade.isEffective && trade.dealtAverage >= 2;

  if (allowRisky) {
    return trade.dealtAverage >= 2 || trade.killsTarget || effectiveBias;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE) {
    return (
      trade.killsTarget ||
      hqRushPressure ||
      trade.score >= 14 ||
      trade.dealtAverage >= 3.5 ||
      effectiveBias ||
      (trade.dealtAverage >= 4 && trade.netDamage >= -2)
    );
  }

  if (archetype === ENEMY_AI_ARCHETYPES.TURTLE) {
    return (
      trade.killsTarget ||
      (!trade.canCounter && trade.dealtAverage >= 3) ||
      (trade.safeFromMovementThreat && trade.score >= 22) ||
      (trade.dealtAverage >= 5 && trade.netDamage >= 2)
    );
  }

  if (archetype === ENEMY_AI_ARCHETYPES.CAPTURE) {
    return (
      trade.killsTarget ||
      trade.score >= 19 ||
      (!trade.canCounter && trade.dealtAverage >= 3) ||
      effectiveBias
    );
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HQ_RUSH) {
    return (
      trade.killsTarget ||
      hqRushPressure ||
      trade.score >= 15 ||
      trade.dealtAverage >= 3 ||
      effectiveBias
    );
  }

  return (
    trade.killsTarget ||
    trade.score >= 18 ||
    (!trade.canCounter && trade.dealtAverage >= 3) ||
    effectiveBias ||
    (trade.dealtAverage >= 4 && trade.netDamage >= -0.5)
  );
}

export function pickBestFavorableAttack(state, unit) {
  return getScoredAttackOptions(state, unit).find((option) => isAttackAcceptable(state, option)) ?? null;
}

export function pickBestAvailableAttack(state, unit) {
  return getScoredAttackOptions(state, unit)[0] ?? null;
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
        !needsService(state, candidate)
      ) {
        return false;
      }

      return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
    })
    .map((target) => {
      return {
        target,
        score: getSupportNeedScore(state, target) + Math.max(1, target.cost / 200)
      };
    })
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

export function getBestCapturePlan(state, unit, reachableTiles) {
  if (unit.family !== UNIT_TAGS.INFANTRY) {
    return null;
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
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

export function getBestRepairPlan(state, unit, reachableTiles) {
  if (!wantsRepairMode(state, unit)) {
    return null;
  }

  const currentBuilding = getBuildingAt(state, unit.x, unit.y);

  if (canRepairUnitAtBuilding(unit, currentBuilding)) {
    return {
      building: currentBuilding,
      tile: { x: unit.x, y: unit.y },
      canRepairAfterMove: true,
      isCurrentTile: true,
      score: 999
    };
  }

  return state.map.buildings
    .filter((building) => canRepairUnitAtBuilding(unit, building))
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
        score:
          (directTile ? 150 : 0) +
          (building.type === BUILDING_KEYS.REPAIR_STATION ? 18 : 0) +
          distanceImprovement * 12 -
          distanceFromBuilding * 3
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

export function getBestMoveAttackOption(state, unit, reachableTiles, { allowRisky = false } = {}) {
  const originalPosition = { x: unit.x, y: unit.y };
  let bestOption = null;

  for (const tile of reachableTiles) {
    unit.x = tile.x;
    unit.y = tile.y;

    const attackOption = allowRisky
      ? getScoredAttackOptions(state, unit).find((option) => isAttackAcceptable(state, option, { allowRisky: true })) ??
        pickBestAvailableAttack(state, unit)
      : pickBestFavorableAttack(state, unit);

    if (!attackOption) {
      continue;
    }

    const movementCost = Math.abs(originalPosition.x - tile.x) + Math.abs(originalPosition.y - tile.y);
    const movementPenalty = attackOption.trade.isRangedAttack
      ? movementCost * 0.35
      : movementCost * 2.2;
    const score =
      attackOption.trade.score +
      (attackOption.trade.isEffective ? 5 : 0) +
      (attackOption.trade.isRangedAttack ? 4 : 0) +
      getStrategicObjectiveScore(state, unit, tile) * 0.08 -
      movementPenalty;

    if (!bestOption || score > bestOption.score) {
      bestOption = {
        ...attackOption,
        tile,
        score
      };
    }
  }

  unit.x = originalPosition.x;
  unit.y = originalPosition.y;
  return bestOption;
}

function getPlayerAttackThreatMargin(state, unit, tile) {
  let lowestMargin = Number.POSITIVE_INFINITY;

  for (const playerUnit of getLivingUnits(state, TURN_SIDES.PLAYER)) {
    if (!canUnitAttackTarget(playerUnit, unit)) {
      continue;
    }

    const attackProfile = getUnitAttackProfile(playerUnit);
    const distance = Math.abs(playerUnit.x - tile.x) + Math.abs(playerUnit.y - tile.y);

    if (!attackProfile) {
      continue;
    }

    lowestMargin = Math.min(
      lowestMargin,
      distance - getAttackRangeCap(state, playerUnit, attackProfile)
    );
  }

  return lowestMargin;
}

function getPlayerMovementThreatMargin(state, unit, tile) {
  let lowestMargin = Number.POSITIVE_INFINITY;

  for (const playerUnit of getLivingUnits(state, TURN_SIDES.PLAYER)) {
    if (!canUnitAttackTarget(playerUnit, unit)) {
      continue;
    }

    const attackProfile = getUnitAttackProfile(playerUnit);

    if (!attackProfile) {
      continue;
    }

    const movementBudget = getUnitMovementAllowance(
      playerUnit,
      playerUnit.stats.movement + getMovementModifier(state, playerUnit)
    );
    const threatRange = movementBudget + getAttackRangeCap(state, playerUnit, attackProfile);
    const distance = Math.abs(playerUnit.x - tile.x) + Math.abs(playerUnit.y - tile.y);
    lowestMargin = Math.min(lowestMargin, distance - threatRange);
  }

  return lowestMargin;
}

function getNearestPlayerDistance(state, tile) {
  const playerUnits = getLivingUnits(state, TURN_SIDES.PLAYER);

  if (playerUnits.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return playerUnits.reduce((nearest, playerUnit) => {
    const distance = Math.abs(tile.x - playerUnit.x) + Math.abs(tile.y - playerUnit.y);
    return Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);
}

function compareDescending(left, right) {
  return right - left;
}

function compareAscending(left, right) {
  return left - right;
}

function compareBooleanDescending(left, right) {
  return Number(right) - Number(left);
}

function compareSlipstreamCandidates(left, right) {
  return (
    compareBooleanDescending(left.isSafeFromMovementThreat, right.isSafeFromMovementThreat) ||
    compareBooleanDescending(left.isSafeFromImmediateThreat, right.isSafeFromImmediateThreat) ||
    compareDescending(left.positionArmorBonus, right.positionArmorBonus) ||
    compareDescending(left.movementThreatMargin, right.movementThreatMargin) ||
    compareDescending(left.attackThreatMargin, right.attackThreatMargin) ||
    compareDescending(left.nearestPlayerDistance, right.nearestPlayerDistance) ||
    compareBooleanDescending(left.isCurrentTile, right.isCurrentTile) ||
    compareAscending(left.y, right.y) ||
    compareAscending(left.x, right.x)
  );
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

function getAdjacentTransportPassengers(state, runner) {
  return getLivingUnits(state, runner.owner)
    .filter((candidate) => {
      if (
        !canLoadUnit(candidate, runner) ||
        candidate.id === runner.id ||
        candidate.hasMoved ||
        candidate.hasAttacked
      ) {
        return false;
      }

      return Math.abs(candidate.x - runner.x) + Math.abs(candidate.y - runner.y) === 1;
    })
    .sort((left, right) => {
      const score = (unit) => {
        if (unit.unitTypeId === "grunt") {
          return 6;
        }
        if (unit.unitTypeId === "breaker" || unit.unitTypeId === "longshot") {
          return 5;
        }
        return 3;
      };

      return score(right) - score(left);
    });
}

function getBestFootObjectiveScore(state, passenger) {
  const movementBudget = getUnitMovementAllowance(
    passenger,
    passenger.stats.movement + getMovementModifier(state, passenger)
  );
  const reachableTiles = getReachableTiles(state, passenger, movementBudget);
  const currentTile = { x: passenger.x, y: passenger.y };

  return [currentTile, ...reachableTiles].reduce(
    (bestScore, tile) => Math.max(bestScore, getStrategicObjectiveScore(state, passenger, tile)),
    Number.NEGATIVE_INFINITY
  );
}

function scoreLoadedPassengerPosition(state, passenger, tile) {
  const positionedPassenger = {
    ...passenger,
    x: tile.x,
    y: tile.y
  };
  const currentThreatMargin = getPlayerMovementThreatMargin(state, passenger, { x: passenger.x, y: passenger.y });
  const nextThreatMargin = getPlayerMovementThreatMargin(state, positionedPassenger, tile);

  return (
    getStrategicObjectiveScore(state, positionedPassenger, tile) -
    10 +
    (currentThreatMargin <= 0 && nextThreatMargin > 0 ? 26 : 0)
  );
}

export function getBestRunnerTransportPlan(state, runner, reachableTiles) {
  if (runner.unitTypeId !== "runner") {
    return null;
  }

  const carriedPassenger = runner.transport?.carryingUnitId
    ? getLivingUnits(state, runner.owner).find((unit) => unit.id === runner.transport.carryingUnitId) ?? null
    : null;
  const passengers = carriedPassenger ? [carriedPassenger] : getAdjacentTransportPassengers(state, runner);

  if (passengers.length === 0) {
    return null;
  }

  const originalRunnerPosition = { x: runner.x, y: runner.y };
  let bestPlan = null;

  for (const passenger of passengers) {
    const footObjectiveScore = carriedPassenger ? Number.NEGATIVE_INFINITY : getBestFootObjectiveScore(state, passenger);
    const originalPassengerPosition = { x: passenger.x, y: passenger.y };
    const currentPassengerThreatMargin = getPlayerMovementThreatMargin(state, passenger, originalPassengerPosition);

    for (const moveTile of reachableTiles) {
      const isMovedTile =
        moveTile.x !== originalRunnerPosition.x || moveTile.y !== originalRunnerPosition.y;
      runner.x = moveTile.x;
      runner.y = moveTile.y;
      passenger.x = moveTile.x;
      passenger.y = moveTile.y;

      const carryScore = scoreLoadedPassengerPosition(state, passenger, moveTile);
      const carryType = currentPassengerThreatMargin <= 0 && getPlayerMovementThreatMargin(state, passenger, moveTile) > 0
        ? "extract-and-retreat"
        : carriedPassenger
          ? "carry-forward"
          : "board-and-carry";
      const carryPlan = {
        type: carryType,
        passengerId: passenger.id,
        moveTile,
        unloadTile: null,
        score: carryScore
      };

      if (
        isMovedTile &&
        (
          carriedPassenger ||
          carryScore >= footObjectiveScore + 10 ||
          carryType === "extract-and-retreat"
        )
      ) {
        if (!bestPlan || carryPlan.score > bestPlan.score) {
          bestPlan = carryPlan;
        }
      }

      const unloadTiles = getValidUnloadTiles(state, runner, passenger);

      for (const unloadTile of unloadTiles) {
        const unloadedPassenger = {
          ...passenger,
          x: unloadTile.x,
          y: unloadTile.y,
          transport: {
            ...passenger.transport,
            carriedByUnitId: null
          }
        };
        const unloadScore =
          getStrategicObjectiveScore(state, unloadedPassenger, unloadTile) +
          6 +
          (currentPassengerThreatMargin <= 0 &&
          getPlayerMovementThreatMargin(state, unloadedPassenger, unloadTile) > 0
            ? 18
            : 0);
        const unloadType =
          moveTile.x === originalRunnerPosition.x && moveTile.y === originalRunnerPosition.y
            ? "unload-now"
            : currentPassengerThreatMargin <= 0 &&
                getPlayerMovementThreatMargin(state, unloadedPassenger, unloadTile) > 0
              ? "extract-and-retreat"
              : "move-then-unload";
        const unloadPlan = {
          type: unloadType,
          passengerId: passenger.id,
          moveTile,
          unloadTile,
          score: unloadScore
        };

        if (
          carriedPassenger ||
          unloadScore >= footObjectiveScore + 6 ||
          unloadType === "extract-and-retreat"
        ) {
          if (!bestPlan || unloadPlan.score > bestPlan.score) {
            bestPlan = unloadPlan;
          }
        }
      }
    }

    passenger.x = originalPassengerPosition.x;
    passenger.y = originalPassengerPosition.y;
  }

  runner.x = originalRunnerPosition.x;
  runner.y = originalRunnerPosition.y;
  return bestPlan;
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
