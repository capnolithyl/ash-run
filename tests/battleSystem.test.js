import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILDING_KEYS,
  ENEMY_AI_ARCHETYPES,
  ENEMY_RECRUITMENT_BASE_MAP_CAP,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { COMMANDERS, getCommanderPowerMax } from "../src/game/content/commanders.js";
import { ARMOR_CLASSES, WEAPON_CLASSES } from "../src/game/content/weaponClasses.js";
import { BUILDING_RECRUITMENT } from "../src/game/content/unitCatalog.js";
import { deriveBattleAnimationEvents } from "../src/game/phaser/view/battleAnimationEvents.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import {
  canResupplyUnit,
  getExperienceModifier,
  getArmorModifier,
  getAttackModifier,
  getLuckModifier,
  getMovementModifier,
  getRangeModifier,
  rollStrikeOutcome
} from "../src/game/simulation/commanderEffects.js";
import {
  getAttackForecast,
  getCombatExperience,
  getDefenderArmor
} from "../src/game/simulation/combatResolver.js";
import { pickBestFavorableAttack } from "../src/game/simulation/enemyAi.js";
import { getXpThreshold } from "../src/game/simulation/progression.js";
import {
  canUnitAttackTarget,
  getEffectiveCurrentStamina,
  getReachableTiles,
  getUnitAt,
  getUnitAttackProfile
} from "../src/game/simulation/selectors.js";
import { canLoadUnit } from "../src/game/simulation/transportRules.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

function setNeutralCommanders(state) {
  state.player.commanderId = null;
  state.enemy.commanderId = null;
  return state;
}

function createNeutralBattleState(options = {}) {
  return setNeutralCommanders(createTestBattleState(options));
}

function createNeutralForecast(attacker, defender, { seed = 1337 } = {}) {
  const battleState = createNeutralBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender],
    seed
  });
  battleState.map.tiles = Array.from({ length: battleState.map.height }, () =>
    Array.from({ length: battleState.map.width }, () => TERRAIN_KEYS.ROAD)
  );
  battleState.map.buildings = [];

  return {
    battleState,
    forecast: getAttackForecast(battleState, attacker, defender)
  };
}

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

test("ground units can move through aircraft but cannot stop on occupied tiles", () => {
  const groundUnit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1);
  const aircraft = createPlacedUnit("gunship", TURN_SIDES.ENEMY, 2, 1);
  const battleState = createTestBattleState({
    width: 5,
    height: 3,
    playerUnits: [groundUnit],
    enemyUnits: [aircraft]
  });

  battleState.map.tiles = [
    [TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER],
    [TERRAIN_KEYS.ROAD, TERRAIN_KEYS.ROAD, TERRAIN_KEYS.ROAD, TERRAIN_KEYS.ROAD, TERRAIN_KEYS.ROAD],
    [TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER, TERRAIN_KEYS.WATER]
  ];

  const groundReachableTiles = getReachableTiles(battleState, groundUnit, groundUnit.stats.movement);

  assert.equal(groundReachableTiles.some((tile) => tile.x === aircraft.x && tile.y === aircraft.y), false);
  assert.equal(groundReachableTiles.some((tile) => tile.x === 3 && tile.y === 1), true);

  const aircraftReachableTiles = getReachableTiles(battleState, aircraft, aircraft.stats.movement);

  assert.equal(aircraftReachableTiles.some((tile) => tile.x === groundUnit.x && tile.y === groundUnit.y), false);
  assert.equal(aircraftReachableTiles.some((tile) => tile.x === 0 && tile.y === 1), true);
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

test("owned sectors heal ten percent of max HP and resupply units", () => {
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

  assert.equal(healedUnit.current.hp, 1 + Math.ceil(unit.stats.maxHealth * 0.1));
  assert.equal(healedUnit.current.ammo, healedUnit.stats.ammoMax);
  assert.equal(healedUnit.current.stamina, healedUnit.stats.staminaMax);
});

test("owned command posts resupply ammo and stamina without healing HP", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      hp: 5,
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
  const commandPost = battleState.map.buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.PLAYER
  );
  unit.x = commandPost.x;
  unit.y = commandPost.y;

  const system = new BattleSystem(battleState);

  assert.equal(system.finalizeEnemyTurn().changed, true);

  const servicedUnit = system.getStateForSave().player.units[0];

  assert.equal(servicedUnit.current.hp, 5);
  assert.equal(servicedUnit.current.ammo, servicedUnit.stats.ammoMax);
  assert.equal(servicedUnit.current.stamina, servicedUnit.stats.staminaMax);
});

test("atlas passively restores 10 percent max HP to each unit at the start of the turn", () => {
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
  assert.equal(system.getStateForSave().player.units[0].current.hp, 10 + Math.ceil(unit.stats.maxHealth * 0.1));
});

test("atlas power heals 33 percent HP, cleanses negative statuses, and grants armor through the enemy turn", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      hp: 4
    },
    statuses: [
      { type: "burn", tickDamageRatio: 0.1, negative: true },
      { type: "mobility", value: -1, turnsRemaining: 1, negative: true }
    ]
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "atlas";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const updatedUnit = system.getStateForSave().player.units[0];

  assert.equal(updatedUnit.current.hp, 4 + Math.ceil(unit.stats.maxHealth * 0.33));
  assert.equal(updatedUnit.statuses.some((status) => status.type === "burn"), false);
  assert.equal(updatedUnit.statuses.some((status) => status.type === "mobility"), false);
  assert.equal(getArmorModifier(system.getStateForSave(), updatedUnit), 3);
  assert.equal(getAttackModifier(system.getStateForSave(), updatedUnit), 0);
  assert.equal(getMovementModifier(system.getStateForSave(), updatedUnit), 0);

  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);

  const enemyTurnState = system.getStateForSave();
  const buffedDuringEnemyTurn = enemyTurnState.player.units[0];

  assert.equal(getArmorModifier(enemyTurnState, buffedDuringEnemyTurn), 3);

  assert.equal(system.finalizeEnemyTurn().changed, true);

  const nextPlayerTurnState = system.getStateForSave();
  const expiredOnNextTurn = nextPlayerTurnState.player.units[0];

  assert.equal(getArmorModifier(nextPlayerTurnState, expiredOnNextTurn), 0);
});

test("active powers do not recharge during the same turn they were activated", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender]
  });
  battleState.player.commanderId = "viper";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);
  assert.equal(system.getStateForSave().player.charge, 0);
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  assert.equal(system.getStateForSave().player.charge, 0);
});

test("enemy turns still allow inspection clicks without opening player actions", () => {
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemyUnit = createPlacedUnit("runner", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    activeSide: TURN_SIDES.ENEMY
  });

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(playerUnit.x, playerUnit.y), true);

  let inspectedState = system.getStateForSave();
  assert.equal(inspectedState.selection.type, "unit");
  assert.equal(inspectedState.selection.id, playerUnit.id);
  assert.equal(inspectedState.pendingAction, null);

  assert.equal(system.handleTileSelection(enemyUnit.x, enemyUnit.y), true);

  inspectedState = system.getStateForSave();
  assert.equal(inspectedState.selection.type, "unit");
  assert.equal(inspectedState.selection.id, enemyUnit.id);
  assert.equal(inspectedState.pendingAction, null);
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
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  assert.equal(getAttackModifier(battleState, grunt), 12);
  assert.equal(getAttackModifier(battleState, runner), 14);
  assert.equal(getAttackModifier(battleState, bruiser), -17);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const afterPower = system.getStateForSave();
  const updatedGrunt = afterPower.player.units.find((unit) => unit.id === grunt.id);
  const updatedRunner = afterPower.player.units.find((unit) => unit.id === runner.id);
  const updatedBruiser = afterPower.player.units.find((unit) => unit.id === bruiser.id);

  assert.equal(getAttackModifier(afterPower, updatedGrunt), 31);
  assert.equal(getAttackModifier(afterPower, updatedRunner), 36);
  assert.equal(getAttackModifier(afterPower, updatedBruiser), -17);
  assert.equal(getMovementModifier(afterPower, updatedGrunt), 2);
  assert.equal(getMovementModifier(afterPower, updatedRunner), 0);
});

test("rook boosts attacks on owned properties and hostile takeover scales from owned property count", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 5, 4);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [grunt, bruiser],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "rook";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);
  battleState.map.buildings = [
    { id: "player-sector-a", type: BUILDING_KEYS.SECTOR, owner: TURN_SIDES.PLAYER, x: 2, y: 2 },
    { id: "player-sector-b", type: BUILDING_KEYS.SECTOR, owner: TURN_SIDES.PLAYER, x: 6, y: 1 },
    { id: "enemy-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 7, y: 4 }
  ];

  assert.equal(getAttackModifier(battleState, grunt), 19);
  assert.equal(getAttackModifier(battleState, bruiser), 0);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const afterPower = system.getStateForSave();
  const updatedGrunt = afterPower.player.units.find((unit) => unit.id === grunt.id);
  const updatedBruiser = afterPower.player.units.find((unit) => unit.id === bruiser.id);

  assert.equal(getAttackModifier(afterPower, updatedGrunt), 25);
  assert.equal(getAttackModifier(afterPower, updatedBruiser), 8);
  assert.equal(getArmorModifier(afterPower, updatedBruiser), 6);
});

test("echo power reduces enemy movement through the enemy turn", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "echo";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  let updatedEnemy = system.getStateForSave().enemy.units[0];
  assert.equal(getMovementModifier(system.getStateForSave(), updatedEnemy), -1);

  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);

  updatedEnemy = system.getStateForSave().enemy.units[0];
  assert.equal(getMovementModifier(system.getStateForSave(), updatedEnemy), -1);

  assert.equal(system.finalizeEnemyTurn().changed, true);

  updatedEnemy = system.getStateForSave().enemy.units[0];
  assert.equal(getMovementModifier(system.getStateForSave(), updatedEnemy), 0);
});

test("echo units can reposition 1 tile after attacking", () => {
  const attacker = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1, {
    current: {
      hp: 6
    }
  });
  const distantEnemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 6);
  const battleState = createTestBattleState({
    width: 8,
    height: 8,
    playerUnits: [attacker],
    enemyUnits: [defender, distantEnemy]
  });
  battleState.player.commanderId = "echo";

  const system = new BattleSystem(battleState);

  assert.equal(system.attackTarget(attacker.id, defender.id), true);

  let afterAttack = system.getStateForSave();
  const attackSnapshot = system.getSnapshot();
  let updatedAttacker = afterAttack.player.units.find((unit) => unit.id === attacker.id);

  assert.equal(afterAttack.pendingAction.mode, "slipstream");
  assert.equal(afterAttack.selection.id, attacker.id);
  assert.equal(updatedAttacker.hasAttacked, true);
  assert.ok(attackSnapshot.presentation.reachableTiles.length > 0);

  const slipstreamTile = attackSnapshot.presentation.reachableTiles[0];

  assert.equal(system.handleTileSelection(slipstreamTile.x, slipstreamTile.y), true);

  const afterSlipstream = system.getStateForSave();
  updatedAttacker = afterSlipstream.player.units.find((unit) => unit.id === attacker.id);

  assert.equal(updatedAttacker.x, slipstreamTile.x);
  assert.equal(updatedAttacker.y, slipstreamTile.y);
  assert.equal(updatedAttacker.hasAttacked, true);
  assert.equal(afterSlipstream.pendingAction, null);
});

test("enemy echo units stay put after attacking when their current tile is the best cover", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 3, 3, {
    current: {
      hp: 18
    }
  });
  player.stats.luck = 0;
  const enemy = createPlacedUnit("longshot", TURN_SIDES.ENEMY, 5, 3);
  enemy.stats.luck = 0;
  const battleState = createTestBattleState({
    width: 6,
    height: 6,
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY,
    seed: 7
  });
  battleState.map.tiles = Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, () => TERRAIN_KEYS.ROAD)
  );
  battleState.map.buildings = [
    { id: "player-command-echo-test", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 0, y: 5 },
    { id: "enemy-command-echo-test", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 5, y: 3 }
  ];
  battleState.enemy.commanderId = "echo";
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const attackStep = system.processEnemyTurnStep();
  const afterAttack = system.getStateForSave();
  const updatedEnemy = afterAttack.enemy.units.find((unit) => unit.id === enemy.id);

  assert.equal(attackStep.type, "attack");
  assert.equal(afterAttack.enemyTurn.pendingSlipstream, null);
  assert.equal(updatedEnemy.x, enemy.x);
  assert.equal(updatedEnemy.y, enemy.y);
  assert.equal(updatedEnemy.hasAttacked, true);
  assert.ok(
    !afterAttack.player.units.find((unit) => unit.id === player.id) ||
      afterAttack.player.units.find((unit) => unit.id === player.id).current.hp < player.current.hp
  );
});

test("enemy echo units reposition after attacking when a safer slipstream tile is available", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3, {
    current: {
      hp: 100
    }
  });
  player.stats.luck = 0;
  const enemy = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 5, 3);
  enemy.stats.luck = 0;
  const battleState = createTestBattleState({
    width: 6,
    height: 6,
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY,
    seed: 7
  });
  battleState.map.tiles = Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, () => TERRAIN_KEYS.ROAD)
  );
  battleState.map.buildings = [
    { id: "player-command-echo-test", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 0, y: 5 },
    { id: "enemy-command-echo-test", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 5, y: 4 }
  ];
  battleState.enemy.commanderId = "echo";
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const attackStep = system.processEnemyTurnStep();
  const afterAttack = system.getStateForSave();

  assert.equal(attackStep.type, "attack");
  assert.ok(afterAttack.enemyTurn.pendingSlipstream);
  assert.deepEqual(afterAttack.enemyTurn.pendingSlipstream, {
    unitId: enemy.id,
    x: 5,
    y: 4,
    moveSegments: 1
  });
  assert.equal(
    afterAttack.enemy.units.find((unit) => unit.id === enemy.id).hasAttacked,
    true
  );
  assert.ok(
    !afterAttack.player.units.find((unit) => unit.id === player.id) ||
      afterAttack.player.units.find((unit) => unit.id === player.id).current.hp < player.current.hp
  );

  const moveStep = system.processEnemyTurnStep();
  const updatedEnemy = system.getStateForSave().enemy.units.find((unit) => unit.id === enemy.id);

  assert.equal(moveStep.type, "move");
  assert.equal(system.getStateForSave().enemyTurn.pendingSlipstream, null);
  assert.equal(updatedEnemy.x, 5);
  assert.equal(updatedEnemy.y, 4);
  assert.equal(updatedEnemy.hasAttacked, true);
});

test("unimplemented commanders use explicit future effect names without old generic mechanics", () => {
  const staleTypes = new Set([
    "charge-dealt",
    "team-resupply",
    "team-mobility",
    "team-heal",
    "move-tag",
    "range-tag",
    "recruit-discount",
    "team-shield",
    "team-assault",
    "orbital-strike",
    "supply-drop"
  ]);

  for (const commander of COMMANDERS.filter((candidate) => !["atlas", "viper", "echo"].includes(candidate.id))) {
    assert.equal(staleTypes.has(commander.passive.type), false, commander.id);
    assert.equal(staleTypes.has(commander.active.type), false, commander.id);
  }
});

test("echo disruption can corrupt ammo or stamina stats and persists through the enemy turn", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 7, 4);
  enemy.id = "echo-a";
  const battleState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy],
    seed: 6
  });
  battleState.player.commanderId = "echo";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  let updatedEnemy = system.getStateForSave().enemy.units[0];
  const corruptedStatus = updatedEnemy.statuses.find((status) => status.type === "corrupted");

  assert.equal(corruptedStatus?.stat, "stamina");
  assert.equal(getMovementModifier(system.getStateForSave(), updatedEnemy), -1);
  assert.equal(getEffectiveCurrentStamina(updatedEnemy), 40);
  assert.equal(updatedEnemy.statuses.some((status) => status.type === "corrupted"), true);
  assert.notEqual(system.getStateForSave().seed, 6);

  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);

  updatedEnemy = system.getStateForSave().enemy.units[0];
  assert.equal(getEffectiveCurrentStamina(updatedEnemy), 40);

  assert.equal(system.finalizeEnemyTurn().changed, true);
  updatedEnemy = system.getStateForSave().enemy.units[0];
  assert.equal(updatedEnemy.statuses.some((status) => status.type === "corrupted"), false);
  assert.equal(getEffectiveCurrentStamina(updatedEnemy), 80);
});

test("echo disruption rolls corrupted stats independently per enemy unit", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemies = [
    createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4),
    createPlacedUnit("runner", TURN_SIDES.ENEMY, 7, 5),
    createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 7, 6)
  ];
  enemies[0].id = "echo-0";
  enemies[1].id = "echo-1";
  enemies[2].id = "echo-3";
  const battleState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: enemies,
    seed: 6
  });
  battleState.player.commanderId = "echo";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const corruptedStats = system.getStateForSave().enemy.units.map(
    (unit) => unit.statuses.find((status) => status.type === "corrupted")?.stat ?? null
  );

  assert.deepEqual(corruptedStats, ["attack", "ammo", "armor"]);
});

test("blaze ignition applies burn damage, halves attack while burning, and expires after the burned turn", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 1);
  const battleState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "blaze";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  let burnedEnemy = system.getStateForSave().enemy.units[0];
  assert.equal(burnedEnemy.current.hp, 90);
  assert.equal(burnedEnemy.statuses.some((status) => status.type === "burn"), true);
  assert.equal(getAttackModifier(system.getStateForSave(), burnedEnemy), -31);

  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);

  burnedEnemy = system.getStateForSave().enemy.units[0];
  assert.equal(burnedEnemy.current.hp, 80);
  assert.equal(getAttackModifier(system.getStateForSave(), burnedEnemy), -31);

  assert.equal(system.finalizeEnemyTurn().changed, true);
  burnedEnemy = system.getStateForSave().enemy.units[0];
  assert.equal(burnedEnemy.statuses.some((status) => status.type === "burn"), false);
  assert.equal(getAttackModifier(system.getStateForSave(), burnedEnemy), 0);
});

test("infantry can extinguish adjacent burned allies", () => {
  const helper = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const ally = createPlacedUnit("runner", TURN_SIDES.PLAYER, 3, 2, {
    statuses: [{ type: "burn", tickDamageRatio: 0.1, negative: true }]
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [helper, ally],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: helper.id, x: helper.x, y: helper.y };
  battleState.pendingAction = {
    type: "move",
    unitId: helper.id,
    mode: "menu",
    fromX: helper.x,
    fromY: helper.y,
    fromStamina: helper.current.stamina,
    toX: helper.x,
    toY: helper.y
  };

  const system = new BattleSystem(battleState);

  assert.equal(system.useExtinguishAbilityWithPendingUnit(), true);

  const afterExtinguish = system.getStateForSave();
  const updatedHelper = afterExtinguish.player.units.find((unit) => unit.id === helper.id);
  const updatedAlly = afterExtinguish.player.units.find((unit) => unit.id === ally.id);

  assert.equal(updatedAlly.statuses.some((status) => status.type === "burn"), false);
  assert.equal(updatedHelper.hasMoved, true);
  assert.equal(updatedHelper.hasAttacked, true);
});

test("knox doubles positional armor for units that stay put and fortress protocol blanks the first enemy combat", () => {
  const defender = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
    movedThisTurn: false
  });
  const attacker = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [defender],
    enemyUnits: [attacker]
  });
  battleState.player.commanderId = "knox";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);
  battleState.map.tiles[defender.y][defender.x] = TERRAIN_KEYS.FOREST;

  assert.equal(getDefenderArmor(battleState, defender), 10);
  defender.movedThisTurn = true;
  assert.equal(getDefenderArmor(battleState, defender), 8);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  let updatedDefender = system.getStateForSave().player.units[0];
  assert.equal(getDefenderArmor(system.getStateForSave(), updatedDefender), 10);

  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);
  assert.equal(system.attackTarget(attacker.id, defender.id), true);

  updatedDefender = system.getStateForSave().player.units[0];
  const updatedAttacker = system.getStateForSave().enemy.units[0];

  assert.equal(updatedDefender.current.hp, defender.current.hp);
  assert.equal(updatedAttacker.current.hp, attacker.current.hp);
});

test("falcon buffs aircraft and reinforcements spawn a temporary gunship near HQ", () => {
  const gunship = createPlacedUnit("gunship", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [gunship],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "falcon";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  assert.equal(getAttackModifier(battleState, gunship), 16);
  assert.equal(getArmorModifier(battleState, gunship), 2);

  const hq = battleState.map.buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.PLAYER
  );
  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const afterPower = system.getStateForSave();
  const summonedGunship = afterPower.player.units.find(
    (unit) => unit.id !== gunship.id && unit.unitTypeId === "gunship"
  );

  assert.ok(summonedGunship);
  assert.equal(summonedGunship.temporary?.battleLocalOnly, true);
  assert.equal(Math.abs(summonedGunship.x - hq.x) + Math.abs(summonedGunship.y - hq.y) <= 1, true);
  assert.equal(summonedGunship.hasMoved, false);
  assert.equal(summonedGunship.hasAttacked, false);
});

test("falcon power fails cleanly without spending charge when HQ and adjacent tiles are blocked", () => {
  const battleState = createTestBattleState({
    playerUnits: [
      createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0),
      createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0),
      createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0),
      createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0),
      createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0)
    ],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4)]
  });
  battleState.player.commanderId = "falcon";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);
  const hq = battleState.map.buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.PLAYER
  );
  const occupiedTiles = [
    { x: hq.x, y: hq.y },
    { x: hq.x + 1, y: hq.y },
    { x: hq.x - 1, y: hq.y },
    { x: hq.x, y: hq.y + 1 },
    { x: hq.x, y: hq.y - 1 }
  ];

  battleState.player.units.forEach((unit, index) => {
    unit.x = occupiedTiles[index].x;
    unit.y = occupiedTiles[index].y;
  });

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), false);
  assert.equal(system.getStateForSave().player.units.length, 5);
  assert.equal(system.getStateForSave().player.charge, getCommanderPowerMax("falcon"));
  assert.equal(system.getLastPowerResult().applied, false);
});

test("graves gains 50 percent bonus combat xp on kills and nonlethal attacks", () => {
  const modifierUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const modifierState = createTestBattleState({
    playerUnits: [modifierUnit],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4)]
  });
  modifierState.player.commanderId = "graves";

  assert.equal(getExperienceModifier(modifierState, modifierUnit, { combatXp: false, killed: false }), 0);
  assert.equal(getExperienceModifier(modifierState, modifierUnit, { combatXp: true, killed: false }), 0.5);
  assert.equal(getExperienceModifier(modifierState, modifierUnit, { combatXp: true, killed: true }), 0.5);

  const nonlethalAttacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
    experience: 0
  });
  const nonlethalDefender = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 3, 2);
  const nonlethalState = createTestBattleState({
    playerUnits: [nonlethalAttacker],
    enemyUnits: [nonlethalDefender]
  });
  nonlethalState.player.commanderId = "graves";
  const nonlethalSystem = new BattleSystem(nonlethalState);
  const nonlethalBefore = nonlethalSystem.getStateForSave();

  assert.equal(nonlethalSystem.attackTarget(nonlethalAttacker.id, nonlethalDefender.id), true);

  const nonlethalAfter = nonlethalSystem.getStateForSave();
  const updatedNonlethalAttacker = nonlethalAfter.player.units[0];
  const updatedNonlethalDefender = nonlethalAfter.enemy.units[0];
  const nonlethalDamage = nonlethalBefore.enemy.units[0].current.hp - updatedNonlethalDefender.current.hp;
  const nonlethalBaseXp = getCombatExperience(
    nonlethalBefore.player.units[0],
    nonlethalBefore.enemy.units[0],
    nonlethalDamage,
    false
  );

  assert.equal(updatedNonlethalAttacker.experience, Math.round(nonlethalBaseXp * 1.5));

  const killAttacker = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 2, 2, {
    experience: 0
  });
  const killDefender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2, {
    current: {
      hp: 10
    }
  });
  const killState = createTestBattleState({
    playerUnits: [killAttacker],
    enemyUnits: [killDefender]
  });
  killState.player.commanderId = "graves";
  const killSystem = new BattleSystem(killState);
  const killBefore = killSystem.getStateForSave();

  assert.equal(killSystem.attackTarget(killAttacker.id, killDefender.id), true);

  const killAfter = killSystem.getStateForSave();
  const updatedKillAttacker = killAfter.player.units[0];
  const killDamage = killBefore.enemy.units[0].current.hp;
  const killBaseXp = getCombatExperience(
    killBefore.player.units[0],
    killBefore.enemy.units[0],
    killDamage,
    true
  );

  assert.equal(killAfter.enemy.units.length, 0);
  assert.equal(updatedKillAttacker.experience, Math.round(killBaseXp * 1.5));
});

test("graves execution window lets defenders strike first when attacked", () => {
  const makeState = () => {
    const defender = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
    const attacker = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 3, 2);
    return createTestBattleState({
      playerUnits: [defender],
      enemyUnits: [attacker]
    });
  };

  const baselineState = makeState();
  baselineState.player.commanderId = "graves";
  const baselineSystem = new BattleSystem(baselineState);
  baselineSystem.endTurn();
  baselineSystem.startEnemyTurnActions();
  assert.equal(
    baselineSystem.attackTarget(
      baselineSystem.getStateForSave().enemy.units[0].id,
      baselineSystem.getStateForSave().player.units[0].id
    ),
    true
  );
  const baselineAfter = baselineSystem.getStateForSave();

  const poweredState = makeState();
  poweredState.player.commanderId = "graves";
  poweredState.player.charge = getCommanderPowerMax("graves");
  const poweredSystem = new BattleSystem(poweredState);

  assert.equal(poweredSystem.activatePower(), true);
  assert.equal(poweredSystem.endTurn(), true);
  assert.equal(poweredSystem.startEnemyTurnActions().changed, true);
  assert.equal(
    poweredSystem.attackTarget(
      poweredSystem.getStateForSave().enemy.units[0].id,
      poweredSystem.getStateForSave().player.units[0].id
    ),
    true
  );

  const poweredAfter = poweredSystem.getStateForSave();

  assert.ok(poweredAfter.player.units[0].current.hp > baselineAfter.player.units[0].current.hp);
  assert.ok(poweredAfter.enemy.units[0].current.hp < baselineAfter.enemy.units[0].current.hp);
});

test("graves execution window mirror match cancels back to normal combat order", () => {
  const makeState = () => {
    const defender = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
    const attacker = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 3, 2);
    return createTestBattleState({
      playerUnits: [defender],
      enemyUnits: [attacker]
    });
  };

  const baselineState = makeState();
  baselineState.player.commanderId = "graves";
  const baselineSystem = new BattleSystem(baselineState);
  baselineSystem.endTurn();
  baselineSystem.startEnemyTurnActions();
  assert.equal(
    baselineSystem.attackTarget(
      baselineSystem.getStateForSave().enemy.units[0].id,
      baselineSystem.getStateForSave().player.units[0].id
    ),
    true
  );
  const baselineAfter = baselineSystem.getStateForSave();

  const mirrorState = makeState();
  mirrorState.player.commanderId = "graves";
  mirrorState.player.charge = getCommanderPowerMax("graves");
  mirrorState.enemy.commanderId = "graves";
  mirrorState.enemy.charge = getCommanderPowerMax("graves");
  const mirrorSystem = new BattleSystem(mirrorState);

  assert.equal(mirrorSystem.activatePower(), true);
  assert.equal(mirrorSystem.endTurn(), true);
  assert.equal(mirrorSystem.startEnemyTurnActions().changed, true);
  assert.equal(mirrorSystem.activatePower(), true);
  assert.equal(
    mirrorSystem.attackTarget(
      mirrorSystem.getStateForSave().enemy.units[0].id,
      mirrorSystem.getStateForSave().player.units[0].id
    ),
    true
  );

  const mirrorAfter = mirrorSystem.getStateForSave();

  assert.equal(mirrorAfter.player.units[0].current.hp, baselineAfter.player.units[0].current.hp);
  assert.equal(mirrorAfter.enemy.units[0].current.hp, baselineAfter.enemy.units[0].current.hp);
});

test("nova passive checks full ammo and overload spends ammo for a same-turn attack buff", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [grunt],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "nova";
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  assert.equal(getAttackModifier(battleState, grunt), 12);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const updatedGrunt = system.getStateForSave().player.units[0];

  assert.equal(updatedGrunt.current.ammo, 0);
  assert.equal(getAttackModifier(system.getStateForSave(), updatedGrunt), 43);
  assert.equal(getUnitAttackProfile(updatedGrunt).type, "secondary");
});

test("sable passive and lucky seven turn luck into crit and glance outcomes", () => {
  const critAttacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const critDefender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  critAttacker.stats.luck = 100;
  let critState = createTestBattleState({
    playerUnits: [critAttacker],
    enemyUnits: [critDefender],
    seed: 1
  });
  critState.player.commanderId = "sable";

  assert.deepEqual(rollStrikeOutcome(critState, critAttacker, critDefender, 10), {
    damage: 20,
    isCrit: true,
    isGlance: false
  });

  const glanceAttacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const glanceDefender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  glanceDefender.stats.luck = 100;
  const glanceState = createTestBattleState({
    playerUnits: [glanceAttacker],
    enemyUnits: [glanceDefender],
    seed: 1
  });
  glanceState.enemy.commanderId = "sable";

  assert.deepEqual(rollStrikeOutcome(glanceState, glanceAttacker, glanceDefender, 10), {
    damage: 5,
    isCrit: false,
    isGlance: true
  });

  const luckyAttacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const luckyDefender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  luckyAttacker.stats.luck = 10;
  const luckyState = createTestBattleState({
    playerUnits: [luckyAttacker],
    enemyUnits: [luckyDefender],
    seed: 1
  });
  luckyState.player.commanderId = "sable";
  luckyState.player.charge = getCommanderPowerMax(luckyState.player.commanderId);
  const luckySystem = new BattleSystem(luckyState);

  assert.equal(luckySystem.activatePower(), true);

  const afterPower = luckySystem.getStateForSave();
  const updatedAttacker = afterPower.player.units[0];
  const updatedDefender = afterPower.enemy.units[0];

  assert.deepEqual(rollStrikeOutcome(afterPower, updatedAttacker, updatedDefender, 10), {
    damage: 20,
    isCrit: true,
    isGlance: false
  });
});

test("damage forecast matches actual damage with terrain armor", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  attacker.stats.luck = 0;
  defender.stats.luck = 0;
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender],
    seed: 1
  });
  battleState.map.tiles[defender.y][defender.x] = TERRAIN_KEYS.MOUNTAIN;

  const forecast = getAttackForecast(battleState, attacker, defender);
  const system = new BattleSystem(battleState);
  const startingHp = defender.current.hp;

  assert.equal(system.attackTarget(attacker.id, defender.id), true);

  const afterAttack = system.getStateForSave();
  const damagedDefender = afterAttack.enemy.units.find((unit) => unit.id === defender.id);
  const actualDamage = startingHp - damagedDefender.current.hp;

  assert.equal(forecast.dealt.min, actualDamage);
  assert.equal(forecast.dealt.max, actualDamage);
});

test("damage forecast matches actual damage with building and status armor", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1, {
    statuses: [{ type: "shield", value: 2, turnsRemaining: 1 }]
  });
  attacker.stats.luck = 0;
  defender.stats.luck = 0;
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender],
    seed: 2
  });
  battleState.map.tiles[defender.y][defender.x] = TERRAIN_KEYS.ROAD;
  battleState.map.buildings.push({
    id: "enemy-test-sector",
    type: BUILDING_KEYS.SECTOR,
    owner: TURN_SIDES.ENEMY,
    x: defender.x,
    y: defender.y
  });

  const forecast = getAttackForecast(battleState, attacker, defender);
  const system = new BattleSystem(battleState);
  const startingHp = defender.current.hp;

  assert.equal(system.attackTarget(attacker.id, defender.id), true);

  const afterAttack = system.getStateForSave();
  const damagedDefender = afterAttack.enemy.units.find((unit) => unit.id === defender.id);
  const actualDamage = startingHp - damagedDefender.current.hp;

  assert.equal(forecast.dealt.min, actualDamage);
  assert.equal(forecast.dealt.max, actualDamage);
});

test("buildings override terrain armor regardless of ownership, and command posts give plus four", () => {
  const defender = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 1);
  const battleState = createTestBattleState({
    playerUnits: [defender],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4)]
  });

  battleState.map.tiles[defender.y][defender.x] = TERRAIN_KEYS.MOUNTAIN;
  battleState.map.buildings = battleState.map.buildings.filter(
    (building) => building.x !== defender.x || building.y !== defender.y
  );
  battleState.map.buildings.push({
    id: "neutral-command-override",
    type: BUILDING_KEYS.COMMAND,
    owner: "neutral",
    x: defender.x,
    y: defender.y
  });

  assert.equal(getDefenderArmor(battleState, defender), defender.stats.armor + 4);
});

test("combat can deal zero damage when defense fully absorbs the hit", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 2, 1, {
    statuses: [{ type: "shield", value: 2, turnsRemaining: 1 }]
  });
  attacker.stats.luck = 0;
  defender.stats.luck = 0;
  const battleState = createNeutralBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender],
    seed: 3
  });
  battleState.map.tiles[defender.y][defender.x] = TERRAIN_KEYS.FOREST;
  battleState.map.buildings = battleState.map.buildings.filter(
    (building) => building.x !== defender.x || building.y !== defender.y
  );
  battleState.map.buildings.push({
    id: "enemy-zero-damage-sector",
    type: BUILDING_KEYS.SECTOR,
    owner: TURN_SIDES.ENEMY,
    x: defender.x,
    y: defender.y
  });

  const forecast = getAttackForecast(battleState, attacker, defender);
  const system = new BattleSystem(battleState);
  const startingHp = defender.current.hp;

  assert.equal(system.attackTarget(attacker.id, defender.id), true);

  const afterAttack = system.getStateForSave();
  const damagedDefender = afterAttack.enemy.units.find((unit) => unit.id === defender.id);
  const actualDamage = startingHp - damagedDefender.current.hp;

  assert.equal(forecast.dealt.min, 0);
  assert.equal(forecast.dealt.max, 0);
  assert.equal(actualDamage, 0);
});

test("secondary fire uses the rifle weapon profile", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      ammo: 0
    }
  });
  const gunship = createPlacedUnit("gunship", TURN_SIDES.ENEMY, 2, 1);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 2, 1);
  const attackProfile = getUnitAttackProfile(runner);

  assert.equal(attackProfile.type, "secondary");
  assert.equal(attackProfile.weaponClass, WEAPON_CLASSES.RIFLE);
  assert.equal(canUnitAttackTarget(runner, gunship), false);
  assert.equal(canUnitAttackTarget(runner, bruiser), true);
});

test("breaker uses light, medium, and heavy armor class profiles", () => {
  const breaker = createPlacedUnit("breaker", TURN_SIDES.PLAYER, 1, 1);
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 2, 1);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 2, 1);
  const juggernaut = createPlacedUnit("juggernaut", TURN_SIDES.ENEMY, 2, 1);
  breaker.stats.luck = 0;
  runner.stats.luck = 0;
  bruiser.stats.luck = 0;
  juggernaut.stats.luck = 0;

  assert.equal(createNeutralForecast(breaker, runner).forecast.dealt.min, 73);
  assert.equal(createNeutralForecast(breaker, runner).forecast.dealt.max, 73);
  assert.equal(createNeutralForecast(breaker, bruiser).forecast.dealt.min, 46);
  assert.equal(createNeutralForecast(breaker, bruiser).forecast.dealt.max, 46);
  assert.equal(createNeutralForecast(breaker, juggernaut).forecast.dealt.min, 17);
  assert.equal(createNeutralForecast(breaker, juggernaut).forecast.dealt.max, 17);
});

test("hp scaling happens after armor is subtracted", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("runner", TURN_SIDES.ENEMY, 2, 1);
  attacker.stats.luck = 0;
  defender.stats.luck = 0;

  let result = createNeutralForecast(attacker, defender).forecast;
  assert.equal(result.dealt.min, 11);
  assert.equal(result.dealt.max, 11);

  attacker.current.hp = 50;
  result = createNeutralForecast(attacker, defender).forecast;
  assert.equal(result.dealt.min, 6);
  assert.equal(result.dealt.max, 6);
});

test("luck does not scale down with low hp", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      hp: 1
    }
  });
  const defender = createPlacedUnit("runner", TURN_SIDES.ENEMY, 2, 1);
  attacker.stats.luck = 3;
  defender.stats.luck = 0;

  const forecast = createNeutralForecast(attacker, defender).forecast;

  assert.equal(forecast.dealt.min, 0);
  assert.equal(forecast.dealt.max, 3);
});

test("neutral threshold smoke tests match the new weapon and armor profiles", () => {
  const cases = [
    { attacker: "grunt", defender: "grunt", dealt: [56, 59], received: [23, 28], distance: 1 },
    { attacker: "breaker", defender: "runner", dealt: [73, 76], received: [16, 21], distance: 1 },
    { attacker: "breaker", defender: "juggernaut", dealt: [17, 20], received: [86, 92], distance: 1 },
    { attacker: "longshot", defender: "grunt", dealt: [68, 71], received: null, distance: 2 },
    { attacker: "bruiser", defender: "bruiser", dealt: [55, 58], received: [23, 28], distance: 1 },
    { attacker: "juggernaut", defender: "juggernaut", dealt: [54, 56], received: [24, 27], distance: 1 },
    { attacker: "siege-gun", defender: "juggernaut", dealt: [50, 53], received: null, distance: 2 },
    { attacker: "skyguard", defender: "gunship", dealt: [119, 122], received: null, distance: 1 },
    { attacker: "gunship", defender: "skyguard", dealt: [63, 66], received: [40, 47], distance: 1 },
    { attacker: "interceptor", defender: "interceptor", dealt: [61, 64], received: [22, 27], distance: 1 }
  ];

  for (const entry of cases) {
    const attacker = createPlacedUnit(entry.attacker, TURN_SIDES.PLAYER, 1, 1);
    const defender = createPlacedUnit(entry.defender, TURN_SIDES.ENEMY, 1 + entry.distance, 1);
    const forecast = createNeutralForecast(attacker, defender).forecast;

    assert.deepEqual(
      [forecast.dealt.min, forecast.dealt.max],
      entry.dealt,
      `${entry.attacker} vs ${entry.defender} dealt`
    );

    if (entry.received === null) {
      assert.equal(forecast.received, null, `${entry.attacker} vs ${entry.defender} should not receive counter damage`);
    } else {
      assert.deepEqual(
        [forecast.received.min, forecast.received.max],
        entry.received,
        `${entry.attacker} vs ${entry.defender} received`
      );
    }
  }
});

test("movement spends stamina equal to the path cost used", () => {
  const unit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      stamina: 8
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.map.tiles[1][2] = TERRAIN_KEYS.FOREST;
  battleState.map.tiles[1][3] = TERRAIN_KEYS.ROAD;
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(3, 1), true);

  const movedUnit = system.getStateForSave().player.units[0];

  assert.equal(movedUnit.current.stamina, 4);
});

test("units with zero stamina can hold position but cannot move off their tile", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      stamina: 0
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };
  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(unit.x, unit.y), true);
  assert.equal(system.getStateForSave().pendingAction?.unitId, unit.id);
  assert.equal(system.handleContextAction(), true);

  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };
  const secondSystem = new BattleSystem(battleState);
  assert.equal(secondSystem.handleTileSelection(2, 1), true);
  assert.equal(secondSystem.getStateForSave().pendingAction, null);
  assert.equal(secondSystem.getStateForSave().player.units[0].x, unit.x);
  assert.equal(secondSystem.getStateForSave().player.units[0].y, unit.y);
});

test("carrier stays in data but is not recruitable from airfields", () => {
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1)],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4)]
  });
  battleState.player.funds = 5000;
  const airfield = {
    id: "player-test-airfield",
    type: BUILDING_KEYS.AIRFIELD,
    owner: TURN_SIDES.PLAYER,
    x: 3,
    y: 1
  };
  battleState.map.buildings.push(airfield);
  battleState.selection = { type: "building", id: airfield.id, x: airfield.x, y: airfield.y };

  const system = new BattleSystem(battleState);
  const airfieldOptions = system.getSnapshot().presentation.recruitOptions.map((option) => option.id);

  assert.equal(BUILDING_RECRUITMENT.airfield.includes("carrier"), false);
  assert.equal(airfieldOptions.includes("carrier"), false);
  assert.equal(system.recruitUnit("carrier"), false);
});

test("repair stations service vehicles once per owner and ignore infantry", () => {
  const vehicle = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      hp: 5,
      ammo: 0,
      stamina: 0
    }
  });
  const infantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 1, {
    current: {
      hp: 5,
      ammo: 0,
      stamina: 0
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [vehicle, infantry],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.player.commanderId = "atlas";
  const repairStation = {
    id: "player-test-repair-station",
    type: BUILDING_KEYS.REPAIR_STATION,
    owner: TURN_SIDES.PLAYER,
    x: 3,
    y: 2
  };
  battleState.map.buildings = battleState.map.buildings.filter(
    (building) => building.x !== repairStation.x || building.y !== repairStation.y
  );
  battleState.map.buildings.push(repairStation);
  vehicle.x = repairStation.x;
  vehicle.y = repairStation.y;
  infantry.x = repairStation.x + 1;
  infantry.y = repairStation.y;

  const system = new BattleSystem(battleState);

  assert.equal(system.finalizeEnemyTurn().changed, true);

  let afterService = system.getStateForSave();
  let servicedVehicle = afterService.player.units.find((unit) => unit.id === vehicle.id);
  let ignoredInfantry = afterService.player.units.find((unit) => unit.id === infantry.id);

  assert.equal(servicedVehicle.current.hp, servicedVehicle.stats.maxHealth);
  assert.equal(servicedVehicle.current.ammo, servicedVehicle.stats.ammoMax);
  assert.equal(servicedVehicle.current.stamina, servicedVehicle.stats.staminaMax);
  assert.equal(ignoredInfantry.current.ammo, 0);
  assert.equal(afterService.map.buildings.find((building) => building.id === repairStation.id).lastServiceOwner, TURN_SIDES.PLAYER);

  servicedVehicle.current.hp = 4;
  servicedVehicle.current.ammo = 0;
  servicedVehicle.current.stamina = 0;

  const secondSystem = new BattleSystem(afterService);
  assert.equal(secondSystem.endTurn(), true);
  assert.equal(secondSystem.startEnemyTurnActions().changed, true);
  assert.equal(secondSystem.finalizeEnemyTurn().changed, true);

  afterService = secondSystem.getStateForSave();
  servicedVehicle = afterService.player.units.find((unit) => unit.id === vehicle.id);

  assert.equal(servicedVehicle.current.hp, 4 + Math.ceil(servicedVehicle.stats.maxHealth * 0.1));
  assert.equal(servicedVehicle.current.ammo, 0);
  assert.equal(servicedVehicle.current.stamina, 0);
});

test("hospitals restore infantry once per owner and do not service vehicles", () => {
  const playerInfantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      hp: 3,
      ammo: 0,
      stamina: 0
    }
  });
  const enemyInfantry = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4, {
    current: {
      hp: 3,
      ammo: 0,
      stamina: 0
    }
  });
  const vehicle = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 1, {
    current: {
      hp: 4,
      ammo: 0,
      stamina: 0
    }
  });
  const battleState = createTestBattleState({
    playerUnits: [playerInfantry, vehicle],
    enemyUnits: [enemyInfantry]
  });
  battleState.player.commanderId = "atlas";
  battleState.enemy.commanderId = "atlas";
  const hospital = battleState.map.buildings.find((building) => building.type === BUILDING_KEYS.HOSPITAL);
  hospital.owner = TURN_SIDES.ENEMY;
  playerInfantry.x = hospital.x;
  playerInfantry.y = hospital.y;
  battleState.pendingAction = {
    type: "move",
    unitId: playerInfantry.id,
    mode: "menu"
  };

  const system = new BattleSystem(battleState);

  assert.equal(system.captureWithPendingUnit(), true);

  let afterCapture = system.getStateForSave();
  let restoredPlayer = afterCapture.player.units.find((unit) => unit.id === playerInfantry.id);

  assert.equal(restoredPlayer.current.hp, restoredPlayer.stats.maxHealth);
  assert.equal(restoredPlayer.current.ammo, restoredPlayer.stats.ammoMax);
  assert.equal(restoredPlayer.current.stamina, restoredPlayer.stats.staminaMax);

  restoredPlayer.x = hospital.x + 1;
  const enemyCaptor = afterCapture.enemy.units.find((unit) => unit.id === enemyInfantry.id);
  enemyCaptor.x = hospital.x;
  enemyCaptor.y = hospital.y;
  afterCapture.pendingAction = {
    type: "move",
    unitId: enemyInfantry.id,
    mode: "menu"
  };
  afterCapture.turn.activeSide = TURN_SIDES.ENEMY;

  const enemyCaptureSystem = new BattleSystem(afterCapture);
  assert.equal(enemyCaptureSystem.captureWithPendingUnit(), true);

  const afterEnemyCapture = enemyCaptureSystem.getStateForSave();
  const recapturePlayer = afterEnemyCapture.player.units.find((unit) => unit.id === playerInfantry.id);
  recapturePlayer.current.hp = 5;
  recapturePlayer.current.ammo = 0;
  recapturePlayer.current.stamina = 0;
  recapturePlayer.x = hospital.x;
  recapturePlayer.y = hospital.y;
  afterEnemyCapture.pendingAction = {
    type: "move",
    unitId: playerInfantry.id,
    mode: "menu"
  };
  afterEnemyCapture.turn.activeSide = TURN_SIDES.PLAYER;

  const recaptureSystem = new BattleSystem(afterEnemyCapture);
  assert.equal(recaptureSystem.captureWithPendingUnit(), true);

  const afterRecapture = recaptureSystem.getStateForSave();
  restoredPlayer = afterRecapture.player.units.find((unit) => unit.id === playerInfantry.id);

  assert.equal(restoredPlayer.current.hp, restoredPlayer.stats.maxHealth);
  assert.equal(restoredPlayer.current.ammo, restoredPlayer.stats.ammoMax);
  assert.equal(restoredPlayer.current.stamina, restoredPlayer.stats.staminaMax);

  const vehicleState = createTestBattleState({
    playerUnits: [vehicle],
    enemyUnits: [enemyInfantry]
  });
  const vehicleHospital = vehicleState.map.buildings.find((building) => building.type === BUILDING_KEYS.HOSPITAL);
  vehicleHospital.owner = TURN_SIDES.ENEMY;
  vehicle.x = vehicleHospital.x;
  vehicle.y = vehicleHospital.y;
  vehicleState.pendingAction = {
    type: "move",
    unitId: vehicle.id,
    mode: "menu"
  };

  const vehicleSystem = new BattleSystem(vehicleState);

  assert.equal(vehicleSystem.canCaptureWithPendingUnit(), false);
});

test("weapon armor multipliers apply only to base armor before terrain and building armor", () => {
  const breaker = createPlacedUnit("breaker", TURN_SIDES.PLAYER, 1, 1);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 2, 1);
  breaker.stats.luck = 0;
  bruiser.stats.luck = 0;
  const battleState = createNeutralBattleState({
    playerUnits: [breaker],
    enemyUnits: [bruiser],
    seed: 4
  });
  battleState.map.tiles[bruiser.y][bruiser.x] = TERRAIN_KEYS.FOREST;
  battleState.map.buildings = battleState.map.buildings.filter(
    (building) => building.x !== bruiser.x || building.y !== bruiser.y
  );
  battleState.map.buildings.push({
    id: "enemy-armor-sector",
    type: BUILDING_KEYS.SECTOR,
    owner: TURN_SIDES.ENEMY,
    x: bruiser.x,
    y: bruiser.y
  });

  assert.equal(getDefenderArmor(battleState, bruiser), bruiser.stats.armor + 3);
  assert.equal(
    getDefenderArmor(battleState, bruiser, breaker, getUnitAttackProfile(breaker)),
    31
  );

  const forecast = getAttackForecast(battleState, breaker, bruiser);
  assert.equal(forecast.dealt.min, 43);
  assert.equal(forecast.dealt.max, 43);

  const system = new BattleSystem(battleState);
  const startingHp = bruiser.current.hp;

  assert.equal(system.attackTarget(breaker.id, bruiser.id), true);

  const afterAttack = system.getStateForSave();
  const damagedBruiser = afterAttack.enemy.units[0];

  assert.equal(startingHp - damagedBruiser.current.hp, 43);
  assert.equal(getDefenderArmor(afterAttack, damagedBruiser), bruiser.stats.armor + 3);
});

test("runner transport rules reject non-infantry cargo", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 2);
  const infantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 3);
  const vehicle = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 3, 2);

  assert.equal(canLoadUnit(infantry, runner), true);
  assert.equal(canLoadUnit(vehicle, runner), false);
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

  assert.equal(system.handleTileSelection(3, 1), true);
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

test("enemy units attack when player threat cannot be escaped", () => {
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

  assert.equal(step.type, "attack");
  assert.equal(afterStep.enemyTurn.pendingAttack, null);
  assert.ok(afterStep.player.units[0].current.hp < player.current.hp);
});

test("wounded enemy units enter repair mode and move toward service buildings", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 5, 3, {
    current: {
      hp: 5
    }
  });
  const battleState = createTestBattleState({
    id: "enemy-repair-mode",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.map.buildings = [
    {
      id: "enemy-repair-sector",
      type: "sector",
      owner: TURN_SIDES.ENEMY,
      x: 6,
      y: 3
    }
  ];
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterStep = system.getStateForSave();
  const updatedEnemy = afterStep.enemy.units[0];

  assert.equal(step.changed, true);
  assert.equal(step.type, "move");
  assert.equal(updatedEnemy.x, 6);
  assert.equal(updatedEnemy.y, 3);
  assert.equal(updatedEnemy.cooldowns.repairMode, 2);
  assert.equal(updatedEnemy.hasMoved, true);
  assert.equal(updatedEnemy.hasAttacked, true);
  assert.ok(afterStep.log.some((line) => line.includes("entered repair mode")));
});

test("enemy units already on a service building stay there while repairing", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 4, 3, {
    current: {
      hp: 8
    },
    cooldowns: {
      repairMode: 1
    }
  });
  const battleState = createTestBattleState({
    id: "enemy-repair-hold",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.map.buildings = [
    {
      id: "enemy-repair-sector-hold",
      type: "sector",
      owner: TURN_SIDES.ENEMY,
      x: 4,
      y: 3
    }
  ];
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const updatedEnemy = system.getStateForSave().enemy.units[0];

  assert.equal(step.changed, true);
  assert.equal(step.type, "repair");
  assert.equal(updatedEnemy.x, 4);
  assert.equal(updatedEnemy.y, 3);
  assert.equal(updatedEnemy.cooldowns.repairMode, 1);
  assert.equal(updatedEnemy.hasMoved, true);
  assert.equal(updatedEnemy.hasAttacked, true);
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
});

test("enemy units choose a favorable target when one is available", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 4, 3);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 7, 3);
  const enemy = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 5, 3);
  enemy.stats.attack = 18;
  enemy.stats.luck = 0;
  runner.stats.luck = 0;
  bruiser.stats.luck = 0;
  const battleState = createTestBattleState({
    id: "enemy-good-trade",
    playerUnits: [runner, bruiser],
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
  const runnerAfterAttack = afterStep.player.units.find((unit) => unit.id === runner.id);

  assert.equal(step.type, "attack");
  assert.ok(!runnerAfterAttack || runnerAfterAttack.current.hp < runner.current.hp);
  assert.equal(afterStep.player.units.find((unit) => unit.id === bruiser.id).current.hp, bruiser.current.hp);
});

test("hyper-aggressive AI accepts a riskier runner trade that turtle rejects", () => {
  const player = createPlacedUnit("runner", TURN_SIDES.PLAYER, 4, 3);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 5, 3);
  player.stats.attack = 50;
  player.stats.luck = 0;
  enemy.stats.attack = 50;
  enemy.stats.luck = 0;
  const battleState = createTestBattleState({
    id: "archetype-trade-threshold",
    playerUnits: [player],
    enemyUnits: [enemy]
  });
  battleState.map.buildings = [
    { id: "player-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 1, y: 3 },
    { id: "enemy-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 6, y: 3 }
  ];

  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE;
  const hyperChoice = pickBestFavorableAttack(battleState, enemy);

  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.TURTLE;
  const turtleChoice = pickBestFavorableAttack(battleState, enemy);

  assert.ok(hyperChoice);
  assert.equal(turtleChoice, null);
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

test("enemy capture archetype infantry advance toward neutral sectors when no attack is available", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 9, 5);
  const battleState = createTestBattleState({
    id: "capture-stage",
    width: 14,
    height: 8,
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY,
    seed: 5
  });
  battleState.map.buildings = [
    { id: "player-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 1, y: 4 },
    { id: "enemy-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 12, y: 4 },
    { id: "neutral-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 4, y: 5 }
  ];
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.CAPTURE;
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const updatedEnemy = system.getStateForSave().enemy.units[0];

  assert.equal(step.type, "move");
  assert.deepEqual({ x: updatedEnemy.x, y: updatedEnemy.y }, { x: 5, y: 5 });
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

test("enemy breakers prioritize effective attacks over capture plans", () => {
  const player = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 5, 3);
  const enemy = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 4, 3);
  const battleState = createTestBattleState({
    id: "breaker-effective-over-capture",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.map.buildings = [
    { id: "neutral-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 4, y: 3 },
    { id: "player-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 1, y: 3 },
    { id: "enemy-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 6, y: 3 }
  ];
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.CAPTURE;
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const capturedBuilding = system.getStateForSave().map.buildings.find((building) => building.id === "neutral-sector");

  assert.equal(step.type, "attack");
  assert.equal(capturedBuilding.owner, "neutral");
  assert.ok(system.getStateForSave().log.some((line) => line.includes("Breaker hit Bruiser")));
});

test("enemy longshots prioritize effective attacks over capture plans", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 6, 3);
  const enemy = createPlacedUnit("longshot", TURN_SIDES.ENEMY, 4, 3);
  const battleState = createTestBattleState({
    id: "longshot-effective-over-capture",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.map.buildings = [
    { id: "neutral-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 4, y: 3 },
    { id: "player-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 1, y: 3 },
    { id: "enemy-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 6, y: 3 }
  ];
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.CAPTURE;
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const capturedBuilding = system.getStateForSave().map.buildings.find((building) => building.id === "neutral-sector");

  assert.equal(step.type, "attack");
  assert.equal(capturedBuilding.owner, "neutral");
  assert.ok(system.getStateForSave().log.some((line) => line.includes("Longshot hit Grunt")));
});

test("enemy hq-rush units stage toward the player command when no attack is available", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    id: "hq-stage",
    width: 12,
    height: 8,
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY,
    seed: 5
  });
  battleState.map.buildings = [
    { id: "player-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 1, y: 4 },
    { id: "enemy-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 10, y: 4 }
  ];
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.HQ_RUSH;
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const updatedEnemy = system.getStateForSave().enemy.units[0];

  assert.equal(step.type, "move");
  assert.deepEqual({ x: updatedEnemy.x, y: updatedEnemy.y }, { x: 2, y: 4 });
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

test("enemy commanders proactively use ready powers during active enemy turns", () => {
  const distantPlayer = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const distantEnemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 8, 6);
  const distantBattleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [distantPlayer],
    enemyUnits: [distantEnemy],
    activeSide: TURN_SIDES.ENEMY
  });
  distantBattleState.enemyTurn = {
    started: true,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [distantEnemy.id]
  };
  distantBattleState.enemy.commanderId = "blaze";

  const distantSystem = new BattleSystem(distantBattleState);

  assert.equal(distantSystem.shouldEnemyUsePower(), true);

  const closePlayer = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 3, 3);
  const closeEnemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 3);
  const closeBattleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [closePlayer],
    enemyUnits: [closeEnemy],
    activeSide: TURN_SIDES.ENEMY
  });
  closeBattleState.enemyTurn = {
    started: true,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [closeEnemy.id]
  };
  closeBattleState.enemy.commanderId = "echo";

  const closeSystem = new BattleSystem(closeBattleState);

  assert.equal(closeSystem.shouldEnemyUsePower(), true);
});

test("combat XP uses target max-health percent, level delta, and family matchups", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, { level: 1 });
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 2, 1, { level: 1 });
  const veteranRunner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 2, 1, { level: 5 });
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 1, { level: 1 });
  const enemyGrunt = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1, { level: 1 });
  const veteranJuggernaut = createPlacedUnit("juggernaut", TURN_SIDES.PLAYER, 1, 1, { level: 10 });

  assert.equal(getCombatExperience(grunt, runner, 4, false), 4);
  assert.equal(getCombatExperience(grunt, veteranRunner, 4, false), 6);
  assert.equal(getCombatExperience(bruiser, enemyGrunt, 4, false), 2);
  assert.equal(
    getCombatExperience(veteranJuggernaut, enemyGrunt, enemyGrunt.stats.maxHealth, true),
    24
  );
});

test("xp thresholds follow the new 90 plus 30-per-level curve", () => {
  assert.equal(getXpThreshold(1), 90);
  assert.equal(getXpThreshold(2), 120);
  assert.equal(getXpThreshold(3), 150);
  assert.equal(getXpThreshold(4), 180);
});

test("weapon target rules allow AA-kit overrides and gunship-only air skirmishes", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  grunt.gear = { slot: "gear-aa-kit" };
  grunt.gearState = { aaKitAmmo: 1 };
  const plainGrunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const skyguard = createPlacedUnit("skyguard", TURN_SIDES.PLAYER, 1, 1);
  const interceptor = createPlacedUnit("interceptor", TURN_SIDES.PLAYER, 1, 1);
  const gunship = createPlacedUnit("gunship", TURN_SIDES.PLAYER, 1, 1);
  const payload = createPlacedUnit("payload", TURN_SIDES.PLAYER, 1, 1);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 2, 1);
  const enemyGunship = createPlacedUnit("gunship", TURN_SIDES.ENEMY, 2, 1);
  const enemyPayload = createPlacedUnit("payload", TURN_SIDES.ENEMY, 2, 1);
  const enemyInterceptor = createPlacedUnit("interceptor", TURN_SIDES.ENEMY, 2, 1);

  assert.equal(canUnitAttackTarget(plainGrunt, enemyGunship), false);
  assert.equal(canUnitAttackTarget(grunt, enemyGunship), true);
  assert.equal(canUnitAttackTarget(skyguard, enemyGunship), true);
  assert.equal(canUnitAttackTarget(interceptor, enemyGunship), true);
  assert.equal(canUnitAttackTarget(interceptor, plainGrunt), false);
  assert.equal(canUnitAttackTarget(gunship, enemyGunship), true);
  assert.equal(canUnitAttackTarget(payload, enemyGunship), false);
  assert.equal(canUnitAttackTarget(gunship, enemyPayload), false);
  assert.equal(canUnitAttackTarget(gunship, enemyInterceptor), false);
  assert.equal(canUnitAttackTarget(gunship, bruiser), true);
  assert.equal(canUnitAttackTarget(payload, bruiser), true);
});

test("field medpack can heal the acting unit and is consumed on use", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 5, 5, {
    current: {
      hp: 6
    }
  });
  grunt.gear = { slot: "gear-field-meds" };
  grunt.gearState = {};
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4);
  const state = createTestBattleState({
    playerUnits: [grunt],
    enemyUnits: [enemy]
  });
  state.pendingAction = {
    type: "move",
    unitId: grunt.id,
    mode: "menu",
    fromX: grunt.x,
    fromY: grunt.y,
    fromStamina: grunt.current.stamina,
    toX: grunt.x,
    toY: grunt.y
  };
  const system = new BattleSystem(state);

  assert.equal(system.useMedpackWithPendingUnit(), true);

  const updated = system.getStateForSave().player.units[0];
  assert.equal(
    updated.current.hp,
    Math.min(grunt.stats.maxHealth, 6 + Math.ceil(grunt.stats.maxHealth * 0.33))
  );
  assert.equal(updated.gear.slot, null);
  assert.equal(updated.hasMoved, true);
  assert.equal(updated.hasAttacked, true);
});

test("field medpack targets self or adjacent infantry allies only", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 5, 5, {
    current: {
      hp: 6
    }
  });
  const ally = createPlacedUnit("medic", TURN_SIDES.PLAYER, 6, 5, {
    current: {
      hp: 8
    }
  });
  const farAlly = createPlacedUnit("mechanic", TURN_SIDES.PLAYER, 3, 3, {
    current: {
      hp: 8
    }
  });
  grunt.gear = { slot: "gear-field-meds" };
  grunt.gearState = {};
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const state = createTestBattleState({
    playerUnits: [grunt, ally, farAlly],
    enemyUnits: [enemy]
  });
  state.pendingAction = {
    type: "move",
    unitId: grunt.id,
    mode: "menu",
    fromX: grunt.x,
    fromY: grunt.y,
    fromStamina: grunt.current.stamina,
    toX: grunt.x,
    toY: grunt.y
  };
  const system = new BattleSystem(state);

  assert.equal(system.useMedpackWithPendingUnit(), true);
  assert.equal(system.getStateForSave().pendingAction.mode, "medpack");

  const choosingSnapshot = system.getSnapshot();
  assert.deepEqual(
    new Set(choosingSnapshot.presentation.pendingAction.medpackTargetUnitIds),
    new Set([grunt.id, ally.id])
  );

  assert.equal(system.useMedpackWithPendingUnit(ally.id), true);

  const updatedAlly = system.getStateForSave().player.units.find((unit) => unit.id === ally.id);
  const updatedGrunt = system.getStateForSave().player.units.find((unit) => unit.id === grunt.id);

  assert.equal(
    updatedAlly.current.hp,
    Math.min(ally.stats.maxHealth, 8 + Math.ceil(ally.stats.maxHealth * 0.33))
  );
  assert.equal(updatedGrunt.gear.slot, null);
});

test("aa kit uses separate ammo for air attacks", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      ammo: 0
    }
  });
  grunt.gear = { slot: "gear-aa-kit" };
  grunt.gearState = { aaKitAmmo: 2 };
  const enemyGunship = createPlacedUnit("gunship", TURN_SIDES.ENEMY, 2, 1);
  const battleState = createTestBattleState({
    playerUnits: [grunt],
    enemyUnits: [enemyGunship]
  });
  const system = new BattleSystem(battleState);

  assert.equal(system.attackTarget(grunt.id, enemyGunship.id), true);

  const updatedGrunt = system.getStateForSave().player.units[0];
  assert.equal(updatedGrunt.current.ammo, 0);
  assert.equal(updatedGrunt.gearState.aaKitAmmo, 1);
});

test("units only gain combat XP when they actually deal damage", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("longshot", TURN_SIDES.ENEMY, 2, 1);
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender]
  });
  const system = new BattleSystem(battleState);

  assert.equal(system.attackTarget(attacker.id, defender.id), true);

  const afterAttack = system.getStateForSave();
  const updatedAttacker = afterAttack.player.units[0];
  const updatedDefender = afterAttack.enemy.units[0];

  assert.ok(updatedAttacker.experience > 0);
  assert.equal(updatedDefender.experience, 0);
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
  const player = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, production.y);

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

  assert.equal(system.handleTileSelection(3, 1), true);

  const movedSnapshot = system.getSnapshot();
  const pendingAction = movedSnapshot.presentation.pendingAction;

  assert.equal(pendingAction.fromX, 1);
  assert.equal(pendingAction.fromY, 1);
  assert.equal(pendingAction.toX, 3);
  assert.equal(pendingAction.toY, 1);

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
  battleState.enemy.commanderId = "atlas";
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

test("enemy hq-rush runners can keep infantry loaded instead of auto-unloading", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 10, 6);
  const passenger = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 10, 5);
  const battleState = createTestBattleState({
    id: "hq-rush-transport",
    width: 12,
    height: 8,
    playerUnits: [player],
    enemyUnits: [runner, passenger],
    activeSide: TURN_SIDES.ENEMY,
    seed: 404
  });
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.HQ_RUSH;
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
  assert.equal(updatedRunner.transport.carryingUnitId, passenger.id);
  assert.equal(updatedPassenger.transport.carriedByUnitId, runner.id);
  assert.deepEqual({ x: updatedRunner.x, y: updatedRunner.y }, { x: 6, y: 4 });
  assert.deepEqual({ x: updatedPassenger.x, y: updatedPassenger.y }, { x: 6, y: 4 });
  assert.ok(afterMove.log.some((line) => line.includes("boarded")));
  assert.equal(afterMove.log.some((line) => line.includes("disembarked")), false);
});

test("enemy capture runners board infantry for an earlier capture approach", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 10, 5);
  const passenger = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 10, 4);
  const battleState = createTestBattleState({
    id: "capture-transport",
    width: 14,
    height: 8,
    playerUnits: [player],
    enemyUnits: [runner, passenger],
    activeSide: TURN_SIDES.ENEMY,
    seed: 88
  });
  battleState.map.buildings = [
    { id: "player-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 1, y: 4 },
    { id: "enemy-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 12, y: 4 },
    { id: "far-neutral", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 4, y: 5 }
  ];
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.CAPTURE;
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
  assert.equal(updatedRunner.transport.carryingUnitId, passenger.id);
  assert.equal(updatedPassenger.transport.carriedByUnitId, runner.id);
  assert.deepEqual({ x: updatedRunner.x, y: updatedRunner.y }, { x: 4, y: 5 });
});

test("enemy runners unload carried infantry when the destination directly improves a capture objective", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 5, 5, {
    hasMoved: false,
    hasAttacked: false
  });
  const passenger = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 5, {
    hasMoved: false,
    hasAttacked: false
  });
  runner.transport.carryingUnitId = passenger.id;
  passenger.transport.carriedByUnitId = runner.id;
  const battleState = createTestBattleState({
    id: "capture-unload",
    width: 12,
    height: 8,
    playerUnits: [player],
    enemyUnits: [runner, passenger],
    activeSide: TURN_SIDES.ENEMY,
    seed: 55
  });
  battleState.map.buildings = [
    { id: "player-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.PLAYER, x: 1, y: 4 },
    { id: "enemy-command", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 10, y: 4 },
    { id: "neutral-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 5, y: 4 }
  ];
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.CAPTURE;
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [runner.id]
  };

  const system = new BattleSystem(battleState);
  const step = system.processEnemyTurnStep();
  const afterUnload = system.getStateForSave();
  const updatedRunner = afterUnload.enemy.units.find((unit) => unit.id === runner.id);
  const updatedPassenger = afterUnload.enemy.units.find((unit) => unit.id === passenger.id);

  assert.equal(step.type, "unload");
  assert.equal(updatedRunner.transport.carryingUnitId, null);
  assert.equal(updatedPassenger.transport.carriedByUnitId, null);
  assert.deepEqual({ x: updatedPassenger.x, y: updatedPassenger.y }, { x: 5, y: 4 });
  assert.ok(afterUnload.log.some((line) => line.includes("disembarked")));
});

test("enemy runners extract threatened infantry instead of leaving them exposed", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 7, 4);
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 5, 4);
  const passenger = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 3, {
    current: {
      hp: 4
    }
  });
  const battleState = createTestBattleState({
    id: "retreat-transport",
    width: 12,
    height: 8,
    playerUnits: [player],
    enemyUnits: [runner, passenger],
    activeSide: TURN_SIDES.ENEMY,
    seed: 123
  });
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.TURTLE;
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
  assert.equal(updatedRunner.transport.carryingUnitId, passenger.id);
  assert.equal(updatedPassenger.transport.carriedByUnitId, runner.id);
  assert.deepEqual({ x: updatedRunner.x, y: updatedRunner.y }, { x: 3, y: 1 });
  assert.deepEqual({ x: updatedPassenger.x, y: updatedPassenger.y }, { x: 3, y: 1 });
});
