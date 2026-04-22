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
import { getReachableTiles, getUnitAt } from "../src/game/simulation/selectors.js";
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
  const deployedUnit = afterRecruitment.enemy.units.find((unit) => unit.id !== enemy.id);

  assert.equal(recruitment.changed, true);
  assert.ok(deployedUnit);
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

test("mechanics recruit from barracks instead of motor pools", () => {
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1)],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4)]
  });
  battleState.player.funds = 3000;

  const barracks = battleState.map.buildings.find(
    (building) => building.owner === TURN_SIDES.PLAYER && building.type === "barracks"
  );
  const motorPool = battleState.map.buildings.find(
    (building) => building.owner === TURN_SIDES.PLAYER && building.type === "motor-pool"
  );

  battleState.selection = { type: "building", id: barracks.id, x: barracks.x, y: barracks.y };
  const barracksSystem = new BattleSystem(battleState);
  const barracksOptions = barracksSystem.getSnapshot().presentation.recruitOptions.map((option) => option.id);

  assert.ok(barracksOptions.includes("mechanic"));
  assert.ok(barracksOptions.includes("medic"));

  battleState.selection = { type: "building", id: motorPool.id, x: motorPool.x, y: motorPool.y };
  const motorPoolSystem = new BattleSystem(battleState);
  const motorPoolOptions = motorPoolSystem.getSnapshot().presentation.recruitOptions.map((option) => option.id);

  assert.equal(motorPoolOptions.includes("mechanic"), false);
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

test("transported infantry are hidden from occupancy and expose unload tiles", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 2);
  const infantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 3);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [runner, infantry],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: infantry.id, x: infantry.x, y: infantry.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(infantry.x, infantry.y), true);
  assert.equal(system.enterTransportWithPendingUnit(), true);

  let afterBoarding = system.getStateForSave();
  const carriedAfterBoarding = afterBoarding.player.units.find((unit) => unit.id === infantry.id);

  assert.equal(carriedAfterBoarding.transport.carriedByUnitId, runner.id);
  assert.equal(getUnitAt(afterBoarding, runner.x, runner.y).id, runner.id);

  assert.equal(system.handleTileSelection(3, 2), true);
  assert.equal(system.beginPendingUnload(), true);

  const unloadSnapshot = system.getSnapshot();
  const carriedAfterMove = unloadSnapshot.player.units.find((unit) => unit.id === infantry.id);

  assert.equal(carriedAfterMove.x, 3);
  assert.equal(carriedAfterMove.y, 2);
  assert.equal(unloadSnapshot.presentation.pendingAction.isUnloading, true);
  assert.ok(unloadSnapshot.presentation.pendingAction.unloadPreviewTiles.length > 0);
  assert.ok(
    unloadSnapshot.presentation.pendingAction.unloadPreviewTiles.every(
      (tile) => Math.abs(tile.x - 3) + Math.abs(tile.y - 2) === 1
    )
  );
});

test("infantry choose which adjacent runner to board when multiple are available", () => {
  const leftRunner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 3);
  const rightRunner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 4, 3);
  const infantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 3, 3);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [leftRunner, rightRunner, infantry],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: infantry.id, x: infantry.x, y: infantry.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(infantry.x, infantry.y), true);
  assert.equal(system.enterTransportWithPendingUnit(), true);

  const choiceSnapshot = system.getSnapshot();

  assert.equal(choiceSnapshot.presentation.pendingAction.mode, "transport");
  assert.equal(choiceSnapshot.presentation.pendingAction.isChoosingTransport, true);
  assert.deepEqual(
    new Set(choiceSnapshot.presentation.pendingAction.transportTargetUnitIds),
    new Set([leftRunner.id, rightRunner.id])
  );
  assert.equal(
    choiceSnapshot.player.units.find((unit) => unit.id === infantry.id).transport.carriedByUnitId,
    null
  );

  assert.equal(system.handleTileSelection(rightRunner.x, rightRunner.y), true);

  const afterBoarding = system.getStateForSave();
  const updatedInfantry = afterBoarding.player.units.find((unit) => unit.id === infantry.id);
  const updatedLeftRunner = afterBoarding.player.units.find((unit) => unit.id === leftRunner.id);
  const updatedRightRunner = afterBoarding.player.units.find((unit) => unit.id === rightRunner.id);

  assert.equal(updatedInfantry.transport.carriedByUnitId, rightRunner.id);
  assert.equal(updatedLeftRunner.transport.carryingUnitId, null);
  assert.equal(updatedRightRunner.transport.carryingUnitId, infantry.id);
  assert.equal(afterBoarding.pendingAction, null);
  assert.equal(afterBoarding.selection.id, rightRunner.id);
});

test("medics choose which adjacent infantry to support when multiple need service", () => {
  const medic = createPlacedUnit("medic", TURN_SIDES.PLAYER, 3, 3);
  const leftInfantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 3, {
    current: {
      hp: 5,
      ammo: 0,
      stamina: 0
    }
  });
  const rightInfantry = createPlacedUnit("breaker", TURN_SIDES.PLAYER, 4, 3, {
    current: {
      hp: 4,
      ammo: 0,
      stamina: 0
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [medic, leftInfantry, rightInfantry],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: medic.id, x: medic.x, y: medic.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(medic.x, medic.y), true);
  assert.equal(system.useSupportAbilityWithPendingUnit(), true);

  const choiceSnapshot = system.getSnapshot();

  assert.equal(choiceSnapshot.presentation.pendingAction.mode, "support");
  assert.equal(choiceSnapshot.presentation.pendingAction.isChoosingSupport, true);
  assert.deepEqual(
    new Set(choiceSnapshot.presentation.pendingAction.supportTargetUnitIds),
    new Set([leftInfantry.id, rightInfantry.id])
  );

  assert.equal(system.handleTileSelection(rightInfantry.x, rightInfantry.y), true);

  const afterSupport = system.getStateForSave();
  const updatedMedic = afterSupport.player.units.find((unit) => unit.id === medic.id);
  const updatedLeft = afterSupport.player.units.find((unit) => unit.id === leftInfantry.id);
  const updatedRight = afterSupport.player.units.find((unit) => unit.id === rightInfantry.id);

  assert.equal(updatedLeft.current.hp, leftInfantry.current.hp);
  assert.ok(updatedRight.current.hp > rightInfantry.current.hp);
  assert.equal(updatedRight.current.ammo, updatedRight.stats.ammoMax);
  assert.equal(updatedRight.current.stamina, updatedRight.stats.staminaMax);
  assert.equal(updatedMedic.cooldowns.support, 2);
  assert.equal(afterSupport.pendingAction, null);
});

test("mechanics choose which adjacent vehicle to support when multiple need service", () => {
  const mechanic = createPlacedUnit("mechanic", TURN_SIDES.PLAYER, 3, 3);
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 3, {
    current: {
      hp: 5,
      ammo: 0,
      stamina: 0
    }
  });
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 4, 3, {
    current: {
      hp: 8,
      ammo: 0,
      stamina: 0
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [mechanic, runner, bruiser],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: mechanic.id, x: mechanic.x, y: mechanic.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(mechanic.x, mechanic.y), true);
  assert.equal(system.useSupportAbilityWithPendingUnit(), true);
  assert.equal(system.getSnapshot().presentation.pendingAction.mode, "support");

  assert.equal(system.handleTileSelection(runner.x, runner.y), true);

  const afterSupport = system.getStateForSave();
  const updatedMechanic = afterSupport.player.units.find((unit) => unit.id === mechanic.id);
  const updatedRunner = afterSupport.player.units.find((unit) => unit.id === runner.id);
  const updatedBruiser = afterSupport.player.units.find((unit) => unit.id === bruiser.id);

  assert.ok(updatedRunner.current.hp > runner.current.hp);
  assert.equal(updatedRunner.current.ammo, updatedRunner.stats.ammoMax);
  assert.equal(updatedRunner.current.stamina, updatedRunner.stats.staminaMax);
  assert.equal(updatedBruiser.current.hp, bruiser.current.hp);
  assert.equal(updatedMechanic.cooldowns.support, 3);
});

test("enemy medics use support on damaged adjacent infantry", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const medic = createPlacedUnit("medic", TURN_SIDES.ENEMY, 6, 4);
  const wounded = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 5, {
    current: {
      hp: 4,
      ammo: 0,
      stamina: 0
    }
  });
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [player],
    enemyUnits: [medic, wounded],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [medic.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterSupport = system.getStateForSave();
  const updatedMedic = afterSupport.enemy.units.find((unit) => unit.id === medic.id);
  const updatedWounded = afterSupport.enemy.units.find((unit) => unit.id === wounded.id);

  assert.equal(step.type, "support");
  assert.ok(updatedWounded.current.hp > wounded.current.hp);
  assert.equal(updatedWounded.current.ammo, updatedWounded.stats.ammoMax);
  assert.equal(updatedWounded.current.stamina, updatedWounded.stats.staminaMax);
  assert.equal(updatedMedic.cooldowns.support, 2);
});

test("enemy runners opportunistically ferry adjacent infantry", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 10, 6);
  const passenger = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 10, 5);
  const battleState = createTestBattleState({
    id: "enemy-runner-ferry",
    width: 12,
    height: 8,
    playerUnits: [player],
    enemyUnits: [runner, passenger],
    activeSide: TURN_SIDES.ENEMY,
    seed: 404
  });
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [runner.id, passenger.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterMove = system.getStateForSave();
  const updatedRunner = afterMove.enemy.units.find((unit) => unit.id === runner.id);
  const updatedPassenger = afterMove.enemy.units.find((unit) => unit.id === passenger.id);

  assert.equal(step.type, "move");
  assert.equal(updatedRunner.transport.carryingUnitId, null);
  assert.equal(updatedPassenger.transport.carriedByUnitId, null);
  assert.notDeepEqual({ x: updatedPassenger.x, y: updatedPassenger.y }, { x: passenger.x, y: passenger.y });
  assert.ok(afterMove.log.some((line) => line.includes("boarded")));
  assert.ok(afterMove.log.some((line) => line.includes("disembarked")));
});
