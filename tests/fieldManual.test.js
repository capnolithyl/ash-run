import test from "node:test";
import assert from "node:assert/strict";
import { buildFieldManual, searchFieldManual } from "../src/game/content/fieldManual.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { COMMANDERS } from "../src/game/content/commanders.js";
import { BUILDING_KEYS } from "../src/game/core/constants.js";
import { MAP_GOAL_ORDER } from "../src/game/content/mapGoals.js";
import { REINFORCEMENT_TRIGGER_ORDER } from "../src/game/content/reinforcements.js";
import { RUN_CARD_TYPES, RUN_UPGRADES } from "../src/game/content/runUpgrades.js";
import { TERRAIN_LIBRARY } from "../src/game/content/terrain.js";

test("field manual provides fourteen stable sections", () => {
  const manual = buildFieldManual();
  assert.equal(manual.length, 14);
  assert.deepEqual(manual.map((section) => section.id), [
    "quick-start", "controls", "turn-flow", "units", "weapons", "terrain", "buildings",
    "combat-math", "support-transport", "missions", "commanders", "statuses", "progression", "run-upgrades"
  ]);
});

test("field manual covers every current unit and commander exactly once", () => {
  const manual = buildFieldManual();
  const unitEntries = manual.find((section) => section.id === "units").entries;
  const commanderEntries = manual.find((section) => section.id === "commanders").entries;
  assert.equal(unitEntries.length, Object.keys(UNIT_CATALOG).length);
  assert.equal(new Set(unitEntries.map((entry) => entry.id)).size, unitEntries.length);
  assert.equal(commanderEntries.length, COMMANDERS.length);
  assert.equal(new Set(commanderEntries.map((entry) => entry.id)).size, COMMANDERS.length);
});

test("Carrier and Run persistence are described from current behavior", () => {
  const manual = buildFieldManual();
  const carrier = manual.find((section) => section.id === "units").entries.find((entry) => entry.id === "unit-carrier");
  const run = manual.find((section) => section.id === "progression").entries.find((entry) => entry.id === "run-structure");
  assert.match(`${carrier.summary} ${carrier.details.join(" ")}`, /scenario\/enemy-only/i);
  assert.match(carrier.details.join(" "), /not a troop transport/i);
  assert.match(run.details.join(" "), /HP, ammo, and stamina refresh/i);
  assert.match(run.summary, /10 maps/i);
});

test("manual catalog sections exactly cover terrain, buildings, missions, upgrades, and reinforcement triggers", () => {
  const sections = Object.fromEntries(buildFieldManual().map((section) => [section.id, section]));
  assert.deepEqual(
    sections.terrain.entries.map((entry) => entry.id),
    Object.keys(TERRAIN_LIBRARY).map((id) => `terrain-${id}`)
  );
  assert.deepEqual(
    sections.buildings.entries.slice(1).map((entry) => entry.id),
    Object.values(BUILDING_KEYS).map((id) => `building-${id}`)
  );
  assert.deepEqual(
    sections.missions.entries.map((entry) => entry.id),
    MAP_GOAL_ORDER.map((id) => `mission-${id}`)
  );

  const expectedUpgrades = RUN_UPGRADES
    .filter((upgrade) => !upgrade.hidden && [RUN_CARD_TYPES.PASSIVE, RUN_CARD_TYPES.GEAR].includes(upgrade.type))
    .map((upgrade) => `upgrade-${upgrade.id}`);
  const expectedReinforcements = REINFORCEMENT_TRIGGER_ORDER.map((id) => `reinforcement-${id}`);
  assert.deepEqual(sections["run-upgrades"].entries.map((entry) => entry.id), [
    ...expectedUpgrades,
    ...expectedReinforcements
  ]);
});

test("manual search indexes aliases, details, and filters", () => {
  const manual = buildFieldManual();
  const carrierResults = searchFieldManual(manual, "carrier");
  assert.ok(carrierResults.some((section) => section.entries.some((entry) => entry.id === "unit-carrier")));
  const missionResults = searchFieldManual(manual, "", "missions");
  assert.equal(missionResults.length, 1);
  assert.equal(missionResults[0].entries.length, 5);
});
