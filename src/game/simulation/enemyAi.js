import {
  BUILDING_KEYS,
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
import { getMovementModifier } from "./commanderEffects.js";
import {
  getAttackForecast,
  getAttackRangeCap,
  getTargetsForUnit
} from "./combatResolver.js";
import {
  canUnitAttackTarget,
  getLivingUnits,
  getRecruitmentOptions,
  getUnitAt,
  getUnitAttackProfile
} from "./selectors.js";

const ANTI_AIR_RECRUITS = new Set(["skyguard", "interceptor"]);
const ANTI_VEHICLE_RECRUITS = new Set(["breaker", "juggernaut", "siege-gun", "payload"]);
const ANTI_INFANTRY_RECRUITS = new Set(["longshot", "runner", "bruiser", "gunship", "payload"]);

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

function scoreEnemyRecruitmentOption(state, option) {
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

  if (fundsAfterPurchase >= 300) {
    score += Math.min(4, fundsAfterPurchase / 300);
  }

  if (option.id === "carrier") {
    score -= 8;
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

function scoreAttackTrade(state, attacker, defender) {
  const forecast = getAttackForecast(state, attacker, defender);
  const dealtAverage = getAverageDamage(forecast.dealt);
  const receivedAverage = forecast.received ? getAverageDamage(forecast.received) : 0;
  const killsTarget = forecast.dealt.max >= defender.current.hp;
  const damageRatio = defender.stats.maxHealth > 0 ? dealtAverage / defender.stats.maxHealth : 0;
  const targetValue = Math.max(1, defender.cost / 300);
  const score =
    dealtAverage * 2.2 -
    receivedAverage * 2.6 +
    damageRatio * 12 +
    targetValue +
    (killsTarget ? 55 : 0);

  return {
    forecast,
    dealtAverage,
    receivedAverage,
    killsTarget,
    isFavorable:
      killsTarget ||
      (dealtAverage >= Math.max(5, defender.stats.maxHealth * 0.3) &&
        dealtAverage >= receivedAverage + 2) ||
      (dealtAverage >= 4 && dealtAverage >= receivedAverage * 1.35 + 1),
    score
  };
}

export function pickBestFavorableAttack(state, unit) {
  return getTargetsForUnit(state, unit)
    .map((target) => ({
      target,
      trade: scoreAttackTrade(state, unit, target)
    }))
    .filter((option) => option.trade.isFavorable)
    .sort((left, right) => right.trade.score - left.trade.score)[0] ?? null;
}

function getBuildingCapturePriority(building) {
  const typePriority = {
    [BUILDING_KEYS.SECTOR]: 40,
    [BUILDING_KEYS.BARRACKS]: 34,
    [BUILDING_KEYS.MOTOR_POOL]: 34,
    [BUILDING_KEYS.AIRFIELD]: 34,
    [BUILDING_KEYS.COMMAND]: 28
  };

  return (typePriority[building.type] ?? 20) + (building.owner === "neutral" ? 18 : 6);
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

export function getBestMoveAttackOption(state, unit, reachableTiles) {
  const originalPosition = { x: unit.x, y: unit.y };
  let bestOption = null;

  for (const tile of reachableTiles) {
    unit.x = tile.x;
    unit.y = tile.y;

    const attackOption = pickBestFavorableAttack(state, unit);

    if (!attackOption) {
      continue;
    }

    const movementCost = Math.abs(originalPosition.x - tile.x) + Math.abs(originalPosition.y - tile.y);
    const score = attackOption.trade.score - movementCost * 0.4;

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

    const movementBudget = playerUnit.stats.movement + getMovementModifier(state, playerUnit);
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

export function pickFallbackMovementTile(state, unit, reachableTiles) {
  if (getLivingUnits(state, TURN_SIDES.PLAYER).length === 0) {
    return { x: unit.x, y: unit.y, intent: "stage" };
  }

  const currentTile = { x: unit.x, y: unit.y };
  const currentNearestDistance = getNearestPlayerDistance(state, currentTile);
  const currentMovementThreatMargin = getPlayerMovementThreatMargin(state, unit, currentTile);
  const shouldFallBack = currentMovementThreatMargin <= 0;
  const postureRoll = takeRandomInt(state, 0, 99);
  const targetThreatMargin = postureRoll < 18 ? 0 : postureRoll < 42 ? 2 : 1;
  const aggressionWeight = postureRoll < 18 ? 7.5 : postureRoll < 42 ? 4.5 : 6;
  const threatPenalty = postureRoll < 18 ? 4 : postureRoll < 42 ? 18 : 11;

  const rankedTiles = reachableTiles
    .map((tile) => {
      const nearestPlayerDistance = getNearestPlayerDistance(state, tile);
      const movementDistance = Math.abs(tile.x - unit.x) + Math.abs(tile.y - unit.y);
      const attackThreatMargin = getPlayerAttackThreatMargin(state, unit, tile);
      const movementThreatMargin = getPlayerMovementThreatMargin(state, unit, tile);
      const distanceImprovement = currentNearestDistance - nearestPlayerDistance;
      const immediateThreatPenalty = attackThreatMargin <= 0 ? 22 : 0;
      const movementThreatPenalty = movementThreatMargin <= 0 ? threatPenalty : 0;
      const stagingScore =
        distanceImprovement * aggressionWeight -
        Math.abs(Math.min(5, movementThreatMargin) - targetThreatMargin) * 2 -
        movementDistance * 0.35 -
        immediateThreatPenalty -
        movementThreatPenalty +
        takeRandomInt(state, 0, 5);
      const fallbackScore =
        nearestPlayerDistance * 4 -
        movementDistance -
        immediateThreatPenalty -
        movementThreatPenalty +
        (movementThreatMargin > 0 ? 12 : 0) +
        takeRandomInt(state, 0, 5);

      return {
        ...tile,
        intent: shouldFallBack ? "fallback" : "stage",
        score: shouldFallBack ? fallbackScore : stagingScore
      };
    })
    .sort((left, right) => right.score - left.score);

  return rankedTiles[0] ?? currentTile;
}
