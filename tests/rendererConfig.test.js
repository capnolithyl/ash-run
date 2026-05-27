import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASER_RENDERER_MODE,
  PHASER_RENDERER_TYPE,
  canUseBuiltinPhaserFx,
  getActualPhaserRendererMode,
  getRequestedPhaserRendererMode,
  normalizePhaserRendererMode,
  resolvePhaserRendererPreference
} from "../src/game/phaser/rendererConfig.js";

test("renderer mode helpers normalize runtime overrides", () => {
  assert.equal(normalizePhaserRendererMode("WEBGL"), PHASER_RENDERER_MODE.WEBGL);
  assert.equal(getRequestedPhaserRendererMode({ phaserRenderer: "canvas" }), PHASER_RENDERER_MODE.CANVAS);
  assert.equal(getRequestedPhaserRendererMode({ phaserRenderer: "unknown" }), PHASER_RENDERER_MODE.AUTO);
});

test("renderer preference keeps auto on Phaser AUTO and still honors explicit overrides", () => {
  const defaultPreference = resolvePhaserRendererPreference({
    requestedMode: PHASER_RENDERER_MODE.AUTO
  });
  const explicitWebgl = resolvePhaserRendererPreference({
    requestedMode: PHASER_RENDERER_MODE.WEBGL
  });
  const explicitCanvas = resolvePhaserRendererPreference({
    requestedMode: PHASER_RENDERER_MODE.CANVAS
  });

  assert.equal(defaultPreference.phaserType, PHASER_RENDERER_TYPE.AUTO);
  assert.equal(defaultPreference.source, "default");
  assert.equal(explicitWebgl.phaserType, PHASER_RENDERER_TYPE.WEBGL);
  assert.equal(explicitWebgl.source, "override");
  assert.equal(explicitCanvas.phaserType, PHASER_RENDERER_TYPE.CANVAS);
  assert.equal(explicitCanvas.source, "override");
});

test("renderer helpers detect actual renderer mode and built-in FX support", () => {
  assert.equal(getActualPhaserRendererMode({ type: PHASER_RENDERER_TYPE.CANVAS }), PHASER_RENDERER_MODE.CANVAS);
  assert.equal(
    getActualPhaserRendererMode({ renderer: { type: PHASER_RENDERER_TYPE.WEBGL } }),
    PHASER_RENDERER_MODE.WEBGL
  );
  assert.equal(canUseBuiltinPhaserFx({ type: PHASER_RENDERER_TYPE.WEBGL, pipelines: {} }), true);
  assert.equal(canUseBuiltinPhaserFx({ type: PHASER_RENDERER_TYPE.WEBGL }), false);
  assert.equal(canUseBuiltinPhaserFx({ type: PHASER_RENDERER_TYPE.CANVAS, pipelines: {} }), false);
});
