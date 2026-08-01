import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { getCommanderById } from "../src/game/content/commanders.js";
import {
  chooseEnemyAirStrikeCenter,
  evaluateAirStrikeCenter,
  getAirStrikeTiles
} from "../src/game/simulation/airStrike.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

const AIR_STRIKE = getCommanderById("falcon").active;

test("Air Strike tiles use configurable center and cardinal damage and clip at map edges", () => {
  const state = createTestBattleState();

  assert.deepEqual(
    getAirStrikeTiles(state, { x: 0, y: 0 }, { centerDamage: 9, adjacentDamage: 3 }),
    [
      { x: 0, y: 0, zone: "center", damage: 9 },
      { x: 1, y: 0, zone: "adjacent", damage: 3 },
      { x: 0, y: 1, zone: "adjacent", damage: 3 }
    ]
  );
});

test("enemy Air Strike values a centered Bruiser above three Grunts", () => {
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 2);
  const grunts = [
    createPlacedUnit("grunt", TURN_SIDES.PLAYER, 6, 1),
    createPlacedUnit("grunt", TURN_SIDES.PLAYER, 7, 2),
    createPlacedUnit("grunt", TURN_SIDES.PLAYER, 6, 3)
  ];
  const state = createTestBattleState({
    playerUnits: [bruiser, ...grunts],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 4)],
    seed: 42
  });
  const bruiserCenter = evaluateAirStrikeCenter(
    state,
    TURN_SIDES.ENEMY,
    { x: 1, y: 2 },
    AIR_STRIKE
  );
  const gruntCluster = evaluateAirStrikeCenter(
    state,
    TURN_SIDES.ENEMY,
    { x: 6, y: 2 },
    AIR_STRIKE
  );
  const choice = chooseEnemyAirStrikeCenter(state, TURN_SIDES.ENEMY, AIR_STRIKE, state.seed);

  assert.equal(bruiserCenter.fundsDamage, 490);
  assert.equal(gruntCluster.fundsDamage, 120);
  assert.deepEqual(choice.center, { x: 1, y: 2 });
});

test("enemy Air Strike caps funds damage at current HP and prefers a kill on a value tie", () => {
  const killTarget = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1, {
    current: { hp: 60 }
  });
  const nonlethalTarget = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 6, 3);
  nonlethalTarget.cost = 600 / 7;
  const state = createTestBattleState({
    playerUnits: [killTarget, nonlethalTarget],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 4)]
  });
  const killEvaluation = evaluateAirStrikeCenter(
    state,
    TURN_SIDES.ENEMY,
    { x: 1, y: 1 },
    AIR_STRIKE
  );
  const nonlethalEvaluation = evaluateAirStrikeCenter(
    state,
    TURN_SIDES.ENEMY,
    { x: 6, y: 3 },
    AIR_STRIKE
  );
  const choice = chooseEnemyAirStrikeCenter(state, TURN_SIDES.ENEMY, AIR_STRIKE, 99);

  assert.equal(killEvaluation.fundsDamage, 60);
  assert.equal(nonlethalEvaluation.fundsDamage, 60);
  assert.equal(killEvaluation.killCount, 1);
  assert.deepEqual(choice.center, { x: 1, y: 1 });
});

test("enemy Air Strike prefers the stronger affected unit after value and kill ties", () => {
  const stronger = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 1);
  stronger.cost = 200;
  stronger.stats.maxHealth = 200;
  stronger.current.hp = 200;
  const weaker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 6, 3);
  const state = createTestBattleState({
    playerUnits: [stronger, weaker],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 4)]
  });
  const choice = chooseEnemyAirStrikeCenter(state, TURN_SIDES.ENEMY, AIR_STRIKE, 11);

  assert.deepEqual(choice.center, { x: 1, y: 1 });
});

test("enemy Air Strike uses seeded randomness when every tile has zero value", () => {
  const state = createTestBattleState({ playerUnits: [], enemyUnits: [], seed: 12345 });
  const first = chooseEnemyAirStrikeCenter(state, TURN_SIDES.ENEMY, AIR_STRIKE, state.seed);
  const second = chooseEnemyAirStrikeCenter(state, TURN_SIDES.ENEMY, AIR_STRIKE, state.seed);

  assert.deepEqual(first, second);
  assert.ok(first.center.x >= 0 && first.center.x < state.map.width);
  assert.ok(first.center.y >= 0 && first.center.y < state.map.height);
  assert.notEqual(first.seed, state.seed);
});
