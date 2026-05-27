export const PHASER_RENDERER_MODE = Object.freeze({
  AUTO: "auto",
  CANVAS: "canvas",
  WEBGL: "webgl"
});

export const DEFAULT_PHASER_RENDERER_MODE = PHASER_RENDERER_MODE.AUTO;
export const PHASER_RENDERER_TYPE = Object.freeze({
  AUTO: 0,
  CANVAS: 1,
  WEBGL: 2
});

export function normalizePhaserRendererMode(value) {
  if (typeof value !== "string") {
    return DEFAULT_PHASER_RENDERER_MODE;
  }

  const normalizedValue = value.trim().toLowerCase();

  switch (normalizedValue) {
    case PHASER_RENDERER_MODE.CANVAS:
    case PHASER_RENDERER_MODE.WEBGL:
    case PHASER_RENDERER_MODE.AUTO:
      return normalizedValue;
    default:
      return DEFAULT_PHASER_RENDERER_MODE;
  }
}

export function getRequestedPhaserRendererMode(runtimeConfig = globalThis.__ASH_RUN_RUNTIME__) {
  return normalizePhaserRendererMode(runtimeConfig?.phaserRenderer);
}

/**
 * `auto` maps to Phaser.AUTO so desktop, packaged Steam builds, and browser
 * testers all prefer WebGL but can still fall back to Canvas when needed.
 */
export function resolvePhaserRendererPreference({
  requestedMode = DEFAULT_PHASER_RENDERER_MODE
} = {}) {
  const normalizedMode = normalizePhaserRendererMode(requestedMode);

  if (normalizedMode === PHASER_RENDERER_MODE.CANVAS) {
    return {
      requestedMode: normalizedMode,
      phaserType: PHASER_RENDERER_TYPE.CANVAS,
      source: "override"
    };
  }

  if (normalizedMode === PHASER_RENDERER_MODE.WEBGL) {
    return {
      requestedMode: normalizedMode,
      phaserType: PHASER_RENDERER_TYPE.WEBGL,
      source: "override"
    };
  }

  return {
    requestedMode: normalizedMode,
    phaserType: PHASER_RENDERER_TYPE.AUTO,
    source: "default"
  };
}

export function getActualPhaserRendererMode(gameOrRenderer) {
  const rendererType = gameOrRenderer?.renderer?.type ?? gameOrRenderer?.type ?? null;

  if (rendererType === PHASER_RENDERER_TYPE.CANVAS) {
    return PHASER_RENDERER_MODE.CANVAS;
  }

  if (rendererType === PHASER_RENDERER_TYPE.WEBGL) {
    return PHASER_RENDERER_MODE.WEBGL;
  }

  return PHASER_RENDERER_MODE.AUTO;
}

export function canUseBuiltinPhaserFx(gameOrRenderer) {
  const renderer = gameOrRenderer?.renderer ?? gameOrRenderer;

  return (
    getActualPhaserRendererMode(renderer) === PHASER_RENDERER_MODE.WEBGL &&
    Boolean(renderer?.pipelines)
  );
}
