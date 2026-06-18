import test from "node:test";
import assert from "node:assert/strict";
import {
  collectAssetPreloadEntries,
  PRELOADABLE_ASSET_KINDS_BY_EXTENSION,
} from "../scripts/generate-asset-preload-manifest.mjs";
import {
  ASSET_PRELOAD_MANIFEST,
  ASSET_PRELOAD_TOTAL_BYTES,
} from "../src/game/phaser/generated/assetPreloadManifest.js";

test("asset preload manifest covers every preloadable runtime file", async () => {
  const expectedEntries = await collectAssetPreloadEntries();

  assert.deepEqual(ASSET_PRELOAD_MANIFEST, expectedEntries);
  assert.equal(
    ASSET_PRELOAD_TOTAL_BYTES,
    expectedEntries.reduce((sum, entry) => sum + entry.byteSize, 0),
  );
});

test("asset preload manifest keeps stable encoded urls for filenames with spaces", () => {
  assert.ok(
    ASSET_PRELOAD_MANIFEST.some(
      (entry) =>
        entry.kind === "audio" &&
        entry.url === "./assets/audio/music/Ally%20Theme.mp3",
    ),
  );
  assert.ok(
    ASSET_PRELOAD_MANIFEST.some(
      (entry) =>
        entry.kind === "image" &&
        entry.url === "./assets/img/commanders/atlas/Atlas%20-%20Info.png",
    ),
  );
});

test("asset preload manifest includes development source styles and scripts", () => {
  assert.ok(
    ASSET_PRELOAD_MANIFEST.some(
      (entry) =>
        entry.kind === "script" &&
        entry.environment === "development" &&
        entry.url === "./src/main.js",
    ),
  );
  assert.ok(
    ASSET_PRELOAD_MANIFEST.some(
      (entry) =>
        entry.kind === "style" &&
        entry.environment === "development" &&
        entry.url === "./src/styles/main.css",
    ),
  );
});

test("asset preload manifest includes production script and style bundle urls", () => {
  assert.ok(
    ASSET_PRELOAD_MANIFEST.some(
      (entry) =>
        entry.kind === "script" &&
        entry.environment === "production" &&
        entry.url === "./assets/main.js",
    ),
  );
  assert.ok(
    ASSET_PRELOAD_MANIFEST.some(
      (entry) =>
        entry.kind === "style" &&
        entry.environment === "production" &&
        entry.url === "./assets/main.css",
    ),
  );
});

test("asset preload extension routing covers runtime media, fonts, and cursors", () => {
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".css"), "style");
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".js"), "script");
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".mjs"), "script");
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".png"), "image");
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".svg"), "image");
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".mp3"), "audio");
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".ttf"), "font");
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".cur"), "cursor");
  assert.equal(PRELOADABLE_ASSET_KINDS_BY_EXTENSION.get(".ani"), "cursor");
});
