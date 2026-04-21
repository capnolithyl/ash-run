import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES, UNIT_TAGS } from "../src/game/core/constants.js";
import { getBuildingIncomeForSide } from "../src/game/core/economy.js";
import { MAP_POOL } from "../src/game/content/maps.js";
import { createBattleStateForRun } from "../src/game/state/runFactory.js";
import { createPersistentUnitSnapshot, createUnitFromType } from "../src/game/simulation/unitFactory.js";

function createRunState(overrides = {}) {
  return {
    id: "run-test",
    seed: 99,
    slotId: "slot-1",
    commanderId: "viper",
    mapIndex: 0,
    targetMapCount: 10,
    mapSequence: [MAP_POOL[0].id],
    roster: [],
    completedMaps: [],
    ...overrides
  };
}

function uniquePositionCount(units) {
  return new Set(units.map((unit) => `${unit.x},${unit.y}`)).size;
}

test("createBattleStateForRun restores persistent survivors while seeding opening player funds from buildings", () => {
  const veteran = createUnitFromType("grunt", TURN_SIDES.PLAYER);
  veteran.level = 3;
  veteran.experience = 27;
  veteran.stats.attack += 2;
  veteran.stats.maxHealth += 2;
  const persistentVeteran = createPersistentUnitSnapshot(veteran);
  const runState = createRunState({
    roster: [persistentVeteran]
  });

  const battleState = createBattleStateForRun(runState);
  const deployedVeteran = battleState.player.units[0];
  const expectedOpeningFunds = getBuildingIncomeForSide(battleState.map.buildings, TURN_SIDES.PLAYER);

  assert.equal(battleState.player.funds, expectedOpeningFunds);
  assert.equal(battleState.enemy.recruitsBuiltThisMap, 0);
  assert.equal(deployedVeteran.level, 3);
  assert.equal(deployedVeteran.experience, 27);
  assert.equal(deployedVeteran.stats.attack, veteran.stats.attack);
  assert.equal(deployedVeteran.current.hp, deployedVeteran.stats.maxHealth);
  assert.equal(deployedVeteran.current.stamina, deployedVeteran.stats.staminaMax);
  assert.equal(deployedVeteran.current.ammo, deployedVeteran.stats.ammoMax);
});

test("createBattleStateForRun spreads a large carried roster across unique spawn tiles", () => {
  const roster = Array.from({ length: 10 }, (_, index) => {
    const unitTypeId = index % 3 === 0 ? "grunt" : index % 3 === 1 ? "runner" : "longshot";
    return createPersistentUnitSnapshot(createUnitFromType(unitTypeId, TURN_SIDES.PLAYER));
  });
  const battleState = createBattleStateForRun(createRunState({ roster }));

  assert.equal(battleState.player.units.length, 10);
  assert.equal(uniquePositionCount(battleState.player.units), battleState.player.units.length);
});

test("createBattleStateForRun scales enemy opening pressure on later maps", () => {
  const firstMap = createBattleStateForRun(createRunState({ mapIndex: 0 }));
  const fourthMap = createBattleStateForRun(createRunState({ mapIndex: 3 }));

  assert.ok(fourthMap.enemy.funds > firstMap.enemy.funds);
  assert.ok(fourthMap.enemy.units.length > firstMap.enemy.units.length);
  assert.ok(fourthMap.enemy.units.every((unit) => unit.level >= 2));
  assert.equal(uniquePositionCount(fourthMap.enemy.units), fourthMap.enemy.units.length);
  assert.ok(
    fourthMap.map.buildings.some(
      (building) => building.owner === TURN_SIDES.ENEMY && building.id.includes("neutral")
    )
  );
  assert.ok(fourthMap.log.includes("Enemy pressure increased to tier 4."));
});

test("createBattleStateForRun assigns anti-air support when enemy opens with air power", () => {
  let battleState = null;

  for (let seed = 0; seed < 500 && !battleState; seed += 1) {
    const candidate = createBattleStateForRun(createRunState({
      seed,
      commanderId: "atlas",
      id: `run-air-check-${seed}`
    }));

    if (candidate.enemy.units.some((unit) => unit.family === UNIT_TAGS.AIR)) {
      battleState = candidate;
    }
  }

  assert.ok(battleState, "test should find a deterministic enemy air opener");
  assert.ok(
    battleState.player.units.some((unit) => ["skyguard", "interceptor"].includes(unit.unitTypeId))
  );
  assert.ok(battleState.log.includes("Anti-air escort assigned to answer enemy air power."));
});
