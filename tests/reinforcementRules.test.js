import test from "node:test";
import assert from "node:assert/strict";
import {
  TERRAIN_KEYS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { MAP_GOAL_TYPES } from "../src/game/content/mapGoals.js";
import {
  REINFORCEMENT_TRIGGER_TYPES
} from "../src/game/content/reinforcements.js";
import { replaceCustomMaps } from "../src/game/content/maps.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import {
  prepareEnemyTurnEndReinforcements,
  resolveReinforcementTriggers
} from "../src/game/simulation/reinforcementRules.js";
import {
  createPlacedUnit,
  createTestBattleState
} from "./helpers/createTestBattleState.js";
import {
  createBattleStateForRun,
  createSkirmishBattleState
} from "../src/game/state/runFactory.js";

test.afterEach(() => {
  replaceCustomMaps([]);
});

function createWave({
  id = "wave-1",
  name = "Wave 1",
  type = REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED,
  every = 1,
  maxActivations = 1,
  targetUnitId = null,
  tiles = [],
  units = [{ id: `${id}-grunt`, unitTypeId: "grunt", level: 3, x: 6, y: 4 }]
} = {}) {
  const trigger = { type };

  if (type === REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED) {
    trigger.tiles = tiles;
  }

  if (type === REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED) {
    trigger.targetUnitId = targetUnitId;
  }

  if (
    type === REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES ||
    type === REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED
  ) {
    trigger.every = every;
  }

  return {
    id,
    name,
    maxActivations,
    trigger,
    units
  };
}

function configureState(state, waves, goal = { type: MAP_GOAL_TYPES.SURVIVE, turnLimit: 99 }) {
  state.map.goal = goal;
  state.map.units = [
    ...state.player.units.map((unit) => ({
      id: unit.id,
      unitTypeId: unit.unitTypeId,
      owner: unit.owner,
      level: unit.level,
      x: unit.x,
      y: unit.y
    })),
    ...state.enemy.units.map((unit) => ({
      id: unit.id,
      unitTypeId: unit.unitTypeId,
      owner: unit.owner,
      level: unit.level,
      x: unit.x,
      y: unit.y
    }))
  ];
  state.map.reinforcements = waves;
  return state;
}

test("rescue and specific-unit waves are one-shot and can activate together", () => {
  const player = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1, { id: "rescuer" });
  const target = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 4, { id: "target-enemy" });
  const state = configureState(
    createTestBattleState({ playerUnits: [player], enemyUnits: [target] }),
    [
      createWave({
        id: "rescue-wave",
        type: REINFORCEMENT_TRIGGER_TYPES.RESCUE_PICKED_UP,
        maxActivations: 8,
        units: [{ id: "rescue-grunt", unitTypeId: "grunt", level: 2, x: 6, y: 4 }]
      }),
      createWave({
        id: "target-wave",
        type: REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED,
        targetUnitId: target.id,
        maxActivations: 8,
        units: [{ id: "target-grunt", unitTypeId: "grunt", level: 2, x: 6, y: 3 }]
      })
    ]
  );
  const system = new BattleSystem(state);

  system.state.mission.rescue.status = "carried";
  system.state.mission.rescue.carrierUnitId = player.id;
  system.state.enemy.units = [];

  const activations = resolveReinforcementTriggers(system.state);

  assert.deepEqual(
    activations.map((activation) => activation.waveId),
    ["rescue-wave", "target-wave"]
  );
  assert.deepEqual(system.state.reinforcementState.activationsByWaveId, {
    "rescue-wave": 1,
    "target-wave": 1
  });
  assert.equal(resolveReinforcementTriggers(system.state).length, 0);
});

test("casualty waves repeat on their interval, share triggers, and stop at their caps", () => {
  const enemies = Array.from({ length: 4 }, (_, index) =>
    createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4 + (index % 2), 1 + Math.floor(index / 2), {
      id: `starting-enemy-${index + 1}`
    })
  );
  const state = configureState(
    createTestBattleState({
      playerUnits: [createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1)],
      enemyUnits: enemies
    }),
    [
      createWave({
        id: "casualty-wave-a",
        type: REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES,
        every: 2,
        maxActivations: 2
      }),
      createWave({
        id: "casualty-wave-b",
        type: REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES,
        every: 2,
        maxActivations: 1,
        units: [{ id: "wave-b-runner", unitTypeId: "runner", level: 2, x: 6, y: 3 }]
      })
    ]
  );
  const system = new BattleSystem(state);

  system.state.enemy.units = system.state.enemy.units.slice(2);
  let activations = resolveReinforcementTriggers(system.state);

  assert.deepEqual(
    activations.map((activation) => activation.waveId),
    ["casualty-wave-a", "casualty-wave-b"]
  );
  assert.equal(system.state.reinforcementState.enemyCasualties, 2);

  system.state.enemy.units = system.state.enemy.units.filter(
    (unit) => !unit.id.startsWith("starting-enemy-")
  );
  activations = resolveReinforcementTriggers(system.state);

  assert.deepEqual(activations.map((activation) => activation.waveId), ["casualty-wave-a"]);
  assert.equal(system.state.reinforcementState.enemyCasualties, 4);
  assert.equal(resolveReinforcementTriggers(system.state).length, 0);
});

test("turn waves queue at enemy-turn end and deploy one unit at a time without joining the action queue", () => {
  const state = configureState(
    createTestBattleState({
      playerUnits: [createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1)],
      enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5)]
    }),
    [
      createWave({
        id: "turn-wave",
        maxActivations: 2,
        units: [
          { id: "turn-wave-grunt", unitTypeId: "grunt", level: 3, x: 6, y: 4 },
          { id: "turn-wave-runner", unitTypeId: "runner", level: 2, x: 6, y: 3 }
        ]
      })
    ]
  );
  const system = new BattleSystem(state);

  assert.equal(system.endTurn(), true);
  const result = system.startEnemyTurnActions();
  let saved = system.getStateForSave();

  assert.equal(result.reinforcementActivations.length, 0);
  assert.equal(
    saved.enemy.units.some((unit) =>
      unit.id.startsWith("turn-wave-activation-1-")
    ),
    false
  );
  assert.equal(saved.reinforcementState.activationsByWaveId["turn-wave"], 0);

  system.state.enemyTurn.pendingUnitIds = [];
  const queued = system.prepareEnemyEndTurnReinforcements();

  assert.equal(queued.changed, true);
  assert.equal(queued.deployments.length, 2);
  assert.equal(system.hasPendingEnemyTurnReinforcements(), true);
  assert.equal(system.getStateForSave().enemy.units.length, 1);

  const firstResult = system.processNextEnemyTurnReinforcement();
  saved = system.getStateForSave();
  const firstReinforcement = saved.enemy.units.find((unit) =>
    unit.id.startsWith("turn-wave-activation-1-")
  );

  assert.equal(firstResult.changed, true);
  assert.equal(firstResult.done, false);
  assert.ok(firstReinforcement);
  assert.equal(firstReinforcement.hasMoved, false);
  assert.equal(firstReinforcement.hasAttacked, false);
  assert.equal(saved.enemyTurn.pendingUnitIds.includes(firstReinforcement.id), false);
  assert.equal(saved.selection.id, firstReinforcement.id);
  assert.equal(system.getSnapshot().presentation.spentUnitIds.includes(firstReinforcement.id), false);

  const secondResult = system.processNextEnemyTurnReinforcement();
  saved = system.getStateForSave();

  assert.equal(secondResult.changed, true);
  assert.equal(secondResult.done, true);
  assert.equal(system.hasPendingEnemyTurnReinforcements(), false);
  assert.equal(
    saved.enemy.units.filter((unit) => unit.id.startsWith("turn-wave-activation-1-")).length,
    2
  );
});

test("waves triggered during an active enemy phase wait until the next enemy phase", () => {
  const startingEnemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5, {
    id: "phase-enemy"
  });
  const state = configureState(
    createTestBattleState({
      playerUnits: [createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1)],
      enemyUnits: [startingEnemy]
    }),
    [
      createWave({
        id: "mid-phase-wave",
        type: REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES,
        every: 1
      })
    ]
  );
  const system = new BattleSystem(state);

  assert.equal(system.endTurn(), true);
  system.startEnemyTurnActions();
  system.state.enemy.units = [];
  system.updateVictoryState();

  const saved = system.getStateForSave();
  const reinforcement = saved.enemy.units.find((unit) =>
    unit.id.startsWith("mid-phase-wave-activation-1-")
  );

  assert.ok(reinforcement);
  assert.equal(reinforcement.hasMoved, true);
  assert.equal(reinforcement.hasAttacked, true);
  assert.equal(saved.enemyTurn.pendingUnitIds.includes(reinforcement.id), false);
});

test("authored reinforcement IDs and level-generated stats survive save/load deterministically", () => {
  const createState = () => {
    const state = configureState(
      createTestBattleState({
        seed: 4821,
        playerUnits: [createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1)],
        enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5)]
      }),
      [createWave({ id: "deterministic-wave", maxActivations: 2 })]
    );
    state.turn.number = 2;
    return state;
  };
  const first = new BattleSystem(createState());
  const second = new BattleSystem(createState());

  const firstActivations = prepareEnemyTurnEndReinforcements(first.state);
  const secondActivations = prepareEnemyTurnEndReinforcements(second.state);

  const firstUnit = firstActivations[0].queuedDeployments[0].unit;
  const secondUnit = secondActivations[0].queuedDeployments[0].unit;

  assert.equal(firstUnit.id, secondUnit.id);
  assert.equal(firstUnit.level, 3);
  assert.deepEqual(firstUnit.stats, secondUnit.stats);

  const restored = new BattleSystem(first.getStateForSave());
  restored.state.turn.number = 3;
  const activations = prepareEnemyTurnEndReinforcements(restored.state);

  assert.equal(activations.length, 1);
  assert.ok(
    activations[0].queuedDeployments.some((deployment) =>
      deployment.unitId.startsWith("deterministic-wave-activation-2-")
    )
  );
  assert.equal(restored.state.reinforcementState.activationsByWaveId["deterministic-wave"], 2);
});

test("movement paths activate one tile wave and lock redo only after deployment", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1);
  const state = configureState(
    createTestBattleState({
      width: 9,
      height: 7,
      playerUnits: [runner],
      enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 8, 6)]
    }),
    [
      createWave({
        id: "path-wave",
        type: REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED,
        maxActivations: 2,
        tiles: [{ x: 2, y: 1 }, { x: 3, y: 1 }]
      })
    ]
  );
  state.selection = { type: "unit", id: runner.id, x: runner.x, y: runner.y };
  const system = new BattleSystem(state);

  assert.equal(system.handleTileSelection(3, 1), true);

  const saved = system.getStateForSave();
  assert.equal(saved.reinforcementState.activationsByWaveId["path-wave"], 1);
  assert.equal(saved.pendingAction.reinforcementLocked, true);
  assert.equal(system.redoPendingMove(), false);
  assert.equal(
    saved.log.filter((line) => line.includes("Enemy reinforcements arrived: Wave 1")).length,
    1
  );

  const exhaustedState = structuredClone(state);
  exhaustedState.reinforcementState = {
    activationsByWaveId: { "path-wave": 2 },
    enemyCasualties: 0,
    knownEnemyUnitIds: exhaustedState.enemy.units.map((unit) => unit.id),
    defeatedEnemyUnitIds: []
  };
  const exhaustedSystem = new BattleSystem(exhaustedState);

  assert.equal(exhaustedSystem.handleTileSelection(3, 1), true);
  assert.equal(exhaustedSystem.getStateForSave().pendingAction.reinforcementLocked, false);
  assert.equal(exhaustedSystem.redoPendingMove(), true);
});

test("slipstream and unloading onto marked tiles activate reinforcement waves", () => {
  const attacker = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1, {
    current: { hp: 6 }
  });
  const distantEnemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 6);
  const slipstreamState = configureState(
    createTestBattleState({
      width: 9,
      height: 8,
      playerUnits: [attacker],
      enemyUnits: [defender, distantEnemy]
    }),
    [
      createWave({
        id: "slipstream-wave",
        type: REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED,
        tiles: [
          { x: 0, y: 1 },
          { x: 1, y: 0 },
          { x: 1, y: 2 }
        ]
      })
    ]
  );
  slipstreamState.player.commanderId = "echo";
  const slipstreamSystem = new BattleSystem(slipstreamState);

  assert.equal(slipstreamSystem.attackTarget(attacker.id, defender.id), true);
  const slipstreamTile = slipstreamSystem.getSnapshot().presentation.reachableTiles[0];
  assert.equal(slipstreamSystem.handleTileSelection(slipstreamTile.x, slipstreamTile.y), true);
  assert.equal(
    slipstreamSystem.getStateForSave().reinforcementState.activationsByWaveId["slipstream-wave"],
    1
  );

  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 2);
  const infantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 3);
  const unloadState = configureState(
    createTestBattleState({
      width: 10,
      height: 8,
      playerUnits: [runner, infantry],
      enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 8, 6)]
    }),
    [
      createWave({
        id: "unload-wave",
        type: REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED,
        tiles: [
          { x: 2, y: 2 },
          { x: 3, y: 1 },
          { x: 3, y: 3 },
          { x: 4, y: 2 }
        ]
      })
    ]
  );
  unloadState.selection = { type: "unit", id: infantry.id, x: infantry.x, y: infantry.y };
  const unloadSystem = new BattleSystem(unloadState);

  assert.equal(unloadSystem.handleTileSelection(infantry.x, infantry.y), true);
  assert.equal(unloadSystem.enterTransportWithPendingUnit(), true);
  assert.equal(unloadSystem.handleTileSelection(3, 2), true);
  assert.equal(unloadSystem.beginPendingUnload(), true);
  const unloadTile = unloadSystem.getSnapshot().presentation.pendingAction.unloadPreviewTiles[0];
  assert.equal(unloadSystem.unloadTransportWithPendingUnit(unloadTile.x, unloadTile.y), true);
  assert.equal(
    unloadSystem.getStateForSave().reinforcementState.activationsByWaveId["unload-wave"],
    1
  );
});

test("reinforcements fan out across valid terrain and warn when no tile is open", () => {
  const occupiedOrigin = createPlacedUnit("runner", TURN_SIDES.PLAYER, 4, 3);
  const state = configureState(
    createTestBattleState({
      width: 8,
      height: 6,
      playerUnits: [occupiedOrigin],
      enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5)]
    }),
    [
      createWave({
        id: "fanout-wave",
        units: [{ id: "fanout-grunt", unitTypeId: "grunt", level: 1, x: 4, y: 3 }]
      })
    ]
  );
  state.map.tiles[3][5] = TERRAIN_KEYS.WATER;
  state.turn.number = 2;
  const activation = prepareEnemyTurnEndReinforcements(state)[0];

  assert.deepEqual(
    { x: activation.deployments[0].x, y: activation.deployments[0].y },
    { x: 3, y: 3 }
  );

  const occupiedUnits = [
    createPlacedUnit("gunship", TURN_SIDES.PLAYER, 0, 0),
    createPlacedUnit("gunship", TURN_SIDES.PLAYER, 1, 0),
    createPlacedUnit("gunship", TURN_SIDES.PLAYER, 0, 1),
    createPlacedUnit("gunship", TURN_SIDES.ENEMY, 1, 1)
  ];
  const blockedBaseState = createTestBattleState({
    playerUnits: occupiedUnits.slice(0, 3),
    enemyUnits: occupiedUnits.slice(3)
  });
  blockedBaseState.map.width = 2;
  blockedBaseState.map.height = 2;
  blockedBaseState.map.tiles = [
    [TERRAIN_KEYS.PLAIN, TERRAIN_KEYS.PLAIN],
    [TERRAIN_KEYS.PLAIN, TERRAIN_KEYS.PLAIN]
  ];
  blockedBaseState.map.buildings = [];
  const blockedState = configureState(
    blockedBaseState,
    [
      createWave({
        id: "blocked-wave",
        units: [{ id: "blocked-gunship", unitTypeId: "gunship", level: 1, x: 0, y: 0 }]
      })
    ]
  );
  blockedState.turn.number = 2;
  const blockedActivation = prepareEnemyTurnEndReinforcements(blockedState)[0];

  assert.equal(blockedActivation.deployments.length, 0);
  assert.equal(blockedActivation.skippedUnitCount, 1);
  assert.ok(blockedState.log.some((line) => line.includes("no valid tile was open")));
});

test("final-kill casualty waves resolve before Rout while future turn waves do not block victory", () => {
  function createRoutSystem(wave) {
    const attacker = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 1);
    const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1, {
      id: "last-enemy",
      current: { hp: 1 }
    });
    const state = configureState(
      createTestBattleState({
        playerUnits: [attacker],
        enemyUnits: [defender]
      }),
      [wave],
      { type: MAP_GOAL_TYPES.ROUT }
    );
    return { system: new BattleSystem(state), attacker, defender };
  }

  const casualty = createRoutSystem(
    createWave({
      id: "last-kill-wave",
      type: REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES,
      every: 1
    })
  );
  assert.equal(casualty.system.attackTarget(casualty.attacker.id, casualty.defender.id), true);
  assert.equal(casualty.system.getStateForSave().victory, null);
  assert.ok(casualty.system.getStateForSave().enemy.units.length > 0);

  const future = createRoutSystem(
    createWave({
      id: "future-wave",
      type: REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED,
      every: 2
    })
  );
  assert.equal(future.system.attackTarget(future.attacker.id, future.defender.id), true);
  assert.equal(future.system.getStateForSave().victory.winner, TURN_SIDES.PLAYER);
  assert.equal(future.system.getStateForSave().enemy.units.length, 0);
});

test("run and skirmish creation preserve authored reinforcement definitions and levels", () => {
  replaceCustomMaps([
    {
      id: "reinforcement-preservation",
      name: "Reinforcement Preservation",
      theme: "ash",
      width: 8,
      height: 8,
      units: [
        {
          id: "reinforcement-preservation-enemy-grunt",
          unitTypeId: "grunt",
          owner: TURN_SIDES.ENEMY,
          level: 2,
          x: 6,
          y: 6
        }
      ],
      reinforcements: [
        createWave({
          id: "preserved-wave",
          units: [
            {
              id: "preserved-breaker",
              unitTypeId: "breaker",
              level: 7,
              x: 5,
              y: 5
            }
          ]
        })
      ]
    }
  ]);

  const skirmish = createSkirmishBattleState({
    mapId: "reinforcement-preservation",
    playerCommanderId: "viper",
    enemyCommanderId: "rook",
    startingFunds: 0,
    fundsPerBuilding: 0
  });
  const run = createBattleStateForRun({
    id: "reinforcement-run",
    seed: 77,
    slotId: "slot-1",
    commanderId: "viper",
    mapIndex: 0,
    targetMapCount: 10,
    mapSequence: ["reinforcement-preservation"],
    roster: [],
    completedMaps: [],
    runUpgrades: [],
    availableRunCardIds: [],
    availableDraftUnitIds: [],
    ownedRunCardIds: [],
    selectedRewards: [],
    pendingRewardChoices: [],
    pendingGearReward: null
  });

  for (const battle of [skirmish, run]) {
    assert.equal(battle.map.reinforcements[0].id, "preserved-wave");
    assert.equal(battle.map.reinforcements[0].units[0].unitTypeId, "breaker");
    assert.equal(battle.map.reinforcements[0].units[0].level, 7);
  }
});
