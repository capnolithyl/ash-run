import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BUILDING_KEYS } from "../src/game/core/constants.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { TERRAIN_LIBRARY } from "../src/game/content/terrain.js";
import {
  SPRITE_ASSETS,
  getBuildingSpriteKey,
  getTerrainSpriteKey,
  getUnitSpriteKey
} from "../src/game/phaser/assets.js";

function resolveSpritePath(url) {
  return path.resolve(process.cwd(), url.replace(/^\.\//, ""));
}

test("sprite manifest covers all active unit, terrain, and building content", () => {
  for (const unitTypeId of Object.keys(UNIT_CATALOG)) {
    assert.ok(getUnitSpriteKey(unitTypeId), `missing unit sprite key for ${unitTypeId}`);
  }

  for (const terrainId of Object.keys(TERRAIN_LIBRARY)) {
    assert.ok(getTerrainSpriteKey(terrainId), `missing terrain sprite key for ${terrainId}`);
  }

  for (const buildingTypeId of Object.values(BUILDING_KEYS)) {
    assert.ok(
      getBuildingSpriteKey(buildingTypeId),
      `missing building sprite key for ${buildingTypeId}`
    );
  }
});

test("sprite manifest points at files that ship with the repo", () => {
  for (const asset of SPRITE_ASSETS) {
    assert.ok(fs.existsSync(resolveSpritePath(asset.url)), `missing sprite file: ${asset.url}`);
  }
});
