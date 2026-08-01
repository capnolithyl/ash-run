import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { pushLevelUpEvents } from "../src/game/simulation/battleLog.js";
import {
  awardExperience,
  DEFAULT_LEVEL_UP_GROWTHS,
  getXpThreshold
} from "../src/game/simulation/progression.js";
import { createUnitFromType } from "../src/game/simulation/unitFactory.js";

const PRE_MODIFIER_GROWTH_OVERRIDES = {
  grunt: {
    armor: { increment: [1, 3] },
    movement: { chance: 15, increment: [2, 3] },
    maxRange: { chance: 5, weight: 1, increment: 1 },
    staminaMax: { chance: 30, weight: 1, increment: [7, 10] },
    ammoMax: { chance: 45, weight: 4, increment: [2, 3] },
    luck: { increment: [1, 3] }
  },
  breaker: {
    armor: { increment: [2, 3] },
    movement: { chance: 15, increment: [2, 3] },
    maxRange: { chance: 3, weight: 1, increment: 1 },
    staminaMax: { chance: 35, increment: [7, 10] },
    ammoMax: { chance: 45, weight: 4, increment: [2, 3] }
  },
  longshot: {
    attack: { chance: 65, weight: 7, increment: [7, 8] },
    armor: { chance: 30, weight: 2, increment: [1, 2] },
    maxHealth: { chance: 45, weight: 3, increment: [7, 13] },
    movement: { chance: 6, weight: 1, increment: 1 },
    maxRange: { chance: 7, weight: 1, increment: 1 },
    staminaMax: { chance: 25, weight: 2, increment: [10, 13] },
    ammoMax: { chance: 45 },
    luck: { chance: 17, weight: 4, increment: [2, 3] }
  },
  medic: {
    attack: { chance: 25, weight: 3, increment: [3, 5] },
    armor: { chance: 60, weight: 5, increment: [2, 3] },
    maxHealth: { chance: 65, increment: [9, 15] },
    movement: { chance: 2, weight: 0, increment: 1 },
    maxRange: { chance: 0 },
    staminaMax: { chance: 25, weight: 3, increment: [7, 12] },
    ammoMax: { chance: 25, weight: 4, increment: 1 },
    luck: { chance: 20, weight: 2, increment: [2, 3] }
  },
  mechanic: {
    attack: { chance: 25, weight: 3, increment: [3, 5] },
    armor: { chance: 60, weight: 5, increment: [2, 3] },
    maxHealth: { chance: 65, increment: [9, 15] },
    movement: { chance: 2, weight: 0, increment: 1 },
    maxRange: { chance: 0 },
    staminaMax: { chance: 25, weight: 3, increment: [7, 12] },
    ammoMax: { chance: 25, weight: 4, increment: 1 },
    luck: { chance: 20, weight: 2, increment: [2, 3] }
  },
  runner: {
    attack: { chance: 55, weight: 7, increment: [7, 9] },
    armor: { chance: 40, weight: 4, increment: [3, 5] },
    maxHealth: { chance: 65, weight: 5, increment: [8, 16] },
    movement: { chance: 8, weight: 2, increment: [1, 2] },
    maxRange: { chance: 2, weight: 0, increment: 1 },
    staminaMax: { chance: 40, weight: 3, increment: [10, 15] },
    ammoMax: { chance: 45, weight: 5, increment: [2, 3] },
    luck: { chance: 18, weight: 2, increment: [1, 2] }
  },
  juggernaut: {
    armor: { chance: 45, weight: 5, increment: [5, 7] },
    maxHealth: { chance: 70, weight: 7, increment: [12, 18] },
    movement: { chance: 0, weight: 0, increment: 0 },
    maxRange: { chance: 1, weight: 0, increment: [1, 3] },
    ammoMax: { chance: 45, weight: 5, increment: [2, 3] },
    luck: { chance: 8, weight: 1, increment: 1 }
  },
  "siege-gun": {
    attack: { increment: [7, 8] },
    armor: { chance: 40, weight: 3, increment: [1, 3] },
    maxHealth: { chance: 40, weight: 4, increment: [7, 10] },
    movement: { chance: 2, weight: 0, increment: [1, 2] },
    maxRange: { chance: 4, weight: 1, increment: [1, 2] },
    staminaMax: { chance: 35, weight: 3, increment: [5, 7] },
    ammoMax: { chance: 47, weight: 4, increment: [2, 4] },
    luck: { chance: 18, weight: 4, increment: [2, 3] }
  },
  skyguard: {
    attack: { chance: 30, weight: 3, increment: [4, 5] },
    armor: { chance: 60, weight: 5, increment: [4, 6] },
    maxHealth: { chance: 60, weight: 6, increment: [8, 12] },
    movement: { chance: 4, weight: 0, increment: 1 },
    maxRange: { chance: 3, weight: 0, increment: 1 },
    staminaMax: { chance: 35, weight: 3, increment: [10, 12] },
    ammoMax: { chance: 45, weight: 4, increment: 1 },
    luck: { chance: 8, weight: 1, increment: 1 }
  }
};

function resolveIncrementModifiers(defaultIncrement, modifier = {}) {
  const [defaultMinimum, defaultMaximum] = Array.isArray(defaultIncrement)
    ? defaultIncrement
    : [defaultIncrement, defaultIncrement];
  const minimum = defaultMinimum + (modifier.min ?? 0);
  const maximum = defaultMaximum + (modifier.max ?? 0);

  return minimum === maximum ? minimum : [minimum, maximum];
}

function resolveCatalogGrowths(unitType) {
  return Object.fromEntries(Object.entries(DEFAULT_LEVEL_UP_GROWTHS).map(([stat, defaults]) => {
    const modifier = unitType.levelUpGrowthModifiers?.[stat] ?? {};

    return [stat, {
      chance: defaults.chance + (modifier.chance ?? 0),
      weight: defaults.weight + (modifier.weight ?? 0),
      increment: resolveIncrementModifiers(defaults.increment, modifier.increment)
    }];
  }));
}

function getExpectedPreModifierGrowths(unitTypeId) {
  const overrides = PRE_MODIFIER_GROWTH_OVERRIDES[unitTypeId] ?? {};

  return Object.fromEntries(Object.entries(DEFAULT_LEVEL_UP_GROWTHS).map(([stat, defaults]) => [
    stat,
    { ...defaults, ...(overrides[stat] ?? {}) }
  ]));
}

test("level ups can increase multiple stats from independent growth rolls", () => {
  const unit = createUnitFromType("grunt", TURN_SIDES.PLAYER, 1);
  const result = awardExperience(unit, getXpThreshold(1), 2);
  const levelUp = result.levelUps[0];

  assert.equal(levelUp.usedFallback, false);
  assert.deepEqual(
    levelUp.statGains.map((gain) => gain.stat),
    ["armor", "maxHealth"]
  );
  assert.equal(result.unit.stats.armor, 8);
  assert.equal(result.unit.stats.maxHealth, 110);
  assert.equal(result.unit.current.hp, 110);
});

test("level ups guarantee at least one stat gain with a weighted fallback", () => {
  const unit = createUnitFromType("grunt", TURN_SIDES.PLAYER, 1);
  const result = awardExperience(unit, getXpThreshold(1), 112);
  const levelUp = result.levelUps[0];

  assert.equal(levelUp.usedFallback, true);
  assert.equal(levelUp.statGains.length, 1);
  assert.equal(levelUp.statGains[0].stat, "ammoMax");
  assert.equal(result.unit.stats.ammoMax, 10);
  assert.equal(result.unit.current.ammo, 10);
});

test("player level-up events preserve all stat gains in one overlay payload", () => {
  const unit = createUnitFromType("grunt", TURN_SIDES.PLAYER, 1);
  const result = awardExperience(unit, getXpThreshold(1), 2);
  const state = {
    levelUpQueue: []
  };

  pushLevelUpEvents(state, result.unit, result.levelUps);

  assert.equal(state.levelUpQueue.length, 1);
  assert.deepEqual(
    state.levelUpQueue[0].statGains.map((gain) => gain.stat),
    ["armor", "maxHealth"]
  );
  assert.deepEqual(
    state.levelUpQueue[0].statSheet.map((entry) => entry.stat),
    ["maxHealth", "attack", "armor", "movement", "maxRange", "staminaMax", "ammoMax", "luck"]
  );
  assert.equal(state.levelUpQueue[0].statSheet.find((entry) => entry.stat === "maxHealth")?.beforeValue, 100);
  assert.equal(state.levelUpQueue[0].statSheet.find((entry) => entry.stat === "maxHealth")?.afterValue, 110);
});

test("level-ups add per-unit chance and increment modifiers to shared defaults", () => {
  const originalModifiers = UNIT_CATALOG.grunt.levelUpGrowthModifiers;
  UNIT_CATALOG.grunt.levelUpGrowthModifiers = {
    attack: { chance: 43, increment: { min: 1, max: 0 } },
    armor: { chance: -48 },
    maxHealth: { chance: 32, increment: { min: -6, max: -13 } },
    movement: { chance: -4 },
    maxRange: { chance: -1 },
    staminaMax: { chance: 67, increment: { min: -7, max: -11 } },
    ammoMax: { chance: 58, increment: { min: 1, max: 0 } },
    luck: { chance: -16 }
  };

  try {
    const unit = createUnitFromType("grunt", TURN_SIDES.PLAYER, 1);
    const result = awardExperience(unit, getXpThreshold(1), 25);
    const levelUp = result.levelUps[0];

    assert.equal(levelUp.usedFallback, false);
    assert.ok([7, 8].includes(levelUp.statGains.find((gain) => gain.stat === "attack")?.increment));
    assert.equal(levelUp.statGains.find((gain) => gain.stat === "maxHealth")?.increment, 4);
    assert.equal(levelUp.statGains.find((gain) => gain.stat === "staminaMax")?.increment, 2);
    assert.equal(levelUp.statGains.find((gain) => gain.stat === "ammoMax")?.increment, 2);
    assert.equal(result.unit.stats.maxHealth, 104);
    assert.equal(result.unit.current.hp, 104);
    assert.equal(result.unit.stats.staminaMax, 62);
    assert.equal(result.unit.current.stamina, 62);
    assert.equal(result.unit.stats.ammoMax, 9);
    assert.equal(result.unit.current.ammo, 9);
  } finally {
    if (originalModifiers === undefined) {
      delete UNIT_CATALOG.grunt.levelUpGrowthModifiers;
    } else {
      UNIT_CATALOG.grunt.levelUpGrowthModifiers = originalModifiers;
    }
  }
});

test("level-up fallback uses positively and negatively modified weights", () => {
  const originalModifiers = UNIT_CATALOG.grunt.levelUpGrowthModifiers;
  UNIT_CATALOG.grunt.levelUpGrowthModifiers = {
    attack: { chance: -57, weight: 1, increment: { min: -5, max: -7 } },
    armor: { chance: -48, weight: -4 },
    maxHealth: { chance: -68, weight: -6 },
    movement: { chance: -4 },
    maxRange: { chance: -1 },
    staminaMax: { chance: -33, weight: -2 },
    ammoMax: { chance: -42, weight: -5 },
    luck: { chance: -16, weight: -3 }
  };

  try {
    const unit = createUnitFromType("grunt", TURN_SIDES.PLAYER, 1);
    const result = awardExperience(unit, getXpThreshold(1), 25);
    const levelUp = result.levelUps[0];

    assert.equal(levelUp.usedFallback, true);
    assert.deepEqual(levelUp.statGains.map((gain) => gain.stat), ["attack"]);
    assert.equal(levelUp.statGains[0].increment, 1);
  } finally {
    UNIT_CATALOG.grunt.levelUpGrowthModifiers = originalModifiers;
  }
});

test("catalog growth modifiers preserve every pre-conversion growth table", () => {
  for (const [unitTypeId, unitType] of Object.entries(UNIT_CATALOG)) {
    assert.deepEqual(
      resolveCatalogGrowths(unitType),
      getExpectedPreModifierGrowths(unitTypeId),
      `${unitTypeId} growths changed during modifier conversion`
    );
  }
});
