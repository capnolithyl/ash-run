import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_KEYS } from "../src/game/core/constants.js";
import { TUTORIAL_IDS } from "../src/game/content/tutorial.js";
import {
  getMapById,
  MAP_POOL,
  replaceCustomMaps,
  RUN_MAP_POOL,
  upsertCustomMap
} from "../src/game/content/maps.js";

test.afterEach(() => {
  replaceCustomMaps([]);
});

test("maps registry loads every JSON map file from the maps folder", async () => {
  const mapsDir = path.resolve("src/game/content/maps");
  const fileNames = (await fs.readdir(mapsDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));

  assert.equal(MAP_POOL.length, fileNames.length);
  assert.deepEqual(
    MAP_POOL.map((mapDefinition) => fileNames.find((fileName) => fileName === `${mapDefinition.id}.json`)),
    fileNames
  );
});

test("getMapById resolves both base maps and run variants", () => {
  const baseMap = MAP_POOL[0];
  const runMap = RUN_MAP_POOL.find((mapDefinition) => mapDefinition.id === `${baseMap.id}-run`);

  assert.ok(baseMap);
  assert.ok(runMap);
  assert.equal(getMapById(baseMap.id)?.id, baseMap.id);
  assert.equal(getMapById(runMap.id)?.id, runMap.id);
});

test("tutorial map stays outside skirmish and run map pools", () => {
  assert.equal(MAP_POOL.some((mapDefinition) => mapDefinition.id === TUTORIAL_IDS.MAP), false);
  assert.equal(RUN_MAP_POOL.some((mapDefinition) => mapDefinition.id === TUTORIAL_IDS.MAP), false);
  assert.equal(RUN_MAP_POOL.some((mapDefinition) => mapDefinition.id === `${TUTORIAL_IDS.MAP}-run`), false);
  assert.equal(getMapById(TUTORIAL_IDS.MAP), undefined);
});

test("run map pool strips player production buildings while preserving enemy production sites", () => {
  const runMap = RUN_MAP_POOL.find((mapDefinition) => {
    const baseMap = MAP_POOL.find((candidate) => candidate.id === mapDefinition.id.replace(/-run$/, ""));

    return (
      baseMap?.buildings.some(
        (building) =>
          building.owner === "player" &&
          [BUILDING_KEYS.BARRACKS, BUILDING_KEYS.MOTOR_POOL, BUILDING_KEYS.AIRFIELD].includes(
            building.type
          )
      ) &&
      mapDefinition.buildings.some(
        (building) =>
          building.owner === "enemy" &&
          [BUILDING_KEYS.BARRACKS, BUILDING_KEYS.MOTOR_POOL, BUILDING_KEYS.AIRFIELD].includes(
            building.type
          )
      )
    );
  });

  assert.ok(runMap);
  assert.equal(
    runMap.buildings.some(
      (building) =>
        building.owner === "player" &&
        [BUILDING_KEYS.BARRACKS, BUILDING_KEYS.MOTOR_POOL, BUILDING_KEYS.AIRFIELD].includes(
          building.type
        )
    ),
    false
  );
  assert.equal(
    runMap.buildings.some(
      (building) =>
        building.owner === "enemy" &&
        [BUILDING_KEYS.BARRACKS, BUILDING_KEYS.MOTOR_POOL, BUILDING_KEYS.AIRFIELD].includes(
          building.type
        )
    ),
    true
  );
});

test("custom maps merge into the live registry and create run variants immediately", () => {
  replaceCustomMaps([
    {
      id: "custom-district",
      name: "Custom District",
      theme: "ash",
      width: 8,
      height: 8
    }
  ]);

  assert.ok(MAP_POOL.some((mapDefinition) => mapDefinition.id === "custom-district"));
  assert.ok(RUN_MAP_POOL.some((mapDefinition) => mapDefinition.id === "custom-district-run"));
  assert.equal(getMapById("custom-district")?.name, "Custom District");
  assert.equal(getMapById("custom-district-run")?.name, "Custom District (Run)");
});

test("upserting the same custom map id replaces the previous registry entry", () => {
  upsertCustomMap({
    id: "custom-district",
    name: "Custom District",
    theme: "ash",
    width: 8,
    height: 8
  });
  upsertCustomMap({
    id: "custom-district",
    name: "Custom District Redux",
    theme: "ash",
    width: 10,
    height: 6
  });

  const matchingMaps = MAP_POOL.filter((mapDefinition) => mapDefinition.id === "custom-district");

  assert.equal(matchingMaps.length, 1);
  assert.equal(matchingMaps[0].name, "Custom District Redux");
  assert.equal(matchingMaps[0].width, 10);
  assert.equal(matchingMaps[0].height, 6);
});
