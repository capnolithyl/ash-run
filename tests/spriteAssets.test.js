import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BUILDING_KEYS } from "../src/game/core/constants.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { TERRAIN_LIBRARY } from "../src/game/content/terrain.js";
import {
  BUILDING_OWNER_VARIANTS,
  SPRITE_ASSETS,
  UNIT_OWNER_VARIANTS,
  getBuildingSpriteKey,
  getTerrainSpriteKey,
  getUnitSpriteKey
} from "../src/game/phaser/assets.js";

function resolveSpritePath(url) {
  return path.resolve(process.cwd(), url.replace(/^\.\//, ""));
}

function collectSvgFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      return collectSvgFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(".svg") ? [entryPath] : [];
  });
}

function isSourceMasterSprite(filePath) {
  const relativePath = path.relative(path.resolve(process.cwd(), "assets/sprites"), filePath);
  const parts = relativePath.split(path.sep);

  if (parts.length !== 2 || !["units", "buildings"].includes(parts[0])) {
    return false;
  }

  const assetId = path.basename(parts[1], ".svg");
  const activeIds =
    parts[0] === "units" ? Object.keys(UNIT_CATALOG) : Object.values(BUILDING_KEYS);
  const expectedOwners = parts[0] === "units" ? UNIT_OWNER_VARIANTS : BUILDING_OWNER_VARIANTS;

  return (
    activeIds.includes(assetId) &&
    expectedOwners.every((owner) =>
      fs.existsSync(path.resolve(process.cwd(), "assets/sprites", parts[0], owner, `${assetId}.svg`))
    )
  );
}

test("sprite manifest covers all active unit, terrain, and building content", () => {
  for (const unitTypeId of Object.keys(UNIT_CATALOG)) {
    for (const owner of UNIT_OWNER_VARIANTS) {
      assert.ok(
        getUnitSpriteKey(unitTypeId, owner),
        `missing ${owner} unit sprite key for ${unitTypeId}`
      );
    }
  }

  for (const terrainId of Object.keys(TERRAIN_LIBRARY)) {
    assert.ok(getTerrainSpriteKey(terrainId), `missing terrain sprite key for ${terrainId}`);
  }

  for (const buildingTypeId of Object.values(BUILDING_KEYS)) {
    for (const owner of BUILDING_OWNER_VARIANTS) {
      assert.ok(
        getBuildingSpriteKey(buildingTypeId, owner),
        `missing ${owner} building sprite key for ${buildingTypeId}`
      );
    }
  }
});

test("sprite manifest points at files that ship with the repo", () => {
  for (const asset of SPRITE_ASSETS) {
    assert.ok(fs.existsSync(resolveSpritePath(asset.url)), `missing sprite file: ${asset.url}`);
  }
});

test("sprite folders only contain manifest assets or documented source masters", () => {
  const manifestPaths = new Set(SPRITE_ASSETS.map((asset) => resolveSpritePath(asset.url)));
  const spriteFiles = collectSvgFiles(path.resolve(process.cwd(), "assets/sprites"));

  for (const filePath of spriteFiles) {
    assert.ok(
      manifestPaths.has(filePath) || isSourceMasterSprite(filePath),
      `untracked sprite file: ${path.relative(process.cwd(), filePath)}`
    );
  }
});
