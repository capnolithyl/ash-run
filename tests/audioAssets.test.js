import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MUSIC_ASSETS, MUSIC_TRACK_IDS, getMusicTrackKey } from "../src/game/phaser/assets.js";
import { getMusicTrackIdForState } from "../src/game/phaser/audio/MusicDirector.js";
import { SCREEN_IDS, TURN_SIDES } from "../src/game/core/constants.js";
import { createDefaultMetaState } from "../src/game/state/defaults.js";
import { renderOptionFields } from "../src/ui/views/optionFieldsView.js";

function resolveAssetPath(url) {
  return path.resolve(process.cwd(), url.replace(/^\.\//, ""));
}

test("music manifest points at files that ship with the repo", () => {
  for (const asset of MUSIC_ASSETS) {
    assert.ok(fs.existsSync(resolveAssetPath(asset.url)), `missing music file: ${asset.url}`);
  }
});

test("music manifest exposes menu, ally turn, and enemy turn keys", () => {
  assert.equal(getMusicTrackKey(MUSIC_TRACK_IDS.MENU), "music:menu");
  assert.equal(getMusicTrackKey(MUSIC_TRACK_IDS.ALLY_TURN), "music:ally-turn");
  assert.equal(getMusicTrackKey(MUSIC_TRACK_IDS.ENEMY_TURN), "music:enemy-turn");
});

test("music track selection follows title and battle turn state", () => {
  assert.equal(
    getMusicTrackIdForState({
      screen: SCREEN_IDS.TITLE
    }),
    MUSIC_TRACK_IDS.MENU
  );

  assert.equal(
    getMusicTrackIdForState({
      screen: SCREEN_IDS.BATTLE,
      battleSnapshot: {
        turn: {
          activeSide: TURN_SIDES.PLAYER
        }
      }
    }),
    MUSIC_TRACK_IDS.ALLY_TURN
  );

  assert.equal(
    getMusicTrackIdForState({
      screen: SCREEN_IDS.BATTLE,
      battleSnapshot: {
        turn: {
          activeSide: TURN_SIDES.ENEMY
        }
      }
    }),
    MUSIC_TRACK_IDS.ENEMY_TURN
  );
});

test("new audio options default to a quiet master volume", () => {
  const metaState = createDefaultMetaState();
  const fallbackOptionsHtml = renderOptionFields({});

  assert.equal(metaState.options.combatCutsceneAnimations, true);
  assert.equal(metaState.options.masterVolume, 0.4);
  assert.equal(metaState.options.muted, false);
  assert.match(fallbackOptionsHtml, /Combat Cutscene Animations/);
  assert.match(
    fallbackOptionsHtml,
    /<input type="checkbox"[^>]*checked[^>]*data-option="combatCutsceneAnimations"/
  );
  assert.match(fallbackOptionsHtml, /Master Volume <strong>40%<\/strong>/);
  assert.match(fallbackOptionsHtml, /value="0.4"/);
});
