import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

test("selectNextReadyUnit cycles through player units that have not moved", () => {
  const alpha = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const spent = createPlacedUnit("runner", TURN_SIDES.PLAYER, 4, 2, { hasMoved: true });
  const bravo = createPlacedUnit("longshot", TURN_SIDES.PLAYER, 2, 4);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 3);
  const battleState = createTestBattleState({
    playerUnits: [bravo, spent, alpha],
    enemyUnits: [enemy]
  });
  const system = new BattleSystem(battleState);

  assert.equal(system.selectNextReadyUnit(), true);
  assert.equal(system.getStateForSave().selection.id, alpha.id);

  assert.equal(system.selectNextReadyUnit(), true);
  assert.equal(system.getStateForSave().selection.id, bravo.id);

  assert.equal(system.selectNextReadyUnit(), true);
  assert.equal(system.getStateForSave().selection.id, alpha.id);
});

test("enemy turns queue a post-move attack so combat resolves after movement", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 6, 3);
  const battleState = createTestBattleState({
    id: "enemy-turn-queue",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const startingHp = player.current.hp;

  const moveStep = system.processEnemyTurnStep();
  const afterMove = system.getStateForSave();

  assert.equal(moveStep.changed, true);
  assert.equal(moveStep.type, "move");
  assert.equal(moveStep.moveSegments, 1);
  assert.equal(afterMove.enemy.units[0].x, 5);
  assert.equal(afterMove.enemyTurn.pendingAttack.attackerId, enemy.id);
  assert.equal(afterMove.player.units[0].current.hp, startingHp);

  const attackStep = system.processEnemyTurnStep();
  const afterAttack = system.getStateForSave();

  assert.equal(attackStep.changed, true);
  assert.equal(attackStep.type, "attack");
  assert.equal(afterAttack.enemyTurn.pendingAttack, null);
  assert.ok(afterAttack.player.units[0].current.hp < startingHp);
});
