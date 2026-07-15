import Phaser from "phaser";
import { preloadSpriteAssets } from "../assets.js";
import { BattleFxLayer } from "../view/BattleFxLayer.js";
import { BuildingLayer } from "../view/BuildingLayer.js";
import { GridLayer } from "../view/GridLayer.js";
import { SelectionLayer } from "../view/SelectionLayer.js";
import { UnitLayer } from "../view/UnitLayer.js";
import { battleSceneCameraMethods } from "./battleScene/cameraControls.js";
import {
  battleSceneGamepadMethods,
  bindBattleSceneGamepadControls
} from "./battleScene/gamepadControls.js";
import {
  battleScenePointerMethods,
  bindBattleScenePointerControls
} from "./battleScene/pointerControls.js";
import { battleSceneRenderMethods } from "./battleScene/renderBoard.js";

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
    this.combatCutsceneCamera = null;
    this.combatCutsceneCameraTween = null;
    this.combatCutsceneCameraTimers = [];
    this.cameraTargetZoom = 1;
    this.suppressTouchClickUntil = 0;
    this.mapEditorPaintPointerId = null;
    this.mapEditorPaintToolId = null;
    this.lastPaintedTileKey = null;
    this.gamepadCursorTile = null;
    this.gamepadMoveDirection = null;
    this.gamepadNextMoveAt = 0;
    this.gamepadButtonState = new Map();
    this.gamepadActionBusy = false;
    this.lastEnemyMoveHoldFxId = null;
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

    bindBattleScenePointerControls(this);
    bindBattleSceneGamepadControls(this);
  }
}

Object.assign(BattleScene.prototype, battleSceneCameraMethods);
Object.assign(BattleScene.prototype, battleScenePointerMethods);
Object.assign(BattleScene.prototype, battleSceneGamepadMethods);
Object.assign(BattleScene.prototype, battleSceneRenderMethods);
