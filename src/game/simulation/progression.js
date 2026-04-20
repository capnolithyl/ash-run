import { pickOne } from "../core/random.js";

const LEVEL_UP_WEIGHTS = [
  { stat: "attack", weight: 4, increment: 1 },
  { stat: "armor", weight: 4, increment: 1 },
  { stat: "maxHealth", weight: 4, increment: 2 },
  { stat: "movement", weight: 1, increment: 1 },
  { stat: "maxRange", weight: 1, increment: 1 },
  { stat: "staminaMax", weight: 2, increment: 1 },
  { stat: "ammoMax", weight: 2, increment: 1 },
  { stat: "luck", weight: 2, increment: 1 }
];

function buildWeightedStats(unit) {
  return LEVEL_UP_WEIGHTS.flatMap((entry) => {
    if (entry.stat === "maxRange" && unit.stats.maxRange === 0) {
      return [];
    }

    return Array.from({ length: entry.weight }, () => entry);
  });
}

export function getXpThreshold(level) {
  return 80 + (level - 1) * 35;
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

    const weightedStats = buildWeightedStats(nextUnit);
    const roll = pickOne(nextSeed, weightedStats);
    nextSeed = roll.seed;

    const previousValue = nextUnit.stats[roll.value.stat];
    nextUnit.stats[roll.value.stat] += roll.value.increment;

    if (roll.value.stat === "maxHealth") {
      nextUnit.current.hp += roll.value.increment;
    }

    if (roll.value.stat === "staminaMax") {
      nextUnit.current.stamina += roll.value.increment;
    }

    if (roll.value.stat === "ammoMax") {
      nextUnit.current.ammo += roll.value.increment;
    }

    notes.push(`${nextUnit.name} reached level ${nextUnit.level}.`);
    levelUps.push({
      previousLevel,
      newLevel: nextUnit.level,
      stat: roll.value.stat,
      increment: roll.value.increment,
      previousValue,
      nextValue: nextUnit.stats[roll.value.stat]
    });
  }

  return {
    unit: nextUnit,
    seed: nextSeed,
    notes,
    levelUps
  };
}
