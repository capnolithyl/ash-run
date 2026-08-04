import { getBoardSnapshot, isBattleScreen, isBoardScreen } from "./screenState.js";
import {
  BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS,
  BATTLE_COMBAT_CUTSCENE_FOCUS_OUT_MS
} from "../../../core/constants.js";
import { getBattleCombatCutsceneState } from "../../view/battleCombatCutscene.js";

const COMBAT_CUTSCENE_FOCUS_MAX_ZOOM = 2.35;
const COMBAT_CUTSCENE_FOCUS_PADDING_TILES = 1.45;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampCameraScroll(value, minimum, maximum) {
  if (minimum > maximum) {
    return (minimum + maximum) / 2;
  }

  return clamp(value, minimum, maximum);
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function getCutsceneFocusTiles(cutscene) {
  return (cutscene?.focusTiles ?? []).filter(
    (tile) => Number.isFinite(tile?.x) && Number.isFinite(tile?.y)
  );
}

function getTileCenter(layout, tile) {
  return {
    x: layout.originX + tile.x * layout.cellSize + layout.cellSize / 2,
    y: layout.originY + tile.y * layout.cellSize + layout.cellSize / 2
  };
}

function resolveTutorialCameraTile(snapshot, target) {
  if (!target) return null;
  if (Number.isInteger(target.x) && Number.isInteger(target.y)) return target;
  if (target.type === "unit") {
    return [...(snapshot.player?.units ?? []), ...(snapshot.enemy?.units ?? [])].find((unit) => unit.id === target.id) ?? null;
  }
  if (target.type === "building") {
    return (snapshot.map?.buildings ?? []).find((building) => building.id === target.id) ?? null;
  }
  return null;
}

function getTutorialFocusKey(snapshot, target, tile, panelPlacement) {
  const targetId = target?.id ?? `${tile.x},${tile.y}`;
  return `${snapshot.id}:${target?.type ?? "tile"}:${targetId}:${tile.x},${tile.y}:${panelPlacement}`;
}

function isTutorialTargetInSafeViewport(camera, screenX, screenY, panelPlacement, compact) {
  const insideBoardViewport =
    screenX >= camera.width * 0.1 &&
    screenX <= camera.width * 0.9 &&
    screenY >= camera.height * 0.1 &&
    screenY <= camera.height * (compact ? 0.56 : 0.88);

  if (!insideBoardViewport || compact || screenY < camera.height * 0.5) {
    return insideBoardViewport;
  }

  // On desktop the guide occupies only one lower corner. Its placement already
  // moves away from the cue, so lower-center tiles do not need camera motion.
  return panelPlacement === "right"
    ? screenX <= camera.width * 0.64
    : screenX >= camera.width * 0.36;
}

export const battleSceneCameraMethods = {
  focusTutorialTarget(snapshot, layout, target, _stepId = "", panelPlacement = "left") {
    const tile = resolveTutorialCameraTile(snapshot, target);
    if (!tile) return;

    const focusKey = getTutorialFocusKey(snapshot, target, tile, panelPlacement);
    if (this.lastTutorialCameraFocusKey === focusKey) return;
    this.lastTutorialCameraFocusKey = focusKey;

    const camera = this.cameras.main;
    const center = getTileCenter(layout, tile);
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const screenX = originX + (center.x - camera.scrollX - originX) * camera.zoom;
    const screenY = originY + (center.y - camera.scrollY - originY) * camera.zoom;
    const compact = this.scale.width <= 900;

    if (
      isTutorialTargetInSafeViewport(
        camera,
        screenX,
        screenY,
        panelPlacement,
        compact
      )
    ) {
      return;
    }

    // At the base zoom the battlefield is fitted to the viewport and the
    // normal camera clamp fixes scroll at zero. Starting a pan here only makes
    // the map lurch before the clamp restores it, which is especially visible
    // when a highlighted tutorial command advances to the next cue.
    if (camera.zoom <= this.getCameraZoomRange().min + 0.001) {
      return;
    }

    const duration = prefersReducedMotion() ? 0 : 260;
    if (duration === 0) {
      camera.centerOn(center.x, center.y - layout.cellSize);
      this.clampBattlefieldCamera();
      return;
    }

    camera.pan(center.x, center.y - layout.cellSize, duration, "Sine.easeOut", false, (_camera, progress) => {
      if (progress >= 1) this.clampBattlefieldCamera();
    });
  },

  canUseBattlefieldCamera() {
    return (
      isBoardScreen(this.latestState) &&
      (!isBattleScreen(this.latestState) ||
        (!this.latestState?.battleUi?.pauseMenuOpen &&
          !this.latestState?.battleUi?.combatCutscene))
    );
  },

  getCameraZoomRange() {
    return {
      min: 1,
      max: 3.25
    };
  },

  getWheelZoomTarget(deltaY) {
    const camera = this.cameras.main;
    const { min, max } = this.getCameraZoomRange();
    const baseZoom = Number.isFinite(this.cameraTargetZoom)
      ? this.cameraTargetZoom
      : camera.zoom;
    const normalizedDelta = clamp(deltaY, -180, 180);
    const zoomMultiplier = Math.exp(normalizedDelta * -0.00042);

    return clamp(baseZoom * zoomMultiplier, min, max);
  },

  getBoardBounds(snapshot, layout) {
    return {
      left: layout.originX,
      top: layout.originY,
      right: layout.originX + snapshot.map.width * layout.cellSize,
      bottom: layout.originY + snapshot.map.height * layout.cellSize
    };
  },

  getBattlefieldCameraPanRoom(viewportWidth, viewportHeight) {
    const isCompact = this.scale.width <= 1024;

    return {
      x: viewportWidth * (isCompact ? 0.78 : 0.68),
      y: viewportHeight * (isCompact ? 0.82 : 0.72)
    };
  },

  getClampedBattlefieldScroll(snapshot, layout, zoom, scrollX, scrollY) {
    const camera = this.cameras.main;
    const bounds = this.getBoardBounds(snapshot, layout);
    const viewportScreenWidth = camera.width || this.scale.width;
    const viewportScreenHeight = camera.height || this.scale.height;
    const originX = viewportScreenWidth * camera.originX;
    const originY = viewportScreenHeight * camera.originY;
    const viewportWidth = viewportScreenWidth / zoom;
    const viewportHeight = viewportScreenHeight / zoom;
    const panRoom = this.getBattlefieldCameraPanRoom(viewportWidth, viewportHeight);
    const minX = bounds.left - panRoom.x - originX + originX / zoom;
    const maxX = bounds.right + panRoom.x - originX - (viewportScreenWidth - originX) / zoom;
    const minY = bounds.top - panRoom.y - originY + originY / zoom;
    const maxY =
      bounds.bottom + panRoom.y - originY - (viewportScreenHeight - originY) / zoom;

    if (zoom <= this.getCameraZoomRange().min + 0.001) {
      return {
        scrollX: 0,
        scrollY: 0
      };
    }

    return {
      scrollX: clampCameraScroll(scrollX, minX, maxX),
      scrollY: clampCameraScroll(scrollY, minY, maxY)
    };
  },

  clampBattlefieldCamera() {
    const snapshot = getBoardSnapshot(this.latestState, this.hoveredTile);

    if (!snapshot) {
      return;
    }

    const camera = this.cameras.main;
    const layout = this.getBoardLayout(snapshot);
    const { scrollX, scrollY } = this.getClampedBattlefieldScroll(
      snapshot,
      layout,
      camera.zoom,
      camera.scrollX,
      camera.scrollY
    );

    camera.setScroll(scrollX, scrollY);
  },

  resetBattlefieldCamera() {
    this.clearCombatCutsceneCameraFocus?.({ restore: false });
    this.stopBattlefieldZoomTween();
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    this.cameraTargetZoom = 1;
    this.pointerPan = null;
    this.touchGesture = null;
    this.touchPointers.clear();
    this.clickCandidate = null;
    this.mapEditorPaintPointerId = null;
    this.mapEditorPaintToolId = null;
    this.lastPaintedTileKey = null;
    this.lastTutorialCameraFocusKey = null;
  },

  stopBattlefieldZoomTween() {
    if (this.cameraZoomTween) {
      this.cameraZoomTween.stop();
      this.cameraZoomTween = null;
    }
  },

  getWorldPointFromScreen(screenX, screenY) {
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const viewportX = screenX - camera.x;
    const viewportY = screenY - camera.y;

    return {
      x: camera.scrollX + originX + (viewportX - originX) / camera.zoom,
      y: camera.scrollY + originY + (viewportY - originY) / camera.zoom
    };
  },

  getScrollForZoomAnchor(screenX, screenY, worldAnchor, zoom) {
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const viewportX = screenX - camera.x;
    const viewportY = screenY - camera.y;

    return {
      x: worldAnchor.x - originX - (viewportX - originX) / zoom,
      y: worldAnchor.y - originY - (viewportY - originY) / zoom
    };
  },

  applyBattlefieldZoomAt(screenX, screenY, worldAnchor, zoom) {
    const camera = this.cameras.main;
    const scroll = this.getScrollForZoomAnchor(screenX, screenY, worldAnchor, zoom);

    camera.setZoom(zoom);
    camera.setScroll(scroll.x, scroll.y);
    this.clampBattlefieldCamera();
  },

  zoomBattlefieldAt(screenX, screenY, nextZoom, options = {}) {
    const camera = this.cameras.main;
    const smooth = options.smooth === true;
    const { min, max } = this.getCameraZoomRange();
    const clampedZoom = clamp(nextZoom, min, max);

    this.cameraTargetZoom = clampedZoom;

    if (Math.abs(clampedZoom - camera.zoom) < 0.001) {
      this.stopBattlefieldZoomTween();
      return;
    }

    this.stopBattlefieldZoomTween();
    const worldAnchor = this.getWorldPointFromScreen(screenX, screenY);

    if (!smooth) {
      this.applyBattlefieldZoomAt(screenX, screenY, worldAnchor, clampedZoom);
      this.updateHoveredTileFromScreenPoint(screenX, screenY);
      return;
    }

    const tweenState = { zoom: camera.zoom };
    this.cameraZoomTween = this.tweens.add({
      targets: tweenState,
      zoom: clampedZoom,
      duration: 120,
      ease: "Sine.easeOut",
      onUpdate: () => {
        this.applyBattlefieldZoomAt(screenX, screenY, worldAnchor, tweenState.zoom);
        this.updateHoveredTileFromScreenPoint(screenX, screenY);
      },
      onComplete: () => {
        this.applyBattlefieldZoomAt(screenX, screenY, worldAnchor, clampedZoom);
        this.cameraZoomTween = null;
        this.updateHoveredTileFromScreenPoint(screenX, screenY);
      }
    });

    this.updateHoveredTileFromScreenPoint(screenX, screenY);
  },

  panBattlefieldBy(deltaX, deltaY) {
    const camera = this.cameras.main;
    this.stopBattlefieldZoomTween();
    this.cameraTargetZoom = camera.zoom;

    if (camera.zoom <= this.getCameraZoomRange().min + 0.001) {
      return;
    }

    camera.scrollX -= deltaX / camera.zoom;
    camera.scrollY -= deltaY / camera.zoom;
    this.clampBattlefieldCamera();
  },

  captureBattlefieldCameraState() {
    const camera = this.cameras.main;

    return {
      zoom: camera.zoom,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
      targetZoom: Number.isFinite(this.cameraTargetZoom) ? this.cameraTargetZoom : camera.zoom
    };
  },

  applyBattlefieldCameraState(cameraState) {
    if (!cameraState) {
      return;
    }

    const camera = this.cameras.main;
    camera.setZoom(cameraState.zoom);
    camera.setScroll(cameraState.scrollX, cameraState.scrollY);
    this.cameraTargetZoom = cameraState.targetZoom ?? cameraState.zoom;
    this.clampBattlefieldCamera();
  },

  getCombatCutsceneCameraTarget(snapshot, layout, cutscene) {
    const focusTiles = getCutsceneFocusTiles(cutscene);

    if (focusTiles.length < 2) {
      return null;
    }

    const camera = this.cameras.main;
    const { min, max } = this.getCameraZoomRange();
    const maxFocusZoom = Math.max(min, Math.min(max, COMBAT_CUTSCENE_FOCUS_MAX_ZOOM));
    const points = focusTiles.map((tile) => getTileCenter(layout, tile));
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const padding = layout.cellSize * COMBAT_CUTSCENE_FOCUS_PADDING_TILES;
    const focusWidth = Math.max(layout.cellSize, maxX - minX + padding * 2);
    const focusHeight = Math.max(layout.cellSize, maxY - minY + padding * 2);
    const zoomForWidth = this.scale.width / focusWidth;
    const zoomForHeight = this.scale.height / focusHeight;
    const zoom = clamp(Math.min(zoomForWidth, zoomForHeight), min, maxFocusZoom);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const scroll = this.getClampedBattlefieldScroll(
      snapshot,
      layout,
      zoom,
      centerX - camera.width * camera.originX,
      centerY - camera.height * camera.originY
    );

    return {
      zoom,
      scrollX: scroll.scrollX,
      scrollY: scroll.scrollY,
      targetZoom: zoom
    };
  },

  stopCombatCutsceneCameraTween() {
    if (this.combatCutsceneCameraTween) {
      this.combatCutsceneCameraTween.stop();
      this.combatCutsceneCameraTween = null;
    }
  },

  tweenBattlefieldCameraTo(cameraState, duration, onComplete = null) {
    if (!cameraState) {
      return;
    }

    this.stopBattlefieldZoomTween();
    this.stopCombatCutsceneCameraTween();

    const camera = this.cameras.main;
    const effectiveDuration = prefersReducedMotion() ? 1 : Math.max(1, duration);

    if (effectiveDuration <= 1) {
      this.applyBattlefieldCameraState(cameraState);
      onComplete?.();
      return;
    }

    const tweenState = {
      zoom: camera.zoom,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY
    };

    this.cameraTargetZoom = cameraState.targetZoom ?? cameraState.zoom;
    this.combatCutsceneCameraTween = this.tweens.add({
      targets: tweenState,
      zoom: cameraState.zoom,
      scrollX: cameraState.scrollX,
      scrollY: cameraState.scrollY,
      duration: effectiveDuration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        camera.setZoom(tweenState.zoom);
        camera.setScroll(tweenState.scrollX, tweenState.scrollY);
        this.clampBattlefieldCamera();
      },
      onComplete: () => {
        this.applyBattlefieldCameraState(cameraState);
        this.combatCutsceneCameraTween = null;
        onComplete?.();
      }
    });
  },

  clearCombatCutsceneCameraTimers() {
    for (const timer of this.combatCutsceneCameraTimers ?? []) {
      timer.remove(false);
    }

    this.combatCutsceneCameraTimers = [];
  },

  clearCombatCutsceneCameraFocus({ restore = true } = {}) {
    const focusState = this.combatCutsceneCamera;

    if (!focusState) {
      return;
    }

    this.clearCombatCutsceneCameraTimers();

    if (restore && focusState.restoring) {
      return;
    }

    this.stopCombatCutsceneCameraTween();

    if (restore && focusState.restore) {
      this.applyBattlefieldCameraState(focusState.restore);
    }

    this.combatCutsceneCamera = null;
  },

  scheduleCombatCutsceneCameraFocus(snapshot, layout, cutscene) {
    if (!cutscene?.id || !cutscene?.startedAt) {
      return;
    }

    const key = `${cutscene.id}:${cutscene.startedAt}`;

    if (this.combatCutsceneCamera?.key === key) {
      return;
    }

    this.clearCombatCutsceneCameraFocus({ restore: true });

    const timeline = getBattleCombatCutsceneState(cutscene);
    const focusState = {
      key,
      restore: this.captureBattlefieldCameraState(),
      restoring: false
    };
    this.combatCutsceneCamera = focusState;

    const scheduleAt = (targetMs, callback) => {
      const delay = Math.max(0, targetMs - timeline.elapsedMs);

      if (delay <= 0) {
        callback();
        return;
      }

      const timer = this.time.delayedCall(delay, () => {
        this.combatCutsceneCameraTimers = (this.combatCutsceneCameraTimers ?? []).filter(
          (activeTimer) => activeTimer !== timer
        );

        if (this.combatCutsceneCamera?.key !== key) {
          return;
        }

        callback();
      });

      this.combatCutsceneCameraTimers ??= [];
      this.combatCutsceneCameraTimers.push(timer);
    };

    if (timeline.elapsedMs >= timeline.closeStartMs) {
      this.restoreCombatCutsceneCameraFocus(key, cutscene);
      return;
    }

    scheduleAt(cutscene.focusStartMs ?? 0, () =>
      this.startCombatCutsceneCameraFocus(snapshot, layout, cutscene, key)
    );
    scheduleAt(timeline.closeStartMs, () => this.restoreCombatCutsceneCameraFocus(key, cutscene));
  },

  startCombatCutsceneCameraFocus(snapshot, layout, cutscene, key) {
    if (this.combatCutsceneCamera?.key !== key) {
      return;
    }

    const target = this.getCombatCutsceneCameraTarget(snapshot, layout, cutscene);

    if (!target) {
      return;
    }

    this.tweenBattlefieldCameraTo(
      target,
      cutscene.focusInMs ?? BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS
    );
  },

  restoreCombatCutsceneCameraFocus(key, cutscene) {
    const focusState = this.combatCutsceneCamera;

    if (!focusState || focusState.key !== key) {
      return;
    }

    focusState.restoring = true;
    this.clearCombatCutsceneCameraTimers();
    this.tweenBattlefieldCameraTo(
      focusState.restore,
      cutscene?.focusOutMs ?? BATTLE_COMBAT_CUTSCENE_FOCUS_OUT_MS,
      () => {
        if (this.combatCutsceneCamera?.key === key) {
          this.combatCutsceneCamera = null;
        }
      }
    );
  }
};
