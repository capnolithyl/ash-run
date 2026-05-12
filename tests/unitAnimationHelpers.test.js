import test from "node:test";
import assert from "node:assert/strict";
import {
  getAnimationRange,
  getAnimationRangeFrameCount,
  getAttackAnimationPlayback,
  getOwnerIdleFlipX,
  getUnitAttackRangeName,
  getUnitDefaultTexture,
} from "../src/game/phaser/view/unitAnimationHelpers.js";

test("getUnitAttackRangeName uses horizontal direction and owner defaults", () => {
  assert.equal(getUnitAttackRangeName("player", 2), "right");
  assert.equal(getUnitAttackRangeName("player", -1), "left");
  assert.equal(getUnitAttackRangeName("player", 0), "right");
  assert.equal(getUnitAttackRangeName("enemy", 0), "left");
});

test("attack playback helper resolves the clip and duration for directional attacks", () => {
  const attackAnimation = {
    key: "spritesheet:units:player:grunt:attack",
    frameRate: 5,
    ranges: {
      left: { start: 0, end: 2 },
      right: { start: 3, end: 5 },
    },
  };

  assert.deepEqual(getAttackAnimationPlayback("player", attackAnimation, 1), {
    rangeName: "right",
    range: { start: 3, end: 5 },
    startFrame: 3,
    flipX: false,
    durationMs: 600,
  });
  assert.deepEqual(getAttackAnimationPlayback("enemy", attackAnimation, 0), {
    rangeName: "left",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: false,
    durationMs: 600,
  });
});

test("attack playback helper mirrors a single directional attack clip when needed", () => {
  const attackAnimation = {
    key: "spritesheet:units:player:grunt:attack",
    frameRate: 5,
    ranges: {
      left: { start: 0, end: 2 },
    },
  };

  assert.deepEqual(getAttackAnimationPlayback("player", attackAnimation, -1), {
    rangeName: "left",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: false,
    durationMs: 600,
  });
  assert.deepEqual(getAttackAnimationPlayback("player", attackAnimation, 1), {
    rangeName: "left",
    range: { start: 0, end: 2 },
    startFrame: 0,
    flipX: true,
    durationMs: 600,
  });
});

test("default texture helper prefers idle animation and otherwise falls back to svg", () => {
  const visualWithIdle = {
    fallbackKey: "sprite:units:enemy:grunt",
    idle: {
      key: "spritesheet:units:enemy:grunt:idle",
      ranges: {
        default: { start: 0, end: 1 },
      },
    },
  };
  const visualWithoutIdle = {
    fallbackKey: "sprite:units:player:grunt",
    idle: null,
  };

  assert.deepEqual(getUnitDefaultTexture(visualWithIdle, "enemy"), {
    key: "spritesheet:units:enemy:grunt:idle",
    frame: 0,
    flipX: false,
  });
  assert.deepEqual(getUnitDefaultTexture(visualWithoutIdle, "player"), {
    key: "sprite:units:player:grunt",
    frame: undefined,
    flipX: false,
  });
  assert.equal(getOwnerIdleFlipX("enemy"), true);
  assert.equal(getOwnerIdleFlipX("player"), false);
  assert.deepEqual(getAnimationRange(visualWithIdle.idle, "default"), { start: 0, end: 1 });
  assert.equal(getAnimationRangeFrameCount({ start: 3, end: 5 }), 3);
});
