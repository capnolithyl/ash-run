import { pickOne, randomInt } from "../core/random.js";

const LEVEL_UP_GROWTHS = [
  { stat: "attack", chance: 50, weight: 4, increment: 1 },
  { stat: "armor", chance: 50, weight: 4, increment: 1 },
  { stat: "maxHealth", chance: 50, weight: 4, increment: 2 },
  { stat: "movement", chance: 10, weight: 1, increment: 1 },
  { stat: "maxRange", chance: 5, weight: 1, increment: 1 },
  { stat: "staminaMax", chance: 25, weight: 2, increment: 1 },
  { stat: "ammoMax", chance: 20, weight: 2, increment: 1 },
  { stat: "luck", chance: 20, weight: 2, increment: 1 }
];

function isGrowthEligible(unit, entry) {
  return !(entry.stat === "maxRange" && unit.stats.maxRange === 0);
}

function getEligibleGrowths(unit) {
  return LEVEL_UP_GROWTHS.filter((entry) => isGrowthEligible(unit, entry));
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
      statGains
    });
  }

  return {
    unit: nextUnit,
    seed: nextSeed,
    notes,
    levelUps
  };
}
