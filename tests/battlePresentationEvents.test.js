import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_MODES, TURN_SIDES } from "../src/game/core/constants.js";
import { getCommanderPowerMax } from "../src/game/content/commanders.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { deriveBattleAnimationEvents } from "../src/game/phaser/view/battleAnimationEvents.js";
import {
  createPlacedUnit,
  createTestBattleState
} from "./helpers/createTestBattleState.js";

function createCombatSystem(attackerOverrides = {}, defenderOverrides = {}) {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, attackerOverrides);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2, defenderOverrides);
  const state = createTestBattleState({ playerUnits: [attacker], enemyUnits: [defender] });
  state.player.commanderId = null;
  state.enemy.commanderId = null;
  return { system: new BattleSystem(state), attacker, defender };
}

test("presentation events are monotonic, capped, and excluded from saves", () => {
  const { system } = createCombatSystem();

  for (let index = 0; index < 170; index += 1) {
    system.recordPresentationEvent("probe", { index });
  }

  const snapshot = system.getSnapshot();
  assert.equal(snapshot.presentation.events.length, 160);
  assert.equal(snapshot.presentation.events[0].id, 11);
  assert.equal(snapshot.presentation.events.at(-1).id, 170);
  assert.equal("presentation" in system.getStateForSave(), false);
  assert.equal("presentationEvents" in system.getStateForSave(), false);
});

test("combat journals primary and secondary strikes even when damage is zero", () => {
  const primary = createCombatSystem();
  assert.equal(primary.system.attackTarget(primary.attacker.id, primary.defender.id), true);

  const primaryEvent = primary.system
    .getSnapshot()
    .presentation.events.find((event) => event.type === "strike" && event.phase === "primary");
  assert.equal(primaryEvent.profile, "primary");
  assert.equal(primaryEvent.weaponClass, "rifle");
  assert.equal(primaryEvent.order, 0);
  assert.equal(typeof primaryEvent.damage, "number");

  const secondary = createCombatSystem({ current: { ammo: 0 } });
  assert.equal(secondary.system.attackTarget(secondary.attacker.id, secondary.defender.id), true);
  const secondaryEvent = secondary.system
    .getSnapshot()
    .presentation.events.find((event) => event.type === "strike" && event.phase === "primary");
  assert.equal(secondaryEvent.profile, "secondary");
  assert.equal(secondaryEvent.weaponClass, "rifle");
});

test("AA gear strikes have an explicit presentation profile and weapon class", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
    gear: { slot: "gear-aa-kit" },
    gearState: { aaKitAmmo: 2 }
  });
  const defender = createPlacedUnit("gunship", TURN_SIDES.ENEMY, 3, 2);
  const state = createTestBattleState({ playerUnits: [attacker], enemyUnits: [defender] });
  state.player.commanderId = null;
  state.enemy.commanderId = null;
  const system = new BattleSystem(state);

  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const strike = system
    .getSnapshot()
    .presentation.events.find((event) => event.type === "strike" && event.attackerId === attacker.id);
  assert.equal(strike.profile, "gear-aa");
  assert.equal(strike.weaponClass, "anti_air_gear");
});

test("service and Runner transitions journal exact sources and resource deltas", () => {
  const medic = createPlacedUnit("medic", TURN_SIDES.PLAYER, 1, 1);
  const patient = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 1, {
    current: { hp: 2, ammo: 0, stamina: 0 }
  });
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 4, 1);
  const passenger = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 3, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5);
  const system = new BattleSystem(
    createTestBattleState({ playerUnits: [medic, patient, runner, passenger], enemyUnits: [enemy] })
  );
  const [systemMedic, systemPatient, systemRunner, systemPassenger] = system.state.player.units;

  assert.equal(system.applySupportAbility(systemMedic, systemPatient), true);
  assert.equal(system.boardUnitIntoRunner(systemPassenger, systemRunner), true);
  assert.equal(system.unloadTransportForEnemy(systemRunner, { x: 4, y: 2 }), true);

  const events = system.getSnapshot().presentation.events;
  const service = events.find((event) => event.type === "service");
  assert.equal(service.sourceKind, "medic");
  assert.equal(service.targetId, patient.id);
  assert.ok(service.hpRecovered > 0);
  assert.ok(service.ammoRecovered > 0);
  assert.ok(service.staminaRecovered > 0);
  assert.deepEqual(
    events.filter((event) => event.type === "transport").map((event) => event.action),
    ["board", "unload"]
  );
});

test("authoritative transport events prevent passenger movement during board-move-unload", () => {
  const passenger = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 1, 1);
  const runner = createPlacedUnit("runner", TURN_SIDES.ENEMY, 2, 1);
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 7, 5);
  const system = new BattleSystem(
    createTestBattleState({ playerUnits: [player], enemyUnits: [passenger, runner] })
  );
  const before = system.getSnapshot();
  const [systemPassenger, systemRunner] = system.state.enemy.units;

  assert.equal(system.boardUnitIntoRunner(systemPassenger, systemRunner), true);
  systemRunner.x = 4;
  systemRunner.y = 1;
  system.syncTransportCargoPosition(systemRunner);
  assert.equal(system.unloadTransportForEnemy(systemRunner, { x: 4, y: 2 }), true);

  const events = deriveBattleAnimationEvents(before, system.getSnapshot());
  assert.equal(
    events.some((event) => event.type === "move" && event.unitId === passenger.id),
    false
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === "deploy" &&
        event.unitId === passenger.id &&
        event.fromUnload === true
    ),
    true
  );
});

test("level-up max-HP growth does not masquerade as a service animation", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5);
  const system = new BattleSystem(
    createTestBattleState({ playerUnits: [unit], enemyUnits: [enemy] })
  );
  const before = system.getSnapshot();

  system.state.player.units[0].level += 1;
  system.state.player.units[0].stats.maxHealth += 5;
  system.state.player.units[0].current.hp += 5;
  const events = deriveBattleAnimationEvents(before, system.getSnapshot());

  assert.equal(events.some((event) => ["heal", "resupply"].includes(event.type)), false);
  assert.equal(events.some((event) => event.type === "experience"), true);
});

test("every service building records its exact source and deltas", () => {
  for (const buildingType of ["command", "sector", "hospital", "repair-station"]) {
    const unitTypeId = buildingType === "repair-station" ? "runner" : "grunt";
    const unit = createPlacedUnit(unitTypeId, TURN_SIDES.PLAYER, 2, 2, {
      current: { hp: 1, ammo: 0, stamina: 0 }
    });
    const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5);
    const state = createTestBattleState({ playerUnits: [unit], enemyUnits: [enemy] });
    state.map.buildings = [
      {
        id: `${buildingType}-service`,
        type: buildingType,
        owner: TURN_SIDES.PLAYER,
        x: 2,
        y: 2
      }
    ];
    state.pendingAction = {
      type: "move",
      mode: "menu",
      unitId: unit.id,
      fromX: 2,
      fromY: 2,
      toX: 2,
      toY: 2
    };
    const system = new BattleSystem(state);

    assert.equal(system.useSupplyWithPendingUnit(), true, buildingType);
    const event = system
      .getSnapshot()
      .presentation.events.find((candidate) => candidate.type === "service");
    assert.equal(event.sourceKind, "building");
    assert.equal(event.buildingType, buildingType);
    assert.equal(event.sourceId, `${buildingType}-service`);
    assert.ok(event.hpRecovered + event.ammoRecovered + event.staminaRecovered > 0);
  }
});

test("multiple authoritative services on one unit each retain their own pulse and source", () => {
  const unit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 2, {
    current: { hp: 2, ammo: 0, stamina: 0 }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 5);
  const system = new BattleSystem(
    createTestBattleState({ playerUnits: [unit], enemyUnits: [enemy] })
  );
  const before = system.getSnapshot();

  system.recordPresentationEvent("service", {
    targetId: unit.id,
    sourceKind: "commander-passive",
    sourceId: "atlas-field-repairs",
    hpRecovered: 1,
    ammoRecovered: 0,
    staminaRecovered: 0,
    x: 2,
    y: 2
  });
  system.recordPresentationEvent("service", {
    targetId: unit.id,
    sourceKind: "run-card",
    sourceId: "turn-start-run-card",
    hpRecovered: 2,
    ammoRecovered: 1,
    staminaRecovered: 1,
    x: 2,
    y: 2
  });
  system.state.player.units[0].current.hp += 3;
  system.state.player.units[0].current.ammo += 1;
  system.state.player.units[0].current.stamina += 1;

  const restores = deriveBattleAnimationEvents(before, system.getSnapshot()).filter(
    (event) => ["heal", "resupply"].includes(event.type)
  );
  assert.deepEqual(restores.map((event) => event.sourceKind), [
    "commander-passive",
    "run-card"
  ]);
  assert.deepEqual(restores.map((event) => event.eventId), [1, 2]);
});

test("Toolkit and Patient Zero journal authoritative status applications", () => {
  for (const [gearId, statusType] of [
    ["gear-toolkit", "corrupted"],
    ["gear-patient-zero", "zombified"]
  ]) {
    const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2, {
      gear: { slot: gearId }
    });
    const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2);
    const state = createTestBattleState({ playerUnits: [attacker], enemyUnits: [defender] });
    state.player.commanderId = null;
    state.enemy.commanderId = null;
    const system = new BattleSystem(state);

    assert.equal(system.attackTarget(attacker.id, defender.id), true, gearId);
    const event = system
      .getSnapshot()
      .presentation.events.find(
        (candidate) =>
          candidate.type === "status" &&
          candidate.action === "apply" &&
          candidate.sourceId === gearId
      );

    assert.ok(event, gearId);
    assert.equal(event.actorId, attacker.id);
    assert.equal(event.targetId, defender.id);
    assert.equal(event.sourceKind, "gear");
    assert.equal(event.statusType, statusType);
  }
});

test("experimental ammunition recoil journals deterministic self-damage", () => {
  const attacker = createPlacedUnit("longshot", TURN_SIDES.PLAYER, 1, 2);
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 2);
  const state = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender],
    seed: 4
  });
  state.player.commanderId = null;
  state.enemy.commanderId = null;
  state.runCards = { ownedCardIds: ["experimental-ammunition-2"] };
  const system = new BattleSystem(state);

  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const event = system
    .getSnapshot()
    .presentation.events.find(
      (candidate) =>
        candidate.type === "status" &&
        candidate.action === "effect-damage" &&
        candidate.sourceId === "experimental-ammunition-2"
    );

  assert.ok(event);
  assert.equal(system.state.player.units[0].current.hp, 90);
  assert.equal(event.actorId, attacker.id);
  assert.equal(event.targetId, attacker.id);
  assert.equal(event.sourceKind, "run-card");
  assert.equal(event.damage, 10);
  assert.equal(event.killed, false);
});

test("Scavengers kill healing journals an authoritative service", () => {
  const attacker = createPlacedUnit("longshot", TURN_SIDES.PLAYER, 1, 2, {
    current: { hp: 50 },
    gear: { slot: "gear-scavengers" }
  });
  const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 2, {
    current: { hp: 1 }
  });
  const state = createTestBattleState({ playerUnits: [attacker], enemyUnits: [defender] });
  state.player.commanderId = null;
  state.enemy.commanderId = null;
  const system = new BattleSystem(state);

  assert.equal(system.attackTarget(attacker.id, defender.id), true);
  const event = system
    .getSnapshot()
    .presentation.events.find(
      (candidate) =>
        candidate.type === "service" && candidate.sourceId === "gear-scavengers"
    );

  assert.ok(event);
  assert.equal(system.state.player.units[0].current.hp, 53);
  assert.equal(event.actorId, attacker.id);
  assert.equal(event.targetId, attacker.id);
  assert.equal(event.sourceKind, "run-card");
  assert.equal(event.hpRecovered, 3);
});

test("burn ticks and Atlas passive repairs remain separate presentation events", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 1, {
    current: { hp: 50 },
    statuses: [{ type: "burn", tickDamageRatio: 0.1, negative: true }]
  });
  const state = createTestBattleState({
    playerUnits: [player],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY
  });
  state.player.commanderId = null;
  state.enemy.commanderId = "atlas";
  state.enemyTurn = {
    started: false,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [],
    pendingReinforcementDeployments: [],
    plannedActions: [],
    plannedPendingUnitIdsKey: "",
    forcePassed: false
  };
  const system = new BattleSystem(state);

  system.startEnemyTurnActions();
  const events = system.getSnapshot().presentation.events;
  const burn = events.find(
    (candidate) =>
      candidate.type === "status" &&
      candidate.action === "tick" &&
      candidate.statusType === "burn"
  );
  const repair = events.find(
    (candidate) =>
      candidate.type === "service" && candidate.sourceId === "atlas-field-repairs"
  );

  assert.ok(burn);
  assert.ok(repair);
  assert.notEqual(burn.id, repair.id);
  assert.equal(burn.targetId, enemy.id);
  assert.equal(burn.damage, 10);
  assert.equal(repair.targetId, enemy.id);
  assert.equal(repair.sourceKind, "commander-passive");
  assert.equal(repair.hpRecovered, 10);
  assert.equal(system.state.enemy.units[0].current.hp, 50);
});

test("lethal Glass Fuel Lines damage remains journaled before unit removal", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 2, {
    current: { hp: 1 }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 2);
  const state = createTestBattleState({
    playerUnits: [runner],
    enemyUnits: [enemy],
    activeSide: TURN_SIDES.ENEMY,
    mode: BATTLE_MODES.RUN
  });
  state.runCards = { ownedCardIds: ["glass-fuel-lines"] };
  state.enemyTurn = {
    started: true,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [],
    pendingReinforcementDeployments: [],
    plannedActions: [],
    plannedPendingUnitIdsKey: "",
    forcePassed: false
  };
  const system = new BattleSystem(state);

  system.finalizeEnemyTurn();
  const event = system
    .getSnapshot()
    .presentation.events.find(
      (candidate) =>
        candidate.type === "status" && candidate.sourceId === "glass-fuel-lines"
    );

  assert.ok(event);
  assert.equal(system.state.player.units.some((unit) => unit.id === runner.id), false);
  assert.equal(event.action, "effect-damage");
  assert.equal(event.targetId, runner.id);
  assert.equal(event.sourceKind, "run-card");
  assert.equal(event.damage, 1);
  assert.equal(event.killed, true);
});

test("lethal Blaze targets preserve destroyed metadata for power playback", () => {
  const player = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 1, {
    current: { hp: 5 }
  });
  const state = createTestBattleState({ playerUnits: [player], enemyUnits: [enemy] });
  state.player.commanderId = "blaze";
  state.player.charge = getCommanderPowerMax("blaze");
  const system = new BattleSystem(state);

  assert.equal(system.activatePower(), true);
  const target = system
    .getLastPowerResult()
    .targets.find((candidate) => candidate.unitId === enemy.id);

  assert.ok(target);
  assert.equal(target.pulse, "damage");
  assert.equal(target.amount, 10);
  assert.equal(target.label, "BURN");
  assert.equal(target.destroyed, true);
});
