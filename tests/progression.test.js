import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { pushLevelUpEvents } from "../src/game/simulation/battleLog.js";
import { awardExperience, getXpThreshold } from "../src/game/simulation/progression.js";
import { createUnitFromType } from "../src/game/simulation/unitFactory.js";

test("level ups can increase multiple stats from independent growth rolls", () => {
  const unit = createUnitFromType("grunt", TURN_SIDES.PLAYER, 1);
  const result = awardExperience(unit, getXpThreshold(1), 2);
  const levelUp = result.levelUps[0];

  assert.equal(levelUp.usedFallback, false);
  assert.deepEqual(
    levelUp.statGains.map((gain) => gain.stat),
    ["armor", "maxHealth", "ammoMax"]
  );
  assert.equal(result.unit.stats.armor, 7);
  assert.equal(result.unit.stats.maxHealth, 102);
  assert.equal(result.unit.current.hp, 102);
  assert.equal(result.unit.stats.ammoMax, 8);
  assert.equal(result.unit.current.ammo, 8);
});

test("level ups guarantee at least one stat gain with a weighted fallback", () => {
  const unit = createUnitFromType("grunt", TURN_SIDES.PLAYER, 1);
  const result = awardExperience(unit, getXpThreshold(1), 25);
  const levelUp = result.levelUps[0];

  assert.equal(levelUp.usedFallback, true);
  assert.equal(levelUp.statGains.length, 1);
  assert.equal(levelUp.statGains[0].stat, "maxRange");
  assert.equal(result.unit.stats.maxRange, 2);
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
    ["armor", "maxHealth", "ammoMax"]
  );
  assert.deepEqual(
    state.levelUpQueue[0].statSheet.map((entry) => entry.stat),
    ["maxHealth", "attack", "armor", "movement", "maxRange", "staminaMax", "ammoMax", "luck"]
  );
  assert.equal(state.levelUpQueue[0].statSheet.find((entry) => entry.stat === "maxHealth")?.beforeValue, 100);
  assert.equal(state.levelUpQueue[0].statSheet.find((entry) => entry.stat === "maxHealth")?.afterValue, 102);
});

test("level-ups merge per-unit growth overrides with shared defaults", () => {
  const originalGrowths = UNIT_CATALOG.grunt.levelUpGrowths;
  UNIT_CATALOG.grunt.levelUpGrowths = {
    attack: {
      chance: 100
    },
    maxHealth: {
      chance: 100,
      increment: 4
    }
  };

  try {
    const unit = createUnitFromType("grunt", TURN_SIDES.PLAYER, 1);
    const result = awardExperience(unit, getXpThreshold(1), 25);
    const levelUp = result.levelUps[0];

    assert.equal(levelUp.usedFallback, false);
    assert.equal(levelUp.statGains.find((gain) => gain.stat === "attack")?.increment, 1);
    assert.equal(levelUp.statGains.find((gain) => gain.stat === "maxHealth")?.increment, 4);
    assert.equal(result.unit.stats.maxHealth, 104);
    assert.equal(result.unit.current.hp, 104);
  } finally {
    if (originalGrowths === undefined) {
      delete UNIT_CATALOG.grunt.levelUpGrowths;
    } else {
      UNIT_CATALOG.grunt.levelUpGrowths = originalGrowths;
    }
  }
});
