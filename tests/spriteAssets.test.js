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
  UNIT_COLOR_VARIANTS,
  UNIT_OWNER_VARIANTS,
  getBuildingSpriteDefinition,
  getBuildingSpriteKey,
  getTerrainClusterVariantDefinition,
  getTerrainSpriteDefinition,
  getTerrainTransitionOverlayDefinition,
  getTerrainSpriteKey,
  getUnitSpriteDefinition,
  getUnitSpriteColorAvailability,
  getUnitSpriteKey,
  resolveUnitSpriteColor
} from "../src/game/phaser/assets.js";
import {
  GENERATED_UNIT_SPRITE_ANIMATIONS,
  GENERATED_UNIT_SPRITE_COLOR_AVAILABILITY
} from "../src/game/phaser/generated/unitSpriteAnimations.js";
import {
  ASSET_PRELOAD_MANIFEST
} from "../src/game/phaser/generated/assetPreloadManifest.js";

function resolveSpritePath(url) {
  return path.resolve(process.cwd(), url.replace(/^\.\//, ""));
}

function assertRuntimeSpriteAssetRegistered(url) {
  assert.ok(
    SPRITE_ASSETS.some((asset) => asset.url === url),
    `missing runtime sprite asset: ${url}`
  );
  assert.ok(
    ASSET_PRELOAD_MANIFEST.some((entry) => entry.url === url),
    `missing preload asset: ${url}`
  );
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
  const expectedOwners = parts[0] === "units" ? UNIT_COLOR_VARIANTS : BUILDING_OWNER_VARIANTS;

  return (
    activeIds.includes(assetId) &&
    expectedOwners.some((owner) =>
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

function isTerrainAnimationSprite(filePath) {
  const relativePath = path.relative(path.resolve(process.cwd(), "assets/sprites"), filePath);
  const parts = relativePath.split(path.sep);

  if (parts.length !== 3 || parts[0] !== "terrain" || path.extname(parts[2]) !== ".png") {
    return false;
  }

  const terrainId = parts[1];

  return terrainId in TERRAIN_LIBRARY && parts[2] === `${terrainId}.png`;
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

  if (parts.length < 2) {
    return false;
  }

  if (
    relativePath === path.join("terrain", "bridge.png") ||
    relativePath === path.join("terrain", "bridge_start.png")
  ) {
    return true;
  }

  return path.basename(filePath).startsWith("_");
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
    const terrainSprite = getTerrainSpriteDefinition(terrainId);

    assert.ok(terrainSprite, `missing terrain asset for ${terrainId}`);

    if (fs.existsSync(pngPath) && fs.existsSync(svgPath)) {
      assert.equal(terrainSprite.fallbackKey, `sprite:terrain:${terrainId}`);
      assert.equal(terrainSprite.fallbackUrl, `./assets/sprites/terrain/${terrainId}.png`);
    }
  }
});

test("terrain animation folders take priority over the static fallback", () => {
  const terrainSprite = getTerrainSpriteDefinition("road");

  assert.ok(terrainSprite);
  assert.equal(terrainSprite.type, "spritesheet");
  assert.equal(getTerrainSpriteKey("road"), "spritesheet:terrain:road");
  assert.equal(terrainSprite.fallbackKey, "sprite:terrain:road");
  assert.equal(terrainSprite.animated?.frameWidth, 128);
  assert.equal(terrainSprite.animated?.frameHeight, 128);
  assert.equal(terrainSprite.animated?.url, "./assets/sprites/terrain/road/road.png");
});

test("water terrain animation uses the authored spritesheet frame size", () => {
  const terrainSprite = getTerrainSpriteDefinition("water");

  assert.ok(terrainSprite);
  assert.equal(terrainSprite.type, "spritesheet");
  assert.equal(getTerrainSpriteKey("water"), "spritesheet:terrain:water");
  assert.equal(terrainSprite.fallbackKey, "sprite:terrain:water");
  assert.equal(terrainSprite.animated?.frameWidth, 627);
  assert.equal(terrainSprite.animated?.frameHeight, 627);
  assert.equal(terrainSprite.animated?.frameRate, 4);
  assert.equal(terrainSprite.animated?.frameCount, 4);
  assert.equal(terrainSprite.animated?.sheetColumns, 4);
  assert.equal(terrainSprite.animated?.sheetRows, 1);
  assert.equal(terrainSprite.animated?.url, "./assets/sprites/terrain/water/water.png");
});

test("building sprite definitions expose the runtime owner-colored asset url", () => {
  const spriteDefinition = getBuildingSpriteDefinition(BUILDING_KEYS.COMMAND, "player");

  assert.ok(spriteDefinition);
  assert.equal(spriteDefinition.key, "sprite:buildings:player:command");
  assert.match(spriteDefinition.url, /\.\/assets\/sprites\/buildings\/player\/command\.(png|svg)$/);
});

test("plain terrain falls back to the static tile when no matching animation sheet exists", () => {
  const terrainSprite = getTerrainSpriteDefinition("plain");

  assert.ok(terrainSprite);
  assert.equal(terrainSprite.type, "image");
  assert.equal(getTerrainSpriteKey("plain"), "sprite:terrain:plain");
  assert.equal(terrainSprite.fallbackKey, "sprite:terrain:plain");
  assert.equal(terrainSprite.animated, null);
  assert.equal(terrainSprite.url, "./assets/sprites/terrain/plain.png");
});

test("mountain cluster variants are registered as runtime terrain assets", () => {
  const mountain2x2 = getTerrainClusterVariantDefinition("mountain", "2x2");
  const mountain2x1 = getTerrainClusterVariantDefinition("mountain", "2x1");
  const mountain1x2 = getTerrainClusterVariantDefinition("mountain", "1x2");

  assert.ok(mountain2x2);
  assert.equal(mountain2x2.assetId, "mountain_2x2");
  assert.equal(mountain2x2.key, "sprite:terrain-cluster:mountain:2x2");
  assert.equal(mountain2x2.url, "./assets/sprites/terrain/mountain_2x2.png");
  assert.equal(mountain2x2.widthTiles, 2);
  assert.equal(mountain2x2.heightTiles, 2);

  assert.ok(mountain2x1);
  assert.equal(mountain2x1.assetId, "mountain_2x1");
  assert.equal(mountain2x1.key, "sprite:terrain-cluster:mountain:2x1");
  assert.equal(mountain2x1.url, "./assets/sprites/terrain/mountain_2x1.png");
  assert.equal(mountain2x1.widthTiles, 2);
  assert.equal(mountain2x1.heightTiles, 1);

  assert.ok(mountain1x2);
  assert.equal(mountain1x2.assetId, "mountain_1x2");
  assert.equal(mountain1x2.key, "sprite:terrain-cluster:mountain:1x2");
  assert.equal(mountain1x2.url, "./assets/sprites/terrain/mountain_1x2.png");
  assert.equal(mountain1x2.widthTiles, 1);
  assert.equal(mountain1x2.heightTiles, 2);
});

test("forest cluster variants are registered with the intended rendered footprints", () => {
  const forest2x2 = getTerrainClusterVariantDefinition("forest", "2x2");
  const forest2x1 = getTerrainClusterVariantDefinition("forest", "2x1");
  const forest1x2 = getTerrainClusterVariantDefinition("forest", "1x2");

  assert.ok(forest2x2);
  assert.equal(forest2x2.assetId, "forest_2x2");
  assert.equal(forest2x2.key, "sprite:terrain-cluster:forest:2x2");
  assert.equal(forest2x2.url, "./assets/sprites/terrain/forest_2x2.png");
  assert.equal(forest2x2.widthTiles, 2);
  assert.equal(forest2x2.heightTiles, 2);

  assert.ok(forest2x1);
  assert.equal(forest2x1.assetId, "forest_1x2");
  assert.equal(forest2x1.key, "sprite:terrain-cluster:forest:1x2");
  assert.equal(forest2x1.url, "./assets/sprites/terrain/forest_1x2.png");
  assert.equal(forest2x1.widthTiles, 2);
  assert.equal(forest2x1.heightTiles, 1);

  assert.ok(forest1x2);
  assert.equal(forest1x2.assetId, "forest_2x1");
  assert.equal(forest1x2.key, "sprite:terrain-cluster:forest:2x1");
  assert.equal(forest1x2.url, "./assets/sprites/terrain/forest_2x1.png");
  assert.equal(forest1x2.widthTiles, 1);
  assert.equal(forest1x2.heightTiles, 2);
});

test("terrain transition registry resolves the shoal overlay for configured water borders", () => {
  const waterPlainOverlay = getTerrainTransitionOverlayDefinition("water", "plain");
  const waterForestOverlay = getTerrainTransitionOverlayDefinition("water", "forest");
  const waterMountainOverlay = getTerrainTransitionOverlayDefinition("water", "mountain");
  const waterRoadOverlay = getTerrainTransitionOverlayDefinition("water", "road");
  const roadPlainOverlay = getTerrainTransitionOverlayDefinition("road", "plain");
  const roadForestOverlay = getTerrainTransitionOverlayDefinition("road", "forest");
  const roadMountainOverlay = getTerrainTransitionOverlayDefinition("road", "mountain");
  const plainRoadOverlay = getTerrainTransitionOverlayDefinition("plain", "road");
  const plainWaterOverlay = getTerrainTransitionOverlayDefinition("plain", "water");

  assert.ok(waterPlainOverlay);
  assert.equal(waterPlainOverlay.assetId, "shoal");
  assert.equal(waterPlainOverlay.type, "image");
  assert.equal(waterPlainOverlay.key, "sprite:terrain-transition:shoal");
  assert.equal(waterPlainOverlay.url, "./assets/sprites/terrain/shoal.png");
  assert.equal(waterPlainOverlay.baseDirection, "north");
  assert.deepEqual(
    waterForestOverlay,
    waterPlainOverlay
  );
  assert.deepEqual(
    waterMountainOverlay,
    waterPlainOverlay
  );
  assert.ok(waterRoadOverlay);
  assert.equal(waterRoadOverlay.assetId, "edge");
  assert.equal(waterRoadOverlay.type, "image");
  assert.equal(waterRoadOverlay.key, "sprite:terrain-transition:edge");
  assert.equal(waterRoadOverlay.url, "./assets/sprites/terrain/edge.png");
  assert.equal(waterRoadOverlay.baseDirection, "north");
  assert.ok(roadPlainOverlay);
  assert.equal(roadPlainOverlay.assetId, "roadside");
  assert.equal(roadPlainOverlay.type, "image");
  assert.equal(roadPlainOverlay.key, "sprite:terrain-transition:roadside");
  assert.equal(roadPlainOverlay.url, "./assets/sprites/terrain/roadside.png");
  assert.equal(roadPlainOverlay.baseDirection, "north");
  assert.deepEqual(roadForestOverlay, roadPlainOverlay);
  assert.deepEqual(roadMountainOverlay, roadPlainOverlay);
  assert.equal(plainRoadOverlay, null);
  assert.equal(plainWaterOverlay, null);
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
  const bruiserSheetPath = path.resolve(process.cwd(), "assets/sprites/units/purple/bruiser/bruiser-full.png");

  if (!fs.existsSync(bruiserSheetPath)) {
    return;
  }

  const spriteDefinition = getUnitSpriteDefinition("bruiser", "player");

  assert.equal(spriteDefinition.type, "spritesheet");
  assert.equal(spriteDefinition.fallbackKey, getUnitSpriteKey("bruiser", "player"));
  assert.equal(spriteDefinition.idle.key, "spritesheet:units:purple:bruiser:sheet");
  assert.equal(spriteDefinition.idle.frameCount, 3);
  assert.deepEqual(spriteDefinition.idle.ranges.default, { start: 0, end: 2 });
  assert.equal(spriteDefinition.walk.key, spriteDefinition.idle.key);
  assert.equal(spriteDefinition.attack.key, spriteDefinition.idle.key);
  assert.deepEqual(spriteDefinition.walk.ranges.right, { start: 0, end: 2 });
  assert.deepEqual(spriteDefinition.walk.ranges.down, { start: 3, end: 3 });
  assert.deepEqual(spriteDefinition.walk.ranges.up, { start: 4, end: 4 });
  assert.deepEqual(spriteDefinition.attack.ranges.right, { start: 5, end: 12 });
  assert.equal(spriteDefinition.attack.cutsceneLoopCount, 1);
  assert.deepEqual(spriteDefinition.presentation, {
    battlefieldScale: 1,
    battlefieldMaxScale: 1,
    combatCutsceneScale: 1,
  });
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.bruiser.purple.frameWidth, 384);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.bruiser.purple.frameHeight, 384);
  assert.equal(spriteDefinition.idle.sheetColumns, 4);
  assert.equal(spriteDefinition.idle.sheetRows, 4);
  assert.equal(
    SPRITE_ASSETS.filter((asset) => asset.key === spriteDefinition.idle.key).length,
    1,
  );
});

test("unit animation manifest supports color-specific omissions and mirrored attacks", () => {
  const playerGruntDefinition = getUnitSpriteDefinition("grunt", "player");
  const enemyGruntDefinition = getUnitSpriteDefinition("grunt", "enemy");
  const playerBreakerDefinition = getUnitSpriteDefinition("breaker", "player");
  const enemyBreakerDefinition = getUnitSpriteDefinition("breaker", "enemy");
  const enemyBruiserDefinition = getUnitSpriteDefinition("bruiser", "enemy");

  assert.equal(playerGruntDefinition.idle.key, "spritesheet:units:purple:grunt:idle");
  assert.deepEqual(playerGruntDefinition.idle.ranges.default, { start: 0, end: 1 });
  assert.ok(playerGruntDefinition.attack);
  assert.deepEqual(playerGruntDefinition.attack.ranges.right, { start: 0, end: 2 });
  assert.equal(enemyGruntDefinition.idle.key, "spritesheet:units:blue:grunt:idle");
  assert.equal(enemyGruntDefinition.idle.frameCount, 2);
  assert.equal(playerBreakerDefinition.idle.key, "spritesheet:units:purple:breaker:idle");
  assert.equal(playerBreakerDefinition.walk.key, "spritesheet:units:purple:breaker:walk");
  assert.equal(playerBreakerDefinition.walk.movementStyle, "teleport");
  assert.deepEqual(playerBreakerDefinition.walk.ranges.default, { start: 0, end: 7 });
  assert.deepEqual(playerBreakerDefinition.attack.ranges.right, { start: 0, end: 2 });
  assert.equal(enemyBreakerDefinition.idle.key, "spritesheet:units:blue:breaker:idle");
  assert.equal(enemyBreakerDefinition.walk, null);
  assert.deepEqual(enemyBreakerDefinition.attack.ranges.right, { start: 0, end: 2 });
  assert.equal(enemyBruiserDefinition.idle.key, "spritesheet:units:blue:bruiser:sheet");
  assert.equal(enemyBruiserDefinition.walk.key, enemyBruiserDefinition.idle.key);
  assert.equal(enemyBruiserDefinition.attack.key, enemyBruiserDefinition.idle.key);
  assert.deepEqual(enemyBruiserDefinition.presentation, {
    battlefieldScale: 1,
    battlefieldMaxScale: 1,
    combatCutsceneScale: 1,
  });
  assert.deepEqual(playerGruntDefinition.presentation, {
    battlefieldScale: 0.9,
    battlefieldMaxScale: 0.9,
    combatCutsceneScale: 0.88,
  });
  assert.deepEqual(getUnitSpriteDefinition("runner", "player").presentation, {
    battlefieldScale: 1,
    battlefieldMaxScale: 1,
    combatCutsceneScale: 1,
  });
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.bruiser.blue.frameWidth, 384);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.bruiser.blue.frameHeight, 384);
  assert.equal(
    SPRITE_ASSETS.filter((asset) => asset.key === enemyBruiserDefinition.idle.key).length,
    1,
  );
});

test("gunship, runner, and skyguard sheets use the expected frame geometry", () => {
  const animatedUnits = [
    {
      unitTypeId: "gunship",
      frameWidth: 128,
      frameHeight: 128,
      idleRange: { start: 0, end: 1 },
      attackRange: { start: 0, end: 2 },
    },
    {
      unitTypeId: "runner",
      frameWidth: 128,
      frameHeight: 128,
      idleRange: { start: 0, end: 3 },
      attackRange: { start: 0, end: 2 },
    },
    {
      unitTypeId: "skyguard",
      frameWidth: 128,
      frameHeight: 128,
      idleRange: { start: 0, end: 5 },
      attackRange: { start: 0, end: 2 },
    },
  ];

  for (const { unitTypeId, frameWidth, frameHeight, idleRange, attackRange } of animatedUnits) {
    for (const owner of UNIT_OWNER_VARIANTS) {
      const spriteDefinition = getUnitSpriteDefinition(unitTypeId, owner);
      const colorId = resolveUnitSpriteColor(owner);
      const generatedDefinition = GENERATED_UNIT_SPRITE_ANIMATIONS[unitTypeId]?.[colorId];

      assert.ok(spriteDefinition, `missing sprite definition for ${owner} ${unitTypeId}`);
      assert.equal(spriteDefinition.type, "spritesheet");
      assert.equal(spriteDefinition.idle.key, `spritesheet:units:${colorId}:${unitTypeId}:idle`);
      assert.deepEqual(spriteDefinition.idle.ranges.default, idleRange);
      assert.equal(spriteDefinition.attack.key, `spritesheet:units:${colorId}:${unitTypeId}:attack`);
      assert.deepEqual(spriteDefinition.attack.ranges.right, attackRange);
      assert.equal(generatedDefinition.frameWidth, frameWidth);
      assert.equal(generatedDefinition.frameHeight, frameHeight);
    }
  }

  const playerGunshipDefinition = getUnitSpriteDefinition("gunship", "player");
  const enemyGunshipDefinition = getUnitSpriteDefinition("gunship", "enemy");
  const gunshipWalkAsset = SPRITE_ASSETS.find(
    (asset) => asset.key === playerGunshipDefinition.walk?.key,
  );

  assert.equal(
    playerGunshipDefinition.walk.key,
    "spritesheet:units:purple:gunship:walk",
  );
  assert.deepEqual(playerGunshipDefinition.walk.ranges.default, { start: 0, end: 6 });
  assert.deepEqual(playerGunshipDefinition.walk.ranges.right, { start: 0, end: 6 });
  assert.deepEqual(playerGunshipDefinition.walk.ranges.down, { start: 5, end: 6 });
  assert.deepEqual(playerGunshipDefinition.walk.movementPhases, {
    start: { start: 0, end: 1 },
    loop: { start: 2, end: 4 },
    end: { start: 5, end: 6 },
  });
  assert.equal(playerGunshipDefinition.walk.frameWidth, 192);
  assert.equal(playerGunshipDefinition.walk.frameHeight, 192);
  assert.equal(playerGunshipDefinition.walk.sheetColumns, 3);
  assert.equal(playerGunshipDefinition.walk.sheetRows, 3);
  assert.equal(gunshipWalkAsset.frameWidth, 192);
  assert.equal(gunshipWalkAsset.frameHeight, 192);
  assert.equal(enemyGunshipDefinition.walk, null);

  const playerRunnerDefinition = getUnitSpriteDefinition("runner", "player");
  const enemyRunnerDefinition = getUnitSpriteDefinition("runner", "enemy");
  const playerSkyguardDefinition = getUnitSpriteDefinition("skyguard", "player");
  const enemySkyguardDefinition = getUnitSpriteDefinition("skyguard", "enemy");

  assert.equal(playerRunnerDefinition.walk.key, "spritesheet:units:purple:runner:walk");
  assert.deepEqual(playerRunnerDefinition.walk.ranges.right, { start: 0, end: 3 });
  assert.deepEqual(playerRunnerDefinition.walk.ranges.down, { start: 4, end: 4 });
  assert.deepEqual(playerRunnerDefinition.walk.ranges.up, { start: 5, end: 5 });
  assert.equal(playerRunnerDefinition.walk.frameWidth, 192);
  assert.equal(playerRunnerDefinition.walk.frameHeight, 192);
  assert.equal(playerRunnerDefinition.walk.sheetColumns, 2);
  assert.equal(playerRunnerDefinition.walk.sheetRows, 3);
  assert.equal(enemyRunnerDefinition.walk, null);

  assert.equal(playerSkyguardDefinition.walk.key, "spritesheet:units:purple:skyguard:walk");
  assert.deepEqual(playerSkyguardDefinition.walk.ranges.right, { start: 0, end: 5 });
  assert.deepEqual(playerSkyguardDefinition.walk.ranges.down, { start: 6, end: 6 });
  assert.deepEqual(playerSkyguardDefinition.walk.ranges.up, { start: 7, end: 7 });
  assert.equal(playerSkyguardDefinition.walk.frameWidth, 192);
  assert.equal(playerSkyguardDefinition.walk.frameHeight, 192);
  assert.equal(playerSkyguardDefinition.walk.sheetColumns, 3);
  assert.equal(playerSkyguardDefinition.walk.sheetRows, 3);
  assert.equal(enemySkyguardDefinition.walk, null);
});

test("juggernaut, longshot, and medic sheets use the expected owner coverage and metadata", () => {
  for (const owner of UNIT_OWNER_VARIANTS) {
    const colorId = resolveUnitSpriteColor(owner);
    const juggernautDefinition = getUnitSpriteDefinition("juggernaut", owner);
    const longshotDefinition = getUnitSpriteDefinition("longshot", owner);

    assert.equal(juggernautDefinition.type, "spritesheet");
    assert.deepEqual(juggernautDefinition.idle.ranges.default, { start: 0, end: 2 });
    assert.deepEqual(juggernautDefinition.attack.ranges.right, { start: 0, end: 2 });
    assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.juggernaut[colorId].frameWidth, 128);
    assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.juggernaut[colorId].frameHeight, 128);

    assert.equal(longshotDefinition.type, "spritesheet");
    assert.deepEqual(longshotDefinition.idle.ranges.default, { start: 0, end: 1 });
    assert.deepEqual(longshotDefinition.attack.ranges.right, { start: 0, end: 8 });
    assert.equal(longshotDefinition.attack.cutsceneLoopCount, 1);
    assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.longshot[colorId].frameWidth, 128);
    assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.longshot[colorId].frameHeight, 160);
  }

  const playerMedicDefinition = getUnitSpriteDefinition("medic", "player");
  const enemyMedicDefinition = getUnitSpriteDefinition("medic", "enemy");
  const playerJuggernautDefinition = getUnitSpriteDefinition("juggernaut", "player");
  const enemyJuggernautDefinition = getUnitSpriteDefinition("juggernaut", "enemy");
  const playerLongshotDefinition = getUnitSpriteDefinition("longshot", "player");
  const enemyLongshotDefinition = getUnitSpriteDefinition("longshot", "enemy");

  assert.deepEqual(playerJuggernautDefinition.walk.ranges.right, { start: 0, end: 2 });
  assert.deepEqual(playerJuggernautDefinition.walk.ranges.down, { start: 3, end: 3 });
  assert.deepEqual(playerJuggernautDefinition.walk.ranges.up, { start: 4, end: 4 });
  assert.equal(playerJuggernautDefinition.walk.frameWidth, 192);
  assert.equal(playerJuggernautDefinition.walk.frameHeight, 192);
  assert.equal(playerJuggernautDefinition.walk.sheetColumns, 2);
  assert.equal(playerJuggernautDefinition.walk.sheetRows, 3);
  assert.equal(enemyJuggernautDefinition.walk, null);
  assert.equal(playerLongshotDefinition.walk.movementStyle, "teleport");
  assert.deepEqual(playerLongshotDefinition.walk.ranges.default, { start: 0, end: 7 });
  assert.equal(playerLongshotDefinition.walk.sheetColumns, 3);
  assert.equal(playerLongshotDefinition.walk.sheetRows, 3);
  assert.equal(enemyLongshotDefinition.walk, null);
  assert.equal(playerMedicDefinition.type, "spritesheet");
  assert.deepEqual(playerMedicDefinition.idle.ranges.default, { start: 0, end: 1 });
  assert.equal(playerMedicDefinition.walk.movementStyle, "teleport");
  assert.deepEqual(playerMedicDefinition.walk.ranges.default, { start: 0, end: 7 });
  assert.equal(playerMedicDefinition.walk.sheetColumns, 3);
  assert.equal(playerMedicDefinition.walk.sheetRows, 3);
  assert.deepEqual(playerMedicDefinition.attack.ranges.right, { start: 0, end: 2 });
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.medic.purple.frameWidth, 102);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.medic.purple.frameHeight, 128);
  assert.equal(enemyMedicDefinition.type, "image");
  assert.equal(enemyMedicDefinition.idle, null);
  assert.equal(enemyMedicDefinition.attack, null);
});

test("new purple full sheets expose row-major ranges and preserve blue fallbacks", () => {
  const mechanicDefinition = getUnitSpriteDefinition("mechanic", "player");
  const payloadDefinition = getUnitSpriteDefinition("payload", "player");
  const interceptorDefinition = getUnitSpriteDefinition("interceptor", "player");
  const siegeGunDefinition = getUnitSpriteDefinition("siege-gun", "player");

  assert.equal(mechanicDefinition.type, "spritesheet");
  assert.equal(mechanicDefinition.idle.key, "spritesheet:units:purple:mechanic:sheet");
  assert.equal(mechanicDefinition.walk.key, mechanicDefinition.idle.key);
  assert.equal(mechanicDefinition.attack.key, mechanicDefinition.idle.key);
  assert.deepEqual(mechanicDefinition.idle.ranges.default, { start: 0, end: 1 });
  assert.deepEqual(mechanicDefinition.attack.ranges.right, { start: 2, end: 5 });
  assert.equal(mechanicDefinition.walk.movementStyle, "teleport");
  assert.deepEqual(mechanicDefinition.walk.ranges.default, { start: 6, end: 13 });
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.mechanic.purple.frameWidth, 153);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.mechanic.purple.frameHeight, 192);
  assert.equal(mechanicDefinition.idle.sheetColumns, 4);
  assert.equal(mechanicDefinition.idle.sheetRows, 4);

  assert.equal(payloadDefinition.type, "spritesheet");
  assert.equal(payloadDefinition.key, payloadDefinition.idle.key);
  assert.equal(payloadDefinition.frameCount, 1);
  assert.equal(payloadDefinition.idle.key, "spritesheet:units:purple:payload:sheet");
  assert.deepEqual(payloadDefinition.idle.ranges.default, { start: 0, end: 0 });
  assert.deepEqual(payloadDefinition.walk.ranges.right, { start: 0, end: 0 });
  assert.deepEqual(payloadDefinition.walk.ranges.up, { start: 1, end: 1 });
  assert.deepEqual(payloadDefinition.walk.ranges.down, { start: 2, end: 2 });
  assert.deepEqual(payloadDefinition.attack.ranges.right, { start: 3, end: 8 });
  assert.deepEqual(payloadDefinition.attack.frameSequences.right, [
    "blank",
    3,
    4,
    5,
    6,
    7,
    8,
    "blank",
  ]);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.payload.purple.frameWidth, 192);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.payload.purple.frameHeight, 192);
  assert.equal(payloadDefinition.idle.sheetColumns, 3);
  assert.equal(payloadDefinition.idle.sheetRows, 3);

  assert.equal(interceptorDefinition.type, "spritesheet");
  assert.equal(interceptorDefinition.idle.key, "spritesheet:units:purple:interceptor:sheet");
  assert.deepEqual(interceptorDefinition.idle.ranges.default, { start: 0, end: 0 });
  assert.deepEqual(interceptorDefinition.walk.ranges.right, { start: 0, end: 0 });
  assert.deepEqual(interceptorDefinition.walk.ranges.up, { start: 1, end: 1 });
  assert.deepEqual(interceptorDefinition.walk.ranges.down, { start: 2, end: 2 });
  assert.deepEqual(interceptorDefinition.attack.ranges.right, { start: 3, end: 6 });
  assert.deepEqual(interceptorDefinition.attack.frameSequences.right, [3, 4, 5, 6, 3]);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.interceptor.purple.frameWidth, 993);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS.interceptor.purple.frameHeight, 783);
  assert.equal(interceptorDefinition.idle.sheetColumns, 2);
  assert.equal(interceptorDefinition.idle.sheetRows, 4);

  assert.equal(siegeGunDefinition.type, "spritesheet");
  assert.equal(siegeGunDefinition.key, siegeGunDefinition.idle.key);
  assert.equal(siegeGunDefinition.frameCount, 1);
  assert.equal(siegeGunDefinition.idle.key, "spritesheet:units:purple:siege-gun:sheet");
  assert.deepEqual(siegeGunDefinition.idle.ranges.default, { start: 0, end: 0 });
  assert.deepEqual(siegeGunDefinition.walk.ranges.right, { start: 0, end: 0 });
  assert.deepEqual(siegeGunDefinition.walk.ranges.down, { start: 9, end: 9 });
  assert.deepEqual(siegeGunDefinition.walk.ranges.up, { start: 10, end: 10 });
  assert.deepEqual(siegeGunDefinition.attack.ranges.right, { start: 1, end: 8 });
  assert.equal(siegeGunDefinition.attack.cutsceneLoopCount, 1);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS["siege-gun"].purple.frameWidth, 192);
  assert.equal(GENERATED_UNIT_SPRITE_ANIMATIONS["siege-gun"].purple.frameHeight, 192);
  assert.equal(siegeGunDefinition.idle.sheetColumns, 3);
  assert.equal(siegeGunDefinition.idle.sheetRows, 4);

  for (const unitTypeId of ["mechanic", "payload", "interceptor", "siege-gun"]) {
    const enemyDefinition = getUnitSpriteDefinition(unitTypeId, "enemy");

    assert.equal(enemyDefinition.type, "image");
    assert.equal(enemyDefinition.idle, null);
    assert.equal(enemyDefinition.walk, null);
    assert.equal(enemyDefinition.attack, null);
  }
});

test("new purple animation sheets are registered for runtime loading and preloading", () => {
  for (const url of [
    "./assets/sprites/units/purple/breaker/breaker-move.png",
    "./assets/sprites/units/purple/grunt/grunt-move.png",
    "./assets/sprites/units/purple/interceptor/interceptor-full.png",
    "./assets/sprites/units/purple/juggernaut/juggernaut-move.png",
    "./assets/sprites/units/purple/longshot/longshot-move.png",
    "./assets/sprites/units/purple/mechanic/mechanic-full.png",
    "./assets/sprites/units/purple/medic/medic-move.png",
    "./assets/sprites/units/purple/payload/payload-full.png",
    "./assets/sprites/units/purple/runner/runner-move.png",
    "./assets/sprites/units/purple/siege-gun/siege-gun-full.png",
    "./assets/sprites/units/purple/skyguard/skyguard-move.png",
  ]) {
    assertRuntimeSpriteAssetRegistered(url);
  }
});

test("unit color availability and sprite fallback follow complete palette coverage", () => {
  assert.deepEqual(getUnitSpriteColorAvailability(), {
    purple: true,
    blue: true,
    green: false,
    orange: false,
    pink: false
  });
  assert.deepEqual(getUnitSpriteColorAvailability(), GENERATED_UNIT_SPRITE_COLOR_AVAILABILITY);

  const unavailablePlayer = getUnitSpriteDefinition("grunt", "player", {
    playerColor: "green",
    enemyColor: "pink"
  });
  const unavailableEnemy = getUnitSpriteDefinition("grunt", "enemy", {
    playerColor: "green",
    enemyColor: "pink"
  });

  assert.equal(unavailablePlayer.requestedColorId, "green");
  assert.equal(unavailablePlayer.colorId, "purple");
  assert.match(unavailablePlayer.url, /sprites\/units\/purple\/grunt/);
  assert.equal(unavailableEnemy.requestedColorId, "pink");
  assert.equal(unavailableEnemy.colorId, "blue");
  assert.match(unavailableEnemy.url, /sprites\/units\/blue\/grunt/);
});

test("available colors can swap sides without changing owner semantics", () => {
  const options = {
    playerColor: "blue",
    enemyColor: "purple"
  };
  const playerDefinition = getUnitSpriteDefinition("grunt", "player", options);
  const enemyDefinition = getUnitSpriteDefinition("grunt", "enemy", options);

  assert.equal(playerDefinition.owner, "player");
  assert.equal(playerDefinition.colorId, "blue");
  assert.equal(enemyDefinition.owner, "enemy");
  assert.equal(enemyDefinition.colorId, "purple");
});

test("sprite folders only contain manifest assets or documented source masters", () => {
  const manifestPaths = new Set(SPRITE_ASSETS.map((asset) => resolveSpritePath(asset.url)));
  const spriteFiles = collectSpriteFiles(path.resolve(process.cwd(), "assets/sprites"));

  for (const filePath of spriteFiles) {
    assert.ok(
      manifestPaths.has(filePath) ||
        isSourceMasterSprite(filePath) ||
        isTerrainFormatFallbackSprite(filePath) ||
        isTerrainAnimationSprite(filePath) ||
        isBuildingFormatFallbackSprite(filePath) ||
        isWorkingSpriteSource(filePath),
      `untracked sprite file: ${path.relative(process.cwd(), filePath)}`
    );
  }
});
