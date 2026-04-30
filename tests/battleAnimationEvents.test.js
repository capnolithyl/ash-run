import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_ATTACK_WINDOW_MS, TURN_SIDES } from "../src/game/core/constants.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { deriveBattleAnimationEvents } from "../src/game/phaser/view/battleAnimationEvents.js";
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
