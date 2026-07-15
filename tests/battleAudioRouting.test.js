import test from "node:test";
import assert from "node:assert/strict";
import {
  createBattleCueContext,
  getBattlefieldPan,
  getImpactCueIds,
  getMovementCueId,
  getNewBattlePresentationEvents,
  getPresentationEventCueId,
  getServiceCueId,
  getWeaponCueId
} from "../src/game/phaser/view/battleAudioRouting.js";
import { getCommanderPowerDestroyDelayMs } from "../src/game/phaser/scenes/battleScene/renderBoard.js";

test("battlefield pan is centered and conservatively capped", () => {
  assert.equal(getBattlefieldPan(0, 9), -0.35);
  assert.equal(getBattlefieldPan(4, 9), 0);
  assert.equal(getBattlefieldPan(8, 9), 0.35);
  assert.equal(getBattlefieldPan(99, 9), 0.35);
});

test("movement and strike metadata select stable cue IDs", () => {
  assert.equal(getMovementCueId("grunt"), "movement.infantry");
  assert.equal(getMovementCueId("runner"), "movement.vehicle");
  assert.equal(getMovementCueId("juggernaut"), "movement.tracked");
  assert.equal(getMovementCueId("gunship"), "movement.air");
  assert.equal(getWeaponCueId({ profile: "secondary" }), "weapon.secondary");
  assert.equal(getWeaponCueId({ profile: "gear-aa" }), "weapon.aa");
  assert.equal(getWeaponCueId({ profile: "primary", weaponClass: "heavy_cannon" }), "weapon.heavy_cannon");
  assert.deepEqual(getImpactCueIds({ damage: 8, isCrit: true, isEffective: true }), ["impact.hit", "impact.crit"]);
  assert.deepEqual(getImpactCueIds({ damage: 2, isGlance: true }), ["impact.hit", "impact.glance"]);
  assert.deepEqual(getImpactCueIds({ damage: 0 }), ["impact.miss"]);
});

test("service, transport, status, and mission events route by authoritative cause", () => {
  assert.equal(getServiceCueId({ sourceKind: "medic" }), "support.medic");
  assert.equal(
    getServiceCueId({ sourceKind: "building", buildingType: "repair-station" }),
    "support.repair-station"
  );
  assert.equal(getPresentationEventCueId({ type: "transport", action: "board" }), "transport.board");
  assert.equal(getPresentationEventCueId({ type: "status", action: "extinguish" }), "world.extinguish");
  assert.equal(getPresentationEventCueId({ type: "status", action: "tick" }), "world.status-damage");
  assert.equal(
    getPresentationEventCueId({ type: "status", action: "apply", statusType: "burn" }),
    "world.burn"
  );
  assert.equal(
    getPresentationEventCueId({ type: "status", action: "apply", statusType: "corrupted" }),
    "world.status-damage"
  );
  assert.equal(
    getPresentationEventCueId({ type: "status", action: "apply", statusType: "zombified" }),
    "world.status-damage"
  );
  assert.equal(getPresentationEventCueId({ type: "mission", action: "drop-off" }), "world.drop-off");
});

test("weapon cues pan from the attacker while impacts pan at the target", () => {
  const snapshot = { id: "battle-pan", map: { width: 9 } };
  const event = { id: 12, fromX: 0, toX: 8 };

  assert.equal(createBattleCueContext(event, snapshot, "weapon").pan, -0.35);
  assert.equal(createBattleCueContext(event, snapshot, "impact").pan, 0.35);
});

test("lethal commander targets wait for their power pulse before destruction", () => {
  assert.equal(
    getCommanderPowerDestroyDelayMs(
      { pulseDurationMs: 620 },
      { unitId: "enemy-1", destroyed: true }
    ),
    620
  );
  assert.equal(
    getCommanderPowerDestroyDelayMs(
      { pulseDurationMs: 620 },
      { unitId: "enemy-2", destroyed: false }
    ),
    null
  );
});

test("journal consumption only returns newly appended IDs and builds dedupe context", () => {
  const previous = {
    id: "battle-1",
    map: { id: "map-1", width: 6 },
    presentation: { events: [{ id: 4, type: "service" }] }
  };
  const next = {
    id: "battle-1",
    map: { id: "map-1", width: 6 },
    presentation: {
      events: [
        { id: 4, type: "service" },
        { id: 5, type: "transport", action: "unload", x: 5 }
      ]
    }
  };
  const events = getNewBattlePresentationEvents(previous, next);

  assert.deepEqual(events.map((event) => event.id), [5]);
  assert.deepEqual(createBattleCueContext(events[0], next, "transport"), {
    dedupeKey: "battle-1:transport:5",
    eventId: 5,
    pan: 0.35,
    source: "transport"
  });

  assert.deepEqual(getNewBattlePresentationEvents(null, next), []);
  assert.deepEqual(
    getNewBattlePresentationEvents(previous, { ...next, id: "battle-2" }),
    []
  );
});
