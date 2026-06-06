import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { UNIT_COLOR_IDS } from "../src/game/core/unitColors.js";

const GENERATED_MANIFEST_PATH = "src/game/phaser/generated/unitSpriteAnimations.js";
const SUPPORTED_ANIMATION_IDS = ["idle", "walk", "attack"];

function readPngMetadata(buffer, filePath) {
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (!isPng) {
    throw new Error(`Unit sprite sheet is not a PNG: ${filePath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    compression: buffer[26],
    filter: buffer[27],
    interlace: buffer[28]
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

async function readAnimationMetadata(root, unitTypeId) {
  const metadataPath = path.resolve(root, "assets/sprites/units", `${unitTypeId}.animations.json`);

  try {
    const raw = await fs.readFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!isPlainObject(parsed)) {
      throw new Error(`Animation metadata must be an object: ${metadataPath}`);
    }

    assertInteger(parsed.frameWidth, `${unitTypeId} frameWidth`);
    assertInteger(parsed.frameHeight, `${unitTypeId} frameHeight`);

    if (parsed.frameWidth <= 0 || parsed.frameHeight <= 0) {
      throw new Error(`Animation frame dimensions must be greater than zero: ${metadataPath}`);
    }

    if (!isPlainObject(parsed.animations)) {
      throw new Error(`Animation metadata must include an animations object: ${metadataPath}`);
    }

    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function normalizeRanges(animationId, ranges, totalFrames, unitTypeId) {
  if (!isPlainObject(ranges)) {
    throw new Error(`${unitTypeId} ${animationId} ranges must be an object.`);
  }

  const normalizedRanges = {};

  for (const [rangeName, range] of Object.entries(ranges)) {
    if (!isPlainObject(range)) {
      throw new Error(`${unitTypeId} ${animationId} ${rangeName} range must be an object.`);
    }

    assertInteger(range.start, `${unitTypeId} ${animationId} ${rangeName} start`);
    assertInteger(range.end, `${unitTypeId} ${animationId} ${rangeName} end`);

    if (range.end < range.start) {
      throw new Error(`${unitTypeId} ${animationId} ${rangeName} range end must be >= start.`);
    }

    if (range.end >= totalFrames) {
      throw new Error(
        `${unitTypeId} ${animationId} ${rangeName} range exceeds frame count (${totalFrames}).`
      );
    }

    normalizedRanges[rangeName] = {
      start: range.start,
      end: range.end,
    };
  }

  return normalizedRanges;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readColorAnimationSpec(root, colorId, unitTypeId, animationMetadata) {
  if (!animationMetadata) {
    return null;
  }

  const { frameWidth, frameHeight } = animationMetadata;
  const ownerSpec = {
    frameWidth,
    frameHeight,
    animations: {},
  };

  for (const animationId of SUPPORTED_ANIMATION_IDS) {
    const animationSpec = animationMetadata.animations?.[animationId];

    if (!animationSpec) {
      continue;
    }

    if (!isPlainObject(animationSpec)) {
      throw new Error(`${unitTypeId} ${animationId} animation metadata must be an object.`);
    }

    if (typeof animationSpec.file !== "string" || animationSpec.file.length === 0) {
      throw new Error(`${unitTypeId} ${animationId} animation metadata must include a file.`);
    }

    if (
      animationSpec.cutsceneLoopCount !== undefined &&
      (!Number.isInteger(animationSpec.cutsceneLoopCount) || animationSpec.cutsceneLoopCount <= 0)
    ) {
      throw new Error(
        `${unitTypeId} ${animationId} cutsceneLoopCount must be a positive integer when provided.`,
      );
    }

    if (
      animationSpec.movementStyle !== undefined &&
      typeof animationSpec.movementStyle !== "string"
    ) {
      throw new Error(
        `${unitTypeId} ${animationId} movementStyle must be a string when provided.`,
      );
    }

    const relativePath = `assets/sprites/units/${colorId}/${unitTypeId}/${animationSpec.file}`;
    const filePath = path.resolve(root, relativePath);

    try {
      const buffer = await fs.readFile(filePath);
      const metadata = readPngMetadata(buffer, filePath);
      const { width, height } = metadata;

      if (width % frameWidth !== 0 || height % frameHeight !== 0) {
        throw new Error(
          `${unitTypeId} ${animationId} sheet must be divisible by ${frameWidth}x${frameHeight}: ${relativePath}`
        );
      }

      const totalFrames = (width / frameWidth) * (height / frameHeight);
      const normalizedRanges = normalizeRanges(
        animationId,
        animationSpec.ranges,
        totalFrames,
        unitTypeId,
      );
      const frameCount = Math.max(...Object.values(normalizedRanges).map((range) => range.end)) + 1;

      ownerSpec.animations[animationId] = {
        key: `spritesheet:units:${colorId}:${unitTypeId}:${animationId}`,
        url: `./${relativePath}`,
        frameRate: Number.isFinite(animationSpec.frameRate) ? animationSpec.frameRate : 5,
        frameCount,
        sheetWidth: width,
        sheetHeight: height,
        sheetColumns: width / frameWidth,
        sheetRows: height / frameHeight,
        animationKeyBase: `animation:units:${colorId}:${unitTypeId}:${animationId}`,
        ranges: normalizedRanges,
      };

      if (Number.isInteger(animationSpec.cutsceneLoopCount) && animationSpec.cutsceneLoopCount > 0) {
        ownerSpec.animations[animationId].cutsceneLoopCount = animationSpec.cutsceneLoopCount;
      }

      if (typeof animationSpec.movementStyle === "string" && animationSpec.movementStyle.length > 0) {
        ownerSpec.animations[animationId].movementStyle = animationSpec.movementStyle;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return Object.keys(ownerSpec.animations).length > 0 ? ownerSpec : null;
}

export async function generateUnitSpriteSheetManifest({ root = process.cwd() } = {}) {
  const manifest = {};
  const staticColorsByUnit = {};
  const colorAvailability = {};
  const unitTypeIds = Object.keys(UNIT_CATALOG);

  for (const colorId of UNIT_COLOR_IDS) {
    const staticCoverage = await Promise.all(
      unitTypeIds.map((unitTypeId) =>
        pathExists(
          path.resolve(root, "assets/sprites/units", colorId, `${unitTypeId}.svg`)
        )
      )
    );
    colorAvailability[colorId] = staticCoverage.every(Boolean);
  }

  for (const unitTypeId of unitTypeIds) {
    const animationMetadata = await readAnimationMetadata(root, unitTypeId);
    staticColorsByUnit[unitTypeId] = [];

    for (const colorId of UNIT_COLOR_IDS) {
      const staticPath = path.resolve(
        root,
        "assets/sprites/units",
        colorId,
        `${unitTypeId}.svg`
      );

      if (await pathExists(staticPath)) {
        staticColorsByUnit[unitTypeId].push(colorId);
      }

      const sheetSpec = await readColorAnimationSpec(
        root,
        colorId,
        unitTypeId,
        animationMetadata
      );

      if (sheetSpec) {
        manifest[unitTypeId] ??= {};
        manifest[unitTypeId][colorId] = sheetSpec;
      }
    }
  }

  const output = [
    "// This file is generated by scripts/generate-sprite-sheet-manifest.mjs.",
    "// Do not edit by hand.",
    "",
    `export const GENERATED_UNIT_SPRITE_COLOR_AVAILABILITY = ${JSON.stringify(colorAvailability, null, 2)};`,
    "",
    `export const GENERATED_UNIT_SPRITE_STATIC_COLORS = ${JSON.stringify(staticColorsByUnit, null, 2)};`,
    "",
    `export const GENERATED_UNIT_SPRITE_ANIMATIONS = ${JSON.stringify(manifest, null, 2)};`,
    ""
  ].join("\n");
  const manifestPath = path.resolve(root, GENERATED_MANIFEST_PATH);

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, output, "utf8");

  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateUnitSpriteSheetManifest();
}
