import test from "node:test";
import assert from "node:assert/strict";
import {
  preloadAssetManifest,
  waitForBootFonts,
} from "../src/game/boot/assetPreloader.js";

test("asset preloader routes entries to loaders by kind", async () => {
  const calls = [];
  const manifest = [
    { url: "./assets/example.png", kind: "image", byteSize: 4 },
    { url: "./assets/theme.mp3", kind: "audio", byteSize: 4 },
    { url: "./assets/font.ttf", kind: "font", byteSize: 4 },
    { url: "./assets/cursor.cur", kind: "cursor", byteSize: 4 },
    { url: "./src/main.js", kind: "script", byteSize: 4 },
    { url: "./src/styles/main.css", kind: "style", byteSize: 4 },
  ];

  await preloadAssetManifest(manifest, {
    concurrency: 1,
    loaders: {
      image: async (asset) => calls.push(`image:${asset.url}`),
      audio: async (asset) => calls.push(`audio:${asset.url}`),
      font: async (asset) => calls.push(`font:${asset.url}`),
      cursor: async (asset) => calls.push(`cursor:${asset.url}`),
      script: async (asset) => calls.push(`script:${asset.url}`),
      style: async (asset) => calls.push(`style:${asset.url}`),
    },
  });

  assert.deepEqual(calls, [
    "image:./assets/example.png",
    "audio:./assets/theme.mp3",
    "font:./assets/font.ttf",
    "cursor:./assets/cursor.cur",
    "script:./src/main.js",
    "style:./src/styles/main.css",
  ]);
});

test("asset preloader filters entries by runtime environment", async () => {
  const calls = [];

  await preloadAssetManifest(
    [
      { url: "./assets/logo.png", kind: "image", byteSize: 1 },
      { url: "./src/main.js", kind: "script", byteSize: 1, environment: "development" },
      { url: "./assets/main.js", kind: "script", byteSize: 1, environment: "production" },
    ],
    {
      environment: "development",
      concurrency: 1,
      loaders: {
        image: async (asset) => calls.push(asset.url),
        script: async (asset) => calls.push(asset.url),
      },
    },
  );

  assert.deepEqual(calls, ["./assets/logo.png", "./src/main.js"]);
});

test("asset preloader reports byte-weighted monotonic progress", async () => {
  const progressEvents = [];

  await preloadAssetManifest(
    [
      { url: "./assets/small.png", kind: "image", byteSize: 2 },
      { url: "./assets/large.png", kind: "image", byteSize: 8 },
    ],
    {
      concurrency: 1,
      loaders: {
        image: async () => {},
      },
      onProgress: (progress) => progressEvents.push(progress),
    },
  );

  assert.deepEqual(
    progressEvents.map((event) => event.progress),
    [0, 0.2, 1, 1],
  );

  for (let index = 1; index < progressEvents.length; index += 1) {
    assert.ok(
      progressEvents[index].progress >= progressEvents[index - 1].progress,
      "progress should never move backward",
    );
  }
});

test("asset preloader records optional failures and still completes", async () => {
  const warnings = [];
  const result = await preloadAssetManifest(
    [
      { url: "./assets/missing.png", kind: "image", byteSize: 3 },
      { url: "./assets/ready.png", kind: "image", byteSize: 7 },
    ],
    {
      concurrency: 1,
      loaders: {
        image: async (asset) => {
          if (asset.url.includes("missing")) {
            throw new Error("missing asset");
          }
        },
      },
      logger: {
        warn: (...args) => warnings.push(args),
      },
    },
  );

  assert.equal(result.loaded, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].asset.url, "./assets/missing.png");
  assert.equal(warnings.length, 1);
});

test("asset preloader completes empty manifests immediately", async () => {
  const progressEvents = [];
  const result = await preloadAssetManifest([], {
    onProgress: (progress) => progressEvents.push(progress),
  });

  assert.deepEqual(result, {
    total: 0,
    loaded: 0,
    failures: [],
  });
  assert.deepEqual(progressEvents.map((event) => event.progress), [1]);
});

test("boot font readiness waits for configured font descriptors", async () => {
  const descriptors = [];
  const fontFaceSet = {
    ready: Promise.resolve(),
    load: async (descriptor) => {
      descriptors.push(descriptor);
      return [];
    },
  };

  await waitForBootFonts({
    fontFaceSet,
    descriptors: ["400 16px Oxanium", "700 16px Orbitron"],
  });

  assert.deepEqual(descriptors, ["400 16px Oxanium", "700 16px Orbitron"]);
});
