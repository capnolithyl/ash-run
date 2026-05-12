import test from "node:test";
import assert from "node:assert/strict";
import {
  BATTLE_ATTACK_WINDOW_MS,
  BATTLE_COMBAT_CUTSCENE_CLOSE_MS,
  BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_OPEN_MS,
  BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS,
  BATTLE_MOVE_SETTLE_MS,
  TERRAIN_KEYS,
  getBattleMoveDuration,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { getCommanderPowerMax } from "../src/game/content/commanders.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { deriveBattleAnimationEvents } from "../src/game/phaser/view/battleAnimationEvents.js";
import { deriveBattleCombatCutscene } from "../src/game/phaser/view/battleCombatCutscene.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

test("battle animation events include secondary-fire attacks that do not consume ammo", () => {
  const attacker = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 2, {
    current: {
      ammo: 0
    }
  });
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2);
  const system = new BattleSystem(
    createTestBattleState({
      playerUnits: [attacker],
      enemyUnits: [defender]
    })
  );

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const attackEvents = deriveBattleAnimationEvents(before, after).filter((event) => event.type === "attack");

  assert.ok(
    attackEvents.some(
      (event) =>
        event.attackerId === attacker.id &&
        event.targetId === defender.id &&
        event.damage > 0
    )
  );
});

test("battle animation events emit a deploy event when a carried unit unloads", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 2, {
    hasMoved: true
  });
  const infantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  runner.transport.carryingUnitId = infantry.id;
  infantry.transport.carriedByUnitId = runner.id;
  const system = new BattleSystem(
    createTestBattleState({
      playerUnits: [runner, infantry],
      enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4)]
    })
  );

  system.state.selection = { type: "unit", id: runner.id, x: runner.x, y: runner.y };
  system.state.pendingAction = {
    type: "move",
    unitId: runner.id,
    mode: "unload",
    fromX: runner.x,
    fromY: runner.y,
    fromStamina: runner.current.stamina,
    toX: runner.x,
    toY: runner.y
  };
  const before = system.getSnapshot();
  const unloadTile = before.presentation.pendingAction.unloadPreviewTiles[0];

  assert.equal(system.handleTileSelection(unloadTile.x, unloadTile.y), true);
  const after = system.getSnapshot();
  const deployEvents = deriveBattleAnimationEvents(before, after).filter((event) => event.type === "deploy");
  const deployEvent = deployEvents.find((event) => event.unitId === infantry.id);

  assert.ok(deployEvent);
  assert.equal(deployEvent.fromUnload, true);
  assert.equal(deployEvent.carrierId, runner.id);
});

test("lethal attacks delay destroy events until the attack window finishes", () => {
  const attacker = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 2, 2);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2, {
    current: {
      hp: 4
    }
  });
  const system = new BattleSystem(
    createTestBattleState({
      playerUnits: [attacker],
      enemyUnits: [defender]
    })
  );

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const events = deriveBattleAnimationEvents(before, after);
  const attackEvent = events.find((event) => event.type === "attack" && event.targetId === defender.id);
  const destroyEvent = events.find((event) => event.type === "destroy" && event.unitId === defender.id);

  assert.ok(attackEvent);
  assert.ok(destroyEvent);
  assert.equal(destroyEvent.delay, (attackEvent.delay ?? 0) + BATTLE_ATTACK_WINDOW_MS);
});

test("battle animation events show graves preemptive defender strike before the enemy attack", () => {
  const defender = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const attacker = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [defender],
    enemyUnits: [attacker]
  });
  battleState.player.commanderId = "graves";
  battleState.player.charge = getCommanderPowerMax("graves");

  const system = new BattleSystem(battleState);
  assert.equal(system.activatePower(), true);
  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const attackEvents = deriveBattleAnimationEvents(before, after).filter((event) => event.type === "attack");

  assert.equal(attackEvents.length, 2);
  assert.equal(attackEvents[0].attackerId, defender.id);
  assert.equal(attackEvents[0].targetId, attacker.id);
  assert.equal(attackEvents[0].isInitiator, true);
  assert.equal(attackEvents[1].attackerId, attacker.id);
  assert.equal(attackEvents[1].targetId, defender.id);
  assert.equal(attackEvents[1].isInitiator, false);
});

test("battle animation events keep normal order when both graves powers are active", () => {
  const defender = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const attacker = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [defender],
    enemyUnits: [attacker]
  });
  battleState.player.commanderId = "graves";
  battleState.player.charge = getCommanderPowerMax("graves");
  battleState.enemy.commanderId = "graves";
  battleState.enemy.charge = getCommanderPowerMax("graves");

  const system = new BattleSystem(battleState);
  assert.equal(system.activatePower(), true);
  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);
  assert.equal(system.activatePower(), true);

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const attackEvents = deriveBattleAnimationEvents(before, after).filter((event) => event.type === "attack");

  assert.equal(attackEvents.length, 2);
  assert.equal(attackEvents[0].attackerId, attacker.id);
  assert.equal(attackEvents[0].targetId, defender.id);
  assert.equal(attackEvents[0].isInitiator, true);
  assert.equal(attackEvents[1].attackerId, defender.id);
  assert.equal(attackEvents[1].targetId, attacker.id);
  assert.equal(attackEvents[1].isInitiator, false);
});

test("battle combat cutscene payload keeps player-left mapping, split terrain ids, and HP beats", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender]
  });
  battleState.map.tiles[attacker.y][attacker.x] = TERRAIN_KEYS.FOREST;
  battleState.map.tiles[defender.y][defender.x] = TERRAIN_KEYS.RIDGE;
  const system = new BattleSystem(battleState);

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const cutscene = deriveBattleCombatCutscene(before, after);

  assert.ok(cutscene);
  assert.equal(cutscene.playerUnit.id, attacker.id);
  assert.equal(cutscene.enemyUnit.id, defender.id);
  assert.equal(cutscene.playerTerrainId, TERRAIN_KEYS.FOREST);
  assert.equal(cutscene.enemyTerrainId, TERRAIN_KEYS.RIDGE);
  assert.equal(cutscene.steps.length >= 1, true);
  assert.equal(cutscene.steps[0].attackerSide, TURN_SIDES.PLAYER);
  assert.equal(cutscene.steps[0].targetSide, TURN_SIDES.ENEMY);
  assert.equal(
    cutscene.steps[0].startMs,
    BATTLE_COMBAT_CUTSCENE_OPEN_MS + BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS
  );
  assert.equal(cutscene.steps[0].impactMs, cutscene.steps[0].startMs + cutscene.steps[0].impactDelayMs);
  assert.equal(cutscene.steps[0].endMs, cutscene.steps[0].startMs + cutscene.steps[0].windowMs);
  assert.ok(cutscene.steps[0].windowMs >= BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS);
  assert.ok(cutscene.steps[0].loopCount >= 3);
  assert.equal(cutscene.steps[0].targetHpBefore, defender.current.hp);
  assert.ok(cutscene.steps[0].targetHpAfter < cutscene.steps[0].targetHpBefore);
  assert.equal(cutscene.openMs, BATTLE_COMBAT_CUTSCENE_OPEN_MS);
  assert.equal(cutscene.closeMs, BATTLE_COMBAT_CUTSCENE_CLOSE_MS);
  assert.equal(cutscene.introHoldMs, BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS);
  assert.equal(cutscene.outroHoldMs, BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS);
  assert.ok(
    cutscene.durationMs >=
      BATTLE_COMBAT_CUTSCENE_OPEN_MS +
        BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS +
        BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS +
        BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS +
        BATTLE_COMBAT_CUTSCENE_CLOSE_MS
  );
});

test("battle combat cutscene payload keeps graves preemptive counter order", () => {
  const defender = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const attacker = createPlacedUnit("bruiser", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [defender],
    enemyUnits: [attacker]
  });
  battleState.player.commanderId = "graves";
  battleState.player.charge = getCommanderPowerMax("graves");
  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);
  assert.equal(system.endTurn(), true);
  assert.equal(system.startEnemyTurnActions().changed, true);

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const cutscene = deriveBattleCombatCutscene(before, after);

  assert.ok(cutscene);
  assert.equal(cutscene.steps.length, 2);
  assert.equal(cutscene.steps[0].attackerSide, TURN_SIDES.PLAYER);
  assert.equal(cutscene.steps[0].targetSide, TURN_SIDES.ENEMY);
  assert.equal(cutscene.steps[1].startMs, cutscene.steps[0].endMs);
  assert.equal(cutscene.steps[1].attackerSide, TURN_SIDES.ENEMY);
  assert.equal(cutscene.steps[1].targetSide, TURN_SIDES.PLAYER);
  assert.ok(
    cutscene.durationMs >=
      BATTLE_COMBAT_CUTSCENE_OPEN_MS +
        BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS +
        BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS * 2 +
        BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS +
        BATTLE_COMBAT_CUTSCENE_CLOSE_MS
  );
});

test("battle combat cutscene waits for move-and-settle before revealing the duel popup", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 1);
  const battleState = createTestBattleState({
    width: 6,
    height: 4,
    playerUnits: [attacker],
    enemyUnits: [defender]
  });
  battleState.map.tiles = Array.from({ length: battleState.map.height }, () =>
    Array.from({ length: battleState.map.width }, () => TERRAIN_KEYS.ROAD)
  );
  battleState.selection = { type: "unit", id: attacker.id, x: attacker.x, y: attacker.y };

  const system = new BattleSystem(battleState);
  assert.equal(system.handleTileSelection(3, 1), true);
  assert.equal(system.beginPendingAttack(), true);
  const before = system.getSnapshot();
  assert.equal(system.handleTileSelection(defender.x, defender.y), true);
  const after = system.getSnapshot();

  const cutscene = deriveBattleCombatCutscene(before, after);
  const expectedRevealStartMs = getBattleMoveDuration(2) + BATTLE_MOVE_SETTLE_MS;

  assert.ok(cutscene);
  assert.equal(cutscene.revealStartMs, expectedRevealStartMs);
  assert.equal(
    cutscene.steps[0].startMs,
    expectedRevealStartMs +
      BATTLE_COMBAT_CUTSCENE_OPEN_MS +
      BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS
  );
});
