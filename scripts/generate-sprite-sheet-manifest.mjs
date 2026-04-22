import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";

const UNIT_OWNER_VARIANTS = ["player", "enemy"];
const UNIT_SPRITE_FRAME_SIZE = 64;
const GENERATED_MANIFEST_PATH = "src/game/phaser/generated/unitSpriteSheets.js";

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

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  return upDistance <= upLeftDistance ? up : upLeft;
}

function getPngIdatData(buffer, filePath) {
  const chunks = [];
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd > buffer.length) {
      throw new Error(`PNG chunk extends beyond file length: ${filePath}`);
    }

    if (type === "IDAT") {
      chunks.push(buffer.subarray(dataStart, dataEnd));
    }

    if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (chunks.length === 0) {
    throw new Error(`PNG has no image data: ${filePath}`);
  }

  return Buffer.concat(chunks);
}

function decodeRgbaPng(buffer, metadata, filePath) {
  if (
    metadata.bitDepth !== 8 ||
    metadata.colorType !== 6 ||
    metadata.compression !== 0 ||
    metadata.filter !== 0 ||
    metadata.interlace !== 0
  ) {
    return null;
  }

  const bytesPerPixel = 4;
  const rowStride = metadata.width * bytesPerPixel;
  const inflated = zlib.inflateSync(getPngIdatData(buffer, filePath));
  const pixels = new Uint8Array(metadata.width * metadata.height * bytesPerPixel);
  let readOffset = 0;

  for (let row = 0; row < metadata.height; row += 1) {
    const filterType = inflated[readOffset];
    readOffset += 1;

    for (let columnByte = 0; columnByte < rowStride; columnByte += 1) {
      const writeOffset = row * rowStride + columnByte;
      const raw = inflated[readOffset];
      const left = columnByte >= bytesPerPixel ? pixels[writeOffset - bytesPerPixel] : 0;
      const up = row > 0 ? pixels[writeOffset - rowStride] : 0;
      const upLeft =
        row > 0 && columnByte >= bytesPerPixel
          ? pixels[writeOffset - rowStride - bytesPerPixel]
          : 0;

      readOffset += 1;

      switch (filterType) {
        case 0:
          pixels[writeOffset] = raw;
          break;
        case 1:
          pixels[writeOffset] = (raw + left) & 0xff;
          break;
        case 2:
          pixels[writeOffset] = (raw + up) & 0xff;
          break;
        case 3:
          pixels[writeOffset] = (raw + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4:
          pixels[writeOffset] = (raw + paethPredictor(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter ${filterType}: ${filePath}`);
      }
    }
  }

  return pixels;
}

function isFrameVisible(pixels, metadata, frameIndex) {
  const frameColumns = metadata.width / UNIT_SPRITE_FRAME_SIZE;
  const frameX = (frameIndex % frameColumns) * UNIT_SPRITE_FRAME_SIZE;
  const frameY = Math.floor(frameIndex / frameColumns) * UNIT_SPRITE_FRAME_SIZE;
  const bytesPerPixel = 4;

  for (let y = frameY; y < frameY + UNIT_SPRITE_FRAME_SIZE; y += 1) {
    for (let x = frameX; x < frameX + UNIT_SPRITE_FRAME_SIZE; x += 1) {
      const alphaOffset = (y * metadata.width + x) * bytesPerPixel + 3;

      if (pixels[alphaOffset] > 0) {
        return true;
      }
    }
  }

  return false;
}

function countRenderableFrames(buffer, metadata, filePath) {
  const totalFrames =
    (metadata.width / UNIT_SPRITE_FRAME_SIZE) *
    (metadata.height / UNIT_SPRITE_FRAME_SIZE);
  const pixels = decodeRgbaPng(buffer, metadata, filePath);

  if (!pixels) {
    return totalFrames;
  }

  let lastVisibleFrameIndex = totalFrames - 1;

  while (lastVisibleFrameIndex >= 0 && !isFrameVisible(pixels, metadata, lastVisibleFrameIndex)) {
    lastVisibleFrameIndex -= 1;
  }

  if (lastVisibleFrameIndex < 0) {
    throw new Error(`Unit sprite sheet has no visible frames: ${filePath}`);
  }

  return lastVisibleFrameIndex + 1;
}

async function readSheetSpec(root, owner, unitTypeId) {
  const relativePath = `assets/sprites/units/${owner}/${unitTypeId}/${unitTypeId}.png`;
  const filePath = path.resolve(root, relativePath);

  try {
    const buffer = await fs.readFile(filePath);
    const metadata = readPngMetadata(buffer, filePath);
    const { width, height } = metadata;

    if (width % UNIT_SPRITE_FRAME_SIZE !== 0 || height % UNIT_SPRITE_FRAME_SIZE !== 0) {
      throw new Error(
        `Unit sprite sheet frames must be ${UNIT_SPRITE_FRAME_SIZE}x${UNIT_SPRITE_FRAME_SIZE}: ${relativePath}`
      );
    }

    return {
      key: `spritesheet:units:${owner}:${unitTypeId}`,
      url: `./${relativePath}`,
      frameWidth: UNIT_SPRITE_FRAME_SIZE,
      frameHeight: UNIT_SPRITE_FRAME_SIZE,
      frameCount: countRenderableFrames(buffer, metadata, filePath),
      animationKey: `animation:units:${owner}:${unitTypeId}:idle`,
      frameRate: 5
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function generateUnitSpriteSheetManifest({ root = process.cwd() } = {}) {
  const manifest = {};

  for (const unitTypeId of Object.keys(UNIT_CATALOG)) {
    for (const owner of UNIT_OWNER_VARIANTS) {
      const sheetSpec = await readSheetSpec(root, owner, unitTypeId);

      if (!sheetSpec) {
        continue;
      }

      manifest[unitTypeId] ??= {};
      manifest[unitTypeId][owner] = sheetSpec;
    }
  }

  const output = [
    "// This file is generated by scripts/generate-sprite-sheet-manifest.mjs.",
    "// Do not edit by hand.",
    "",
    `export const GENERATED_UNIT_SPRITE_SHEETS = ${JSON.stringify(manifest, null, 2)};`,
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
