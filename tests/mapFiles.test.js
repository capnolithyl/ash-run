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

test("map file listing is recursive, skips invalid json, and preserves relative paths", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-map-files-"));
  const nestedDir = path.join(tempRoot, "crossfire-creek");
  const invalidPath = path.join(tempRoot, "broken.json");
  const validPath = path.join(nestedDir, "crossfire-creek-stage-1.json");

  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(validPath, JSON.stringify({
    id: "crossfire-creek-stage-1",
    name: "Crossfire Creek",
    width: 10,
    height: 10,
    variantStage: 1,
    runStages: [1],
    goal: { type: "rout" },
    tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "plain")),
    buildings: []
  }), "utf8");
  await fs.writeFile(invalidPath, "{", "utf8");

  try {
    const result = await listLoadableMapFiles(tempRoot, fs, { warn() {} });

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].relativePath, "crossfire-creek/crossfire-creek-stage-1.json");
    assert.equal(result.entries[0].name, "Crossfire Creek");
    assert.equal(result.entries[0].variantStage, 1);
    assert.equal(result.entries[0].previewMap.width, 10);
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

test("preferred map root uses bundled maps in dev and user maps when packaged", () => {
  assert.equal(
    resolvePreferredMapRoot({
      isPackaged: false,
      customMapsRoot: "D:/docs/maps",
      bundledMapsRoot: "D:/repo/src/game/content/maps"
    }),
    "D:/repo/src/game/content/maps"
  );
  assert.equal(
    resolvePreferredMapRoot({
      isPackaged: true,
      customMapsRoot: "D:/docs/maps",
      bundledMapsRoot: "D:/repo/src/game/content/maps"
    }),
    "D:/docs/maps"
  );
});
