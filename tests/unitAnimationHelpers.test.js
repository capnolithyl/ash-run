import test from "node:test";
import assert from "node:assert/strict";
import {
  getAnimationRange,
  getAnimationRangeFrameCount,
  getAttackAnimationPlayback,
  getOwnerIdleFlipX,
  getUnitAttackRangeName,
  getUnitDefaultTexture,
  getUnitMovementPlayback,
  getWalkAnimationPlayback,
} from "../src/game/phaser/view/unitAnimationHelpers.js";
import { getBattleMoveDuration } from "../src/game/core/constants.js";
import {
  getClampedBattlefieldEffectMultiplier,
  getUnitSpritePresentation,
} from "../src/game/phaser/unitSpritePresentation.js";

test("unit sprite presentation applies configured scales and effect ceilings", () => {
  const bruiserPresentation = getUnitSpritePresentation("bruiser");
  const gruntPresentation = getUnitSpritePresentation("grunt");

  assert.deepEqual(bruiserPresentation, {
    battlefieldScale: 1,
    battlefieldMaxScale: 1,
    combatCutsceneScale: 1,
  });
  assert.deepEqual(gruntPresentation, {
    battlefieldScale: 0.9,
    battlefieldMaxScale: 0.9,
    combatCutsceneScale: 0.88,
  });
  assert.equal(getClampedBattlefieldEffectMultiplier(bruiserPresentation, 1.24), 1.24);
  assert.equal(getClampedBattlefieldEffectMultiplier(gruntPresentation, 1.24), 1);
});

test("getUnitAttackRangeName uses horizontal direction and owner defaults", () => {
  assert.equal(getUnitAttackRangeName("player", 2), "right");
  assert.equal(getUnitAttackRangeName("player", -1), "left");
  assert.equal(getUnitAttackRangeName("player", 0), "right");
  assert.equal(getUnitAttackRangeName("enemy", 0), "left");
});

test("attack playback helper resolves the clip and duration for directional attacks", () => {
  const attackAnimation = {
    key: "spritesheet:units:purple:grunt:attack",
    frameRate: 5,
    ranges: {
      right: { start: 0, end: 2 },
      left: { start: 3, end: 5 },
    },
  };

  assert.deepEqual(getAttackAnimationPlayback("player", attackAnimation, 1), {
    rangeName: "right",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: false,
    durationMs: 600,
  });
  assert.deepEqual(getAttackAnimationPlayback("enemy", attackAnimation, 0), {
    rangeName: "left",
    range: { start: 3, end: 5 },
    startFrame: 3,
    flipX: false,
    durationMs: 600,
  });
});

test("attack playback helper mirrors a single directional attack clip when needed", () => {
  const attackAnimation = {
    key: "spritesheet:units:purple:grunt:attack",
    frameRate: 5,
    ranges: {
      right: { start: 0, end: 2 },
    },
  };

  assert.deepEqual(getAttackAnimationPlayback("player", attackAnimation, 1), {
    rangeName: "right",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: false,
    durationMs: 600,
  });
  assert.deepEqual(getAttackAnimationPlayback("player", attackAnimation, -1), {
    rangeName: "right",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: true,
    durationMs: 600,
  });
  assert.deepEqual(getAttackAnimationPlayback("enemy", attackAnimation, 0), {
    rangeName: "right",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: true,
    durationMs: 600,
  });
});

test("default texture helper prefers idle animation and otherwise falls back to svg", () => {
  const visualWithIdle = {
    fallbackKey: "sprite:units:blue:grunt",
    idle: {
      key: "spritesheet:units:blue:grunt:idle",
      ranges: {
        default: { start: 0, end: 1 },
      },
    },
  };
  const visualWithoutIdle = {
    fallbackKey: "sprite:units:purple:grunt",
    idle: null,
  };

  assert.deepEqual(getUnitDefaultTexture(visualWithIdle, "enemy"), {
    key: "spritesheet:units:blue:grunt:idle",
    frame: 0,
    flipX: true,
  });
  assert.deepEqual(getUnitDefaultTexture(visualWithoutIdle, "player"), {
    key: "sprite:units:purple:grunt",
    frame: undefined,
    flipX: false,
  });
  assert.equal(getOwnerIdleFlipX("enemy"), true);
  assert.equal(getOwnerIdleFlipX("player"), false);
  assert.deepEqual(getAnimationRange(visualWithIdle.idle, "default"), { start: 0, end: 1 });
  assert.equal(getAnimationRangeFrameCount({ start: 3, end: 5 }), 3);
});

test("walk playback resolves directional clips, mirrors horizontal travel, and holds single frames", () => {
  const walkAnimation = {
    key: "spritesheet:units:purple:bruiser:sheet",
    ranges: {
      right: { start: 0, end: 2 },
      down: { start: 3, end: 3 },
      up: { start: 4, end: 4 },
    },
  };

  assert.deepEqual(getWalkAnimationPlayback("player", walkAnimation, 1, 0), {
    rangeName: "right",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: false,
  });
  assert.deepEqual(getWalkAnimationPlayback("player", walkAnimation, -1, 0), {
    rangeName: "right",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: true,
  });
  assert.deepEqual(getWalkAnimationPlayback("enemy", walkAnimation, 0, 1), {
    rangeName: "down",
    range: { start: 3, end: 3 },
    startFrame: 3,
    flipX: false,
  });
  assert.deepEqual(getWalkAnimationPlayback("enemy", walkAnimation, 0, -1), {
    rangeName: "up",
    range: { start: 4, end: 4 },
    startFrame: 4,
    flipX: false,
  });
});

test("walk playback preserves owner-facing default clips for existing units", () => {
  const walkAnimation = {
    key: "spritesheet:units:blue:grunt:walk",
    ranges: {
      default: { start: 0, end: 3 },
    },
  };

  assert.deepEqual(getWalkAnimationPlayback("enemy", walkAnimation, 1, 0), {
    rangeName: "default",
    range: { start: 0, end: 3 },
    startFrame: 0,
    flipX: true,
  });
  assert.deepEqual(getWalkAnimationPlayback("player", walkAnimation, 0, -1), {
    rangeName: "default",
    range: { start: 0, end: 3 },
    startFrame: 0,
    flipX: false,
  });
  assert.deepEqual(getWalkAnimationPlayback("player", walkAnimation, 0, 1), {
    rangeName: "default",
    range: { start: 0, end: 3 },
    startFrame: 0,
    flipX: false,
  });
  assert.equal(
    getWalkAnimationPlayback("player", { key: walkAnimation.key, ranges: {} }, 0, -1),
    null,
  );
});

test("walk playback uses the shared gunship clip except for south movement", () => {
  const walkAnimation = {
    key: "spritesheet:units:purple:gunship:walk",
    ranges: {
      default: { start: 0, end: 6 },
      right: { start: 0, end: 6 },
      down: { start: 5, end: 6 },
    },
  };

  assert.deepEqual(getWalkAnimationPlayback("player", walkAnimation, 1, 0), {
    rangeName: "right",
    range: { start: 0, end: 6 },
    startFrame: 0,
    flipX: false,
  });
  assert.deepEqual(getWalkAnimationPlayback("player", walkAnimation, -1, 0), {
    rangeName: "right",
    range: { start: 0, end: 6 },
    startFrame: 0,
    flipX: true,
  });
  assert.deepEqual(getWalkAnimationPlayback("player", walkAnimation, 0, -1), {
    rangeName: "default",
    range: { start: 0, end: 6 },
    startFrame: 0,
    flipX: false,
  });
  assert.deepEqual(getWalkAnimationPlayback("player", walkAnimation, 0, 1), {
    rangeName: "down",
    range: { start: 5, end: 6 },
    startFrame: 5,
    flipX: false,
  });
});

test("gunship movement playback exposes one-shot intro and outro around a looping cruise", () => {
  const visualSpec = {
    walk: {
      key: "spritesheet:units:purple:gunship:walk",
      frameRate: 12,
      ranges: {
        default: { start: 0, end: 6 },
        right: { start: 0, end: 6 },
        down: { start: 5, end: 6 },
      },
      movementPhases: {
        start: { start: 0, end: 1 },
        loop: { start: 2, end: 4 },
        end: { start: 5, end: 6 },
      },
    },
  };
  const travelDurationMs = getBattleMoveDuration(2);
  const playback = getUnitMovementPlayback(visualSpec, 2);

  assert.equal(playback.style, "phased-path");
  assert.equal(playback.travelDurationMs, travelDurationMs);
  assert.equal(playback.totalDurationMs, travelDurationMs + 167);
  assert.deepEqual(playback.directionalFrameIndices, {
    down: [5, 6],
  });
  assert.deepEqual(playback.phases, {
    start: {
      frameIndices: [0, 1],
      durationMs: 167,
    },
    loop: {
      frameIndices: [2, 3, 4],
    },
    end: {
      frameIndices: [5, 6],
      durationMs: 167,
    },
  });
});

test("ordinary path and teleport movement playback retain their existing timing", () => {
  const pathPlayback = getUnitMovementPlayback(
    {
      walk: {
        key: "spritesheet:units:blue:gunship:walk",
        frameRate: 12,
        ranges: {
          default: { start: 0, end: 6 },
        },
      },
    },
    2,
  );
  const teleportPlayback = getUnitMovementPlayback(
    {
      walk: {
        key: "spritesheet:units:purple:grunt:walk",
        frameRate: 6,
        movementStyle: "teleport",
        ranges: {
          default: { start: 0, end: 4 },
        },
      },
    },
    2,
  );

  assert.equal(pathPlayback.style, "path");
  assert.equal(pathPlayback.totalDurationMs, getBattleMoveDuration(2));
  assert.equal(teleportPlayback.style, "teleport");
  assert.deepEqual(teleportPlayback.forwardFrameIndices, [0, 1, 2, 3, 4]);
  assert.deepEqual(teleportPlayback.reverseFrameIndices, [4, 3, 2, 1, 0]);
  assert.equal(teleportPlayback.totalDurationMs, 1667);
});
