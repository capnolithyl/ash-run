import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
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
  assert.equal(result.unit.stats.armor, 2);
  assert.equal(result.unit.stats.maxHealth, 20);
  assert.equal(result.unit.current.hp, 20);
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
});
