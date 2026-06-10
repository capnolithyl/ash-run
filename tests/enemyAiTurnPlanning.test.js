import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILDING_KEYS,
  ENEMY_AI_ARCHETYPES,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { MAP_GOAL_TYPES } from "../src/game/content/mapGoals.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import {
  ENEMY_TURN_PLANNER_ACTIONS_PER_UNIT,
  ENEMY_TURN_PLANNER_BEAM_WIDTH,
  ENEMY_TURN_PLANNER_BRANCH_LIMIT,
  ENEMY_TURN_PLANNER_TILES_PER_TARGET,
  planEnemyTurn
} from "../src/game/simulation/enemyAi/turnPlanning.js";
import { getBestMoveAttackOption } from "../src/game/simulation/enemyAi/movementScoring.js";
import { getReachableTiles } from "../src/game/simulation/selectors.js";
import { createSkirmishBattleState } from "../src/game/state/runFactory.js";
import {
  createPlacedUnit,
  createTestBattleState
} from "./helpers/createTestBattleState.js";

function fillRoads(state) {
  state.map.tiles = Array.from(
    { length: state.map.height },
    () => Array(state.map.width).fill(TERRAIN_KEYS.ROAD)
  );
}

function setEnemyTurn(state, unitIds) {
  state.enemyTurn = {
    started: true,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [...unitIds],
    forcePassed: false
  };
}

test("enemy planner reorders units so a heavy opener creates a finisher kill", () => {
  const target = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3);
  const finisher = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 3);
  const opener = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 5, 3);

  Object.assign(target.stats, {
    attack: 0,
    armor: 0,
    luck: 0,
    maxHealth: 20
  });
  target.current.hp = 20;
  Object.assign(finisher.stats, { attack: 5, luck: 0 });
  Object.assign(opener.stats, { attack: 15, luck: 0 });

  const state = createTestBattleState({
    playerUnits: [target],
    enemyUnits: [finisher, opener],
    activeSide: TURN_SIDES.ENEMY
  });
  state.map.buildings = [];
  setEnemyTurn(state, [finisher.id, opener.id]);

  const plan = planEnemyTurn(state, state.enemyTurn.pendingUnitIds);

  assert.equal(plan.action.unitId, opener.id);
  assert.deepEqual(
    plan.sequence.map((action) => action.unitId),
    [opener.id, finisher.id]
  );

  const system = new BattleSystem(state);
  const openerStep = system.processEnemyTurnStep();
  const afterOpener = system.getStateForSave();

  assert.equal(openerStep.type, "attack");
  assert.equal(openerStep.unitId, opener.id);
  assert.equal(afterOpener.player.units[0].current.hp, 5);

  const finisherStep = system.processEnemyTurnStep();

  assert.equal(finisherStep.type, "attack");
  assert.equal(finisherStep.unitId, finisher.id);
  assert.equal(system.getStateForSave().player.units.length, 0);
});

test("enemy planner gives up the best solo tile to preserve a follow-up lane", () => {
  const target = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 2);
  const opener = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 6, 2);
  const finisher = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 2);

  Object.assign(target.stats, {
    attack: 0,
    armor: 0,
    luck: 0,
    maxHealth: 20
  });
  target.current.hp = 20;
  Object.assign(opener.stats, { attack: 15, luck: 0, movement: 4 });
  Object.assign(finisher.stats, { attack: 5, luck: 0, movement: 2 });
  finisher.current.stamina = 2;

  const state = createTestBattleState({
    width: 9,
    height: 5,
    playerUnits: [target],
    enemyUnits: [opener, finisher],
    activeSide: TURN_SIDES.ENEMY
  });
  state.map.buildings = [];
  fillRoads(state);

  const soloOption = getBestMoveAttackOption(
    state,
    opener,
    getReachableTiles(state, opener, opener.stats.movement),
    { allowRisky: true }
  );
  const plan = planEnemyTurn(state, [opener.id, finisher.id]);

  assert.deepEqual(soloOption.tile, { x: 5, y: 2 });
  assert.equal(plan.action.unitId, opener.id);
  assert.notDeepEqual(plan.action.tile, soloOption.tile);
  assert.deepEqual(plan.sequence[1].tile, soloOption.tile);
  assert.equal(plan.sequence[1].unitId, finisher.id);
});

test("enemy archetypes use optimistic, expected, and conservative kill forecasts", () => {
  const highValueTarget = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 3, 3);
  const expectedTarget = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 2);
  const reliableTarget = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 5, 3);
  const attacker = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 3);

  for (const target of [highValueTarget, expectedTarget, reliableTarget]) {
    Object.assign(target.stats, {
      attack: 0,
      armor: 0,
      luck: 0,
      maxHealth: 20
    });
  }
  highValueTarget.current.hp = 5;
  highValueTarget.cost = 1000;
  expectedTarget.current.hp = 4;
  expectedTarget.cost = 500;
  reliableTarget.current.hp = 3;
  reliableTarget.cost = 100;
  Object.assign(attacker.stats, { attack: 3, luck: 2 });

  const state = createTestBattleState({
    playerUnits: [highValueTarget, expectedTarget, reliableTarget],
    enemyUnits: [attacker],
    activeSide: TURN_SIDES.ENEMY
  });
  state.map.buildings = [];

  state.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE;
  const aggressivePlan = planEnemyTurn(state, [attacker.id]);
  state.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.BALANCED;
  const expectedPlan = planEnemyTurn(state, [attacker.id]);
  state.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.TURTLE;
  const conservativePlan = planEnemyTurn(state, [attacker.id]);

  assert.equal(aggressivePlan.action.targetId, highValueTarget.id);
  assert.equal(expectedPlan.action.targetId, expectedTarget.id);
  assert.equal(conservativePlan.action.targetId, reliableTarget.id);
});

test("repair and capture plans retain archetype priorities", () => {
  const distantPlayer = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 10, 6);
  const enemy = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 4, 3);

  distantPlayer.stats.attack = 0;
  enemy.stats.maxHealth = 100;
  enemy.current.hp = 60;

  const state = createTestBattleState({
    width: 12,
    height: 8,
    playerUnits: [distantPlayer],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  state.map.buildings = [
    {
      id: "enemy-repair-sector",
      type: BUILDING_KEYS.SECTOR,
      owner: TURN_SIDES.ENEMY,
      x: 3,
      y: 3
    },
    {
      id: "neutral-capture-sector",
      type: BUILDING_KEYS.SECTOR,
      owner: "neutral",
      x: 5,
      y: 3
    }
  ];

  state.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.TURTLE;
  const turtlePlan = planEnemyTurn(state, [enemy.id]);
  state.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.CAPTURE;
  const capturePlan = planEnemyTurn(state, [enemy.id]);

  assert.equal(turtlePlan.action.type, "repair");
  assert.equal(turtlePlan.action.buildingId, "enemy-repair-sector");
  assert.equal(capturePlan.action.type, "capture");
  assert.equal(capturePlan.action.buildingId, "neutral-capture-sector");
});

test("an immediate enemy HQ capture overrides the rest of the turn plan", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 8, 5);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 3);
  const state = createTestBattleState({
    width: 10,
    height: 7,
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });

  player.stats.attack = 0;
  state.map.goal = { type: MAP_GOAL_TYPES.HQ_CAPTURE };
  state.map.buildings = [
    {
      id: "player-command",
      type: BUILDING_KEYS.COMMAND,
      owner: TURN_SIDES.PLAYER,
      x: 5,
      y: 3
    },
    {
      id: "enemy-command",
      type: BUILDING_KEYS.COMMAND,
      owner: TURN_SIDES.ENEMY,
      x: 1,
      y: 3
    }
  ];
  setEnemyTurn(state, [enemy.id]);

  const plan = planEnemyTurn(state, [enemy.id]);

  assert.equal(plan.action.type, "capture");
  assert.equal(plan.action.buildingId, "player-command");

  const system = new BattleSystem(state);
  const step = system.processEnemyTurnStep();

  assert.equal(step.type, "move");
  assert.equal(system.getStateForSave().victory.winner, TURN_SIDES.ENEMY);
});

test("enemy execution replans when actual luck kills a projected survivor", () => {
  const firstTarget = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3);
  const secondTarget = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 5);
  const firstEnemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 3);
  const secondEnemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 3);

  for (const target of [firstTarget, secondTarget]) {
    Object.assign(target.stats, {
      attack: 0,
      armor: 0,
      luck: 0,
      maxHealth: 20
    });
  }
  firstTarget.current.hp = 5;
  firstTarget.cost = 1000;
  secondTarget.current.hp = 3;
  secondTarget.cost = 100;
  for (const enemy of [firstEnemy, secondEnemy]) {
    Object.assign(enemy.stats, { attack: 3, luck: 2 });
  }

  const state = createTestBattleState({
    width: 9,
    height: 7,
    playerUnits: [firstTarget, secondTarget],
    enemyUnits: [firstEnemy, secondEnemy],
    activeSide: TURN_SIDES.ENEMY,
    seed: 2
  });
  state.map.buildings = [];
  fillRoads(state);
  setEnemyTurn(state, [firstEnemy.id, secondEnemy.id]);

  const initialPlan = planEnemyTurn(state, state.enemyTurn.pendingUnitIds);

  assert.deepEqual(
    initialPlan.sequence.map((action) => action.targetId),
    [firstTarget.id, firstTarget.id]
  );

  const system = new BattleSystem(state);
  const firstStep = system.processEnemyTurnStep();

  assert.equal(firstStep.type, "attack");
  assert.equal(
    system.getStateForSave().player.units.some((unit) => unit.id === firstTarget.id),
    false
  );

  const replannedMove = system.processEnemyTurnStep();
  const afterReplan = system.getStateForSave();

  assert.equal(replannedMove.type, "move");
  assert.equal(afterReplan.enemyTurn.pendingAttack.targetId, secondTarget.id);
});

test("planning is seed-neutral and enemy units are activated at most once", () => {
  const target = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3);
  const enemies = [
    createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 3),
    createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 3),
    createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 5)
  ];

  Object.assign(target.stats, {
    attack: 0,
    armor: 0,
    luck: 0,
    maxHealth: 1000
  });
  target.current.hp = 1000;
  enemies.forEach((enemy) => Object.assign(enemy.stats, { attack: 3, luck: 0 }));

  const state = createTestBattleState({
    width: 9,
    height: 7,
    playerUnits: [target],
    enemyUnits: enemies,
    activeSide: TURN_SIDES.ENEMY,
    seed: 404
  });
  state.map.buildings = [];
  fillRoads(state);
  setEnemyTurn(state, enemies.map((unit) => unit.id));

  const beforePlanning = structuredClone(state);
  const plan = planEnemyTurn(state, state.enemyTurn.pendingUnitIds);

  assert.deepEqual(state, beforePlanning);
  assert.equal(plan.sequence.length, enemies.length);
  assert.equal(
    new Set(plan.sequence.map((action) => action.unitId)).size,
    enemies.length
  );

  const system = new BattleSystem(state);
  const attackUnitIds = [];
  let stepCount = 0;

  while (system.hasPendingEnemyTurn() && stepCount < 20) {
    const step = system.processEnemyTurnStep();

    if (step.type === "attack") {
      attackUnitIds.push(step.unitId);
    }
    stepCount += 1;
  }

  assert.equal(new Set(attackUnitIds).size, enemies.length);
  assert.equal(attackUnitIds.length, enemies.length);
  assert.ok(
    system.getStateForSave().enemy.units.every(
      (unit) => unit.hasMoved && unit.hasAttacked
    )
  );
});

test("the bounded planner handles the authored 12-enemy Cauldron map", () => {
  const state = createSkirmishBattleState({
    mapId: "cauldron-stage-1",
    playerCommanderId: "viper",
    enemyCommanderId: "rook",
    startingFunds: 1200,
    fundsPerBuilding: 100
  });
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 7, 10);

  player.stats.attack = 0;
  state.player.units = [player];
  state.turn.activeSide = TURN_SIDES.ENEMY;

  const pendingUnitIds = state.enemy.units.map((unit) => unit.id);
  const firstPlannerUnitId = state.enemy.units.find(
    (unit) => unit.unitTypeId === "breaker"
  ).id;
  const planningUnitIds = [
    firstPlannerUnitId,
    ...pendingUnitIds.filter((unitId) => unitId !== firstPlannerUnitId)
  ];
  const startedAt = performance.now();
  const plan = planEnemyTurn(state, planningUnitIds);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(pendingUnitIds.length, 12);
  assert.ok(plan);
  assert.ok(plan.sequence.length <= pendingUnitIds.length);
  assert.ok(plan.expandedNodes <= 3000);
  assert.ok(elapsedMs < 2000, `planner took ${elapsedMs.toFixed(1)}ms`);
  assert.equal(ENEMY_TURN_PLANNER_BEAM_WIDTH, 10);
  assert.equal(ENEMY_TURN_PLANNER_BRANCH_LIMIT, 24);
  assert.equal(ENEMY_TURN_PLANNER_ACTIONS_PER_UNIT, 8);
  assert.equal(ENEMY_TURN_PLANNER_TILES_PER_TARGET, 4);
});
