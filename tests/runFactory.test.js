import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_AI_ARCHETYPES,
  TURN_SIDES,
  UNIT_TAGS
} from "../src/game/core/constants.js";
import { RUN_CARD_TYPES } from "../src/game/content/runUpgrades.js";
import { MAP_POOL } from "../src/game/content/maps.js";
import {
  applyBattleVictoryToRun,
  createBattleStateForRun,
  createSkirmishBattleState,
  normalizeBattleState
} from "../src/game/state/runFactory.js";
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

test("createBattleStateForRun restores persistent survivors without run-mode player funds", () => {
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
  assert.equal(battleState.mode, "run");
  assert.equal(battleState.player.funds, 0);
  assert.equal(battleState.enemy.recruitsBuiltThisMap, 0);
  assert.equal(deployedVeteran.level, 3);
  assert.equal(deployedVeteran.experience, 27);
  assert.equal(deployedVeteran.stats.attack, veteran.stats.attack);
  assert.equal(deployedVeteran.current.hp, deployedVeteran.stats.maxHealth);
  assert.equal(deployedVeteran.current.stamina, deployedVeteran.stats.staminaMax);
  assert.equal(deployedVeteran.current.ammo, deployedVeteran.stats.ammoMax);
});

test("createBattleStateForRun deploys carried roster across unique spawn tiles", () => {
  const roster = Array.from({ length: 10 }, (_, index) => {
    const unitTypeId = index % 3 === 0 ? "grunt" : index % 3 === 1 ? "runner" : "longshot";
    return createPersistentUnitSnapshot(createUnitFromType(unitTypeId, TURN_SIDES.PLAYER));
  });
  const battleState = createBattleStateForRun(createRunState({ roster }));

  assert.equal(battleState.player.units.length, roster.length);
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
      mapIndex: 3,
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

test("enemy air units are gated until map four", () => {
  const earlyAirOpener = Array.from({ length: 200 }, (_, seed) =>
    createBattleStateForRun(createRunState({
      seed,
      mapIndex: 0,
      commanderId: "atlas",
      id: `run-early-air-${seed}`
    }))
  ).find((candidate) => candidate.enemy.units.some((unit) => unit.family === UNIT_TAGS.AIR));

  assert.equal(earlyAirOpener, undefined);
});

test("skirmish battle creation assigns deterministic enemy AI archetypes for the same commander and map", () => {
  const firstBattle = createSkirmishBattleState({
    mapId: MAP_POOL[0].id,
    playerCommanderId: "rook",
    enemyCommanderId: "atlas",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });
  const secondBattle = createSkirmishBattleState({
    mapId: MAP_POOL[0].id,
    playerCommanderId: "rook",
    enemyCommanderId: "atlas",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });

  assert.equal(firstBattle.enemy.aiArchetype, secondBattle.enemy.aiArchetype);
});

test("enemy AI archetype rolls stay biased by commander weights across skirmish battle creation", () => {
  const atlasCounts = new Map();
  const falconCounts = new Map();

  for (const mapDefinition of MAP_POOL) {
    const atlasBattle = createSkirmishBattleState({
      mapId: mapDefinition.id,
      playerCommanderId: "rook",
      enemyCommanderId: "atlas",
      startingFunds: 1200,
      fundsPerBuilding: 100
    });
    atlasCounts.set(
      atlasBattle.enemy.aiArchetype,
      (atlasCounts.get(atlasBattle.enemy.aiArchetype) ?? 0) + 1
    );

    const falconBattle = createSkirmishBattleState({
      mapId: mapDefinition.id,
      playerCommanderId: "rook",
      enemyCommanderId: "falcon",
      startingFunds: 1200,
      fundsPerBuilding: 100
    });
    falconCounts.set(
      falconBattle.enemy.aiArchetype,
      (falconCounts.get(falconBattle.enemy.aiArchetype) ?? 0) + 1
    );
  }

  assert.ok(
    (atlasCounts.get(ENEMY_AI_ARCHETYPES.TURTLE) ?? 0) >
      (atlasCounts.get(ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE) ?? 0)
  );
  assert.ok(
    (falconCounts.get(ENEMY_AI_ARCHETYPES.HQ_RUSH) ?? 0) >=
      (falconCounts.get(ENEMY_AI_ARCHETYPES.CAPTURE) ?? 0)
  );
});

test("legacy battle states normalize a missing enemy AI archetype to balanced", () => {
  const battleState = createBattleStateForRun(createRunState());
  delete battleState.enemy.aiArchetype;

  const normalized = normalizeBattleState(battleState);

  assert.equal(normalized.enemy.aiArchetype, ENEMY_AI_ARCHETYPES.BALANCED);
});

test("forced draft maps offer only reinforcement unit choices", () => {
  const runState = createRunState({
    mapIndex: 1,
    availableDraftUnitIds: ["grunt", "runner", "longshot", "medic"]
  });
  const battleState = createBattleStateForRun(runState);
  const nextRunState = applyBattleVictoryToRun(runState, battleState);

  assert.equal(nextRunState.pendingRewardChoices.length, 3);
  assert.ok(nextRunState.pendingRewardChoices.every((choice) => choice.type === RUN_CARD_TYPES.UNIT));
  assert.equal(
    new Set(nextRunState.pendingRewardChoices.map((choice) => choice.unitTypeId)).size,
    nextRunState.pendingRewardChoices.length
  );
});

test("non-forced reward choices stay within unlocked unowned upgrades", () => {
  const baseRunState = createRunState({
    availableRunCardIds: ["passive-drill", "passive-plating", "gear-aa-kit", "gear-field-meds"],
    selectedRewards: [{ id: "passive-drill", type: RUN_CARD_TYPES.PASSIVE }]
  });
  const firstBattle = createBattleStateForRun(baseRunState);
  const firstRewards = applyBattleVictoryToRun(baseRunState, firstBattle).pendingRewardChoices;

  assert.ok(firstRewards.every((choice) => choice.type !== RUN_CARD_TYPES.UNIT));
  assert.ok(firstRewards.every((choice) => choice.id !== "passive-drill"));
  assert.ok(
    firstRewards.every((choice) =>
      ["passive-plating", "gear-aa-kit", "gear-field-meds"].includes(choice.id)
    )
  );
  assert.deepEqual(
    new Set(firstRewards.map((choice) => choice.id)),
    new Set(["passive-plating", "gear-aa-kit", "gear-field-meds"])
  );
});
