import { getBoardSnapshot, isBattleScreen, isBoardScreen } from "./screenState.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export const battleSceneCameraMethods = {
  canUseBattlefieldCamera() {
    return (
      isBoardScreen(this.latestState) &&
      (!isBattleScreen(this.latestState) || !this.latestState?.battleUi?.pauseMenuOpen)
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

  clampBattlefieldCamera() {
    const snapshot = getBoardSnapshot(this.latestState, this.hoveredTile);

    if (!snapshot) {
      return;
    }

    const camera = this.cameras.main;
    const layout = this.getBoardLayout(snapshot);
    const bounds = this.getBoardBounds(snapshot, layout);
    const viewportWidth = this.scale.width / camera.zoom;
    const viewportHeight = this.scale.height / camera.zoom;
    const panRoom = this.getBattlefieldCameraPanRoom(viewportWidth, viewportHeight);
    const minX = Math.min(bounds.left - panRoom.x, 0);
    const maxX = Math.max(bounds.right - viewportWidth + panRoom.x, 0);
    const minY = Math.min(bounds.top - panRoom.y, 0);
    const maxY = Math.max(bounds.bottom - viewportHeight + panRoom.y, 0);

    if (camera.zoom <= this.getCameraZoomRange().min + 0.001) {
      camera.setScroll(0, 0);
      return;
    }

    const nextScrollX = clamp(camera.scrollX, minX, maxX);
    const nextScrollY = clamp(camera.scrollY, minY, maxY);

    camera.setScroll(nextScrollX, nextScrollY);
  },

  resetBattlefieldCamera() {
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
  }
};
