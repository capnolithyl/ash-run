import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  listLoadableMapFiles,
  loadMapFileFromRoot,
  resolvePreferredMapRoot
} = require("../electron/mapFiles.cjs");

test("map file listing expands bundles, keeps legacy maps, and skips invalid json", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-map-files-"));
  const nestedDir = path.join(tempRoot, "crossfire-creek");
  const legacyDir = path.join(tempRoot, "stone-citadel");
  const invalidPath = path.join(tempRoot, "broken.json");
  const bundlePath = path.join(nestedDir, "crossfire-creek.json");
  const legacyPath = path.join(legacyDir, "stone-citadel-stage-1.json");

  await fs.mkdir(nestedDir, { recursive: true });
  await fs.mkdir(legacyDir, { recursive: true });
  await fs.writeFile(bundlePath, JSON.stringify({
    format: "ash-run-map-bundle-v1",
    id: "crossfire-creek",
    name: "Crossfire Creek",
    stages: [1, 3].map((stage) => ({
      id: `crossfire-creek-stage-${stage}`,
      name: "Crossfire Creek",
      width: 10,
      height: 10,
      stage,
      variantStage: stage,
      runStages: [stage],
      goal: { type: "rout" },
      tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "plain")),
      buildings: []
    }))
  }), "utf8");
  await fs.writeFile(legacyPath, JSON.stringify({
    id: "stone-citadel-stage-1",
    name: "Stone Citadel",
    width: 8,
    height: 8,
    variantStage: 1,
    runStages: [1],
    goal: { type: "rout" },
    tiles: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "plain")),
    buildings: []
  }), "utf8");
  await fs.writeFile(invalidPath, "{", "utf8");

  try {
    const result = await listLoadableMapFiles(tempRoot, fs, { warn() {} });

    assert.deepEqual(
      result.entries.map((entry) => entry.relativePath).sort(),
      [
        "crossfire-creek/crossfire-creek.json?stage=1",
        "crossfire-creek/crossfire-creek.json?stage=3",
        "stone-citadel/stone-citadel-stage-1.json"
      ]
    );
    assert.equal(
      result.entries.find((entry) => entry.relativePath.endsWith("?stage=3")).variantStage,
      3
    );
    assert.equal(
      result.entries.find((entry) => entry.name === "Stone Citadel").previewMap.width,
      8
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("map file loading resolves inside the preferred root and returns metadata", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-map-load-"));
  const validPath = path.join(tempRoot, "crossfire-creek.json");

  await fs.writeFile(validPath, JSON.stringify({
    id: "crossfire-creek",
    name: "Crossfire Creek",
    width: 8,
    height: 8,
    goal: { type: "rout" },
    tiles: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "plain")),
    buildings: []
  }), "utf8");

  try {
    const result = await loadMapFileFromRoot(tempRoot, "crossfire-creek.json", fs);

    assert.match(result.filePath, /crossfire-creek\.json$/);
    assert.equal(result.metadata.relativePath, "crossfire-creek.json");
    assert.equal(JSON.parse(result.text).name, "Crossfire Creek");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("map file loading returns bundle text with selected stage metadata", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-map-bundle-load-"));
  const nestedDir = path.join(tempRoot, "crossfire-creek");
  const validPath = path.join(nestedDir, "crossfire-creek.json");

  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(validPath, JSON.stringify({
    format: "ash-run-map-bundle-v1",
    id: "crossfire-creek",
    name: "Crossfire Creek",
    stages: [1, 2].map((stage) => ({
      id: `crossfire-creek-stage-${stage}`,
      name: "Crossfire Creek",
      stage,
      variantStage: stage,
      runStages: [stage],
      width: 8,
      height: 8,
      goal: { type: "rout" },
      tiles: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "plain")),
      buildings: []
    }))
  }), "utf8");

  try {
    const result = await loadMapFileFromRoot(
      tempRoot,
      "crossfire-creek/crossfire-creek.json?stage=2",
      fs
    );
    const parsed = JSON.parse(result.text);

    assert.equal(parsed.format, "ash-run-map-bundle-v1");
    assert.equal(result.metadata.relativePath, "crossfire-creek/crossfire-creek.json?stage=2");
    assert.equal(result.metadata.variantStage, 2);
    assert.equal(result.metadata.previewMap.width, 8);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("preferred map root uses bundled maps in dev and packaged resources in packaged builds", () => {
  assert.equal(
    resolvePreferredMapRoot({
      isPackaged: false,
      customMapsRoot: "D:/docs/maps",
      bundledMapsRoot: "D:/repo/src/game/content/maps",
      packagedMapsRoot: "D:/game/resources/maps"
    }),
    "D:/repo/src/game/content/maps"
  );
  assert.equal(
    resolvePreferredMapRoot({
      isPackaged: true,
      customMapsRoot: "D:/docs/maps",
      bundledMapsRoot: "D:/repo/src/game/content/maps",
      packagedMapsRoot: "D:/game/resources/maps"
    }),
    "D:/game/resources/maps"
  );
});
