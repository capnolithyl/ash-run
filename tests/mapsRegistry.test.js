import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_KEYS } from "../src/game/core/constants.js";
import { getMapById, MAP_POOL, RUN_MAP_POOL } from "../src/game/content/maps.js";

test("maps registry loads every JSON map file from the maps folder", async () => {
  const mapsDir = path.resolve("src/game/content/maps");
  const fileNames = (await fs.readdir(mapsDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));

  assert.equal(MAP_POOL.length, fileNames.length);
  assert.deepEqual(
    MAP_POOL.map((mapDefinition) => `${mapDefinition.id}.json`),
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

test("run map pool strips player production buildings while preserving enemy production sites", () => {
  const runMap = RUN_MAP_POOL.find((mapDefinition) => mapDefinition.id === "ashline-crossing-run");

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
