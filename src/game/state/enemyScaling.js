import { ENEMY_STARTING_FUNDS, TURN_SIDES } from "../core/constants.js";
import { createUnitFromType } from "../simulation/unitFactory.js";
import { awardExperience, getXpThreshold } from "../simulation/progression.js";

const ENEMY_REINFORCEMENT_SCHEDULE = [
  { tier: 3, unitTypeId: "grunt" },
  { tier: 5, unitTypeId: "bruiser" },
  { tier: 7, unitTypeId: "skyguard" },
  { tier: 9, unitTypeId: "siege-gun" }
];
const ENEMY_STARTING_FUNDS_PER_TIER = 100;
const ENEMY_STARTING_FUNDS_MAX = 500;
const ENEMY_LEVEL_STEP_INTERVAL = 2;
const ENEMY_LEVEL_MAX = 5;
const ENEMY_PRECAPTURE_STEP_INTERVAL = 3;
const ENEMY_PRECAPTURE_MAX = 2;

/**
 * Enemy scaling is intentionally centralized so difficulty pressure can be
 * tuned without touching run assembly or battle rules.
 */
function getEnemyStartingLevel(difficultyTier) {
  const levelSteps = Math.floor((Math.max(1, difficultyTier) - 1) / ENEMY_LEVEL_STEP_INTERVAL);
  return Math.min(ENEMY_LEVEL_MAX, 1 + levelSteps);
}

function scaleEnemyUnitLevel(unit, targetLevel, seed) {
  let scaledUnit = unit;
  let nextSeed = seed;

  while (scaledUnit.level < targetLevel) {
    const levelUp = awardExperience(
      {
        ...scaledUnit,
        experience: 0
      },
      getXpThreshold(scaledUnit.level),
      nextSeed
    );

    scaledUnit = levelUp.unit;
    nextSeed = levelUp.seed;
  }

  return {
    ...scaledUnit,
    experience: 0,
    current: {
      hp: scaledUnit.stats.maxHealth,
      stamina: scaledUnit.stats.staminaMax,
      ammo: scaledUnit.stats.ammoMax
    }
  };
}

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
    .filter((building) => building.owner === "neutral")
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

export function buildScaledEnemyRoster(baseUnitTypeIds, difficultyTier) {
  const targetLevel = getEnemyStartingLevel(difficultyTier);
  const rosterUnitTypeIds = [
    ...baseUnitTypeIds,
    ...ENEMY_REINFORCEMENT_SCHEDULE
      .filter((entry) => difficultyTier >= entry.tier)
      .map((entry) => entry.unitTypeId)
  ];

  return rosterUnitTypeIds.map((unitTypeId, index) =>
    scaleEnemyUnitLevel(
      createUnitFromType(unitTypeId, TURN_SIDES.ENEMY),
      targetLevel,
      difficultyTier * 1000 + index
    )
  );
}
