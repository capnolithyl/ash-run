import Phaser from "phaser";
import {
  BATTLE_ATTACK_WINDOW_MS,
  BATTLE_MOVE_SETTLE_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  SCREEN_IDS
} from "../../core/constants.js";
import { createMapEditorSnapshot } from "../../content/mapEditor.js";
import { getBattlefieldLayout } from "../../core/battlefieldLayout.js";
import { getMovementPath, getSelectedUnit } from "../../simulation/selectors.js";
import { preloadSpriteAssets } from "../assets.js";
import { deriveBattleAnimationEvents } from "../view/battleAnimationEvents.js";
import { BattleFxLayer } from "../view/BattleFxLayer.js";
import { BuildingLayer } from "../view/BuildingLayer.js";
import { GridLayer } from "../view/GridLayer.js";
import { SelectionLayer } from "../view/SelectionLayer.js";
import { UnitLayer } from "../view/UnitLayer.js";

function isBattleScreen(state) {
  return state?.screen === SCREEN_IDS.BATTLE && state?.battleSnapshot;
}

function isMapEditorScreen(state) {
  return state?.screen === SCREEN_IDS.MAP_EDITOR && state?.mapEditor?.mapData;
}

function isBoardScreen(state) {
  return isBattleScreen(state) || isMapEditorScreen(state);
}

function getBoardSnapshot(state) {
  if (isBattleScreen(state)) {
    return state.battleSnapshot;
  }

  if (isMapEditorScreen(state)) {
    return createMapEditorSnapshot(state.mapEditor.mapData, state.mapEditor.selectedTile);
  }

  return null;
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
  const isSlipstream =
    presentation.pendingAction?.unitId === selectedUnit?.id &&
    presentation.pendingAction?.isSlipstream;

  if (
    !hoveredTile ||
    !selectedUnit ||
    selectedUnit.owner !== "player" ||
    snapshot.turn.activeSide !== "player" ||
    (!isSlipstream && selectedUnit.hasMoved) ||
    (presentation.pendingAction?.unitId === selectedUnit.id && !isSlipstream)
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

  const forecast = presentation.attackForecasts?.[hoveredEnemy.id] ?? null;

  if (!forecast) {
    return null;
  }

  return {
    ...forecast,
    targetName: hoveredEnemy.name
  };
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
    this.mapEditorPaintPointerId = null;
    this.lastPaintedTileKey = null;
    this.gamepadCursorTile = null;
    this.gamepadMoveDirection = null;
    this.gamepadNextMoveAt = 0;
    this.gamepadButtonState = new Map();
    this.gamepadActionBusy = false;
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

    this.input.gamepad?.on?.("connected", () => {
      this.seedGamepadCursorFromState();
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
      if (!isBoardScreen(this.latestState)) {
        return;
      }

      if (isBattleScreen(this.latestState) && this.latestState?.battleUi?.pauseMenuOpen) {
        return;
      }

      if (isBattleScreen(this.latestState) && isRightClick(pointer)) {
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

      if (isMapEditorScreen(this.latestState)) {
        const tile = this.getTileFromScreenPoint(pointer.x, pointer.y);

        if (!tile) {
          return;
        }

        this.mapEditorPaintPointerId = getPointerId(pointer);
        this.lastPaintedTileKey = null;
        this.controller.startMapEditorPaint?.();
        this.paintEditorTile(tile);
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
      if (!isBoardScreen(this.latestState)) {
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

      if (
        isMapEditorScreen(this.latestState) &&
        this.mapEditorPaintPointerId === getPointerId(pointer)
      ) {
        const tile = this.getTileFromScreenPoint(pointer.x, pointer.y);

        if (tile) {
          this.paintEditorTile(tile);
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

      if (isMapEditorScreen(this.latestState) && this.mapEditorPaintPointerId === pointerId) {
        this.mapEditorPaintPointerId = null;
        this.lastPaintedTileKey = null;
        this.controller.stopMapEditorPaint?.();
        return;
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

      if (this.mapEditorPaintPointerId === pointerId) {
        this.mapEditorPaintPointerId = null;
        this.lastPaintedTileKey = null;
        this.controller.stopMapEditorPaint?.();
      }
    });
  }

  canUseBattlefieldCamera() {
    return (
      isBoardScreen(this.latestState) &&
      (!isBattleScreen(this.latestState) || !this.latestState?.battleUi?.pauseMenuOpen)
    );
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
    const snapshot = getBoardSnapshot(this.latestState);

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
    this.mapEditorPaintPointerId = null;
    this.lastPaintedTileKey = null;
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

  paintEditorTile(tile) {
    const tileKey = `${tile.x},${tile.y}`;

    if (this.lastPaintedTileKey === tileKey) {
      return;
    }

    this.lastPaintedTileKey = tileKey;
    this.controller.applyMapEditorToolAt?.(tile.x, tile.y);
  }

  getTileFromScreenPoint(screenX, screenY) {
    const snapshot = getBoardSnapshot(this.latestState);

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
  }

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

  getBoardLayout(snapshot) {
    return getBattlefieldLayout({
      viewportWidth: this.scale.width,
      viewportHeight: this.scale.height,
      mapWidth: snapshot.map.width,
      mapHeight: snapshot.map.height
    });
  }

  renderBattle() {
    const snapshot = getBoardSnapshot(this.latestState);

    if (!snapshot) {
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

    const isBattle = isBattleScreen(this.latestState);
    const layout = this.getBoardLayout(snapshot);
    const battleKey = `${this.latestState.screen}:${snapshot.id}:${snapshot.map.id}`;

    if (this.cameraBattleKey !== battleKey) {
      this.cameraBattleKey = battleKey;
      this.resetBattlefieldCamera();
    } else {
      this.clampBattlefieldCamera();
    }

    if (!isBattle) {
      this.fxLayer.clear();
      this.gridLayer.render(snapshot, layout, { useBattlefieldBackdrop: false });
      this.selectionLayer.render(snapshot, layout, false, this.hoveredTile, [], null, {
        editorSpawns: {
          player: snapshot.map.playerSpawns,
          enemy: snapshot.map.enemySpawns
        }
      });
      this.buildingLayer.render(snapshot, layout);
      this.unitLayer.render(snapshot, layout, []);
      this.previousSnapshot = null;
      return;
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
    const attackEvents = animationEvents
      .filter((event) => event.type === "attack")
      .sort((left, right) => (left.delay ?? 0) - (right.delay ?? 0));
    const experienceEvents = animationEvents.filter((event) => event.type === "experience");
    const deployUnitIds = new Set(
      animationEvents
        .filter((event) => event.type === "deploy")
        .map((event) => event.unitId)
    );
    const destroyUnitIds = new Set(
      animationEvents
        .filter((event) => event.type === "destroy")
        .map((event) => event.unitId)
    );
    const damageByUnitId = new Map();
    const previousUnitsById = previousSnapshot
      ? new Map(
          [...previousSnapshot.player.units, ...previousSnapshot.enemy.units].map((unit) => [
            unit.id,
            unit
          ])
        )
      : new Map();
    const nextUnitsById = new Map(
      [...snapshot.player.units, ...snapshot.enemy.units].map((unit) => [unit.id, unit])
    );

    previousUnitsById.forEach((previousUnit, unitId) => {
      const nextUnit = nextUnitsById.get(unitId);

      if (!nextUnit || nextUnit.current.hp < previousUnit.current.hp) {
        damageByUnitId.set(unitId, {
          nextHp: nextUnit?.current.hp ?? 0,
          maxHealth: previousUnit.stats.maxHealth
        });
      }
    });
    const turnTransitionDelay = getTurnTransitionDelay(previousSnapshot, snapshot);
    this.fxLayer.setScreenShakeEnabled(this.latestState.metaState.options.screenShake !== false);

    this.gridLayer.render(snapshot, layout, { useBattlefieldBackdrop: true });
    this.selectionLayer.render(
      snapshot,
      layout,
      showGrid,
      this.hoveredTile,
      hoveredMovementPath,
      hoveredAttackForecast
    );
    this.buildingLayer.render(snapshot, layout);
    this.unitLayer.render(snapshot, layout, movementEvents, {
      deployUnitIds,
      destroyUnitIds,
      damageByUnitId
    });
    const maxMoveDelay = movementEvents.length
      ? Math.max(
          ...movementEvents.map((event) =>
            event.unitId ? this.unitLayer.getMoveTweenRemaining(event.unitId) : 0
          )
        )
      : 0;
    const destroyEventByUnitId = new Map(
      animationEvents
        .filter((event) => event.type === "destroy")
        .map((event) => [event.unitId, event])
    );
    const attackDrivenDestroyUnitIds = new Set(
      attackEvents
        .filter((event) => destroyEventByUnitId.has(event.targetId))
        .map((event) => event.targetId)
    );
    const experienceRevealDelay = 180;

    for (const unitId of attackDrivenDestroyUnitIds) {
      this.unitLayer.holdForDestroy(unitId);
    }

    for (const event of animationEvents) {
      if (event.type === "deploy") {
        if (event.fromUnload && event.carrierId) {
          this.fxLayer.schedule(turnTransitionDelay, () => {
            this.unitLayer.queueAfterMovement(
              event.carrierId,
              () => {
                this.unitLayer.playDeploy(event.unitId);
                this.fxLayer.playDeploy(event, layout);
              },
              BATTLE_MOVE_SETTLE_MS
            );
          });
        } else {
          this.fxLayer.schedule(turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS, () => {
            this.unitLayer.playDeploy(event.unitId);
            this.fxLayer.playDeploy(event, layout);
          });
        }
      }

      if (event.type === "capture") {
        this.fxLayer.schedule(
          turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS,
          () => this.fxLayer.playCapture(event, layout)
        );
      }

      if (event.type === "destroy") {
        if (attackDrivenDestroyUnitIds.has(event.unitId)) {
          continue;
        }

        this.unitLayer.scheduleDestroy(event.unitId, turnTransitionDelay + (event.delay ?? 0));
        this.fxLayer.schedule(turnTransitionDelay + (event.delay ?? 0), () =>
          this.fxLayer.playDestroy(event, layout)
        );
      }

      if (event.type === "heal" || event.type === "resupply") {
        this.fxLayer.schedule(turnTransitionDelay, () => this.unitLayer.playHeal(event.unitId));
      }
    }

    if (attackEvents.length > 0) {
      const playAttackSequence = (index = 0) => {
        if (index >= attackEvents.length) {
          if (experienceEvents.length > 0) {
            this.fxLayer.schedule(experienceRevealDelay, () => {
              experienceEvents.forEach((event) => this.fxLayer.playExperience(event, layout));
            });
          }
          return;
        }

        const event = attackEvents[index];
        const destroyEvent = destroyEventByUnitId.get(event.targetId);

        this.unitLayer.playAttack(
          event.attackerId,
          event.toX - event.fromX,
          event.toY - event.fromY,
          {
            onStart: () => {
              this.fxLayer.playAttack(event, layout);

              if (destroyEvent) {
                this.unitLayer.scheduleDestroy(event.targetId, BATTLE_ATTACK_WINDOW_MS);
                this.fxLayer.schedule(BATTLE_ATTACK_WINDOW_MS, () =>
                  this.fxLayer.playDestroy(destroyEvent, layout)
                );
              }

              this.fxLayer.schedule(BATTLE_ATTACK_WINDOW_MS, () => playAttackSequence(index + 1));
            },
            onImpact: () => {
              this.unitLayer.playDamage(event.targetId);
              this.fxLayer.playDamageNumber(event, layout);
            }
          }
        );
      };

      const firstAttack = attackEvents[0];
      const firstAttackMoveDelay = this.unitLayer.getMoveTweenRemaining(firstAttack.attackerId);

      this.fxLayer.schedule(turnTransitionDelay, () => {
        if (firstAttackMoveDelay > 0) {
          this.unitLayer.queueAfterMovement(
            firstAttack.attackerId,
            () => playAttackSequence(0),
            BATTLE_MOVE_SETTLE_MS
          );
          return;
        }

        playAttackSequence(0);
      });
    } else if (experienceEvents.length > 0) {
      this.fxLayer.schedule(turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS, () => {
        experienceEvents.forEach((event) => this.fxLayer.playExperience(event, layout));
      });
    }

    this.fxLayer.playEvents(
      animationEvents.filter(
        (event) =>
          event.type !== "attack" &&
          event.type !== "experience" &&
          event.type !== "capture" &&
          event.type !== "deploy" &&
          event.type !== "destroy"
      ),
      layout,
      {
        baseDelay: turnTransitionDelay
      }
    );
    this.previousSnapshot = structuredClone(snapshot);
  }

  update(time) {
    this.pollGamepadInput(time);
  }

  pollGamepadInput(time) {
    const gamepad = this.getPrimaryGamepad();

    if (!gamepad || !this.controller) {
      return;
    }

    if (!isBattleScreen(this.latestState)) {
      this.gamepadButtonState.clear();
      return;
    }

    if (this.shouldDeferGamepadToDom()) {
      this.syncGamepadButtonState(gamepad);
      this.gamepadMoveDirection = null;
      this.gamepadNextMoveAt = 0;
      return;
    }

    const pauseMenuOpen = this.latestState?.battleUi?.pauseMenuOpen === true;

    if (this.consumeGamepadButtonPress(gamepad, 9)) {
      if (pauseMenuOpen) {
        this.controller.closePauseMenu();
      } else {
        this.controller.openPauseMenu();
      }
      return;
    }

    if (pauseMenuOpen) {
      if (this.consumeGamepadButtonPress(gamepad, 1)) {
        this.controller.closePauseMenu();
      }
      return;
    }

    if (this.consumeGamepadButtonPress(gamepad, 5) || this.consumeGamepadButtonPress(gamepad, 4)) {
      this.runGamepadAction(() => this.controller.selectNextReadyUnit());
    }

    if (this.consumeGamepadButtonPress(gamepad, 1)) {
      this.runGamepadAction(() => this.controller.handleBattleContextAction());
    }

    if (this.consumeGamepadButtonPress(gamepad, 0)) {
      const tile = this.getGamepadCursorTile();

      if (tile) {
        this.runGamepadAction(() => this.controller.handleBattleTileClick(tile.x, tile.y));
      }
    }

    const moveDirection = this.getGamepadMoveDirection(gamepad);

    if (!moveDirection) {
      this.gamepadMoveDirection = null;
      this.gamepadNextMoveAt = 0;
      return;
    }

    const directionChanged =
      !this.gamepadMoveDirection ||
      this.gamepadMoveDirection.x !== moveDirection.x ||
      this.gamepadMoveDirection.y !== moveDirection.y;

    if (!directionChanged && time < this.gamepadNextMoveAt) {
      return;
    }

    this.moveGamepadCursor(moveDirection.x, moveDirection.y);
    this.gamepadMoveDirection = moveDirection;
    this.gamepadNextMoveAt = time + (directionChanged ? 220 : 110);
  }

  getPrimaryGamepad() {
    const gamepads = this.input.gamepad?.gamepads ?? [];
    return gamepads.find((gamepad) => gamepad?.connected) ?? null;
  }

  shouldDeferGamepadToDom() {
    if (typeof document === "undefined") {
      return false;
    }

    return Boolean(
      document.querySelector(
        "#ui-root[data-input-mode='controller'] .is-controller-focused, #ui-root[data-input-mode='controller'] .battle-command-prompt, #ui-root[data-input-mode='controller'] .battle-overlay"
      )
    );
  }

  consumeGamepadButtonPress(gamepad, buttonIndex) {
    const pressed = Boolean(gamepad?.buttons?.[buttonIndex]?.pressed);
    const previous = this.gamepadButtonState.get(buttonIndex) === true;
    this.gamepadButtonState.set(buttonIndex, pressed);
    return pressed && !previous;
  }

  syncGamepadButtonState(gamepad) {
    for (const buttonIndex of [0, 1, 4, 5, 9]) {
      this.gamepadButtonState.set(buttonIndex, Boolean(gamepad?.buttons?.[buttonIndex]?.pressed));
    }
  }

  getGamepadMoveDirection(gamepad) {
    const axisX = Number(gamepad?.axes?.[0]?.getValue?.() ?? 0);
    const axisY = Number(gamepad?.axes?.[1]?.getValue?.() ?? 0);
    const threshold = 0.5;
    const dpadLeft = Boolean(gamepad?.buttons?.[14]?.pressed);
    const dpadRight = Boolean(gamepad?.buttons?.[15]?.pressed);
    const dpadUp = Boolean(gamepad?.buttons?.[12]?.pressed);
    const dpadDown = Boolean(gamepad?.buttons?.[13]?.pressed);
    const horizontal = dpadLeft ? -1 : dpadRight ? 1 : axisX <= -threshold ? -1 : axisX >= threshold ? 1 : 0;
    const vertical = dpadUp ? -1 : dpadDown ? 1 : axisY <= -threshold ? -1 : axisY >= threshold ? 1 : 0;

    if (!horizontal && !vertical) {
      return null;
    }

    if (Math.abs(axisX) > Math.abs(axisY) && horizontal) {
      return { x: horizontal, y: 0 };
    }

    if (Math.abs(axisY) > Math.abs(axisX) && vertical) {
      return { x: 0, y: vertical };
    }

    if (horizontal) {
      return { x: horizontal, y: 0 };
    }

    return { x: 0, y: vertical };
  }

  seedGamepadCursorFromState() {
    if (!isBattleScreen(this.latestState)) {
      this.gamepadCursorTile = null;
      return;
    }

    const selectedTile = this.latestState.battleSnapshot?.presentation?.selectedTile;

    this.gamepadCursorTile = selectedTile
      ? { x: selectedTile.x, y: selectedTile.y }
      : this.gamepadCursorTile;
  }

  getGamepadCursorTile() {
    if (!isBattleScreen(this.latestState)) {
      return null;
    }

    const snapshot = this.latestState.battleSnapshot;

    if (!this.gamepadCursorTile) {
      this.seedGamepadCursorFromState();
    }

    if (!this.gamepadCursorTile) {
      this.gamepadCursorTile = { x: 0, y: 0 };
    }

    this.gamepadCursorTile = {
      x: Phaser.Math.Clamp(this.gamepadCursorTile.x, 0, snapshot.map.width - 1),
      y: Phaser.Math.Clamp(this.gamepadCursorTile.y, 0, snapshot.map.height - 1)
    };

    return this.gamepadCursorTile;
  }

  moveGamepadCursor(deltaX, deltaY) {
    const tile = this.getGamepadCursorTile();

    if (!tile) {
      return;
    }

    const snapshot = this.latestState.battleSnapshot;
    const nextTile = {
      x: Phaser.Math.Clamp(tile.x + deltaX, 0, snapshot.map.width - 1),
      y: Phaser.Math.Clamp(tile.y + deltaY, 0, snapshot.map.height - 1)
    };

    if (nextTile.x === tile.x && nextTile.y === tile.y) {
      return;
    }

    this.gamepadCursorTile = nextTile;
    this.hoveredTile = nextTile;

    if (this.controller.setBattleHoverTile) {
      this.controller.setBattleHoverTile(nextTile);
    } else {
      this.renderBattle();
    }
  }

  runGamepadAction(action) {
    if (this.gamepadActionBusy) {
      return;
    }

    this.gamepadActionBusy = true;
    Promise.resolve(action()).finally(() => {
      this.gamepadActionBusy = false;
    });
  }
}
