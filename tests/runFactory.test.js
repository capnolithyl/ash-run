import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { getBuildingIncomeForSide } from "../src/game/core/economy.js";
import { MAP_POOL } from "../src/game/content/maps.js";
import { createBattleStateForRun } from "../src/game/state/runFactory.js";
import { createPersistentUnitSnapshot, createUnitFromType } from "../src/game/simulation/unitFactory.js";

test("createBattleStateForRun restores persistent survivors while seeding opening player funds from buildings", () => {
  const veteran = createUnitFromType("grunt", TURN_SIDES.PLAYER);
  veteran.level = 3;
  veteran.experience = 27;
  veteran.stats.attack += 2;
  veteran.stats.maxHealth += 2;
  const persistentVeteran = createPersistentUnitSnapshot(veteran);
  const runState = {
    id: "run-test",
    seed: 99,
    slotId: "slot-1",
    commanderId: "viper",
    mapIndex: 0,
    targetMapCount: 10,
    mapSequence: [MAP_POOL[0].id],
    roster: [persistentVeteran],
    completedMaps: []
  };

  const battleState = createBattleStateForRun(runState);
  const deployedVeteran = battleState.player.units[0];
  const expectedOpeningFunds = getBuildingIncomeForSide(battleState.map.buildings, TURN_SIDES.PLAYER);

  assert.equal(battleState.player.funds, expectedOpeningFunds);
  assert.equal(deployedVeteran.level, 3);
  assert.equal(deployedVeteran.experience, 27);
  assert.equal(deployedVeteran.stats.attack, veteran.stats.attack);
  assert.equal(deployedVeteran.current.hp, deployedVeteran.stats.maxHealth);
  assert.equal(deployedVeteran.current.stamina, deployedVeteran.stats.staminaMax);
  assert.equal(deployedVeteran.current.ammo, deployedVeteran.stats.ammoMax);
});
