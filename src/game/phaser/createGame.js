import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { BattleScene } from "./scenes/BattleScene.js";
import { ShellScene } from "./scenes/ShellScene.js";

function shouldUseCanvasRenderer() {
  if (typeof navigator === "undefined") {
    return false;
  }

  // Electron's Chromium WebGL path is currently dropping the renderer during
  // Phaser texture boot on Windows, while the Canvas renderer remains stable.
  return /Electron/i.test(navigator.userAgent);
}

function hasPaintedCanvasSurface(canvas) {
  if (!canvas?.width || !canvas?.height) {
    return false;
  }

  try {
    const context = canvas.getContext("2d");
    const colorBuckets = new Set();
    let visibleSamples = 0;

    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const x = Math.min(canvas.width - 1, Math.floor((column + 0.5) * canvas.width / 7));
        const y = Math.min(canvas.height - 1, Math.floor((row + 0.5) * canvas.height / 5));
        const pixel = context.getImageData(x, y, 1, 1).data;

        if (pixel[3] > 0) {
          visibleSamples += 1;
        }
        colorBuckets.add(`${pixel[0] >> 4}:${pixel[1] >> 4}:${pixel[2] >> 4}:${pixel[3] >> 5}`);
      }
    }

    // Phaser clears to an opaque background color, so alpha alone cannot
    // distinguish a healthy battlefield from Chromium's invalidated surface.
    return visibleSamples > 0 && colorBuckets.size > 2;
  } catch {
    // A readable backing surface is not available (for example, a tainted
    // browser canvas), so Phaser's completed render is the best signal.
    return true;
  }
}

function rebuildInvalidCanvasSurface(game, width, height) {
  const canvas = game.canvas;
  const renderer = game.renderer;
  if (!canvas || renderer?.type !== Phaser.CANVAS) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  renderer.gameCanvas = canvas;
  renderer.gameContext = context;
  renderer.setContext(context);
  renderer.resize(width, height);
  game.context = context;
  game.scene.getScenes(false).forEach((scene) => {
    scene.sys.context = context;
  });
}

function restartStalledGameLoop(game) {
  const loop = game?.loop;

  if (!loop || typeof document === "undefined" || document.hidden) {
    return;
  }

  const observedFrame = Number(loop.frame) || 0;
  window.requestAnimationFrame(() => {
    if ((Number(loop.frame) || 0) !== observedFrame || document.hidden) {
      return;
    }

    // Electron can invalidate Phaser's outstanding RAF while leaving both
    // TimeStep.running and RequestAnimationFrame.isRunning set to true. A
    // sleep/wake cycle is required to register a fresh browser callback.
    loop.sleep?.();
    loop.wake?.(true);
  });
}

export function refreshGameRenderer(game, parent, { clearHover = false } = {}) {
  if (!game || !parent?.isConnected) {
    return false;
  }

  const width = parent.clientWidth;
  const height = parent.clientHeight;

  if (width < 64 || height < 64) {
    return false;
  }

  game.loop?.focus?.();
  game.resume?.();
  if (!game.loop?.running) {
    game.loop?.wake?.(true);
  }
  const previousCanvasBounds = game.scale?.canvasBounds
    ? {
        x: game.scale.canvasBounds.x,
        y: game.scale.canvasBounds.y,
        width: game.scale.canvasBounds.width,
        height: game.scale.canvasBounds.height
      }
    : null;
  const dimensionsChanged =
    game.scale.width !== width ||
    game.scale.height !== height ||
    game.canvas?.width !== width ||
    game.canvas?.height !== height;

  if (dimensionsChanged) {
    game.scale.resize(width, height);
  }

  // Electron can move and resize the outer window without another DOM resize
  // after Chromium has settled. Refresh Phaser's page-to-canvas transform on
  // every recovery frame so subsequent pointer events use the new rectangle.
  game.scale.updateBounds?.();
  if (game.scale?.displayScale && game.scale?.baseSize && game.scale?.canvasBounds) {
    game.scale.displayScale.set(
      game.scale.baseSize.width / Math.max(1, game.scale.canvasBounds.width),
      game.scale.baseSize.height / Math.max(1, game.scale.canvasBounds.height)
    );
  }

  const canvasBoundsChanged = Boolean(
    previousCanvasBounds && game.scale?.canvasBounds && (
      previousCanvasBounds.x !== game.scale.canvasBounds.x ||
      previousCanvasBounds.y !== game.scale.canvasBounds.y ||
      previousCanvasBounds.width !== game.scale.canvasBounds.width ||
      previousCanvasBounds.height !== game.scale.canvasBounds.height
    )
  );

  const battleScene = game.scene.getScene("BattleScene");
  if (battleScene?.scene?.isActive?.()) {
    battleScene.refreshBattlefieldSurface?.({
      clearHover: clearHover || dimensionsChanged || canvasBoundsChanged
    });
  }

  let frameBeforeRefresh = Number(game.loop?.frame) || 0;
  game.loop?.tick?.();
  const canvas = game.canvas;
  let painted = (Number(game.loop?.frame) || 0) > frameBeforeRefresh &&
    hasPaintedCanvasSurface(canvas);

  // Chromium can invalidate a Canvas backing surface while Electron changes
  // fullscreen/window modes without replacing the DOM node or its context.
  // Rebuild only after an attempted Phaser frame proves the surface is blank.
  if (!painted && game.renderer?.type === Phaser.CANVAS) {
    rebuildInvalidCanvasSurface(game, width, height);
    battleScene?.refreshBattlefieldSurface?.();
    frameBeforeRefresh = Number(game.loop?.frame) || 0;
    game.loop?.tick?.();
    painted = (Number(game.loop?.frame) || 0) > frameBeforeRefresh &&
      hasPaintedCanvasSurface(canvas);
  }

  return {
    painted,
    canvasWidth: canvas?.width ?? 0,
    canvasHeight: canvas?.height ?? 0,
    parentWidth: width,
    parentHeight: height
  };
}

/**
 * Phaser renders the animated backdrop and the tactical battlefield.
 * Dense controls and menus stay in the DOM for clarity.
 */
export function createGame(parent, controller) {
  const game = new Phaser.Game({
    type: shouldUseCanvasRenderer() ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    backgroundColor: "#091210",
    render: {
      pixelArt: true,
      roundPixels: true
    },
    callbacks: {
      /**
       * Scenes need the controller during their own `create()` lifecycle.
       * Registering it here avoids a timing race during game boot.
       */
      preBoot(bootedGame) {
        bootedGame.registry.set("controller", controller);
      }
    },
    input: {
      gamepad: true
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight
    },
    scene: [BootScene, ShellScene, BattleScene]
  });

  let refreshScheduled = false;
  let refreshResolvers = [];
  let clearHoverOnRefresh = false;

  const requestRefresh = (options = {}) => new Promise((resolve) => {
    refreshResolvers.push(resolve);
    clearHoverOnRefresh ||= options.clearHover === true;

    if (refreshScheduled) {
      return;
    }

    refreshScheduled = true;
    queueMicrotask(() => {
      refreshScheduled = false;
      let result = false;
      try {
        const shouldClearHover = clearHoverOnRefresh;
        clearHoverOnRefresh = false;
        result = refreshGameRenderer(game, parent, { clearHover: shouldClearHover });
      } catch (error) {
        console.error("Unable to refresh the game renderer after a display change.", error);
        result = {
          painted: false,
          canvasWidth: game.canvas?.width ?? 0,
          canvasHeight: game.canvas?.height ?? 0,
          parentWidth: parent.clientWidth,
          parentHeight: parent.clientHeight,
          error: error?.message ?? String(error)
        };
      }
      const resolvers = refreshResolvers;
      refreshResolvers = [];
      resolvers.forEach((resolver) => resolver(result));
    });
  });

  const requestRefreshOnNextFrame = () => new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      void requestRefresh().then((result) => {
        restartStalledGameLoop(game);
        resolve(result);
      });
    });
  });

  let lastScreen = controller.getState()?.screen ?? null;
  controller.subscribe((state) => {
    if (state.screen === lastScreen) {
      return;
    }
    lastScreen = state.screen;
    void requestRefresh().then(() => requestRefreshOnNextFrame());
  });

  const acknowledgedTransitions = new Set();
  let pendingDisplayState = null;
  let rendererAcknowledgementInFlight = false;
  let rendererAcknowledgementFrame = null;

  const scheduleRendererAcknowledgement = () => {
    if (rendererAcknowledgementFrame !== null || !pendingDisplayState) {
      return;
    }

    rendererAcknowledgementFrame = window.requestAnimationFrame(() => {
      rendererAcknowledgementFrame = null;
      void acknowledgeSettledRenderer();
    });
  };

  const acknowledgeSettledRenderer = async () => {
    const displayState = pendingDisplayState;
    const transitionId = displayState?.transitionId;
    if (rendererAcknowledgementInFlight ||
        displayState?.transitionPhase !== "awaiting-renderer" ||
        !transitionId ||
        acknowledgedTransitions.has(transitionId)) {
      return;
    }

    rendererAcknowledgementInFlight = true;
    const rendererState = await requestRefresh({ clearHover: true });
    if (!rendererState) {
      rendererAcknowledgementInFlight = false;
      return;
    }

    const nextDisplayState = await globalThis.ashRun84Api
      ?.acknowledgeDisplayRenderer?.({ transitionId, ...rendererState });
    rendererAcknowledgementInFlight = false;
    if (nextDisplayState?.transitionPhase === "previewing") {
      acknowledgedTransitions.add(transitionId);
      pendingDisplayState = null;
      return;
    }

    if (nextDisplayState?.transitionId === transitionId &&
        nextDisplayState.transitionPhase === "awaiting-renderer") {
      pendingDisplayState = nextDisplayState;
      scheduleRendererAcknowledgement();
      return;
    }

    pendingDisplayState = null;
  };

  const refreshAfterParentResize = () => {
    if (pendingDisplayState) {
      void acknowledgeSettledRenderer();
      return;
    }
    void requestRefresh();
  };

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(refreshAfterParentResize)
    : null;

  if (resizeObserver) {
    resizeObserver.observe(parent);
  } else {
    window.addEventListener("resize", refreshAfterParentResize);
  }

  globalThis.ashRun84Api?.onDisplayChanged?.((displayState) => {
    if (displayState?.transitionPhase === "awaiting-renderer") {
      pendingDisplayState = displayState;
      void acknowledgeSettledRenderer();
      return;
    }

    pendingDisplayState = null;
    void requestRefresh().then(() => requestRefreshOnNextFrame());
  });

  return game;
}
