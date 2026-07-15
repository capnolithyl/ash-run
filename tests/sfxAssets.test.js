import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { COMMANDERS } from "../src/game/content/commanders.js";
import { WEAPON_CLASSES } from "../src/game/content/weaponClasses.js";
import {
  COMMANDER_SFX_CUE_BY_ID,
  SERVICE_SFX_CUE_BY_SOURCE,
  SFX_ASSETS,
  UNIT_MOVEMENT_SFX_CUE,
  WEAPON_SFX_CUE_BY_CLASS,
  getSfxCueDefinition,
} from "../src/game/phaser/audio/SfxCatalog.js";
import { generateSoundEffects } from "../scripts/generate-sfx.mjs";

function resolveAssetPath(url, rootDir = process.cwd()) {
  return path.resolve(rootDir, url.replace(/^\.\//, ""));
}

function readWavHeader(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 44);
  return {
    riff: header.toString("ascii", 0, 4),
    wave: header.toString("ascii", 8, 12),
    format: header.readUInt16LE(20),
    channels: header.readUInt16LE(22),
    sampleRate: header.readUInt32LE(24),
    bitsPerSample: header.readUInt16LE(34),
    data: header.toString("ascii", 36, 40),
  };
}

test("SFX catalog has unique replaceable files with valid mono PCM WAV headers", () => {
  assert.ok(SFX_ASSETS.length >= 75);
  assert.equal(new Set(SFX_ASSETS.map((asset) => asset.id)).size, SFX_ASSETS.length);
  assert.equal(new Set(SFX_ASSETS.map((asset) => asset.key)).size, SFX_ASSETS.length);
  assert.equal(new Set(SFX_ASSETS.map((asset) => asset.url)).size, SFX_ASSETS.length);

  for (const asset of SFX_ASSETS) {
    const filePath = resolveAssetPath(asset.url);
    assert.ok(fs.existsSync(filePath), `missing SFX file: ${asset.url}`);
    assert.match(asset.url, /^\.\/assets\/audio\/sfx\/(ui|movement|weapons|impact|support|transport|commander|progression|world|outcome)\/.+\.wav$/);
    assert.deepEqual(readWavHeader(filePath), {
      riff: "RIFF",
      wave: "WAVE",
      format: 1,
      channels: 1,
      sampleRate: 44_100,
      bitsPerSample: 16,
      data: "data",
    });
  }
});

test("SFX mappings cover every weapon, commander, movement unit, and service source", () => {
  assert.deepEqual(
    Object.keys(WEAPON_SFX_CUE_BY_CLASS).sort(),
    Object.values(WEAPON_CLASSES).sort(),
  );

  for (const cueId of Object.values(WEAPON_SFX_CUE_BY_CLASS)) {
    assert.ok(getSfxCueDefinition(cueId));
  }

  assert.deepEqual(
    Object.keys(COMMANDER_SFX_CUE_BY_ID).sort(),
    COMMANDERS.map(({ id }) => id).sort(),
  );

  for (const cueId of Object.values(COMMANDER_SFX_CUE_BY_ID)) {
    assert.ok(getSfxCueDefinition(cueId));
  }

  for (const unitTypeId of [
    "grunt", "breaker", "longshot", "medic", "mechanic", "runner", "bruiser",
    "juggernaut", "siege-gun", "skyguard", "gunship", "payload", "interceptor", "carrier",
  ]) {
    assert.ok(getSfxCueDefinition(UNIT_MOVEMENT_SFX_CUE[unitTypeId]), unitTypeId);
  }

  for (const source of [
    "medic", "mechanic", "field-medpack", "command", "sector", "hospital",
    "repair-station", "passive", "run-card",
  ]) {
    assert.ok(getSfxCueDefinition(SERVICE_SFX_CUE_BY_SOURCE[source]), source);
  }
});

test("SFX generator preserves replacements unless force is requested", (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ash-run-sfx-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const first = generateSoundEffects({ rootDir });
  assert.equal(first.created.length, SFX_ASSETS.length);
  assert.equal(first.skipped.length, 0);

  const replacementPath = resolveAssetPath(SFX_ASSETS[0].url, rootDir);
  const replacement = Buffer.from("replacement-audio");
  fs.writeFileSync(replacementPath, replacement);

  const second = generateSoundEffects({ rootDir });
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped.length, SFX_ASSETS.length);
  assert.deepEqual(fs.readFileSync(replacementPath), replacement);

  const forced = generateSoundEffects({ rootDir, force: true });
  assert.equal(forced.created.length, SFX_ASSETS.length);
  assert.notDeepEqual(fs.readFileSync(replacementPath), replacement);
});
