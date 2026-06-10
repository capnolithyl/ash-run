import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

function getSpentUnitIds(system) {
  return new Set(system.getSnapshot().presentation.spentUnitIds);
}

test("spent presentation waits until a player unit completes its action", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4);
  const state = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy],
  });
  state.selection = { type: "unit", id: player.id, x: player.x, y: player.y };
  const system = new BattleSystem(state);

  assert.equal(system.handleTileSelection(2, 1), true);
  assert.equal(getSpentUnitIds(system).has(player.id), false);

  assert.equal(system.waitWithPendingUnit(), true);
  assert.equal(getSpentUnitIds(system).has(player.id), true);
});

test("spent presentation excludes pending player and enemy follow-up actions", () => {
  const player = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 1, {
    hasMoved: true,
    hasAttacked: true,
  });
  const enemy = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 5, 3, {
    hasMoved: true,
    hasAttacked: true,
  });
  const playerState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy],
  });
  playerState.pendingAction = {
    type: "slipstream",
    mode: "slipstream",
    unitId: player.id,
  };

  const playerSystem = new BattleSystem(playerState);
  assert.equal(getSpentUnitIds(playerSystem).has(player.id), false);

  const enemyState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY,
  });
  enemyState.enemyTurn = {
    started: true,
    pendingAttack: null,
    pendingSlipstream: {
      unitId: enemy.id,
      x: enemy.x - 1,
      y: enemy.y,
      moveSegments: 1,
    },
    pendingUnitIds: [],
    forcePassed: false,
  };

  const enemySystem = new BattleSystem(enemyState);
  assert.equal(getSpentUnitIds(enemySystem).has(enemy.id), false);
  enemySystem.state.enemyTurn.pendingSlipstream = null;
  assert.equal(getSpentUnitIds(enemySystem).has(enemy.id), true);
});

test("spent presentation is active-side-only and waits for enemy turn setup", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    hasMoved: true,
    hasAttacked: true,
  });
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 6, 4, {
    hasMoved: true,
    hasAttacked: true,
  });
  const state = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY,
  });
  state.enemyTurn = {
    started: false,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [],
    forcePassed: false,
  };
  const system = new BattleSystem(state);

  assert.deepEqual([...getSpentUnitIds(system)], []);

  system.state.enemyTurn.started = true;
  assert.deepEqual([...getSpentUnitIds(system)], [enemy.id]);
  assert.equal(getSpentUnitIds(system).has(player.id), false);
});
