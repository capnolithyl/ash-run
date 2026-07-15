import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { buildLevelUpAudioSchedule } from "../src/ui/appShell/render/battlePresentationPlayback.js";
import {
  appShellBattleScreenMethods,
  getOutcomeAudioCueId
} from "../src/ui/appShell/render/battleScreen.js";

const LEVEL_UP_EVENT = {
  unitId: "grunt-1",
  previousLevel: 2,
  newLevel: 3,
  statSheet: [
    { stat: "maxHealth", changed: true },
    { stat: "attack", changed: false },
    { stat: "armor", changed: true },
    { stat: "movement", changed: false }
  ]
};

test("level-up audio follows the visual row cadence and only ticks changed stats", () => {
  const schedule = buildLevelUpAudioSchedule(LEVEL_UP_EVENT);

  assert.equal(schedule[0].cueId, "progression.level-up");
  assert.deepEqual(
    schedule.slice(1).map((entry) => entry.dedupeKey.split(":").at(-1)),
    ["maxHealth", "armor"]
  );
  assert.ok(schedule[2].delayMs > schedule[1].delayMs);
});

test("reduced motion consolidates changed stat ticks", () => {
  const schedule = buildLevelUpAudioSchedule(LEVEL_UP_EVENT, { reducedMotion: true });

  assert.deepEqual(schedule.map((entry) => entry.cueId), [
    "progression.level-up",
    "progression.stat-up"
  ]);
});

test("outcome overlays distinguish battle victory, defeat, and run completion", () => {
  assert.equal(getOutcomeAudioCueId({ winner: TURN_SIDES.PLAYER }), "outcome.victory");
  assert.equal(
    getOutcomeAudioCueId({ winner: TURN_SIDES.PLAYER }, "complete"),
    "outcome.run-complete"
  );
  assert.equal(getOutcomeAudioCueId({ winner: TURN_SIDES.ENEMY }), "outcome.defeat");
});

test("reward and run-completion cues remain reachable after the victory cue", () => {
  const emitted = [];
  const timers = [];
  const originalWindow = globalThis.window;
  globalThis.window = {
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    }
  };

  try {
    const shell = {
      controller: {
        emitAudioCue(cueId) {
          emitted.push(cueId);
        }
      },
      getVictoryKey: appShellBattleScreenMethods.getVictoryKey
    };
    const battleSnapshot = {
      id: "battle-outcome",
      victory: { winner: TURN_SIDES.PLAYER, message: "Sector secured." }
    };

    appShellBattleScreenMethods.playOutcomeAudioIfVisible.call(
      shell,
      { battleSnapshot, runStatus: "reward" },
      false
    );
    timers.shift()?.();
    appShellBattleScreenMethods.playOutcomeAudioIfVisible.call(
      shell,
      { battleSnapshot, runStatus: "complete" },
      false
    );

    assert.deepEqual(emitted, [
      "outcome.victory",
      "progression.reward",
      "outcome.run-complete"
    ]);
  } finally {
    globalThis.window = originalWindow;
  }
});
