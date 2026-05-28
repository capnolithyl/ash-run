import { BUILDING_KEYS, ENEMY_STARTING_FUNDS, TURN_SIDES } from "../core/constants.js";

const ENEMY_STARTING_FUNDS_PER_TIER = 100;
const ENEMY_STARTING_FUNDS_MAX = 500;
const ENEMY_PRECAPTURE_STEP_INTERVAL = 3;
const ENEMY_PRECAPTURE_MAX = 2;
const PRODUCTION_BUILDINGS = new Set([
  BUILDING_KEYS.BARRACKS,
  BUILDING_KEYS.MOTOR_POOL,
  BUILDING_KEYS.AIRFIELD
]);

export function getEnemyStartingFunds(difficultyTier) {
  return ENEMY_STARTING_FUNDS + Math.min(
    ENEMY_STARTING_FUNDS_MAX,
    Math.max(0, difficultyTier - 1) * ENEMY_STARTING_FUNDS_PER_TIER
  );
}

function getEnemyPrecapturedBuildingCount(difficultyTier) {
  return Math.min(
    ENEMY_PRECAPTURE_MAX,
    Math.floor(Math.max(0, difficultyTier - 1) / ENEMY_PRECAPTURE_STEP_INTERVAL)
  );
}

export function applyEnemyMapControlScaling(mapDefinition, difficultyTier) {
  const precaptureCount = getEnemyPrecapturedBuildingCount(difficultyTier);

  if (precaptureCount <= 0) {
    return [];
  }

  const neutralBuildings = mapDefinition.buildings
    .filter((building) => building.owner === "neutral" && !PRODUCTION_BUILDINGS.has(building.type))
    .sort(
      (left, right) =>
        right.x - left.x ||
        Math.abs(left.y - mapDefinition.height / 2) - Math.abs(right.y - mapDefinition.height / 2)
    )
    .slice(0, precaptureCount);

  for (const building of neutralBuildings) {
    building.owner = TURN_SIDES.ENEMY;
  }

  return neutralBuildings;
}
