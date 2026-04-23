import Phaser from "phaser";
import {
  BATTLE_MOVE_SETTLE_MS,
  BATTLE_TURN_BANNER_SETTLE_MS
} from "../../core/constants.js";
import { getMovementPath, getSelectedUnit } from "../../simulation/selectors.js";
import { preloadSpriteAssets } from "../assets.js";
import { deriveBattleAnimationEvents } from "../view/battleAnimationEvents.js";
import { BattleFxLayer } from "../view/BattleFxLayer.js";
import { BuildingLayer } from "../view/BuildingLayer.js";
import { GridLayer } from "../view/GridLayer.js";
import { SelectionLayer } from "../view/SelectionLayer.js";
import { UnitLayer } from "../view/UnitLayer.js";

function isBattleScreen(state) {
  return state?.screen === "battle" && state?.battleSnapshot;
}

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
  return Phaser.Math.Distance.Between(left.x, left.y, right.x, right.y);
}

function getMidpointBetweenPoints(left, right) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2
  };
}

function getHoveredMovementPath(snapshot, hoveredTile) {
  const presentation = snapshot.presentation ?? {};
  const selectedUnit = getSelectedUnit(snapshot);

  if (
    !hoveredTile ||
    !selectedUnit ||
    selectedUnit.owner !== "player" ||
    snapshot.turn.activeSide !== "player" ||
    selectedUnit.hasMoved ||
    presentation.pendingAction?.unitId === selectedUnit.id
  ) {
    return [];
  }

  const isReachable = presentation.reachableTiles?.some(
    (tile) => tile.x === hoveredTile.x && tile.y === hoveredTile.y
  );

  if (!isReachable) {
    return [];
  }

  return getMovementPath(
    snapshot,
    selectedUnit,
    presentation.movementBudget ?? selectedUnit.stats.movement,
    hoveredTile.x,
    hoveredTile.y
  );
}

function getTurnTransitionDelay(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot || previousSnapshot.turn.activeSide === nextSnapshot.turn.activeSide) {
    return 0;
  }

  return BATTLE_TURN_BANNER_SETTLE_MS;
}

function getHoveredAttackForecast(snapshot, hoveredTile) {
  if (!hoveredTile) {
    return null;
  }

  const presentation = snapshot.presentation ?? {};
  const pendingAction = presentation.pendingAction;
  const isTargeting = pendingAction?.isTargeting && pendingAction?.mode === "fire";

  if (!isTargeting) {
    return null;
  }

  const hoveredEnemy = snapshot.enemy.units.find(
    (unit) => unit.current.hp > 0 && unit.x === hoveredTile.x && unit.y === hoveredTile.y
  );

  if (!hoveredEnemy) {
    return null;
  }

  return presentation.attackForecasts?.[hoveredEnemy.id] ?? null;
}

export class BattleScene extends Phaser.Scene {
  constructor() {
    super("BattleScene");
    this.latestState = null;
    this.hoveredTile = null;
    this.previousSnapshot = null;
    this.cameraBattleKey = null;
    this.clickCandidate = null;
    this.pointerPan = null;
    this.touchPointers = new Map();
    this.touchGesture = null;
    this.cameraZoomTween = null;
    this.cameraTargetZoom = 1;
    this.suppressTouchClickUntil = 0;
  }

  preload() {
    preloadSpriteAssets(this);
  }

  create() {
    this.controller = this.game.registry.get("controller");
    this.gridLayer = new GridLayer(this);
    this.selectionLayer = new SelectionLayer(this);
    this.buildingLayer = new BuildingLayer(this);
    this.unitLayer = new UnitLayer(this);
    this.fxLayer = new BattleFxLayer(this);

    if (!this.controller) {
      return;
    }

    this.input.mouse?.disableContextMenu();
    this.input.addPointer?.(2);

    this.latestState = this.controller.getState();
    this.renderBattle();

    this.controller.subscribe((state) => {
      this.latestState = state;
      this.renderBattle();
    });

    this.scale.on("resize", () => {
      this.renderBattle();
    });

    this.input.keyboard?.on("keydown-ESC", () => {
      if (!isBattleScreen(this.latestState)) {
        return;
      }

      if (this.latestState?.battleUi?.pauseMenuOpen) {
        this.controller.closePauseMenu();
        return;
      }

      this.controller.openPauseMenu();
    });

    this.input.on("wheel", (pointer, _gameObjects, _deltaX, deltaY) => {
      if (!this.canUseBattlefieldCamera()) {
        return;
      }

      pointer.event?.preventDefault?.();
      this.zoomBattlefieldAt(pointer.x, pointer.y, this.getWheelZoomTarget(deltaY), {
        smooth: true
      });
    });

    this.input.on("pointerdown", async (pointer) => {
      if (!isBattleScreen(this.latestState) || this.latestState?.battleUi?.pauseMenuOpen) {
        return;
      }

      if (isRightClick(pointer)) {
        await this.controller.handleBattleContextAction();
        return;
      }

      if (isTouchPointer(pointer)) {
        this.trackTouchPointer(pointer);

        if (this.touchPointers.size >= 2) {
          this.clickCandidate = null;
          this.startTouchGesture();
          return;
        }
      }

      if (isMiddleClick(pointer)) {
        this.startPointerPan(pointer);
        return;
      }

      this.clickCandidate = {
        pointerId: getPointerId(pointer),
        x: pointer.x,
        y: pointer.y,
        moved: false,
        touch: isTouchPointer(pointer)
      };
    });

    this.input.on("pointermove", (pointer) => {
      if (!isBattleScreen(this.latestState)) {
        return;
      }

      if (isTouchPointer(pointer)) {
        this.trackTouchPointer(pointer);
      }

      if (this.pointerPan?.pointerId === getPointerId(pointer)) {
        this.panBattlefieldBy(pointer.x - this.pointerPan.x, pointer.y - this.pointerPan.y);
        this.pointerPan.x = pointer.x;
        this.pointerPan.y = pointer.y;
        this.pointerPan.moved = true;
        this.clickCandidate = null;
        return;
      }

      if (this.touchGesture || this.touchPointers.size >= 2) {
        this.updateTouchGesture();
        this.clickCandidate = null;
        return;
      }

      if (this.clickCandidate?.pointerId === getPointerId(pointer)) {
        const dragDistance = Phaser.Math.Distance.Between(
          this.clickCandidate.x,
          this.clickCandidate.y,
          pointer.x,
          pointer.y
        );

        if (dragDistance > 8) {
          this.clickCandidate.moved = true;
        }
      }

      this.updateHoveredTileFromScreenPoint(pointer.x, pointer.y);
    });

    this.input.on("pointerup", async (pointer) => {
      const pointerId = getPointerId(pointer);

      if (this.pointerPan?.pointerId === pointerId) {
        this.pointerPan = null;
        this.clickCandidate = null;
        return;
      }

      if (isTouchPointer(pointer)) {
        this.touchPointers.delete(pointerId);

        if (this.touchGesture) {
          this.touchGesture = null;
          this.suppressTouchClickUntil = Date.now() + 160;
          this.clickCandidate = null;
          return;
        }
      }

      const clickCandidate = this.clickCandidate;
      this.clickCandidate = null;

      if (
        !clickCandidate ||
        clickCandidate.pointerId !== pointerId ||
        clickCandidate.moved ||
        (clickCandidate.touch && Date.now() < this.suppressTouchClickUntil)
      ) {
        return;
      }

      const tile = this.getTileFromScreenPoint(pointer.x, pointer.y);

      if (!tile) {
        return;
      }

      await this.controller.handleBattleTileClick(tile.x, tile.y);
    });

    this.input.on("pointerupoutside", (pointer) => {
      const pointerId = getPointerId(pointer);

      if (this.pointerPan?.pointerId === pointerId) {
        this.pointerPan = null;
      }

      if (isTouchPointer(pointer)) {
        this.touchPointers.delete(pointerId);
        this.touchGesture = null;
        this.suppressTouchClickUntil = Date.now() + 160;
      }

      if (this.clickCandidate?.pointerId === pointerId) {
        this.clickCandidate = null;
      }
    });
  }

  canUseBattlefieldCamera() {
    return isBattleScreen(this.latestState) && !this.latestState?.battleUi?.pauseMenuOpen;
  }

  getCameraZoomRange() {
    return {
      min: 1,
      max: 3.25
    };
  }

  getWheelZoomTarget(deltaY) {
    const camera = this.cameras.main;
    const { min, max } = this.getCameraZoomRange();
    const baseZoom = Number.isFinite(this.cameraTargetZoom)
      ? this.cameraTargetZoom
      : camera.zoom;
    const normalizedDelta = Phaser.Math.Clamp(deltaY, -180, 180);
    const zoomMultiplier = Math.exp(normalizedDelta * -0.00042);

    return Phaser.Math.Clamp(baseZoom * zoomMultiplier, min, max);
  }

  getBoardBounds(snapshot, layout) {
    return {
      left: layout.originX,
      top: layout.originY,
      right: layout.originX + snapshot.map.width * layout.cellSize,
      bottom: layout.originY + snapshot.map.height * layout.cellSize
    };
  }

  getBattlefieldCameraPanRoom(viewportWidth, viewportHeight) {
    const isCompact = this.scale.width <= 1024;

    return {
      x: viewportWidth * (isCompact ? 0.78 : 0.68),
      y: viewportHeight * (isCompact ? 0.82 : 0.72)
    };
  }

  clampBattlefieldCamera() {
    if (!isBattleScreen(this.latestState)) {
      return;
    }

    const camera = this.cameras.main;
    const snapshot = this.latestState.battleSnapshot;
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

    const nextScrollX = Phaser.Math.Clamp(camera.scrollX, minX, maxX);
    const nextScrollY = Phaser.Math.Clamp(camera.scrollY, minY, maxY);

    camera.setScroll(nextScrollX, nextScrollY);
  }

  resetBattlefieldCamera() {
    this.stopBattlefieldZoomTween();
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    this.cameraTargetZoom = 1;
    this.pointerPan = null;
    this.touchGesture = null;
    this.touchPointers.clear();
    this.clickCandidate = null;
  }

  stopBattlefieldZoomTween() {
    if (this.cameraZoomTween) {
      this.cameraZoomTween.stop();
      this.cameraZoomTween = null;
    }
  }

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
  }

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
  }

  applyBattlefieldZoomAt(screenX, screenY, worldAnchor, zoom) {
    const camera = this.cameras.main;
    const scroll = this.getScrollForZoomAnchor(screenX, screenY, worldAnchor, zoom);

    camera.setZoom(zoom);
    camera.setScroll(scroll.x, scroll.y);
    this.clampBattlefieldCamera();
  }

  zoomBattlefieldAt(screenX, screenY, nextZoom, options = {}) {
    const camera = this.cameras.main;
    const smooth = options.smooth === true;
    const { min, max } = this.getCameraZoomRange();
    const clampedZoom = Phaser.Math.Clamp(nextZoom, min, max);

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
  }

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

  startPointerPan(pointer) {
    this.pointerPan = {
      pointerId: getPointerId(pointer),
      x: pointer.x,
      y: pointer.y,
      moved: false
    };
    this.clickCandidate = null;
  }

  trackTouchPointer(pointer) {
    this.touchPointers.set(getPointerId(pointer), {
      x: pointer.x,
      y: pointer.y
    });
  }

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
  }

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
  }

  getTileFromScreenPoint(screenX, screenY) {
    if (!isBattleScreen(this.latestState)) {
      return null;
    }

    const layout = this.getBoardLayout(this.latestState.battleSnapshot);
    const worldPoint = this.getWorldPointFromScreen(screenX, screenY);
    const tileX = Math.floor((worldPoint.x - layout.originX) / layout.cellSize);
    const tileY = Math.floor((worldPoint.y - layout.originY) / layout.cellSize);

    const isInsideBoard =
      tileX >= 0 &&
      tileY >= 0 &&
      tileX < this.latestState.battleSnapshot.map.width &&
      tileY < this.latestState.battleSnapshot.map.height;

    return isInsideBoard ? { x: tileX, y: tileY } : null;
  }

  updateHoveredTileFromScreenPoint(screenX, screenY) {
    const nextHoveredTile = this.getTileFromScreenPoint(screenX, screenY);
    const hoveredChanged =
      this.hoveredTile?.x !== nextHoveredTile?.x ||
      this.hoveredTile?.y !== nextHoveredTile?.y;

    if (hoveredChanged) {
      this.hoveredTile = nextHoveredTile;
      if (this.controller.setBattleHoverTile) {
        this.controller.setBattleHoverTile(nextHoveredTile);
      } else {
        this.renderBattle();
      }
    }
  }

  getBoardLayout(snapshot) {
    const isCompact = this.scale.width <= 1024;
    const isShort = this.scale.height <= 520;
    const reservedTop = isCompact ? (isShort ? 78 : 126) : 0;
    const reservedBottom = isCompact ? (isShort ? 72 : this.scale.width <= 560 ? 132 : 96) : 0;
    const availableHeight = Math.max(180, this.scale.height - reservedTop - reservedBottom);
    const maxBoardWidth = this.scale.width * (isCompact ? 0.94 : 0.56);
    const maxBoardHeight = isCompact ? availableHeight : this.scale.height * 0.72;
    const cellSize = Math.floor(
      Math.min(maxBoardWidth / snapshot.map.width, maxBoardHeight / snapshot.map.height)
    );
    const boardWidth = snapshot.map.width * cellSize;
    const boardHeight = snapshot.map.height * cellSize;

    return {
      cellSize,
      originX: Math.round((this.scale.width - boardWidth) / 2),
      originY: isCompact
        ? Math.round(reservedTop + Math.max(0, (availableHeight - boardHeight) / 2))
        : Math.round((this.scale.height - boardHeight) / 2)
    };
  }

  renderBattle() {
    if (!isBattleScreen(this.latestState)) {
      this.resetBattlefieldCamera();
      this.cameraBattleKey = null;
      this.gridLayer.clear();
      this.selectionLayer.clear();
      this.buildingLayer.clear();
      this.unitLayer.clear();
      this.fxLayer.clear();
      this.hoveredTile = null;
      this.previousSnapshot = null;
      return;
    }

    const snapshot = this.latestState.battleSnapshot;
    const layout = this.getBoardLayout(snapshot);
    const battleKey = `${snapshot.id}:${snapshot.map.id}`;

    if (this.cameraBattleKey !== battleKey) {
      this.cameraBattleKey = battleKey;
      this.resetBattlefieldCamera();
    } else {
      this.clampBattlefieldCamera();
    }

    const showGrid = this.latestState.metaState.options.showGrid;
    const hoveredMovementPath = getHoveredMovementPath(snapshot, this.hoveredTile);
    const hoveredAttackForecast = getHoveredAttackForecast(snapshot, this.hoveredTile);
    const previousSnapshot =
      this.previousSnapshot?.id === snapshot.id && this.previousSnapshot?.map.id === snapshot.map.id
        ? this.previousSnapshot
        : null;

    if (!previousSnapshot && this.previousSnapshot) {
      this.fxLayer.clear();
    }

    const animationEvents = deriveBattleAnimationEvents(previousSnapshot, snapshot);
    const movementEvents = animationEvents.filter((event) => event.type === "move");
    const turnTransitionDelay = getTurnTransitionDelay(previousSnapshot, snapshot);
    this.fxLayer.setScreenShakeEnabled(this.latestState.metaState.options.screenShake !== false);

    this.gridLayer.render(snapshot, layout);
    this.selectionLayer.render(
      snapshot,
      layout,
      showGrid,
      this.hoveredTile,
      hoveredMovementPath,
      hoveredAttackForecast
    );
    this.buildingLayer.render(snapshot, layout);
    this.unitLayer.render(snapshot, layout, movementEvents);
    const sequencedAnimationEvents = animationEvents.map((event) => {
      if (event.type !== "attack") {
        return event;
      }

      const moveDelay = this.unitLayer.getMoveTweenRemaining(event.attackerId);

      if (moveDelay <= 0) {
        return event;
      }

      return {
        ...event,
        delay: (event.delay ?? 0) + moveDelay + BATTLE_MOVE_SETTLE_MS
      };
    });

    for (const event of sequencedAnimationEvents) {
      if (event.type === "deploy") {
        this.fxLayer.schedule(turnTransitionDelay, () => this.unitLayer.playDeploy(event.unitId));
      }

      if (event.type === "heal" || event.type === "resupply") {
        this.fxLayer.schedule(turnTransitionDelay, () => this.unitLayer.playHeal(event.unitId));
      }

      if (event.type === "attack") {
        const attackDelay = turnTransitionDelay + (event.delay ?? 0);
        this.fxLayer.schedule(attackDelay, () =>
          this.unitLayer.playAttack(
            event.attackerId,
            event.toX - event.fromX,
            event.toY - event.fromY,
            {
              onStart: () => this.fxLayer.playAttack(event, layout),
              onImpact: () => this.unitLayer.playDamage(event.targetId)
            }
          )
        );
      }
    }

    this.fxLayer.playEvents(sequencedAnimationEvents, layout, {
      baseDelay: turnTransitionDelay,
      skipAttackVisuals: true
    });
    this.previousSnapshot = structuredClone(snapshot);
  }
}
