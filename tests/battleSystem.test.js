import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMANDER_POWER_MAX,
  ENEMY_RECRUITMENT_BASE_MAP_CAP,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { deriveBattleAnimationEvents } from "../src/game/phaser/view/battleAnimationEvents.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { getAttackModifier, getMovementModifier } from "../src/game/simulation/commanderEffects.js";
import { getReachableTiles } from "../src/game/simulation/selectors.js";
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

test("clicking the selected unit's tile opens the command prompt without moving", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
    current: {
      stamina: 4
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 3);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(2, 2), true);

  const snapshot = system.getSnapshot();
  const pendingAction = snapshot.presentation.pendingAction;
  const updatedUnit = snapshot.player.units[0];

  assert.equal(pendingAction.unitId, unit.id);
  assert.equal(pendingAction.mode, "menu");
  assert.equal(pendingAction.fromX, 2);
  assert.equal(pendingAction.fromY, 2);
  assert.equal(pendingAction.toX, 2);
  assert.equal(pendingAction.toY, 2);
  assert.equal(pendingAction.canFire, true);
  assert.equal(updatedUnit.x, 2);
  assert.equal(updatedUnit.y, 2);
  assert.equal(updatedUnit.current.stamina, 4);
});

test("clicking an enemy with a selected unit inspects it instead of attacking", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(enemy.x, enemy.y), true);

  const afterClick = system.getStateForSave();

  assert.equal(afterClick.enemy.units[0].current.hp, enemy.current.hp);
  assert.equal(afterClick.selection.type, "unit");
  assert.equal(afterClick.selection.id, enemy.id);
  assert.equal(afterClick.pendingAction, null);
});

test("the fire command arms a pending unit to attack an enemy tile", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(unit.x, unit.y), true);
  assert.equal(system.beginPendingAttack(), true);
  assert.equal(system.getSnapshot().presentation.pendingAction.isTargeting, true);

  const startingHp = system.getStateForSave().enemy.units[0].current.hp;

  assert.equal(system.handleTileSelection(enemy.x, enemy.y), true);

  const afterAttack = system.getStateForSave();

  assert.ok(afterAttack.enemy.units.length === 0 || afterAttack.enemy.units[0].current.hp < startingHp);
  assert.equal(afterAttack.pendingAction, null);
});

test("units can move through same-side units but cannot stop on them", () => {
  const unit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1);
  const ally = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 1);
  const battleState = createTestBattleState({
    width: 5,
    height: 3,
    playerUnits: [unit, ally],
    enemyUnits: [enemy]
  });

  battleState.map.tiles = [
    [TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER],
    [TERRAIN_KEYS.ROAD, TERRAIN_KEYS.ROAD, TERRAIN_KEYS.ROAD, TERRAIN_KEYS.ROAD, TERRAIN_KEYS.ROAD],
    [TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER]
  ];

  const reachableTiles = getReachableTiles(battleState, unit, unit.stats.movement);

  assert.equal(reachableTiles.some((tile) => tile.x === ally.x && tile.y === ally.y), false);
  assert.equal(reachableTiles.some((tile) => tile.x === 3 && tile.y === 1), true);
  assert.equal(reachableTiles.some((tile) => tile.x === enemy.x && tile.y === enemy.y), false);
});

test("units with empty primary ammo can still use weak secondary fire", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      ammo: 0
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  const system = new BattleSystem(battleState);
  const startingHp = enemy.current.hp;

  assert.equal(system.attackTarget(unit.id, enemy.id), true);

  const afterAttack = system.getStateForSave();

  assert.equal(afterAttack.player.units[0].current.ammo, 0);
  assert.ok(afterAttack.enemy.units[0].current.hp < startingHp);
  assert.ok(afterAttack.log.some((line) => line.includes("secondary fire")));
});

test("owned sectors heal one third of max HP and resupply units", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      hp: 1,
      ammo: 0,
      stamina: 0
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  const sector = battleState.map.buildings.find(
    (building) => building.type === "sector" && building.owner === TURN_SIDES.PLAYER
  );
  unit.x = sector.x;
  unit.y = sector.y;

  const system = new BattleSystem(battleState);

  assert.equal(system.finalizeEnemyTurn().changed, true);

  const healedUnit = system.getStateForSave().player.units[0];

  assert.equal(healedUnit.current.hp, 1 + Math.ceil(unit.stats.maxHealth / 3));
  assert.equal(healedUnit.current.ammo, healedUnit.stats.ammoMax);
  assert.equal(healedUnit.current.stamina, healedUnit.stats.staminaMax);
});

test("atlas passively restores 1 HP to each unit at the start of the turn", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      hp: 10
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.player.commanderId = "atlas";

  const system = new BattleSystem(battleState);

  assert.equal(system.finalizeEnemyTurn().changed, true);
  assert.equal(system.getStateForSave().player.units[0].current.hp, 11);
});

test("atlas power heals half max HP and grants attack and movement", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      hp: 4
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "atlas";
  battleState.player.charge = COMMANDER_POWER_MAX;

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const updatedUnit = system.getStateForSave().player.units[0];

  assert.equal(updatedUnit.current.hp, 4 + Math.ceil(unit.stats.maxHealth * 0.5));
  assert.equal(getAttackModifier(system.getStateForSave(), updatedUnit), 2);
  assert.equal(getMovementModifier(system.getStateForSave(), updatedUnit), 1);
});

test("viper boosts infantry and recon attack, then powers infantry movement", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 1);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 3, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [grunt, runner, bruiser],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "viper";
  battleState.player.charge = COMMANDER_POWER_MAX;

  assert.equal(getAttackModifier(battleState, grunt), 2);
  assert.equal(getAttackModifier(battleState, runner), 2);
  assert.equal(getAttackModifier(battleState, bruiser), 0);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const afterPower = system.getStateForSave();
  const updatedGrunt = afterPower.player.units.find((unit) => unit.id === grunt.id);
  const updatedRunner = afterPower.player.units.find((unit) => unit.id === runner.id);
  const updatedBruiser = afterPower.player.units.find((unit) => unit.id === bruiser.id);

  assert.equal(getAttackModifier(afterPower, updatedGrunt), 7);
  assert.equal(getAttackModifier(afterPower, updatedRunner), 7);
  assert.equal(getAttackModifier(afterPower, updatedBruiser), 0);
  assert.equal(getMovementModifier(afterPower, updatedGrunt), 2);
  assert.equal(getMovementModifier(afterPower, updatedRunner), 0);
});

test("right-click context action clears the current selection", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 4);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleContextAction(), true);

  const afterContextAction = system.getStateForSave();

  assert.equal(afterContextAction.selection.type, null);
  assert.equal(afterContextAction.selection.id, null);
});

test("right-click context action redoes a pending move", () => {
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
  assert.equal(system.handleContextAction(), true);

  const afterContextAction = system.getStateForSave();
  const updatedUnit = afterContextAction.player.units[0];

  assert.equal(updatedUnit.x, 1);
  assert.equal(updatedUnit.y, 1);
  assert.equal(updatedUnit.current.stamina, 3);
  assert.equal(afterContextAction.pendingAction, null);
  assert.equal(afterContextAction.selection.id, unit.id);
});

test("right-click context action cancels fire targeting before undoing movement", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(unit.x, unit.y), true);
  assert.equal(system.beginPendingAttack(), true);
  assert.equal(system.handleContextAction(), true);

  const pendingAction = system.getSnapshot().presentation.pendingAction;

  assert.equal(pendingAction.unitId, unit.id);
  assert.equal(pendingAction.mode, "menu");
  assert.equal(pendingAction.isTargeting, false);
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

test("enemy units avoid bad immediate trades instead of attacking blindly", () => {
  const player = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 4, 3);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 5, 3);
  const battleState = createTestBattleState({
    id: "enemy-bad-trade",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterStep = system.getStateForSave();

  assert.equal(step.type, "move");
  assert.equal(afterStep.enemyTurn.pendingAttack, null);
  assert.equal(afterStep.player.units[0].current.hp, player.current.hp);
  assert.ok(afterStep.log.some((line) => line.includes("fell back")));
});

test("enemy units advance into staging range when no attack is available", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 8, 1);
  enemy.stats.attack = 1;
  const battleState = createTestBattleState({
    id: "enemy-staging-advance",
    width: 10,
    height: 3,
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.map.tiles = [
    Array.from({ length: 10 }, () => TERRAIN_KEYS.WATER),
    Array.from({ length: 10 }, () => TERRAIN_KEYS.ROAD),
    Array.from({ length: 10 }, () => TERRAIN_KEYS.WATER)
  ];
  battleState.seed = 99;
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterStep = system.getStateForSave();
  const movedEnemy = afterStep.enemy.units[0];

  assert.equal(step.type, "move");
  assert.ok(movedEnemy.x < enemy.x, "enemy should close distance instead of running away");
  assert.ok(afterStep.log.some((line) => line.includes("advanced into position")));
});

test("enemy units choose a favorable target when one is available", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 4, 3);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 6, 3);
  const enemy = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 5, 3);
  const battleState = createTestBattleState({
    id: "enemy-good-trade",
    playerUnits: [runner, bruiser],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.player.commanderId = "rook";
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterStep = system.getStateForSave();

  assert.equal(step.type, "attack");
  assert.ok(afterStep.player.units.find((unit) => unit.id === runner.id).current.hp < runner.current.hp);
  assert.equal(afterStep.player.units.find((unit) => unit.id === bruiser.id).current.hp, bruiser.current.hp);
});

test("enemy grunts capture buildings before attacking", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 5, 3);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 3);
  const battleState = createTestBattleState({
    id: "enemy-grunt-capture",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.map.buildings.push({
    id: "neutral-sector-test",
    type: "sector",
    owner: "neutral",
    x: enemy.x,
    y: enemy.y
  });
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterStep = system.getStateForSave();

  assert.equal(step.type, "capture");
  assert.equal(afterStep.map.buildings.find((building) => building.id === "neutral-sector-test").owner, TURN_SIDES.ENEMY);
  assert.equal(afterStep.player.units[0].current.hp, player.current.hp);
});

test("enemy breakers capture when no favorable target is available", () => {
  const player = createPlacedUnit("juggernaut", TURN_SIDES.PLAYER, 7, 3);
  const enemy = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 4, 3);
  const battleState = createTestBattleState({
    id: "enemy-breaker-capture",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.map.buildings.push({
    id: "neutral-sector-breaker",
    type: "sector",
    owner: "neutral",
    x: enemy.x,
    y: enemy.y
  });
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterStep = system.getStateForSave();

  assert.equal(step.type, "capture");
  assert.equal(afterStep.map.buildings.find((building) => building.id === "neutral-sector-breaker").owner, TURN_SIDES.ENEMY);
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

test("kill XP scales with actual damage and target value", () => {
  const runKillScenario = (defenderType, defenderHp) => {
    const attacker = createPlacedUnit("juggernaut", TURN_SIDES.PLAYER, 2, 2, {
      level: 10
    });
    attacker.stats.attack = 60;
    const defender = createPlacedUnit(defenderType, TURN_SIDES.ENEMY, 3, 2, {
      current: {
        hp: defenderHp
      }
    });
    const battleState = createTestBattleState({
      playerUnits: [attacker],
      enemyUnits: [defender]
    });
    const system = new BattleSystem(battleState);

    assert.equal(system.attackTarget(attacker.id, defender.id), true);

    return system.getStateForSave().player.units[0].experience;
  };

  const lowHpGruntXp = runKillScenario("grunt", 1);
  const fullHpBruiserXp = runKillScenario("bruiser", 24);

  assert.ok(fullHpBruiserXp > lowHpGruntXp + 50);
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

test("early enemy recruitment deploys at most one unit per turn", () => {
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [
      createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1),
      createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 2),
      createPlacedUnit("longshot", TURN_SIDES.PLAYER, 1, 3)
    ],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 8, 1)]
  });
  battleState.enemy.funds = 3000;
  battleState.difficultyTier = 1;

  const system = new BattleSystem(battleState);
  const deployments = system.performEnemyRecruitment();

  assert.equal(deployments.length, 1);
});

test("enemy recruitment obeys the total per-map build cap", () => {
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [
      createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1),
      createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 2),
      createPlacedUnit("longshot", TURN_SIDES.PLAYER, 1, 3)
    ],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 8, 1)]
  });
  battleState.enemy.funds = 3000;
  battleState.enemy.recruitsBuiltThisMap = ENEMY_RECRUITMENT_BASE_MAP_CAP - 1;
  battleState.difficultyTier = 1;

  const system = new BattleSystem(battleState);

  assert.equal(system.performEnemyRecruitment().length, 1);
  assert.equal(system.getStateForSave().enemy.recruitsBuiltThisMap, ENEMY_RECRUITMENT_BASE_MAP_CAP);
  assert.equal(system.performEnemyRecruitment().length, 0);
});

test("enemy recruitment considers all factories and spends up when funds allow", () => {
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [
      createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1),
      createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 2),
      createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 3)
    ],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 8, 1)],
    seed: 2024
  });
  battleState.enemy.funds = 3000;
  battleState.difficultyTier = 1;

  const system = new BattleSystem(battleState);
  const deployments = system.performEnemyRecruitment();

  assert.equal(deployments.length, 1);
  assert.notEqual(deployments[0].unitTypeId, "grunt");
});

test("enemy recruitment pauses when the enemy already has a large unit lead", () => {
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1)],
    enemyUnits: [
      createPlacedUnit("grunt", TURN_SIDES.ENEMY, 8, 1),
      createPlacedUnit("runner", TURN_SIDES.ENEMY, 8, 2),
      createPlacedUnit("longshot", TURN_SIDES.ENEMY, 8, 3)
    ]
  });
  battleState.enemy.funds = 3000;
  battleState.difficultyTier = 1;

  const system = new BattleSystem(battleState);
  const deployments = system.performEnemyRecruitment();

  assert.equal(deployments.length, 0);
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
