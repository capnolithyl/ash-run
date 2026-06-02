import test from "node:test";
import assert from "node:assert/strict";
import {
  TERRAIN_KEYS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import {
  applyRunCardChainReaction,
  applyRunCardDeploymentEffectsToUnit,
  applyRunCardOnDamageDealt,
  applyRunCardOnKillEffects,
  applyRunCardTurnStartEffects,
  canRunCardUnitCrossBlockedTerrain,
  getRunCardAmmoCostForAttack,
  getRunCardAttackModifier,
  getRunCardMovementModifier,
  getRunCardTerrainMoveCost
} from "../src/game/simulation/runCardEffects.js";
import { getLivingUnits } from "../src/game/simulation/selectors.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

function createCardState({ cards = [], playerUnits = [], enemyUnits = [], seed = 1337 } = {}) {
  return {
    ...createTestBattleState({ playerUnits, enemyUnits, seed }),
    runCards: {
      ownedCardIds: cards
    }
  };
}

test("active evolution tiers do not stack lower-tier stat modifiers", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const state = createCardState({
    cards: ["combat-stims-1", "combat-stims-2"],
    playerUnits: [grunt]
  });

  assert.equal(getRunCardAttackModifier(state, grunt), 3);
});

test("deployment effects apply map-only health, stamina, and ammo changes", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const state = createCardState({
    cards: ["supply-mishap-1", "pack-mules-1", "pack-mules-2"],
    playerUnits: [grunt]
  });

  applyRunCardDeploymentEffectsToUnit(state, grunt);

  assert.equal(grunt.stats.maxHealth, 95);
  assert.equal(grunt.stats.staminaMax, 80);
  assert.equal(grunt.stats.ammoMax, 9);
  assert.equal(grunt.current.hp, 95);
  assert.equal(grunt.current.stamina, 80);
  assert.equal(grunt.current.ammo, 9);
});

test("terrain gear changes movement costs and blocked ridge crossing", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const state = createCardState({ playerUnits: [grunt] });

  grunt.gear = { slot: "gear-pathfinder-1" };
  assert.equal(getRunCardTerrainMoveCost(state, grunt, TERRAIN_KEYS.FOREST, 2), 1);

  grunt.gear = { slot: "gear-climbing-gear-3" };
  assert.equal(getRunCardTerrainMoveCost(state, grunt, TERRAIN_KEYS.RIDGE, 99), 1);
  assert.equal(canRunCardUnitCrossBlockedTerrain(state, grunt, TERRAIN_KEYS.RIDGE), true);
});

test("turn-start effects heal field repairs and damage glass fuel vehicles", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
    current: { hp: 50 }
  });
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 3, 2, {
    current: { hp: 100 }
  });
  const state = createCardState({
    cards: ["field-repairs-1", "glass-fuel-lines"],
    playerUnits: [grunt, runner]
  });

  grunt.lastTurnMoved = false;
  const notes = applyRunCardTurnStartEffects(state, TURN_SIDES.PLAYER);

  assert.equal(grunt.current.hp, 53);
  assert.equal(runner.current.hp, 85);
  assert.ok(notes.some((note) => note.includes("Field Repairs")));
  assert.ok(notes.some((note) => note.includes("glass fuel lines")));
});

test("ammo optional, status gear, kill gear, and chain reactions use shared hooks", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
    current: { hp: 50 }
  });
  const defender = createPlacedUnit("runner", TURN_SIDES.ENEMY, 3, 2);
  const adjacent = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 2, {
    current: { hp: 100 }
  });
  attacker.gear = { slot: "gear-patient-zero" };
  const state = createCardState({
    cards: ["ammo-optional-2", "chain-reaction-1"],
    playerUnits: [attacker, adjacent],
    enemyUnits: [defender]
  });

  assert.equal(getRunCardAmmoCostForAttack(state, attacker, 1), 0);

  let notes = applyRunCardOnDamageDealt(state, attacker, defender, 10);
  assert.ok(notes.some((note) => note.includes("zombified")));
  assert.equal(defender.statuses.some((status) => status.type === "zombified"), true);

  attacker.gear = { slot: "gear-scavengers" };
  defender.current.hp = 0;
  notes = applyRunCardOnKillEffects(state, attacker, defender);
  assert.equal(attacker.current.hp, 53);
  assert.ok(notes.some((note) => note.includes("Scavengers")));

  notes = applyRunCardChainReaction(state, attacker, defender);
  assert.equal(adjacent.current.hp, 90);
  assert.ok(notes.some((note) => note.includes("exploded")));
});

test("zombified units count as defeated for rout living counts and victory", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 5, 2, {
    statuses: [{ type: "zombified", permanent: true, negative: true }]
  });
  const battleState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy]
  });
  const system = new BattleSystem(battleState);

  system.state.mission.rout.defeatArmed[TURN_SIDES.ENEMY] = true;
  system.updateVictoryState();

  assert.equal(getLivingUnits(system.state, TURN_SIDES.ENEMY).length, 0);
  assert.equal(system.state.victory?.winner, TURN_SIDES.PLAYER);
});

test("zombified enemy units lash out at adjacent former allies", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 7, 5);
  const zombie = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 2, {
    statuses: [{ type: "zombified", permanent: true, negative: true }]
  });
  const formerAlly = createPlacedUnit("runner", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [zombie, formerAlly],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.enemyTurn = {
    started: false,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [],
    forcePassed: false
  };
  const system = new BattleSystem(battleState);

  assert.equal(system.startEnemyTurnActions().changed, true);
  assert.ok(system.state.enemyTurn.pendingUnitIds.includes(zombie.id));
  const previousHp = system.state.enemy.units.find((unit) => unit.id === formerAlly.id).current.hp;
  const step = system.processEnemyTurnStep();
  const liveFormerAlly = system.state.enemy.units.find((unit) => unit.id === formerAlly.id);

  assert.equal(step.type, "attack");
  assert.ok(liveFormerAlly.current.hp < previousHp);
  assert.ok(system.state.log.some((entry) => String(entry.message ?? entry).includes("zombified")));
});

test("blood trail gear grants one movement bonus per map after a kill", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const defender = createPlacedUnit("runner", TURN_SIDES.ENEMY, 3, 2, {
    current: { hp: 0 }
  });
  attacker.gear = { slot: "gear-blood-trail" };
  const state = createCardState({ playerUnits: [attacker], enemyUnits: [defender] });

  applyRunCardOnKillEffects(state, attacker, defender);
  applyRunCardOnKillEffects(state, attacker, defender);

  assert.equal(getRunCardMovementModifier(state, attacker), 1);
});
