import { MAP_EDITOR_TOOL_IDS } from "../../../content/mapEditor.js";
import { getBoardSnapshot, isBattleScreen, isBoardScreen, isMapEditorScreen } from "./screenState.js";

function isRightClick(pointer) {
  return pointer?.button === 2 || pointer?.rightButtonDown?.();
}

function isMiddleClick(pointer) {
  return pointer?.button === 1 || pointer?.middleButtonDown?.();
}

function isTouchPointer(pointer) {
  return Boolean(
    pointer?.event?.pointerType === "touch" ||
      pointer?.pointerType === "touch" ||
      pointer?.wasTouch ||
      pointer?.event?.type?.startsWith?.("touch") ||
      pointer?.event?.changedTouches
  );
}

function getPointerId(pointer) {
  return pointer?.id ?? pointer?.pointerId ?? pointer?.event?.pointerId ?? 0;
}

function getDistanceBetweenPoints(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function getMidpointBetweenPoints(left, right) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2
  };
}

export function bindBattleScenePointerControls(scene) {
  scene.input.keyboard?.on("keydown-ESC", () => {
    if (!isBattleScreen(scene.latestState)) {
      return;
    }

    if (scene.latestState?.battleUi?.pauseMenuOpen) {
      scene.controller.closePauseMenu();
      return;
    }

    scene.controller.openPauseMenu();
  });

  scene.input.on("wheel", (pointer, _gameObjects, _deltaX, deltaY) => {
    if (!scene.canUseBattlefieldCamera()) {
      return;
    }

    pointer.event?.preventDefault?.();
    scene.zoomBattlefieldAt(pointer.x, pointer.y, scene.getWheelZoomTarget(deltaY), {
      smooth: true
    });
  });

  scene.input.on("pointerdown", async (pointer) => {
    if (!isBoardScreen(scene.latestState)) {
      return;
    }

    if (isBattleScreen(scene.latestState) && scene.latestState?.battleUi?.pauseMenuOpen) {
      return;
    }

    if (isBattleScreen(scene.latestState) && isRightClick(pointer)) {
      await scene.controller.handleBattleContextAction();
      return;
    }

    if (isTouchPointer(pointer)) {
      scene.trackTouchPointer(pointer);

      if (scene.touchPointers.size >= 2) {
        scene.clickCandidate = null;
        scene.startTouchGesture();
        return;
      }
    }

    if (isMiddleClick(pointer)) {
      scene.startPointerPan(pointer);
      return;
    }

    if (isMapEditorScreen(scene.latestState)) {
      const tile = scene.getTileFromScreenPoint(pointer.x, pointer.y);

      if (!tile) {
        return;
      }

      scene.mapEditorPaintPointerId = getPointerId(pointer);
      scene.mapEditorPaintToolId = isRightClick(pointer) ? MAP_EDITOR_TOOL_IDS.ERASER : null;
      scene.lastPaintedTileKey = null;
      scene.controller.startMapEditorPaint?.();
      scene.paintEditorTile(tile);
      return;
    }

    scene.clickCandidate = {
      pointerId: getPointerId(pointer),
      x: pointer.x,
      y: pointer.y,
      moved: false,
      touch: isTouchPointer(pointer)
    };
  });

  scene.input.on("pointermove", (pointer) => {
    if (!isBoardScreen(scene.latestState)) {
      return;
    }

    if (isTouchPointer(pointer)) {
      scene.trackTouchPointer(pointer);
    }

    if (scene.pointerPan?.pointerId === getPointerId(pointer)) {
      scene.panBattlefieldBy(pointer.x - scene.pointerPan.x, pointer.y - scene.pointerPan.y);
      scene.pointerPan.x = pointer.x;
      scene.pointerPan.y = pointer.y;
      scene.pointerPan.moved = true;
      scene.clickCandidate = null;
      return;
    }

    if (scene.touchGesture || scene.touchPointers.size >= 2) {
      scene.updateTouchGesture();
      scene.clickCandidate = null;
      return;
    }

    if (scene.clickCandidate?.pointerId === getPointerId(pointer)) {
      const dragDistance = Math.hypot(
        scene.clickCandidate.x - pointer.x,
        scene.clickCandidate.y - pointer.y
      );

      if (dragDistance > 8) {
        scene.clickCandidate.moved = true;
      }
    }

    if (
      isMapEditorScreen(scene.latestState) &&
      scene.mapEditorPaintPointerId === getPointerId(pointer)
    ) {
      const tile = scene.getTileFromScreenPoint(pointer.x, pointer.y);

      if (tile) {
        scene.paintEditorTile(tile);
      }
    }

    scene.updateHoveredTileFromScreenPoint(pointer.x, pointer.y);
  });

  scene.input.on("pointerup", async (pointer) => {
    const pointerId = getPointerId(pointer);

    if (scene.pointerPan?.pointerId === pointerId) {
      scene.pointerPan = null;
      scene.clickCandidate = null;
      return;
    }

    if (isTouchPointer(pointer)) {
      scene.touchPointers.delete(pointerId);

      if (scene.touchGesture) {
        scene.touchGesture = null;
        scene.suppressTouchClickUntil = Date.now() + 160;
        scene.clickCandidate = null;
        return;
      }
    }

    if (isMapEditorScreen(scene.latestState) && scene.mapEditorPaintPointerId === pointerId) {
      scene.mapEditorPaintPointerId = null;
      scene.mapEditorPaintToolId = null;
      scene.lastPaintedTileKey = null;
      scene.controller.stopMapEditorPaint?.();
      return;
    }

    const clickCandidate = scene.clickCandidate;
    scene.clickCandidate = null;

    if (
      !clickCandidate ||
      clickCandidate.pointerId !== pointerId ||
      clickCandidate.moved ||
      (clickCandidate.touch && Date.now() < scene.suppressTouchClickUntil)
    ) {
      return;
    }

    const tile = scene.getTileFromScreenPoint(pointer.x, pointer.y);

    if (!tile) {
      return;
    }

    await scene.controller.handleBattleTileClick(tile.x, tile.y);
  });

  scene.input.on("pointerupoutside", (pointer) => {
    const pointerId = getPointerId(pointer);

    if (scene.pointerPan?.pointerId === pointerId) {
      scene.pointerPan = null;
    }

    if (isTouchPointer(pointer)) {
      scene.touchPointers.delete(pointerId);
      scene.touchGesture = null;
      scene.suppressTouchClickUntil = Date.now() + 160;
    }

    if (scene.clickCandidate?.pointerId === pointerId) {
      scene.clickCandidate = null;
    }

    if (scene.mapEditorPaintPointerId === pointerId) {
      scene.mapEditorPaintPointerId = null;
      scene.mapEditorPaintToolId = null;
      scene.lastPaintedTileKey = null;
      scene.controller.stopMapEditorPaint?.();
    }
  });
}

export const battleScenePointerMethods = {
  startPointerPan(pointer) {
    this.pointerPan = {
      pointerId: getPointerId(pointer),
      x: pointer.x,
      y: pointer.y,
      moved: false
    };
    this.clickCandidate = null;
  },

  trackTouchPointer(pointer) {
    this.touchPointers.set(getPointerId(pointer), {
      x: pointer.x,
      y: pointer.y
    });
  },

  /**
   * Track two-finger gestures separately from taps so mobile camera navigation
   * never leaks into board selection or map-paint actions.
   */
  startTouchGesture() {
    const points = [...this.touchPointers.values()].slice(0, 2);

    if (points.length < 2) {
      this.touchGesture = null;
      return;
    }

    this.touchGesture = {
      distance: Math.max(1, getDistanceBetweenPoints(points[0], points[1])),
      midpoint: getMidpointBetweenPoints(points[0], points[1]),
      zoom: this.cameras.main.zoom
    };
  },

  updateTouchGesture() {
    const points = [...this.touchPointers.values()].slice(0, 2);

    if (points.length < 2) {
      this.touchGesture = null;
      return;
    }

    if (!this.touchGesture) {
      this.startTouchGesture();
      return;
    }

    const midpoint = getMidpointBetweenPoints(points[0], points[1]);
    const distance = Math.max(1, getDistanceBetweenPoints(points[0], points[1]));
    const zoomRatio = distance / this.touchGesture.distance;
    const targetZoom = this.touchGesture.zoom * zoomRatio;

    this.panBattlefieldBy(
      midpoint.x - this.touchGesture.midpoint.x,
      midpoint.y - this.touchGesture.midpoint.y
    );
    this.zoomBattlefieldAt(midpoint.x, midpoint.y, targetZoom);
    this.touchGesture.midpoint = midpoint;
  },

  paintEditorTile(tile) {
    const tileKey = `${tile.x},${tile.y}`;

    if (this.lastPaintedTileKey === tileKey) {
      return;
    }

    this.lastPaintedTileKey = tileKey;
    this.controller.applyMapEditorToolAt?.(tile.x, tile.y, {
      toolId: this.mapEditorPaintToolId
    });
  },

  getTileFromScreenPoint(screenX, screenY) {
    const snapshot = getBoardSnapshot(this.latestState, this.hoveredTile);

    if (!snapshot) {
      return null;
    }

    const layout = this.getBoardLayout(snapshot);
    const worldPoint = this.getWorldPointFromScreen(screenX, screenY);
    const tileX = Math.floor((worldPoint.x - layout.originX) / layout.cellSize);
    const tileY = Math.floor((worldPoint.y - layout.originY) / layout.cellSize);

    const isInsideBoard =
      tileX >= 0 &&
      tileY >= 0 &&
      tileX < snapshot.map.width &&
      tileY < snapshot.map.height;

    return isInsideBoard ? { x: tileX, y: tileY } : null;
  },

  updateHoveredTileFromScreenPoint(screenX, screenY) {
    const nextHoveredTile = this.getTileFromScreenPoint(screenX, screenY);
    const hoveredChanged =
      this.hoveredTile?.x !== nextHoveredTile?.x ||
      this.hoveredTile?.y !== nextHoveredTile?.y;

    if (hoveredChanged) {
      this.hoveredTile = nextHoveredTile;
      if (isBattleScreen(this.latestState) && this.controller.setBattleHoverTile) {
        this.controller.setBattleHoverTile(nextHoveredTile);
      } else {
        this.renderBattle();
      }
    }
  }
};
