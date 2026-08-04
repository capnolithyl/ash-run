import test from "node:test";
import assert from "node:assert/strict";
import { battleSceneCameraMethods } from "../src/game/phaser/scenes/battleScene/cameraControls.js";

function createCameraContext({ zoom = 1, width = 1000, height = 800 } = {}) {
  const panCalls = [];
  const camera = {
    width,
    height,
    originX: 0.5,
    originY: 0.5,
    scrollX: 0,
    scrollY: 0,
    zoom,
    pan(...args) {
      panCalls.push(args);
    },
    centerOn() {}
  };

  return {
    context: {
      cameras: { main: camera },
      scale: { width, height },
      getCameraZoomRange: battleSceneCameraMethods.getCameraZoomRange,
      clampBattlefieldCamera() {}
    },
    panCalls
  };
}

const snapshot = {
  id: "tutorial-camera-test",
  player: { units: [] },
  enemy: { units: [] },
  map: { buildings: [] }
};
const layout = { originX: 0, originY: 0, cellSize: 100 };

test("tutorial cues never create a transient camera lurch at the fitted base zoom", () => {
  const { context, panCalls } = createCameraContext();

  battleSceneCameraMethods.focusTutorialTarget.call(
    context,
    snapshot,
    layout,
    { type: "tile", x: 9, y: 7 },
    "move-again",
    "right"
  );

  assert.equal(panCalls.length, 0);
});

test("desktop tutorial cues leave visible lower-center targets stable", () => {
  const { context, panCalls } = createCameraContext({ zoom: 1.25 });

  battleSceneCameraMethods.focusTutorialTarget.call(
    context,
    snapshot,
    layout,
    { type: "tile", x: 4, y: 4 },
    "move-again",
    "right"
  );

  assert.equal(panCalls.length, 0);
});

test("tutorial camera focuses a genuinely off-screen cue once across step changes", () => {
  const { context, panCalls } = createCameraContext({ zoom: 2 });
  const target = { type: "tile", x: 9, y: 7 };

  battleSceneCameraMethods.focusTutorialTarget.call(
    context,
    snapshot,
    layout,
    target,
    "first-step",
    "left"
  );
  battleSceneCameraMethods.focusTutorialTarget.call(
    context,
    snapshot,
    layout,
    target,
    "next-step",
    "left"
  );

  assert.equal(panCalls.length, 1);
});
