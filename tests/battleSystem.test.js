import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILDING_KEYS,
  ENEMY_RECRUITMENT_BASE_MAP_CAP,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { COMMANDERS, getCommanderPowerMax } from "../src/game/content/commanders.js";
import { BUILDING_RECRUITMENT } from "../src/game/content/unitCatalog.js";
import { deriveBattleAnimationEvents } from "../src/game/phaser/view/battleAnimationEvents.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { serviceUnitsOnSectors } from "../src/game/simulation/battleServicing.js";
import {
  canResupplyUnit,
  getExperienceModifier,
  getArmorModifier,
  getAttackModifier,
  getLuckModifier,
  getMovementModifier,
  getRangeModifier
} from "../src/game/simulation/commanderEffects.js";
import {
  getAttackForecast,
  getCombatExperience,
  getDefenderArmor
} from "../src/game/simulation/combatResolver.js";
import { getXpThreshold } from "../src/game/simulation/progression.js";
import { canUnitAttackTarget, getReachableTiles, getUnitAt } from "../src/game/simulation/selectors.js";
import { canLoadUnit } from "../src/game/simulation/transportRules.js";
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

test("atlas power heals half max HP and grants armor through the enemy turn", () => {
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
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const updatedUnit = system.getStateForSave().player.units[0];

  assert.equal(updatedUnit.current.hp, 4 + Math.ceil(unit.stats.maxHealth * 0.5));
  assert.equal(getArmorModifier(system.getStateForSave(), updatedUnit), 2);
  assert.equal(getAttackModifier(system.getStateForSave(), updatedUnit), 0);
  assert.equal(getMovementModifier(system.getStateForSave(), updatedUnit), 0);

  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);

  const enemyTurnState = system.getStateForSave();
  const buffedDuringEnemyTurn = enemyTurnState.player.units[0];

  assert.equal(getArmorModifier(enemyTurnState, buffedDuringEnemyTurn), 2);

  assert.equal(system.finalizeEnemyTurn().changed, true);

  const nextPlayerTurnState = system.getStateForSave();
  const expiredOnNextTurn = nextPlayerTurnState.player.units[0];

  assert.equal(getArmorModifier(nextPlayerTurnState, expiredOnNextTurn), 0);
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

  assert.equal(getAttackModifier(battleState, grunt), 2);
  assert.equal(getAttackModifier(battleState, runner), 2);
  assert.equal(getAttackModifier(battleState, bruiser), -2);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const afterPower = system.getStateForSave();
  const updatedGrunt = afterPower.player.units.find((unit) => unit.id === grunt.id);
  const updatedRunner = afterPower.player.units.find((unit) => unit.id === runner.id);
  const updatedBruiser = afterPower.player.units.find((unit) => unit.id === bruiser.id);

  assert.equal(getAttackModifier(afterPower, updatedGrunt), 5);
  assert.equal(getAttackModifier(afterPower, updatedRunner), 5);
  assert.equal(getAttackModifier(afterPower, updatedBruiser), -2);
  assert.equal(getMovementModifier(afterPower, updatedGrunt), 2);
  assert.equal(getMovementModifier(afterPower, updatedRunner), 0);
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

test("enemy echo units reposition after attacking when a slipstream tile is available", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3, {
    current: {
      hp: 18
    }
  });
  player.stats.luck = 0;
  const enemy = createPlacedUnit("breaker", TURN_SIDES.ENEMY, 5, 3);
  enemy.stats.attack = 8;
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
    { id: "enemy-command-echo-test", type: BUILDING_KEYS.COMMAND, owner: TURN_SIDES.ENEMY, x: 5, y: 0 }
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
  assert.notEqual(`${updatedEnemy.x},${updatedEnemy.y}`, `${enemy.x},${enemy.y}`);
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

  for (const commander of COMMANDERS.filter((candidate) => !["atlas", "viper", "rook", "echo"].includes(candidate.id))) {
    assert.equal(staleTypes.has(commander.passive.type), false, commander.id);
    assert.equal(staleTypes.has(commander.active.type), false, commander.id);
  }
});

test("unimplemented commander hooks are inert until their mechanics are built", () => {
  const unit = createPlacedUnit("gunship", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 4);
  const futureCommanderIds = ["blaze", "knox", "falcon", "graves", "nova", "sable"];

  for (const commanderId of futureCommanderIds) {
    const battleState = createTestBattleState({
      playerUnits: [structuredClone(unit)],
      enemyUnits: [structuredClone(enemy)]
    });
    battleState.player.commanderId = commanderId;
    const testedUnit = battleState.player.units[0];

    assert.equal(getAttackModifier(battleState, testedUnit), 0, commanderId);
    assert.equal(getArmorModifier(battleState, testedUnit), 0, commanderId);
    assert.equal(getMovementModifier(battleState, testedUnit), 0, commanderId);
    assert.equal(getRangeModifier(battleState, testedUnit), 0, commanderId);
    assert.equal(getLuckModifier(battleState, testedUnit), 0, commanderId);
    assert.equal(getExperienceModifier(battleState, testedUnit), 0, commanderId);
  }
});

test("rook gains war budget income and cannot resupply from sector service", () => {
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
  battleState.player.commanderId = "rook";
  const sector = battleState.map.buildings.find(
    (building) => building.type === BUILDING_KEYS.SECTOR && building.owner === TURN_SIDES.PLAYER
  );
  unit.x = sector.x;
  unit.y = sector.y;

  const system = new BattleSystem(battleState);
  const result = system.finalizeEnemyTurn();
  const healedUnit = system.getStateForSave().player.units[0];

  assert.equal(result.incomeGain.commanderBonus, 200);
  assert.equal(canResupplyUnit(system.getStateForSave(), healedUnit), false);
  assert.equal(healedUnit.current.hp, 1 + Math.ceil(unit.stats.maxHealth / 3));
  assert.equal(healedUnit.current.ammo, 0);
  assert.equal(healedUnit.current.stamina, healedUnit.stats.staminaMax);

  const directServiceState = system.getStateForSave();
  const directServiceUnit = directServiceState.player.units[0];
  directServiceUnit.current.hp = 1;
  directServiceUnit.current.ammo = 0;
  directServiceUnit.current.stamina = 0;
  serviceUnitsOnSectors(directServiceState, TURN_SIDES.PLAYER);
  assert.equal(directServiceUnit.current.ammo, 0);
  assert.equal(directServiceUnit.current.stamina, 0);
});

test("rook liquidation spends funds, grants current-turn attack, and expires on end turn", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "rook";
  battleState.player.funds = 950;
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const afterPower = system.getStateForSave();
  const poweredUnit = afterPower.player.units[0];

  assert.equal(afterPower.player.funds, 0);
  assert.equal(getAttackModifier(afterPower, poweredUnit), 3);

  assert.equal(system.endTurn(), true);

  const afterEndTurn = system.getStateForSave();

  assert.equal(getAttackModifier(afterEndTurn, afterEndTurn.player.units[0]), 0);
});

test("rook units are not support targets when only ammo and stamina are missing", () => {
  const medic = createPlacedUnit("medic", TURN_SIDES.PLAYER, 3, 3);
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 3, {
    current: {
      hp: 18,
      ammo: 0,
      stamina: 0
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [medic, grunt],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "rook";

  const system = new BattleSystem(battleState);

  assert.deepEqual(system.getSupportTargetsForUnit(medic), []);
});

test("rook support abilities can still heal HP without restoring ammo or stamina", () => {
  const medic = createPlacedUnit("medic", TURN_SIDES.PLAYER, 3, 3);
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 3, {
    current: {
      hp: 5,
      ammo: 0,
      stamina: 0
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [medic, grunt],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "rook";
  battleState.selection = { type: "unit", id: medic.id, x: medic.x, y: medic.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(medic.x, medic.y), true);
  assert.equal(system.useSupportAbilityWithPendingUnit(grunt.id), true);

  const afterSupport = system.getStateForSave();
  const updatedMedic = afterSupport.player.units.find((unit) => unit.id === medic.id);
  const updatedGrunt = afterSupport.player.units.find((unit) => unit.id === grunt.id);

  assert.ok(updatedGrunt.current.hp > grunt.current.hp);
  assert.equal(updatedGrunt.current.ammo, 0);
  assert.equal(updatedGrunt.current.stamina, 0);
  assert.equal(updatedMedic.cooldowns.support, 2);
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
  const defender = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 2, 1);
  attacker.stats.luck = 0;
  defender.stats.luck = 0;
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender],
    seed: 3
  });
  battleState.player.commanderId = "rook";
  battleState.enemy.commanderId = "rook";
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

test("movement stamina is a one-token cost regardless of path length", () => {
  const unit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1, {
    current: {
      stamina: 6
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    width: 10,
    height: 8,
    playerUnits: [unit],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(5, 3), true);

  const movedUnit = system.getStateForSave().player.units[0];

  assert.equal(movedUnit.current.stamina, 5);
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

  assert.equal(servicedVehicle.current.hp, 4 + 1);
  assert.equal(servicedVehicle.current.ammo, 0);
  assert.equal(servicedVehicle.current.stamina, servicedVehicle.stats.staminaMax);
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

test("breaker halves only vehicle base armor for its own attack", () => {
  const breaker = createPlacedUnit("breaker", TURN_SIDES.PLAYER, 1, 1);
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 2, 1);
  breaker.stats.luck = 0;
  bruiser.stats.luck = 0;
  const battleState = createTestBattleState({
    playerUnits: [breaker],
    enemyUnits: [bruiser],
    seed: 4
  });
  battleState.player.commanderId = "rook";
  battleState.enemy.commanderId = "rook";
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
    getDefenderArmor(battleState, bruiser, breaker),
    Math.floor(bruiser.stats.armor * 0.5) + 3
  );

  const forecast = getAttackForecast(battleState, breaker, bruiser);
  assert.equal(forecast.dealt.min, 10);
  assert.equal(forecast.dealt.max, 10);

  const system = new BattleSystem(battleState);
  const startingHp = bruiser.current.hp;

  assert.equal(system.attackTarget(breaker.id, bruiser.id), true);

  const afterAttack = system.getStateForSave();
  const damagedBruiser = afterAttack.enemy.units[0];

  assert.equal(startingHp - damagedBruiser.current.hp, 10);
  assert.equal(damagedBruiser.statuses.some((status) => status.type === "armor-break"), false);
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
  assert.ok(afterStep.log.some((line) => line.includes("advanced into position")));
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
  battleState.player.commanderId = "rook";
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

test("combat XP uses target max-health percent, level delta, and family matchups", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, { level: 1 });
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 2, 1, { level: 1 });
  const veteranRunner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 2, 1, { level: 5 });
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 1, { level: 1 });
  const enemyGrunt = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1, { level: 1 });
  const veteranJuggernaut = createPlacedUnit("juggernaut", TURN_SIDES.PLAYER, 1, 1, { level: 10 });

  assert.equal(getCombatExperience(grunt, runner, 4, false), 18);
  assert.equal(getCombatExperience(grunt, veteranRunner, 4, false), 32);
  assert.equal(getCombatExperience(bruiser, enemyGrunt, 4, false), 10);
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

test("anti-air targeting allows skyguard/interceptor and AA-kit infantry only", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  grunt.gear = { slot: "gear-aa-kit" };
  const skyguard = createPlacedUnit("skyguard", TURN_SIDES.PLAYER, 1, 1);
  const interceptor = createPlacedUnit("interceptor", TURN_SIDES.PLAYER, 1, 1);
  const gunship = createPlacedUnit("gunship", TURN_SIDES.PLAYER, 1, 1);
  const payload = createPlacedUnit("payload", TURN_SIDES.PLAYER, 1, 1);
  const enemyGunship = createPlacedUnit("gunship", TURN_SIDES.ENEMY, 2, 1);

  assert.equal(canUnitAttackTarget(grunt, enemyGunship), true);
  assert.equal(canUnitAttackTarget(gunship, enemyGunship), false);
  assert.equal(canUnitAttackTarget(payload, enemyGunship), false);
  assert.equal(canUnitAttackTarget(skyguard, enemyGunship), true);
  assert.equal(canUnitAttackTarget(interceptor, enemyGunship), true);
});

test("field medpack gear heals at player turn start", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 5, 5, {
    current: {
      hp: 6
    }
  });
  grunt.gear = { slot: "gear-field-meds" };
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4);
  const state = createTestBattleState({
    playerUnits: [grunt],
    enemyUnits: [enemy]
  });
  state.map.buildings = [];
  state.turn.activeSide = TURN_SIDES.ENEMY;
  const system = new BattleSystem(state);

  system.finalizeEnemyTurn();
  const after = system.getStateForSave();
  const updated = after.player.units[0];

  assert.equal(updated.current.hp, 9);
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
