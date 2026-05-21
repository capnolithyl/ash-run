import {
  ENEMY_AI_ARCHETYPES,
  ENEMY_RECRUITMENT_BASE_MAP_CAP,
  ENEMY_RECRUITMENT_EARLY_LIMIT,
  ENEMY_RECRUITMENT_MAP_CAP_STEP_INTERVAL,
  ENEMY_RECRUITMENT_MAX_MAP_CAP,
  ENEMY_RECRUITMENT_STANDARD_LIMIT,
  TURN_SIDES,
  UNIT_TAGS
} from "../../core/constants.js";
import { MAP_GOAL_TYPES } from "../../content/mapGoals.js";
import { getRecruitmentOptions, getLivingUnits } from "../selectors.js";
import { getSupportNeedScore, unitNeedsService } from "../supportScoring.js";
import { getEnemyAiArchetype } from "./profiles.js";
import { takeRandomInt } from "./shared.js";

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

function countUnitsByFamily(units, family) {
  return units.filter((unit) => unit.family === family).length;
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
  const missionType = state.mission?.type ?? MAP_GOAL_TYPES.ROUT;
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
      (unit) => unit.family === targetFamily && unitNeedsService(state, unit)
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

  if (missionType === MAP_GOAL_TYPES.RESCUE) {
    score += FRONTLINE_RECRUITS.has(option.id) ? 4 : 0;
    score += option.id === "runner" ? 2 : 0;
  }

  if (missionType === MAP_GOAL_TYPES.DEFEND || missionType === MAP_GOAL_TYPES.SURVIVE) {
    score += FRONTLINE_RECRUITS.has(option.id) ? 6 : 0;
    score += SUPPORT_RECRUITS.has(option.id) ? -6 : 0;
  }

  if (missionType === MAP_GOAL_TYPES.HQ_CAPTURE) {
    score += HQ_RUSH_RECRUITS.has(option.id) ? 5 : 0;
  }

  return score;
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
