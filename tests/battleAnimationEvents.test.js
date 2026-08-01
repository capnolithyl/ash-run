import test from "node:test";
import assert from "node:assert/strict";
import {
  BATTLE_ATTACK_WINDOW_MS,
  BATTLE_COMBAT_CUTSCENE_CLOSE_MS,
  BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS,
  BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_OPEN_MS,
  BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS,
  BATTLE_POWER_OVERLAY_DISPLAY_MS,
  BATTLE_POST_COMBAT_PAUSE_MS,
  BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS,
  BATTLE_MOVE_SETTLE_MS,
  TERRAIN_KEYS,
  getBattleMoveDuration,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { getCommanderPowerMax } from "../src/game/content/commanders.js";
import { REINFORCEMENT_TRIGGER_TYPES } from "../src/game/content/reinforcements.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { getXpThreshold } from "../src/game/simulation/progression.js";
import {
  AIR_STRIKE_FLYOVER_DURATION_MS,
  AIR_STRIKE_IMPACT_DELAY_MS,
  COMMANDER_POWER_PULSE_DURATION_MS,
  COMMANDER_POWER_TARGET_STAGGER_MS,
  EXPERIENCE_EXIT_DELAY_MS,
  EXPERIENCE_EXIT_DURATION_MS,
  EXPERIENCE_LEVEL_CHAIN_DELAY_MS,
  EXPERIENCE_SEGMENT_COMPLETE_MS,
  EXPERIENCE_SEGMENT_GAIN_MS,
  deriveBattleAnimationEvents,
  getBattleSnapshotTransitionDurationMs
} from "../src/game/phaser/view/battleAnimationEvents.js";
import { getAnimatedMovementPaths } from "../src/game/phaser/scenes/battleScene/renderBoard.js";
import { deriveBattleCombatCutscene } from "../src/game/phaser/view/battleCombatCutscene.js";
import { getUnitSpriteDefinition } from "../src/game/phaser/assets.js";
import { getUnitMovementPlayback } from "../src/game/phaser/view/unitAnimationHelpers.js";
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

test("battle animation events emit a deploy event when a queued reinforcement arrives", () => {
  const state = createTestBattleState({
    playerUnits: [createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 1)],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5)],
    activeSide: TURN_SIDES.ENEMY
  });
  state.turn.number = 2;
  state.enemyTurn = {
    started: true,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [],
    pendingReinforcementDeployments: [],
    forcePassed: false
  };
  state.map.reinforcements = [
    {
      id: "animation-wave",
      name: "Animation Wave",
      maxActivations: 1,
      trigger: {
        type: REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED,
        every: 1
      },
      units: [{ id: "animation-wave-grunt", unitTypeId: "grunt", level: 2, x: 6, y: 4 }]
    }
  ];
  const system = new BattleSystem(state);
  const queued = system.prepareEnemyEndTurnReinforcements();
  const before = system.getSnapshot();
  const result = system.processNextEnemyTurnReinforcement();
  const after = system.getSnapshot();
  const deployEvent = deriveBattleAnimationEvents(before, after).find(
    (event) => event.type === "deploy" && event.unitId === result.deployment.unitId
  );

  assert.equal(queued.deployments.length, 1);
  assert.ok(deployEvent);
  assert.equal(deployEvent.owner, TURN_SIDES.ENEMY);
  assert.equal(deployEvent.x, 6);
  assert.equal(deployEvent.y, 4);
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

test("battle animation events tolerate counter pairs when a unit is missing after combat", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 2, {
    hasAttacked: true
  });
  const defender = createPlacedUnit("breaker", TURN_SIDES.PLAYER, 3, 2);
  const before = createTestBattleState({
    playerUnits: [defender],
    enemyUnits: [attacker]
  });
  const after = structuredClone(before);

  after.enemy.units[0].current.hp -= 33;
  after.enemy.units[0].current.ammo -= 1;
  after.player.units = [];

  const events = deriveBattleAnimationEvents(before, after);
  const attackEvents = events.filter((event) => event.type === "attack");
  const destroyEvent = events.find((event) => event.type === "destroy" && event.unitId === defender.id);

  assert.ok(attackEvents.some((event) => event.attackerId === attacker.id && event.targetId === defender.id));
  assert.ok(attackEvents.some((event) => event.attackerId === defender.id && event.targetId === attacker.id));
  assert.ok(destroyEvent);
});

test("battle animation events show a dead enemy initiator before the lethal player counter", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 2, {
    current: {
      hp: 20
    }
  });
  const defender = createPlacedUnit("breaker", TURN_SIDES.PLAYER, 3, 2);
  const system = new BattleSystem(
    createTestBattleState({
      playerUnits: [defender],
      enemyUnits: [attacker],
      activeSide: TURN_SIDES.ENEMY
    })
  );

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const attackEvents = deriveBattleAnimationEvents(before, after).filter((event) => event.type === "attack");

  assert.equal(after.enemy.units.length, 0);
  assert.equal(attackEvents.length, 2);
  assert.equal(attackEvents[0].attackerId, attacker.id);
  assert.equal(attackEvents[0].targetId, defender.id);
  assert.equal(attackEvents[0].isInitiator, true);
  assert.equal(attackEvents[1].attackerId, defender.id);
  assert.equal(attackEvents[1].targetId, attacker.id);
  assert.equal(attackEvents[1].isInitiator, false);
  assert.equal(attackEvents[1].delay, BATTLE_ATTACK_WINDOW_MS);
});

test("battle animation events show graves preemptive defender strike before the enemy attack", () => {
  const defender = createPlacedUnit("breaker", TURN_SIDES.PLAYER, 2, 2);
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

test("battle animation events emit staged restore pulses for atlas power", () => {
  const bruiser = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 2, 3, {
    current: {
      hp: 40
    },
    statuses: [{ type: "burn", tickDamageRatio: 0.1, negative: true }]
  });
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 4, 1, {
    current: {
      hp: 70
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4);
  const battleState = createTestBattleState({
    playerUnits: [bruiser, runner],
    enemyUnits: [enemy]
  });
  battleState.player.commanderId = "atlas";
  battleState.player.charge = getCommanderPowerMax("atlas");

  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();
  assert.equal(system.activatePower(), true);
  const after = system.getSnapshot();
  const event = deriveBattleAnimationEvents(before, after).find(
    (candidate) => candidate.type === "power"
  );

  assert.ok(event);
  assert.equal(event.side, TURN_SIDES.PLAYER);
  assert.equal(event.commanderId, "atlas");
  assert.equal(event.powerName, "Overhaul");
  assert.equal(event.startDelayMs, BATTLE_POWER_OVERLAY_DISPLAY_MS);
  assert.equal(event.targetStaggerMs, COMMANDER_POWER_TARGET_STAGGER_MS);
  assert.equal(event.pulseDurationMs, COMMANDER_POWER_PULSE_DURATION_MS);
  assert.equal(event.targets.length, 2);
  assert.equal(event.targets[0].pulse, "restore");
  assert.equal(event.targets[1].pulse, "restore");
  assert.ok(event.targets.some((target) => target.unitId === bruiser.id && target.label === "CLEANSE"));
  assert.ok(event.targets.some((target) => target.unitId === bruiser.id && target.amount > 0));
  assert.equal(
    event.endDelayMs,
    BATTLE_POWER_OVERLAY_DISPLAY_MS +
      COMMANDER_POWER_PULSE_DURATION_MS +
      COMMANDER_POWER_TARGET_STAGGER_MS
  );
});

test("battle animation events emit damage pulses for blaze ignition", () => {
  const enemyA = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 2);
  const enemyB = createPlacedUnit("runner", TURN_SIDES.ENEMY, 6, 4);
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1)],
    enemyUnits: [enemyA, enemyB]
  });
  battleState.player.commanderId = "blaze";
  battleState.player.charge = getCommanderPowerMax("blaze");

  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();
  assert.equal(system.activatePower(), true);
  const after = system.getSnapshot();
  const event = deriveBattleAnimationEvents(before, after).find(
    (candidate) => candidate.type === "power"
  );

  assert.ok(event);
  assert.equal(event.commanderId, "blaze");
  assert.equal(event.powerName, "Ignition");
  assert.equal(event.targets.length, 2);
  assert.equal(event.targets.every((target) => target.pulse === "damage"), true);
  assert.ok(event.targets.every((target) => target.amount === 10));
  assert.ok(event.targets.every((target) => target.label === "BURN"));
});

test("battle animation events expose Falcon Air Strike flyover and impact timing", () => {
  const target = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 2, {
    current: { hp: 60 }
  });
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("gunship", TURN_SIDES.PLAYER, 1, 1)],
    enemyUnits: [target]
  });
  battleState.player.commanderId = "falcon";
  battleState.player.charge = getCommanderPowerMax("falcon");
  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();

  assert.equal(system.activatePower(), true);
  assert.equal(
    deriveBattleAnimationEvents(before, system.getSnapshot()).some((event) => event.type === "power"),
    false
  );
  assert.equal(system.handleTileSelection(4, 2), true);

  const event = deriveBattleAnimationEvents(before, system.getSnapshot()).find(
    (candidate) => candidate.type === "power"
  );

  assert.ok(event);
  assert.equal(event.powerType, "falcon-air-strike");
  assert.deepEqual(event.center, { x: 4, y: 2 });
  assert.equal(event.areaTiles.length, 5);
  assert.equal(event.targets.length, 1);
  assert.equal(event.targets[0].amount, 60);
  assert.equal(event.targets[0].destroyed, true);
  assert.equal(event.targetStaggerMs, 0);
  assert.equal(event.impactDelayMs, AIR_STRIKE_IMPACT_DELAY_MS);
  assert.equal(event.flightDurationMs, AIR_STRIKE_FLYOVER_DURATION_MS);
  assert.equal(event.flyoverDirection, 1);
  assert.equal(
    event.durationMs,
    Math.max(
      AIR_STRIKE_FLYOVER_DURATION_MS,
      AIR_STRIKE_IMPACT_DELAY_MS + COMMANDER_POWER_PULSE_DURATION_MS
    )
  );
});

test("battle animation events retain an empty Falcon Air Strike", () => {
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1)],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5)]
  });
  battleState.player.commanderId = "falcon";
  battleState.player.charge = getCommanderPowerMax("falcon");
  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();

  assert.equal(system.activatePower(), true);
  assert.equal(system.handleTileSelection(0, 5), true);

  const event = deriveBattleAnimationEvents(before, system.getSnapshot()).find(
    (candidate) => candidate.type === "power"
  );

  assert.ok(event);
  assert.deepEqual(event.center, { x: 0, y: 5 });
  assert.equal(event.areaTiles.length, 3);
  assert.equal(event.targets.length, 0);
});

test("battle render exposes enemy movement paths for transient move arrows", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3);
  const enemy = createPlacedUnit("runner", TURN_SIDES.ENEMY, 6, 3);
  const battleState = createTestBattleState({
    id: "enemy-arrow-path",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();

  assert.equal(system.processEnemyTurnStep().type, "move");

  const afterMove = system.getSnapshot();
  const movementEvents = deriveBattleAnimationEvents(before, afterMove).filter(
    (event) => event.type === "move"
  );

  assert.deepEqual(getAnimatedMovementPaths(movementEvents, TURN_SIDES.ENEMY), [
    [
      { x: 6, y: 3 },
      { x: 5, y: 3 }
    ]
  ]);
});

test("battle render keeps held enemy movement paths after move animation events clear", () => {
  const heldMove = {
    id: "enemy-move-hold-test",
    unitId: "enemy-runner",
    owner: TURN_SIDES.ENEMY,
    path: [
      { x: 6, y: 3 },
      { x: 5, y: 3 }
    ],
    tile: { x: 5, y: 3 },
    startedAt: 0,
    durationMs: 260
  };

  assert.deepEqual(getAnimatedMovementPaths([], TURN_SIDES.ENEMY, heldMove), [
    [
      { x: 6, y: 3 },
      { x: 5, y: 3 }
    ]
  ]);
  assert.deepEqual(getAnimatedMovementPaths([], TURN_SIDES.PLAYER, heldMove), []);
});

test("player grunt move events use teleport timing while preserving the path", () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const battleState = createTestBattleState({
    width: 6,
    height: 4,
    playerUnits: [grunt],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 3)]
  });
  battleState.map.tiles = Array.from({ length: battleState.map.height }, () =>
    Array.from({ length: battleState.map.width }, () => TERRAIN_KEYS.ROAD)
  );
  battleState.selection = { type: "unit", id: grunt.id, x: grunt.x, y: grunt.y };

  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();

  assert.equal(system.handleTileSelection(3, 1), true);

  const after = system.getSnapshot();
  const moveEvent = deriveBattleAnimationEvents(before, after).find(
    (event) => event.type === "move" && event.unitId === grunt.id
  );

  assert.ok(moveEvent);
  assert.equal(moveEvent.teleport, undefined);
  assert.deepEqual(moveEvent.path, [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 }
  ]);
  assert.equal(moveEvent.durationMs, 1667);
  assert.equal(moveEvent.endDelayMs, 1667 + BATTLE_MOVE_SETTLE_MS);
  assert.equal(getBattleSnapshotTransitionDurationMs(before, after), 1667);
});

test("player longshot move events use teleport timing while preserving the path", () => {
  const longshot = createPlacedUnit("longshot", TURN_SIDES.PLAYER, 1, 1);
  const battleState = createTestBattleState({
    width: 6,
    height: 4,
    playerUnits: [longshot],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 3)]
  });
  battleState.map.tiles = Array.from({ length: battleState.map.height }, () =>
    Array.from({ length: battleState.map.width }, () => TERRAIN_KEYS.ROAD)
  );
  battleState.selection = { type: "unit", id: longshot.id, x: longshot.x, y: longshot.y };

  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();

  assert.equal(system.handleTileSelection(3, 1), true);

  const after = system.getSnapshot();
  const moveEvent = deriveBattleAnimationEvents(before, after).find(
    (event) => event.type === "move" && event.unitId === longshot.id
  );

  assert.ok(moveEvent);
  assert.equal(moveEvent.teleport, undefined);
  assert.deepEqual(moveEvent.path, [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 }
  ]);
  assert.equal(moveEvent.durationMs, 1333);
  assert.equal(moveEvent.endDelayMs, 1333 + BATTLE_MOVE_SETTLE_MS);
  assert.equal(getBattleSnapshotTransitionDurationMs(before, after), 1333);
});

test("enemy grunt movement uses the installed blue teleport sheet timing", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 3);
  const battleState = createTestBattleState({
    id: "enemy-grunt-path",
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  battleState.enemyTurn = {
    pendingAttack: null,
    pendingUnitIds: [enemy.id]
  };

  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();

  assert.equal(system.processEnemyTurnStep().type, "move");

  const afterMove = system.getSnapshot();
  const moveEvent = deriveBattleAnimationEvents(before, afterMove).find(
    (event) => event.type === "move" && event.unitId === enemy.id
  );

  assert.ok(moveEvent);
  assert.equal(moveEvent.teleport, undefined);
  assert.deepEqual(moveEvent.path[0], { x: 6, y: 3 });
  assert.ok(moveEvent.path.length > 1);
  const moveSegments = moveEvent.path.length - 1;
  const spriteDefinition = getUnitSpriteDefinition("grunt", TURN_SIDES.ENEMY);
  const movementDuration = getUnitMovementPlayback(spriteDefinition, moveSegments).totalDurationMs;
  assert.equal(spriteDefinition.walk.movementStyle, "teleport");
  assert.equal(moveEvent.durationMs, movementDuration);
  assert.equal(moveEvent.endDelayMs, movementDuration + BATTLE_MOVE_SETTLE_MS);
});

test("purple gunship move events include the stationary outro before settling", () => {
  const gunship = createPlacedUnit("gunship", TURN_SIDES.PLAYER, 1, 1);
  const battleState = createTestBattleState({
    width: 6,
    height: 4,
    playerUnits: [gunship],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 5, 3)]
  });
  battleState.map.tiles = Array.from({ length: battleState.map.height }, () =>
    Array.from({ length: battleState.map.width }, () => TERRAIN_KEYS.ROAD)
  );
  battleState.selection = { type: "unit", id: gunship.id, x: gunship.x, y: gunship.y };

  const system = new BattleSystem(battleState);
  const before = system.getSnapshot();

  assert.equal(system.handleTileSelection(3, 1), true);

  const after = system.getSnapshot();
  const moveEvent = deriveBattleAnimationEvents(before, after).find(
    (event) => event.type === "move" && event.unitId === gunship.id
  );
  const expectedDurationMs = getBattleMoveDuration(2) + 167;

  assert.ok(moveEvent);
  assert.equal(moveEvent.durationMs, expectedDurationMs);
  assert.equal(moveEvent.endDelayMs, expectedDurationMs + BATTLE_MOVE_SETTLE_MS);
  assert.equal(getBattleSnapshotTransitionDurationMs(before, after), expectedDurationMs);
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
  assert.equal(cutscene.focusStartMs, 0);
  assert.deepEqual(cutscene.focusTiles, [
    { role: "attacker", unitId: attacker.id, x: attacker.x, y: attacker.y },
    { role: "target", unitId: defender.id, x: defender.x, y: defender.y }
  ]);
  assert.equal(cutscene.steps.length >= 1, true);
  assert.equal(cutscene.steps[0].attackerSide, TURN_SIDES.PLAYER);
  assert.equal(cutscene.steps[0].targetSide, TURN_SIDES.ENEMY);
  assert.equal(
    cutscene.steps[0].startMs,
    BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS +
      BATTLE_COMBAT_CUTSCENE_OPEN_MS +
      BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS
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
        BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS +
        BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS +
        BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS +
        BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS +
        BATTLE_COMBAT_CUTSCENE_CLOSE_MS
  );
});

test("battle combat cutscene payload keeps graves preemptive counter order", () => {
  const defender = createPlacedUnit("breaker", TURN_SIDES.PLAYER, 2, 2);
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
        BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS +
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
  const expectedFocusStartMs = 1667 + BATTLE_MOVE_SETTLE_MS;
  const expectedRevealStartMs = expectedFocusStartMs + BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS;

  assert.ok(cutscene);
  assert.equal(cutscene.focusStartMs, expectedFocusStartMs);
  assert.equal(cutscene.revealStartMs, expectedRevealStartMs);
  assert.equal(
    cutscene.steps[0].startMs,
    expectedRevealStartMs +
      BATTLE_COMBAT_CUTSCENE_OPEN_MS +
      BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS
  );
});

test("battle combat cutscene waits for the gunship outro before revealing the duel popup", () => {
  const attacker = createPlacedUnit("gunship", TURN_SIDES.PLAYER, 1, 1);
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
  const expectedFocusStartMs =
    getBattleMoveDuration(2) + 167 + BATTLE_MOVE_SETTLE_MS;

  assert.ok(cutscene);
  assert.equal(cutscene.focusStartMs, expectedFocusStartMs);
  assert.equal(
    cutscene.revealStartMs,
    expectedFocusStartMs + BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS
  );
});

test("battle combat cutscene lets longshot play its one-shot attack clip at full length", () => {
  const attacker = createPlacedUnit("longshot", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 1);
  const system = new BattleSystem(
    createTestBattleState({
      playerUnits: [attacker],
      enemyUnits: [defender]
    })
  );

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const cutscene = deriveBattleCombatCutscene(before, after);

  assert.ok(cutscene);
  assert.equal(cutscene.steps.length, 1);
  assert.equal(cutscene.steps[0].loopCount, 1);
  assert.ok(cutscene.steps[0].windowMs > BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS);
  assert.equal(cutscene.steps[0].windowMs, 1800);
});

test("battle combat cutscene plays the bruiser attack clip once", () => {
  const attacker = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 1, 1);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 2, 1);
  const system = new BattleSystem(
    createTestBattleState({
      playerUnits: [attacker],
      enemyUnits: [defender]
    })
  );

  const before = system.getSnapshot();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const after = system.getSnapshot();
  const cutscene = deriveBattleCombatCutscene(before, after);

  assert.ok(cutscene);
  assert.equal(cutscene.steps[0].loopCount, 1);
  assert.equal(cutscene.steps[0].windowMs, 1000);
});

test("experience events expose threshold-hit timing metadata for a single level-up", () => {
  const thresholdLevel1 = getXpThreshold(1);
  const thresholdLevel2 = getXpThreshold(2);
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
    level: 1,
    experience: thresholdLevel1 - 8
  });
  const before = createTestBattleState({
    playerUnits: [unit]
  });
  const after = structuredClone(before);
  after.player.units[0].level = 2;
  after.player.units[0].experience = 18;

  const event = deriveBattleAnimationEvents(before, after).find(
    (candidate) => candidate.type === "experience"
  );

  assert.ok(event);
  assert.equal(event.startDelayMs, BATTLE_MOVE_SETTLE_MS);
  assert.deepEqual(event.thresholdHitDelaysMs, [
    BATTLE_MOVE_SETTLE_MS + EXPERIENCE_SEGMENT_COMPLETE_MS
  ]);
  assert.deepEqual(
    event.segmentTimings.map((segment) => ({
      level: segment.level,
      threshold: segment.threshold,
      fromExperience: segment.fromExperience,
      toExperience: segment.toExperience,
      startDelayMs: segment.startDelayMs,
      durationMs: segment.durationMs,
      endDelayMs: segment.endDelayMs,
      thresholdHitDelayMs: segment.thresholdHitDelayMs
    })),
    [
      {
        level: 1,
        threshold: thresholdLevel1,
        fromExperience: thresholdLevel1 - 8,
        toExperience: thresholdLevel1,
        startDelayMs: BATTLE_MOVE_SETTLE_MS,
        durationMs: EXPERIENCE_SEGMENT_COMPLETE_MS,
        endDelayMs: BATTLE_MOVE_SETTLE_MS + EXPERIENCE_SEGMENT_COMPLETE_MS,
        thresholdHitDelayMs: BATTLE_MOVE_SETTLE_MS + EXPERIENCE_SEGMENT_COMPLETE_MS
      },
      {
        level: 2,
        threshold: thresholdLevel2,
        fromExperience: 0,
        toExperience: 18,
        startDelayMs:
          BATTLE_MOVE_SETTLE_MS +
          EXPERIENCE_SEGMENT_COMPLETE_MS +
          EXPERIENCE_LEVEL_CHAIN_DELAY_MS,
        durationMs: EXPERIENCE_SEGMENT_GAIN_MS,
        endDelayMs:
          BATTLE_MOVE_SETTLE_MS +
          EXPERIENCE_SEGMENT_COMPLETE_MS +
          EXPERIENCE_LEVEL_CHAIN_DELAY_MS +
          EXPERIENCE_SEGMENT_GAIN_MS,
        thresholdHitDelayMs: null
      }
    ]
  );
  assert.equal(
    event.endDelayMs,
    event.segmentTimings[1].endDelayMs + EXPERIENCE_EXIT_DELAY_MS + EXPERIENCE_EXIT_DURATION_MS
  );
  assert.equal(getBattleSnapshotTransitionDurationMs(before, after), event.endDelayMs);
  assert.equal(
    getBattleSnapshotTransitionDurationMs(before, after, {
      combatCutsceneDurationMs: event.endDelayMs + 20,
      postCombatDelayMs: BATTLE_POST_COMBAT_PAUSE_MS
    }),
    event.endDelayMs + 20 + BATTLE_POST_COMBAT_PAUSE_MS + event.durationMs
  );
});

test("experience events chain one threshold hit per filled bar on multi-level gains", () => {
  const thresholdLevel1 = getXpThreshold(1);
  const thresholdLevel2 = getXpThreshold(2);
  const thresholdLevel3 = getXpThreshold(3);
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
    level: 1,
    experience: thresholdLevel1 - 5
  });
  const before = createTestBattleState({
    playerUnits: [unit]
  });
  const after = structuredClone(before);
  after.player.units[0].level = 3;
  after.player.units[0].experience = 12;

  const event = deriveBattleAnimationEvents(before, after).find(
    (candidate) => candidate.type === "experience"
  );

  assert.ok(event);
  assert.equal(event.segmentTimings.length, 3);
  assert.deepEqual(event.thresholdHitDelaysMs, [
    BATTLE_MOVE_SETTLE_MS + EXPERIENCE_SEGMENT_COMPLETE_MS,
    BATTLE_MOVE_SETTLE_MS + EXPERIENCE_SEGMENT_COMPLETE_MS * 2 + EXPERIENCE_LEVEL_CHAIN_DELAY_MS
  ]);
  assert.deepEqual(
    event.segmentTimings.map((segment) => ({
      level: segment.level,
      threshold: segment.threshold,
      fromExperience: segment.fromExperience,
      toExperience: segment.toExperience,
      startDelayMs: segment.startDelayMs,
      durationMs: segment.durationMs,
      endDelayMs: segment.endDelayMs,
      thresholdHitDelayMs: segment.thresholdHitDelayMs
    })),
    [
      {
        level: 1,
        threshold: thresholdLevel1,
        fromExperience: thresholdLevel1 - 5,
        toExperience: thresholdLevel1,
        startDelayMs: BATTLE_MOVE_SETTLE_MS,
        durationMs: EXPERIENCE_SEGMENT_COMPLETE_MS,
        endDelayMs: BATTLE_MOVE_SETTLE_MS + EXPERIENCE_SEGMENT_COMPLETE_MS,
        thresholdHitDelayMs: BATTLE_MOVE_SETTLE_MS + EXPERIENCE_SEGMENT_COMPLETE_MS
      },
      {
        level: 2,
        threshold: thresholdLevel2,
        fromExperience: 0,
        toExperience: thresholdLevel2,
        startDelayMs:
          BATTLE_MOVE_SETTLE_MS +
          EXPERIENCE_SEGMENT_COMPLETE_MS +
          EXPERIENCE_LEVEL_CHAIN_DELAY_MS,
        durationMs: EXPERIENCE_SEGMENT_COMPLETE_MS,
        endDelayMs:
          BATTLE_MOVE_SETTLE_MS +
          EXPERIENCE_SEGMENT_COMPLETE_MS * 2 + EXPERIENCE_LEVEL_CHAIN_DELAY_MS,
        thresholdHitDelayMs:
          BATTLE_MOVE_SETTLE_MS +
          EXPERIENCE_SEGMENT_COMPLETE_MS * 2 + EXPERIENCE_LEVEL_CHAIN_DELAY_MS
      },
      {
        level: 3,
        threshold: thresholdLevel3,
        fromExperience: 0,
        toExperience: 12,
        startDelayMs:
          BATTLE_MOVE_SETTLE_MS +
          EXPERIENCE_SEGMENT_COMPLETE_MS * 2 + EXPERIENCE_LEVEL_CHAIN_DELAY_MS * 2,
        durationMs: EXPERIENCE_SEGMENT_GAIN_MS,
        endDelayMs:
          BATTLE_MOVE_SETTLE_MS +
          EXPERIENCE_SEGMENT_COMPLETE_MS * 2 +
          EXPERIENCE_LEVEL_CHAIN_DELAY_MS * 2 +
          EXPERIENCE_SEGMENT_GAIN_MS,
        thresholdHitDelayMs: null
      }
    ]
  );
  assert.equal(
    event.durationMs,
    event.endDelayMs - event.startDelayMs
  );
  assert.equal(getBattleSnapshotTransitionDurationMs(before, after), event.endDelayMs);
});
