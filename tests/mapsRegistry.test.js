import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_KEYS } from "../src/game/core/constants.js";
import { expandMapBundleDefinitions } from "../src/game/content/mapEditor.js";
import { TUTORIAL_IDS } from "../src/game/content/tutorial.js";
import {
  getMapById,
  getRunMapPoolForStage,
  getSandboxMapFamilies,
  getSandboxMapSelection,
  MAP_POOL,
  replaceCustomMaps,
  resolveSandboxMapId,
  RUN_MAP_POOL,
  upsertCustomMap
} from "../src/game/content/maps.js";

async function collectBundledMapDefinitions(rootDirectory) {
  const directoryEntries = await fs.readdir(rootDirectory, { withFileTypes: true });
  const mapDefinitions = [];

  for (const entry of directoryEntries) {
    const entryPath = path.join(rootDirectory, entry.name);

    if (entry.isDirectory()) {
      mapDefinitions.push(...(await collectBundledMapDefinitions(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      const parsed = JSON.parse(await fs.readFile(entryPath, "utf8"));
      mapDefinitions.push(...expandMapBundleDefinitions(parsed));
    }
  }

  return mapDefinitions.sort((left, right) => left.id.localeCompare(right.id));
}

test.afterEach(() => {
  replaceCustomMaps([]);
});

test("maps registry loads every JSON map file from the maps folder", async () => {
  const mapsDir = path.resolve("src/game/content/maps");
  const mapDefinitions = await collectBundledMapDefinitions(mapsDir);

  assert.deepEqual(
    MAP_POOL.map((mapDefinition) => mapDefinition.id).sort(),
    mapDefinitions.map((mapDefinition) => mapDefinition.id)
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

test("Cauldron early stages sustain reinforcement pressure through the survival clock", () => {
  const expectedScheduledUnits = [12, 18, 14, 16, 16, 16];

  const actualScheduledUnits = expectedScheduledUnits.map((_, index) => {
    const map = getMapById(`cauldron-stage-${index + 1}`);
    const completedPlayerTurns = map.goal.turnLimit - 1;

    return map.reinforcements
      .filter((wave) => wave.trigger.type === "player-turns-completed")
      .reduce((total, wave) => {
        const activations = Math.min(
          wave.maxActivations,
          Math.floor(completedPlayerTurns / wave.trigger.every)
        );

        return total + activations * wave.units.length;
      }, 0);
  });

  assert.deepEqual(actualScheduledUnits, expectedScheduledUnits);
});

test("sandbox map families group staged variants and resolve exact non-contiguous stages", () => {
  const mapPool = [
    {
      id: "field-test-stage-2",
      name: "Field Test",
      width: 8,
      height: 6,
      variantStage: 2,
      runStages: [2]
    },
    {
      id: "field-test-stage-5",
      name: "Field Test",
      width: 10,
      height: 7,
      variantStage: 5,
      runStages: [5]
    },
    {
      id: "solo-map",
      name: "Solo Map",
      width: 6,
      height: 6
    }
  ];

  assert.deepEqual(getSandboxMapFamilies(mapPool), [
    {
      id: "field-test",
      name: "Field Test",
      stages: [
        { stage: 2, mapId: "field-test-stage-2", width: 8, height: 6 },
        { stage: 5, mapId: "field-test-stage-5", width: 10, height: 7 }
      ]
    },
    {
      id: "solo-map",
      name: "Solo Map",
      stages: [{ stage: 1, mapId: "solo-map", width: 6, height: 6 }]
    }
  ]);
  assert.equal(resolveSandboxMapId("field-test", 5, mapPool), "field-test-stage-5");
  assert.equal(resolveSandboxMapId("field-test", 3, mapPool), null);
  assert.deepEqual(getSandboxMapSelection("field-test-stage-5-run", mapPool), {
    familyId: "field-test",
    stage: 5,
    mapId: "field-test-stage-5"
  });
  assert.deepEqual(getSandboxMapSelection("missing-map", mapPool), {
    familyId: "field-test",
    stage: 2,
    mapId: "field-test-stage-2"
  });
});

test("tutorial map stays outside skirmish and run map pools", () => {
  assert.equal(MAP_POOL.some((mapDefinition) => mapDefinition.id === TUTORIAL_IDS.MAP), false);
  assert.equal(RUN_MAP_POOL.some((mapDefinition) => mapDefinition.id === TUTORIAL_IDS.MAP), false);
  assert.equal(RUN_MAP_POOL.some((mapDefinition) => mapDefinition.id === `${TUTORIAL_IDS.MAP}-run`), false);
  assert.equal(getMapById(TUTORIAL_IDS.MAP), undefined);
});

test("run map pool strips owned production buildings while preserving neutral inert sites", () => {
  replaceCustomMaps([
    {
      id: "production-check",
      name: "Production Check",
      theme: "ash",
      width: 8,
      height: 8,
      buildings: [
        { id: "player-command", type: BUILDING_KEYS.COMMAND, owner: "player", x: 1, y: 1 },
        { id: "player-barracks", type: BUILDING_KEYS.BARRACKS, owner: "player", x: 2, y: 1 },
        { id: "enemy-motor", type: BUILDING_KEYS.MOTOR_POOL, owner: "enemy", x: 5, y: 1 },
        { id: "neutral-airfield", type: BUILDING_KEYS.AIRFIELD, owner: "neutral", x: 4, y: 4 }
      ]
    }
  ]);

  const runMap = RUN_MAP_POOL.find((mapDefinition) => mapDefinition.id === "production-check-run");

  assert.ok(runMap);
  assert.equal(runMap.buildings.some((building) => building.id === "player-barracks"), false);
  assert.equal(runMap.buildings.some((building) => building.id === "enemy-motor"), false);
  assert.deepEqual(
    runMap.buildings.find((building) => building.id === "neutral-airfield"),
    {
      id: "neutral-airfield",
      type: BUILDING_KEYS.AIRFIELD,
      owner: "neutral",
      x: 4,
      y: 4,
      canCapture: false
    }
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

test("custom map run variants preserve stage metadata for staged pools", () => {
  replaceCustomMaps([
    {
      id: "custom-district-stage-2",
      name: "Custom District",
      theme: "ash",
      width: 8,
      height: 8,
      runStages: [2, 3],
      variantStage: 2
    }
  ]);

  const runMap = getMapById("custom-district-stage-2-run");

  assert.ok(runMap);
  assert.deepEqual(runMap.runStages, [2, 3]);
  assert.equal(runMap.variantStage, 2);
  assert.equal(
    getRunMapPoolForStage(1).some((mapDefinition) => mapDefinition.id === "custom-district-stage-2-run"),
    false
  );
  assert.equal(
    getRunMapPoolForStage(2).some((mapDefinition) => mapDefinition.id === "custom-district-stage-2-run"),
    true
  );
});

test("custom map bundles expand into stage-specific runtime maps", () => {
  replaceCustomMaps([
    {
      format: "ash-run-map-bundle-v1",
      id: "bundle-district",
      name: "Bundle District",
      stages: [
        {
          id: "bundle-district-stage-1",
          name: "Bundle District",
          theme: "ash",
          width: 8,
          height: 8,
          stage: 1,
          variantStage: 1,
          runStages: [1]
        },
        {
          id: "bundle-district-stage-2",
          name: "Bundle District",
          theme: "ash",
          width: 8,
          height: 8,
          stage: 2,
          variantStage: 2,
          runStages: [2]
        }
      ]
    }
  ]);

  assert.ok(getMapById("bundle-district-stage-1"));
  assert.ok(getMapById("bundle-district-stage-2"));
  assert.ok(getMapById("bundle-district-stage-1-run"));
  assert.ok(getMapById("bundle-district-stage-2-run"));
  assert.equal(
    getRunMapPoolForStage(1).some((mapDefinition) => mapDefinition.id === "bundle-district-stage-2-run"),
    false
  );
  assert.equal(
    getRunMapPoolForStage(2).some((mapDefinition) => mapDefinition.id === "bundle-district-stage-2-run"),
    true
  );
});

test("custom map bundles override lingering single-stage duplicates", () => {
  replaceCustomMaps([
    {
      id: "duplicate-family-stage-2",
      name: "Duplicate Family",
      theme: "ash",
      width: 6,
      height: 6,
      variantStage: 2,
      runStages: [2]
    },
    {
      format: "ash-run-map-bundle-v1",
      id: "duplicate-family",
      name: "Duplicate Family",
      stages: [
        {
          id: "duplicate-family-stage-2",
          name: "Duplicate Family",
          theme: "ash",
          width: 10,
          height: 10,
          stage: 2,
          variantStage: 2,
          runStages: [2]
        }
      ]
    }
  ]);

  assert.equal(getMapById("duplicate-family-stage-2")?.width, 10);
});

test("legacy variantStage maps without runStages stay eligible only for that stage", () => {
  replaceCustomMaps([
    {
      id: "late-stage-only",
      name: "Late Stage Only",
      theme: "ash",
      width: 8,
      height: 8,
      variantStage: 10
    }
  ]);

  assert.equal(
    getRunMapPoolForStage(1).some((mapDefinition) => mapDefinition.id === "late-stage-only-run"),
    false
  );
  assert.equal(
    getRunMapPoolForStage(10).some((mapDefinition) => mapDefinition.id === "late-stage-only-run"),
    true
  );
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
