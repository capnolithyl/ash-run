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
  getUnitSpriteDefinition,
  getUnitSpriteKey
} from "../src/game/phaser/assets.js";

function resolveSpritePath(url) {
  return path.resolve(process.cwd(), url.replace(/^\.\//, ""));
}

function collectSpriteFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      return collectSpriteFiles(entryPath);
    }

    return entry.isFile() && [".svg", ".png"].includes(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function isSourceMasterSprite(filePath) {
  if (path.extname(filePath) !== ".svg") {
    return false;
  }

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

function isTerrainFormatFallbackSprite(filePath) {
  const relativePath = path.relative(path.resolve(process.cwd(), "assets/sprites"), filePath);
  const parts = relativePath.split(path.sep);

  if (parts.length !== 2 || parts[0] !== "terrain") {
    return false;
  }

  const terrainId = path.basename(parts[1], path.extname(parts[1]));

  if (!(terrainId in TERRAIN_LIBRARY)) {
    return false;
  }

  const svgPath = path.resolve(process.cwd(), "assets/sprites", "terrain", `${terrainId}.svg`);
  const pngPath = path.resolve(process.cwd(), "assets/sprites", "terrain", `${terrainId}.png`);

  return fs.existsSync(svgPath) && fs.existsSync(pngPath);
}

function isBuildingFormatFallbackSprite(filePath) {
  const relativePath = path.relative(path.resolve(process.cwd(), "assets/sprites"), filePath);
  const parts = relativePath.split(path.sep);

  if (parts.length !== 3 || parts[0] !== "buildings") {
    return false;
  }

  const owner = parts[1];
  const buildingTypeId = path.basename(parts[2], path.extname(parts[2]));

  if (!BUILDING_OWNER_VARIANTS.includes(owner) || !Object.values(BUILDING_KEYS).includes(buildingTypeId)) {
    return false;
  }

  const svgPath = path.resolve(process.cwd(), "assets/sprites", "buildings", owner, `${buildingTypeId}.svg`);
  const pngPath = path.resolve(process.cwd(), "assets/sprites", "buildings", owner, `${buildingTypeId}.png`);

  return fs.existsSync(svgPath) && fs.existsSync(pngPath);
}

function isWorkingSpriteSource(filePath) {
  const relativePath = path.relative(path.resolve(process.cwd(), "assets/sprites"), filePath);
  const parts = relativePath.split(path.sep);

  if (parts.length !== 2 || parts[0] !== "terrain") {
    return false;
  }

  return path.basename(parts[1]).startsWith("_");
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

test("terrain sprites prefer png when both png and svg exist", () => {
  for (const terrainId of Object.keys(TERRAIN_LIBRARY)) {
    const pngPath = path.resolve(process.cwd(), "assets/sprites/terrain", `${terrainId}.png`);
    const svgPath = path.resolve(process.cwd(), "assets/sprites/terrain", `${terrainId}.svg`);
    const asset = SPRITE_ASSETS.find((candidate) => candidate.group === "terrain" && candidate.id === terrainId);

    assert.ok(asset, `missing terrain asset for ${terrainId}`);

    if (fs.existsSync(pngPath) && fs.existsSync(svgPath)) {
      assert.equal(asset.type, "image");
      assert.equal(asset.url, `./assets/sprites/terrain/${terrainId}.png`);
    }
  }
});

test("building sprites prefer png when both png and svg exist", () => {
  for (const buildingTypeId of Object.values(BUILDING_KEYS)) {
    for (const owner of BUILDING_OWNER_VARIANTS) {
      const pngPath = path.resolve(
        process.cwd(),
        "assets/sprites/buildings",
        owner,
        `${buildingTypeId}.png`
      );
      const svgPath = path.resolve(
        process.cwd(),
        "assets/sprites/buildings",
        owner,
        `${buildingTypeId}.svg`
      );
      const asset = SPRITE_ASSETS.find(
        (candidate) =>
          candidate.group === "buildings" &&
          candidate.id === buildingTypeId &&
          candidate.owner === owner
      );

      assert.ok(asset, `missing building asset for ${owner} ${buildingTypeId}`);

      if (fs.existsSync(pngPath) && fs.existsSync(svgPath)) {
        assert.equal(asset.type, "image");
        assert.equal(asset.url, `./assets/sprites/buildings/${owner}/${buildingTypeId}.png`);
      }
    }
  }
});

test("unit sprite sheets are preferred over static fallbacks when present", () => {
  const bruiserSheetPath = path.resolve(process.cwd(), "assets/sprites/units/player/bruiser/bruiser-idle.png");

  if (!fs.existsSync(bruiserSheetPath)) {
    return;
  }

  const spriteDefinition = getUnitSpriteDefinition("bruiser", "player");

  assert.equal(spriteDefinition.type, "spritesheet");
  assert.equal(spriteDefinition.fallbackKey, getUnitSpriteKey("bruiser", "player"));
  assert.equal(spriteDefinition.idle.key, "spritesheet:units:player:bruiser:idle");
  assert.equal(spriteDefinition.idle.frameCount, 3);
  assert.deepEqual(spriteDefinition.idle.ranges.default, { start: 0, end: 2 });
});

test("unit animation manifest supports owner-specific omissions and directional attacks", () => {
  const playerGruntDefinition = getUnitSpriteDefinition("grunt", "player");
  const enemyGruntDefinition = getUnitSpriteDefinition("grunt", "enemy");

  assert.equal(playerGruntDefinition.idle, null);
  assert.equal(playerGruntDefinition.fallbackUrl, "./assets/sprites/units/player/grunt.svg");
  assert.ok(playerGruntDefinition.attack);
  assert.deepEqual(playerGruntDefinition.attack.ranges.left, { start: 0, end: 2 });
  assert.deepEqual(playerGruntDefinition.attack.ranges.right, { start: 3, end: 5 });
  assert.equal(enemyGruntDefinition.idle.key, "spritesheet:units:enemy:grunt:idle");
  assert.equal(enemyGruntDefinition.idle.frameCount, 2);
});

test("sprite folders only contain manifest assets or documented source masters", () => {
  const manifestPaths = new Set(SPRITE_ASSETS.map((asset) => resolveSpritePath(asset.url)));
  const spriteFiles = collectSpriteFiles(path.resolve(process.cwd(), "assets/sprites"));

  for (const filePath of spriteFiles) {
    assert.ok(
      manifestPaths.has(filePath) ||
        isSourceMasterSprite(filePath) ||
        isTerrainFormatFallbackSprite(filePath) ||
        isBuildingFormatFallbackSprite(filePath) ||
        isWorkingSpriteSource(filePath),
      `untracked sprite file: ${path.relative(process.cwd(), filePath)}`
    );
  }
});
