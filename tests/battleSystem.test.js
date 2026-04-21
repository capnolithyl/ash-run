import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { deriveBattleAnimationEvents } from "../src/game/phaser/view/battleAnimationEvents.js";
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

test("enemy start actions wait for the controller to release the turn banner", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 6, 3, {
    hasMoved: true,
    hasAttacked: true,
    current: {
      stamina: 1
    }
  });
  const battleState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy]
  });
  const system = new BattleSystem(battleState);
  const startingFunds = battleState.enemy.funds;
  const startingEnemyUnitCount = battleState.enemy.units.length;

  assert.equal(system.endTurn(), true);

  const afterTurnFlip = system.getStateForSave();

  assert.equal(afterTurnFlip.turn.activeSide, TURN_SIDES.ENEMY);
  assert.equal(afterTurnFlip.enemyTurn.started, false);
  assert.equal(afterTurnFlip.enemy.units.length, startingEnemyUnitCount);
  assert.equal(afterTurnFlip.enemy.units[0].hasMoved, true);
  assert.equal(afterTurnFlip.enemy.units[0].hasAttacked, true);
  assert.equal(afterTurnFlip.enemy.units[0].current.stamina, 1);
  assert.equal(afterTurnFlip.enemy.funds, startingFunds);

  const startResult = system.startEnemyTurnActions();

  assert.equal(startResult.changed, true);
  assert.equal(startResult.incomeGain.side, TURN_SIDES.ENEMY);
  assert.equal(startResult.incomeGain.previousFunds, startingFunds);
  assert.ok(startResult.incomeGain.amount > 0);
  const afterStartActions = system.getStateForSave();

  assert.equal(afterStartActions.enemyTurn.started, true);
  assert.equal(afterStartActions.enemy.units.length, startingEnemyUnitCount);
  assert.equal(afterStartActions.enemy.funds, startResult.incomeGain.nextFunds);
  assert.equal(afterStartActions.enemy.units[0].hasMoved, false);
  assert.equal(afterStartActions.enemy.units[0].hasAttacked, false);
  assert.equal(afterStartActions.enemy.units[0].current.stamina, enemy.stats.staminaMax);
  assert.deepEqual(afterStartActions.enemyTurn.pendingUnitIds, [enemy.id]);
  assert.equal(afterStartActions.log.some((line) => line.startsWith("Enemy deployed ")), false);
});

test("enemy recruitment happens at end of turn after units vacate production buildings", () => {
  const battleState = createTestBattleState({
    width: 10,
    height: 8
  });
  const production = battleState.map.buildings.find(
    (building) => building.owner === TURN_SIDES.ENEMY && building.type === "barracks"
  );
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, production.x, production.y);
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, production.y);

  battleState.player.units = [player];
  battleState.enemy.units = [enemy];

  const system = new BattleSystem(battleState);

  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);
  assert.equal(system.getStateForSave().enemy.units.length, 1);

  let guard = 0;

  while (system.hasPendingEnemyTurn() && guard < 8) {
    system.processEnemyTurnStep();
    guard += 1;
  }

  const afterActions = system.getStateForSave();
  const movedEnemy = afterActions.enemy.units.find((unit) => unit.id === enemy.id);

  assert.notDeepEqual(
    { x: movedEnemy.x, y: movedEnemy.y },
    { x: production.x, y: production.y }
  );

  const recruitment = system.performEnemyEndTurnRecruitment();
  const afterRecruitment = system.getStateForSave();
  const newUnitOnProduction = afterRecruitment.enemy.units.find(
    (unit) => unit.id !== enemy.id && unit.x === production.x && unit.y === production.y
  );

  assert.equal(recruitment.changed, true);
  assert.ok(newUnitOnProduction);
  assert.ok(afterRecruitment.log.some((line) => line.startsWith("Enemy deployed ")));
});

test("pending move redo emits a teleport rollback instead of replaying movement", () => {
  const unit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      stamina: 3
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(5, 3), true);

  const movedSnapshot = system.getSnapshot();
  const pendingAction = movedSnapshot.presentation.pendingAction;

  assert.equal(pendingAction.fromX, 1);
  assert.equal(pendingAction.fromY, 1);
  assert.equal(pendingAction.toX, 5);
  assert.equal(pendingAction.toY, 3);

  assert.equal(system.redoPendingMove(), true);

  const rolledBackSnapshot = system.getSnapshot();
  const rolledBackUnit = rolledBackSnapshot.player.units[0];
  const moveEvent = deriveBattleAnimationEvents(movedSnapshot, rolledBackSnapshot).find(
    (event) => event.type === "move" && event.unitId === unit.id
  );

  assert.equal(rolledBackUnit.x, 1);
  assert.equal(rolledBackUnit.y, 1);
  assert.equal(rolledBackUnit.current.stamina, 3);
  assert.equal(rolledBackSnapshot.pendingAction, null);
  assert.equal(moveEvent.teleport, true);
  assert.equal(moveEvent.path, undefined);
});
