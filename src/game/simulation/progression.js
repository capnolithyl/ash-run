import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { pickOne, randomInt } from "../core/random.js";

export const LEVEL_UP_STAT_ORDER = [
  "maxHealth",
  "attack",
  "armor",
  "movement",
  "maxRange",
  "staminaMax",
  "ammoMax",
  "luck"
];

const LEVEL_UP_GROWTH_ROLL_ORDER = [
  "attack",
  "armor",
  "maxHealth",
  "movement",
  "maxRange",
  "staminaMax",
  "ammoMax",
  "luck"
];

// Shared defaults for level-up growth rolls. Override per-unit entries in
// `UNIT_CATALOG[unitTypeId].levelUpGrowths` when a unit needs custom rates.
export const DEFAULT_LEVEL_UP_GROWTHS = {
  attack: { chance: 50, weight: 4, increment: 1 },
  armor: { chance: 50, weight: 4, increment: 1 },
  maxHealth: { chance: 50, weight: 4, increment: 2 },
  movement: { chance: 10, weight: 1, increment: 1 },
  maxRange: { chance: 5, weight: 1, increment: 1 },
  staminaMax: { chance: 25, weight: 2, increment: 1 },
  ammoMax: { chance: 20, weight: 2, increment: 1 },
  luck: { chance: 20, weight: 2, increment: 1 }
};

function snapshotGrowthStats(unit) {
  return Object.fromEntries(
    LEVEL_UP_STAT_ORDER.map((stat) => [stat, unit.stats[stat]])
  );
}

function getLevelUpGrowthEntries(unit) {
  const unitType = UNIT_CATALOG[unit.unitTypeId] ?? {};
  const overrides = unitType.levelUpGrowths ?? {};

  return LEVEL_UP_GROWTH_ROLL_ORDER.map((stat) => ({
    stat,
    ...DEFAULT_LEVEL_UP_GROWTHS[stat],
    ...(overrides[stat] ?? {})
  }));
}

function isGrowthEligible(unit, entry) {
  return !(entry.stat === "maxRange" && unit.stats.maxRange === 0);
}

function getEligibleGrowths(unit) {
  return getLevelUpGrowthEntries(unit).filter((entry) => isGrowthEligible(unit, entry));
}

function buildWeightedStats(unit) {
  return getEligibleGrowths(unit).flatMap((entry) =>
    Array.from({ length: entry.weight }, () => entry)
  );
}

function applyGrowth(unit, entry) {
  const previousValue = unit.stats[entry.stat];
  unit.stats[entry.stat] += entry.increment;

  if (entry.stat === "maxHealth") {
    unit.current.hp += entry.increment;
  }

  if (entry.stat === "staminaMax") {
    unit.current.stamina += entry.increment;
  }

  if (entry.stat === "ammoMax") {
    unit.current.ammo += entry.increment;
  }

  return {
    stat: entry.stat,
    increment: entry.increment,
    previousValue,
    nextValue: unit.stats[entry.stat]
  };
}

export function getXpThreshold(level) {
  return 90 + (level - 1) * 30;
}

export function getLevelProgress(unit) {
  const threshold = getXpThreshold(unit.level);

  return {
    current: unit.experience,
    threshold,
    ratio: threshold > 0 ? unit.experience / threshold : 0
  };
}

/**
 * Random stat growth keeps runs from feeling identical without adding
 * extra authored level-up tables for each unit yet.
 */
export function awardExperience(unit, amount, seed) {
  const nextUnit = structuredClone(unit);
  const notes = [];
  const levelUps = [];
  let nextSeed = seed;

  nextUnit.experience += amount;

  while (nextUnit.experience >= getXpThreshold(nextUnit.level)) {
    nextUnit.experience -= getXpThreshold(nextUnit.level);
    const previousLevel = nextUnit.level;
    const beforeStats = snapshotGrowthStats(nextUnit);
    nextUnit.level += 1;

    const statGains = [];

    for (const entry of getEligibleGrowths(nextUnit)) {
      const roll = randomInt(nextSeed, 1, 100);
      nextSeed = roll.seed;

      if (roll.value <= entry.chance) {
        statGains.push(applyGrowth(nextUnit, entry));
      }
    }

    let usedFallback = false;

    if (statGains.length === 0) {
      const weightedStats = buildWeightedStats(nextUnit);
      const fallbackRoll = pickOne(nextSeed, weightedStats);
      nextSeed = fallbackRoll.seed;
      statGains.push(applyGrowth(nextUnit, fallbackRoll.value));
      usedFallback = true;
    }

    notes.push(`${nextUnit.name} reached level ${nextUnit.level}.`);
    levelUps.push({
      previousLevel,
      newLevel: nextUnit.level,
      usedFallback,
      statGains,
      statSheet: LEVEL_UP_STAT_ORDER.map((stat) => ({
        stat,
        beforeValue: beforeStats[stat],
        afterValue: nextUnit.stats[stat],
        delta: nextUnit.stats[stat] - beforeStats[stat]
      }))
    });
  }

  return {
    unit: nextUnit,
    seed: nextSeed,
    notes,
    levelUps
  };
}
