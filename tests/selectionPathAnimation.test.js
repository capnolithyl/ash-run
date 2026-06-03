import test from "node:test";
import assert from "node:assert/strict";
import {
  createMovementPathTransitionState,
  getMovementPathAnimationDurationMs,
  interpolateMovementPath,
  resolveMovementPathFrame,
} from "../src/game/phaser/view/selectionPathAnimation.js";

test("same-source valid paths interpolate between old and new route points", () => {
  const state = createMovementPathTransitionState(
    {
      contextKey: "battle-a",
      targetKey: "0,0|1,0",
      targetPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      displayPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      contextKey: "battle-a",
      targetPath: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
      nowMs: 1000,
      durationMs: 120,
    },
  );

  const frame = resolveMovementPathFrame(state, 1060);

  assert.equal(state.isAnimating, true);
  assert.deepEqual(frame.displayPath, [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
  ]);
});

test("interpolation grows paths when the target route has more points", () => {
  assert.deepEqual(
    interpolateMovementPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      0.5,
    ),
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1.5, y: 0 },
    ],
  );
});

test("different source tile snaps to the target path", () => {
  const state = createMovementPathTransitionState(
    {
      contextKey: "battle-a",
      targetKey: "0,0|1,0",
      targetPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      displayPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      contextKey: "battle-a",
      targetPath: [
        { x: 2, y: 2 },
        { x: 2, y: 3 },
      ],
      nowMs: 1000,
      durationMs: 120,
    },
  );

  assert.equal(state.isAnimating, false);
  assert.deepEqual(state.displayPath, [
    { x: 2, y: 2 },
    { x: 2, y: 3 },
  ]);
});

test("different context snaps to the target path", () => {
  const state = createMovementPathTransitionState(
    {
      contextKey: "battle-a",
      targetKey: "0,0|1,0",
      targetPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      displayPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      contextKey: "battle-b",
      targetPath: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
      nowMs: 1000,
      durationMs: 120,
    },
  );

  assert.equal(state.isAnimating, false);
  assert.deepEqual(state.displayPath, [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  ]);
});

test("empty or unreachable target clears immediately", () => {
  const state = createMovementPathTransitionState(
    {
      contextKey: "battle-a",
      targetKey: "0,0|1,0",
      targetPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      displayPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      contextKey: "battle-a",
      targetPath: [],
      nowMs: 1000,
      durationMs: 120,
    },
  );

  assert.equal(state.isAnimating, false);
  assert.deepEqual(state.displayPath, []);
  assert.deepEqual(state.targetPath, []);
});

test("reduced-motion duration resolves to instant", () => {
  assert.equal(getMovementPathAnimationDurationMs(true), 0);

  const state = createMovementPathTransitionState(
    {
      contextKey: "battle-a",
      targetKey: "0,0|1,0",
      targetPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      displayPath: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      contextKey: "battle-a",
      targetPath: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
      nowMs: 1000,
      durationMs: getMovementPathAnimationDurationMs(true),
    },
  );

  assert.equal(state.isAnimating, false);
  assert.deepEqual(state.displayPath, [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  ]);
});
