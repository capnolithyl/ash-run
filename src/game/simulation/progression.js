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
  "luck",
];

const LEVEL_UP_GROWTH_ROLL_ORDER = [
  "attack",
  "armor",
  "maxHealth",
  "movement",
  "maxRange",
  "staminaMax",
  "ammoMax",
  "luck",
];

// Shared defaults for level-up growth rolls. Per-unit entries in
// `UNIT_CATALOG[unitTypeId].levelUpGrowthModifiers` add to these values.
export const DEFAULT_LEVEL_UP_GROWTHS = {
  attack: { chance: 57, weight: 6, increment: [6, 8] },
  armor: { chance: 48, weight: 4, increment: [3, 5] },
  maxHealth: { chance: 68, weight: 6, increment: [10, 17] },
  movement: { chance: 4, weight: 0, increment: 1 },
  maxRange: { chance: 1, weight: 0, increment: 1 },
  staminaMax: { chance: 33, weight: 2, increment: [9, 13] },
  ammoMax: { chance: 42, weight: 5, increment: [1, 2] },
  luck: { chance: 16, weight: 3, increment: [1, 2] },
};

function snapshotGrowthStats(unit) {
  return Object.fromEntries(
    LEVEL_UP_STAT_ORDER.map((stat) => [stat, unit.stats[stat]]),
  );
}

function resolveGrowthIncrementDefinition(defaultIncrement, modifier = {}) {
  const [defaultMinimum, defaultMaximum] = Array.isArray(defaultIncrement)
    ? defaultIncrement
    : [defaultIncrement, defaultIncrement];
  const minimum = defaultMinimum + (modifier.min ?? 0);
  const maximum = defaultMaximum + (modifier.max ?? 0);

  return minimum === maximum ? minimum : [minimum, maximum];
}

function getLevelUpGrowthEntries(unit) {
  const unitType = UNIT_CATALOG[unit.unitTypeId] ?? {};
  const modifiers = unitType.levelUpGrowthModifiers ?? {};

  return LEVEL_UP_GROWTH_ROLL_ORDER.map((stat) => {
    const defaults = DEFAULT_LEVEL_UP_GROWTHS[stat];
    const modifier = modifiers[stat] ?? {};

    return {
      stat,
      chance: defaults.chance + (modifier.chance ?? 0),
      weight: defaults.weight + (modifier.weight ?? 0),
      increment: resolveGrowthIncrementDefinition(
        defaults.increment,
        modifier.increment,
      ),
    };
  });
}

function isGrowthEligible(unit, entry) {
  return !(entry.stat === "maxRange" && unit.stats.maxRange === 0);
}

function getEligibleGrowths(unit) {
  return getLevelUpGrowthEntries(unit).filter((entry) =>
    isGrowthEligible(unit, entry),
  );
}

function buildWeightedStats(unit) {
  return getEligibleGrowths(unit).flatMap((entry) =>
    Array.from({ length: entry.weight }, () => entry),
  );
}

function resolveGrowthIncrement(entry, seed) {
  if (Array.isArray(entry.increment)) {
    const minimum = Math.floor(entry.increment[0]);
    const maximum = Math.floor(entry.increment[1]);

    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      return { seed, value: 0 };
    }

    return randomInt(
      seed,
      Math.min(minimum, maximum),
      Math.max(minimum, maximum),
    );
  }

  return {
    seed,
    value: Math.floor(entry.increment ?? 0),
  };
}

function applyGrowth(unit, entry, seed) {
  const incrementRoll = resolveGrowthIncrement(entry, seed);
  const increment = incrementRoll.value;
  const previousValue = unit.stats[entry.stat];

  unit.stats[entry.stat] += increment;

  if (entry.stat === "maxHealth") {
    unit.current.hp += increment;
  }

  if (entry.stat === "staminaMax") {
    unit.current.stamina += increment;
  }

  if (entry.stat === "ammoMax") {
    unit.current.ammo += increment;
  }

  return {
    seed: incrementRoll.seed,
    gain: {
      stat: entry.stat,
      increment,
      previousValue,
      nextValue: unit.stats[entry.stat],
    },
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
    ratio: threshold > 0 ? unit.experience / threshold : 0,
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
        const appliedGrowth = applyGrowth(nextUnit, entry, nextSeed);
        nextSeed = appliedGrowth.seed;
        statGains.push(appliedGrowth.gain);
      }
    }

    let usedFallback = false;

    if (statGains.length === 0) {
      const weightedStats = buildWeightedStats(nextUnit);
      const fallbackRoll = pickOne(nextSeed, weightedStats);
      nextSeed = fallbackRoll.seed;
      const appliedGrowth = applyGrowth(nextUnit, fallbackRoll.value, nextSeed);
      nextSeed = appliedGrowth.seed;
      statGains.push(appliedGrowth.gain);
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
        delta: nextUnit.stats[stat] - beforeStats[stat],
      })),
    });
  }

  return {
    unit: nextUnit,
    seed: nextSeed,
    notes,
    levelUps,
  };
}
