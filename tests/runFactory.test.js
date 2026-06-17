import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_AI_ARCHETYPES,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { BUILDING_KEYS } from "../src/game/core/constants.js";
import { MAP_GOAL_TYPES } from "../src/game/content/mapGoals.js";
import { RUN_CARD_TYPES } from "../src/game/content/runUpgrades.js";
import { MAP_POOL, replaceCustomMaps, RUN_MAP_POOL } from "../src/game/content/maps.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { ARMOR_CLASSES, WEAPON_CLASSES } from "../src/game/content/weaponClasses.js";
import {
  applyBattleVictoryToRun,
  createBattleStateForRun,
  createNewRunState,
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
    roster: [
      createPersistentUnitSnapshot(createUnitFromType("grunt", TURN_SIDES.PLAYER)),
      createPersistentUnitSnapshot(createUnitFromType("runner", TURN_SIDES.PLAYER)),
      createPersistentUnitSnapshot(createUnitFromType("longshot", TURN_SIDES.PLAYER))
    ],
    completedMaps: [],
    ...overrides
  };
}

function uniquePositionCount(units) {
  return new Set(units.map((unit) => `${unit.x},${unit.y}`)).size;
}

test.afterEach(() => {
  replaceCustomMaps([]);
});

test("createNewRunState builds map sequences from each run stage pool", () => {
  const originalRunMapPool = [...RUN_MAP_POOL];

  RUN_MAP_POOL.splice(
    0,
    RUN_MAP_POOL.length,
    { id: "stage-one-run", name: "Stage One", runStages: [1] },
    { id: "stage-two-three-run", name: "Stage Two Three", runStages: [2, 3] }
  );

  try {
    const runState = createNewRunState({ slotId: "slot-1", commanderId: "viper" });

    assert.equal(runState.mapSequence[0], "stage-one-run");
    assert.equal(runState.mapSequence[1], "stage-two-three-run");
    assert.equal(runState.mapSequence[2], "stage-two-three-run");
    assert.equal(runState.mapSequence.length, 10);
  } finally {
    RUN_MAP_POOL.splice(0, RUN_MAP_POOL.length, ...originalRunMapPool);
  }
});

test("createBattleStateForRun loads the selected stage from a map bundle", () => {
  replaceCustomMaps([
    {
      format: "ash-run-map-bundle-v1",
      id: "bundle-run",
      name: "Bundle Run",
      stages: [
        {
          id: "bundle-run-stage-1",
          name: "Bundle Run",
          theme: "ash",
          width: 8,
          height: 8,
          stage: 1,
          variantStage: 1,
          runStages: [1]
        },
        {
          id: "bundle-run-stage-2",
          name: "Bundle Run",
          theme: "ash",
          width: 9,
          height: 9,
          stage: 2,
          variantStage: 2,
          runStages: [2]
        }
      ]
    }
  ]);

  const battleState = createBattleStateForRun(createRunState({
    mapIndex: 1,
    mapSequence: ["bundle-run-stage-1-run", "bundle-run-stage-2-run"]
  }));

  assert.equal(battleState.map.id, "bundle-run-stage-2-run");
  assert.equal(battleState.map.variantStage, 2);
  assert.equal(battleState.map.width, 9);
});

test("createUnitFromType preserves armor and weapon classes in the new stat model", () => {
  const breaker = createUnitFromType("breaker", TURN_SIDES.PLAYER);

  assert.equal(breaker.stats.maxHealth, 100);
  assert.equal(breaker.stats.armorClass, ARMOR_CLASSES.INFANTRY);
  assert.equal(breaker.stats.weaponClass, WEAPON_CLASSES.BREAKER_CHARGE);
  assert.equal(breaker.armorClass, ARMOR_CLASSES.INFANTRY);
  assert.equal(breaker.weaponClass, WEAPON_CLASSES.BREAKER_CHARGE);
});

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

test("run card deployment stat changes do not persist as permanent roster growth", () => {
  const grunt = createUnitFromType("grunt", TURN_SIDES.PLAYER);
  const persistentGrunt = createPersistentUnitSnapshot(grunt);
  const runState = createRunState({
    roster: [persistentGrunt],
    ownedRunCardIds: ["supply-mishap-1", "pack-mules-1", "pack-mules-2"]
  });
  const battleState = createBattleStateForRun(runState);
  const deployedGrunt = battleState.player.units[0];

  assert.equal(deployedGrunt.stats.maxHealth, persistentGrunt.stats.maxHealth - 5);
  assert.equal(deployedGrunt.stats.staminaMax, persistentGrunt.stats.staminaMax + 20);
  assert.equal(deployedGrunt.stats.ammoMax, persistentGrunt.stats.ammoMax + 2);

  battleState.victory = {
    winner: TURN_SIDES.PLAYER,
    message: "Battle won."
  };
  const nextRunState = applyBattleVictoryToRun(runState, battleState);

  assert.equal(nextRunState.roster[0].stats.maxHealth, persistentGrunt.stats.maxHealth);
  assert.equal(nextRunState.roster[0].stats.staminaMax, persistentGrunt.stats.staminaMax);
  assert.equal(nextRunState.roster[0].stats.ammoMax, persistentGrunt.stats.ammoMax);
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

test("createBattleStateForRun uses authored enemy placements and the bought player roster", () => {
  replaceCustomMaps([
    {
      id: "authored-opener",
      name: "Authored Opener",
      theme: "ash",
      width: 8,
      height: 8,
      units: [
        { id: "authored-player-grunt", unitTypeId: "grunt", owner: TURN_SIDES.PLAYER, level: 4, x: 1, y: 1 },
        { id: "authored-enemy-breaker", unitTypeId: "breaker", owner: TURN_SIDES.ENEMY, level: 3, x: 5, y: 5 }
      ],
      playerSpawns: [{ x: 1, y: 1 }]
    }
  ]);
  const battleState = createBattleStateForRun(createRunState({
    mapSequence: ["authored-opener-run"]
  }));

  assert.equal(battleState.enemy.units.length, 1);
  assert.equal(battleState.enemy.units[0].id, "authored-enemy-breaker");
  assert.equal(battleState.enemy.units[0].level, 3);
  assert.equal(battleState.enemy.units[0].x, 5);
  assert.equal(battleState.enemy.units[0].y, 5);
  assert.equal(battleState.player.units.some((unit) => unit.id === "authored-player-grunt"), false);
  assert.equal(battleState.player.units.length, 3);
  assert.equal(uniquePositionCount([...battleState.player.units, ...battleState.enemy.units]), 4);
});

test("authored run unit levels roll stats from the run seed", () => {
  replaceCustomMaps([
    {
      id: "leveled-opener",
      name: "Leveled Opener",
      theme: "ash",
      width: 8,
      height: 8,
      units: [
        { id: "leveled-enemy-grunt", unitTypeId: "grunt", owner: TURN_SIDES.ENEMY, level: 8, x: 5, y: 5 }
      ]
    }
  ]);
  const statSignatures = new Set();

  for (let seed = 1; seed <= 20; seed += 1) {
    const battleState = createBattleStateForRun(createRunState({
      seed,
      mapSequence: ["leveled-opener-run"]
    }));
    const enemy = battleState.enemy.units[0];

    assert.equal(enemy.level, 8);
    assert.equal(enemy.experience, 0);
    assert.ok(enemy.stats.attack >= UNIT_CATALOG.grunt.attack);
    statSignatures.add(JSON.stringify(enemy.stats));
  }

  assert.ok(statSignatures.size > 1);
});

test("run battle scaling keeps funds and neutral map-control pressure without generated openers", () => {
  const firstMap = createBattleStateForRun(createRunState({ mapIndex: 0 }));
  const fourthMap = createBattleStateForRun(createRunState({ mapIndex: 3 }));
  const firstEnemyBuildings = firstMap.map.buildings.filter((building) => building.owner === TURN_SIDES.ENEMY);
  const fourthEnemyBuildings = fourthMap.map.buildings.filter((building) => building.owner === TURN_SIDES.ENEMY);

  assert.ok(fourthMap.enemy.funds > firstMap.enemy.funds);
  assert.ok(fourthEnemyBuildings.length > firstEnemyBuildings.length);
  assert.ok(fourthMap.log.includes("Enemy pressure increased to tier 4."));
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

test("skirmish battle creation no longer injects commander starter squads on spawnless maps", () => {
  const battleState = createSkirmishBattleState({
    mapId: "spann-island",
    playerCommanderId: "rook",
    enemyCommanderId: "atlas",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });

  assert.equal(battleState.player.units.length, 0);
  assert.equal(battleState.enemy.units.length, 0);
});

test("skirmish battle creation preserves authored units and owned production buildings", () => {
  replaceCustomMaps([
    {
      id: "skirmish-authored",
      name: "Skirmish Authored",
      theme: "ash",
      width: 8,
      height: 8,
      buildings: [
        { id: "player-barracks", type: BUILDING_KEYS.BARRACKS, owner: TURN_SIDES.PLAYER, x: 1, y: 1 },
        { id: "enemy-motor", type: BUILDING_KEYS.MOTOR_POOL, owner: TURN_SIDES.ENEMY, x: 6, y: 1 }
      ],
      units: [
        { id: "skirmish-player-grunt", unitTypeId: "grunt", owner: TURN_SIDES.PLAYER, level: 2, x: 2, y: 2 },
        { id: "skirmish-enemy-breaker", unitTypeId: "breaker", owner: TURN_SIDES.ENEMY, level: 3, x: 5, y: 5 }
      ]
    }
  ]);
  const battleState = createSkirmishBattleState({
    mapId: "skirmish-authored",
    playerCommanderId: "rook",
    enemyCommanderId: "atlas",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });

  assert.equal(battleState.player.units[0].id, "skirmish-player-grunt");
  assert.equal(battleState.player.units[0].level, 2);
  assert.equal(battleState.enemy.units[0].id, "skirmish-enemy-breaker");
  assert.equal(battleState.enemy.units[0].level, 3);
  assert.equal(battleState.map.buildings.some((building) => building.id === "player-barracks"), true);
  assert.equal(battleState.map.buildings.some((building) => building.id === "enemy-motor"), true);
});

test("run battle creation can deploy bought squads on maps without authored spawn points", () => {
  const battleState = createBattleStateForRun(createRunState({
    mapSequence: ["spann-island-run"]
  }));

  assert.ok(battleState.player.units.length > 0);
  assert.equal(battleState.enemy.units.length, 0);
  assert.equal(uniquePositionCount(battleState.player.units), battleState.player.units.length);
});

test("custom maps participate in live skirmish and run map creation", () => {
  replaceCustomMaps([
    {
      id: "custom-district",
      name: "Custom District",
      theme: "ash",
      width: 8,
      height: 8,
      units: [
        {
          id: "custom-district-player-grunt-1-1",
          unitTypeId: "grunt",
          owner: TURN_SIDES.PLAYER,
          x: 1,
          y: 1
        }
      ]
    }
  ]);

  const skirmishState = createSkirmishBattleState({
    mapId: "custom-district",
    playerCommanderId: "rook",
    enemyCommanderId: "atlas",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });
  const runState = createBattleStateForRun(
    createRunState({
      mapSequence: ["custom-district-run"]
    })
  );

  assert.ok(RUN_MAP_POOL.some((mapDefinition) => mapDefinition.id === "custom-district-run"));
  assert.equal(skirmishState.map.id, "custom-district");
  assert.equal(skirmishState.player.units[0]?.id, "custom-district-player-grunt-1-1");
  assert.equal(runState.map.id, "custom-district-run");
});

test("enemy AI archetype rolls stay biased by commander weights across skirmish battle creation", () => {
  replaceCustomMaps(
    Array.from({ length: 120 }, (_, index) => ({
      id: `ai-weight-check-${index}`,
      name: `AI Weight Check ${index}`,
      theme: "ash",
      width: 8,
      height: 8
    }))
  );
  const atlasCounts = new Map();
  const falconCounts = new Map();

  for (const mapDefinition of MAP_POOL.filter((mapDefinition) =>
    mapDefinition.id.startsWith("ai-weight-check-")
  )) {
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
  const battleState = createSkirmishBattleState({
    mapId: MAP_POOL.find((mapDefinition) => mapDefinition.goal?.type !== MAP_GOAL_TYPES.SURVIVE)?.id,
    playerCommanderId: "rook",
    enemyCommanderId: "atlas",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });
  delete battleState.enemy.aiArchetype;

  const normalized = normalizeBattleState(battleState);

  assert.equal(normalized.enemy.aiArchetype, ENEMY_AI_ARCHETYPES.BALANCED);
});

test("battle state normalization backfills mission data from the map goal", () => {
  const battleState = createSkirmishBattleState({
    mapId: MAP_POOL[0].id,
    playerCommanderId: "rook",
    enemyCommanderId: "atlas",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });

  battleState.map.goal = {
    type: MAP_GOAL_TYPES.RESCUE,
    target: {
      x: 2,
      y: 2
    }
  };
  battleState.map.buildings = [
    {
      id: "player-hq",
      type: BUILDING_KEYS.COMMAND,
      owner: TURN_SIDES.PLAYER,
      x: 1,
      y: 1
    },
    {
      id: "enemy-sector",
      type: BUILDING_KEYS.SECTOR,
      owner: TURN_SIDES.ENEMY,
      x: 2,
      y: 2
    }
  ];
  delete battleState.mission;

  const normalized = normalizeBattleState(battleState);

  assert.equal(normalized.mission.type, MAP_GOAL_TYPES.RESCUE);
  assert.deepEqual(normalized.mission.target, { x: 2, y: 2 });
  assert.equal(normalized.mission.rescue.status, "waiting");
  assert.deepEqual(normalized.mission.playerHq, { id: "player-hq", x: 1, y: 1 });
});

test("survive missions force hyper-aggressive enemy AI when battle state is normalized", () => {
  const battleState = createSkirmishBattleState({
    mapId: MAP_POOL.find((mapDefinition) => mapDefinition.goal?.type !== MAP_GOAL_TYPES.SURVIVE)?.id,
    playerCommanderId: "rook",
    enemyCommanderId: "atlas",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });

  battleState.map.goal = {
    type: MAP_GOAL_TYPES.SURVIVE,
    turnLimit: 4
  };
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.TURTLE;
  delete battleState.mission;

  const normalized = normalizeBattleState(battleState);

  assert.equal(normalized.mission.type, MAP_GOAL_TYPES.SURVIVE);
  assert.equal(normalized.mission.turnsRemaining, 4);
  assert.equal(normalized.enemy.aiArchetype, ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE);
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

test("gear rewards stay repeatable even after earlier gear picks", () => {
  const baseRunState = createRunState({
    availableRunCardIds: ["passive-drill", "passive-plating", "gear-aa-kit", "gear-field-meds"],
    selectedRewards: [{ id: "passive-drill", type: RUN_CARD_TYPES.PASSIVE }]
  });
  const battleState = createBattleStateForRun(baseRunState);
  const nextRunState = applyBattleVictoryToRun(
    {
      ...baseRunState,
      pendingGearReward: null
    },
    battleState
  );

  assert.ok(nextRunState.pendingRewardChoices.some((choice) => choice.id === "gear-aa-kit"));
  assert.ok(nextRunState.pendingRewardChoices.some((choice) => choice.id === "gear-field-meds"));
});

test("gear rewards can still appear when the surviving roster has no infantry", () => {
  const runner = createPersistentUnitSnapshot(createUnitFromType("runner", TURN_SIDES.PLAYER));
  const bruiser = createPersistentUnitSnapshot(createUnitFromType("bruiser", TURN_SIDES.PLAYER));
  const runState = createRunState({
    roster: [runner, bruiser],
    availableRunCardIds: ["passive-plating", "gear-aa-kit", "gear-field-meds"]
  });
  const battleState = createBattleStateForRun(runState);
  const nextRunState = applyBattleVictoryToRun(runState, battleState);

  assert.deepEqual(
    new Set(nextRunState.pendingRewardChoices.map((choice) => choice.id)),
    new Set(["passive-plating", "gear-aa-kit", "gear-field-meds"])
  );
});
