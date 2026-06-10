import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLuminanceGrayscale,
  ensureGrayscaleTexture,
  getGrayscaleTextureKey,
} from "../src/game/phaser/view/grayscaleTexture.js";

test("luminance grayscale preserves per-pixel alpha", () => {
  const imageData = {
    data: new Uint8ClampedArray([
      255, 0, 0, 17,
      0, 255, 0, 128,
      0, 0, 255, 255,
    ]),
  };

  applyLuminanceGrayscale(imageData);

  assert.deepEqual(
    [...imageData.data],
    [
      54, 54, 54, 17,
      182, 182, 182, 128,
      18, 18, 18, 255,
    ],
  );
});

test("grayscale textures preserve frames and are cached by source key", () => {
  const sourcePixels = new Uint8ClampedArray([
    200, 100, 50, 64,
    20, 80, 140, 192,
  ]);
  const sourceFrames = {
    "0": {
      sourceIndex: 0,
      cutX: 0,
      cutY: 0,
      cutWidth: 1,
      cutHeight: 1,
    },
    "1": {
      sourceIndex: 0,
      cutX: 1,
      cutY: 0,
      cutWidth: 1,
      cutHeight: 1,
    },
  };
  const sourceTexture = {
    getSourceImage: () => ({ width: 2, height: 1 }),
    getFrameNames: () => ["0", "1"],
    get: (frameName) => sourceFrames[frameName],
  };
  const addedFrames = [];
  let outputImageData = null;
  let createCount = 0;
  let refreshCount = 0;
  const textureKeys = new Set(["unit:idle"]);
  const grayscaleTextureKey = getGrayscaleTextureKey("unit:idle");
  const targetTexture = {
    context: {
      clearRect() {},
      drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(sourcePixels) }),
      putImageData: (imageData) => {
        outputImageData = imageData;
      },
    },
    add: (...frame) => {
      addedFrames.push(frame);
    },
    refresh: () => {
      refreshCount += 1;
    },
  };
  const textures = {
    exists: (key) => textureKeys.has(key),
    get: (key) => key === "unit:idle" ? sourceTexture : targetTexture,
    createCanvas: (key) => {
      createCount += 1;
      textureKeys.add(key);
      return targetTexture;
    },
    remove: (key) => {
      textureKeys.delete(key);
    },
  };
  const scene = { textures };

  assert.equal(ensureGrayscaleTexture(scene, "unit:idle"), grayscaleTextureKey);
  assert.equal(ensureGrayscaleTexture(scene, "unit:idle"), grayscaleTextureKey);
  assert.equal(createCount, 1);
  assert.equal(refreshCount, 1);
  assert.deepEqual(addedFrames, [
    ["0", 0, 0, 0, 1, 1],
    ["1", 0, 1, 0, 1, 1],
  ]);
  assert.equal(outputImageData.data[3], 64);
  assert.equal(outputImageData.data[7], 192);
  assert.equal(outputImageData.data[0], outputImageData.data[1]);
  assert.equal(outputImageData.data[1], outputImageData.data[2]);
});
