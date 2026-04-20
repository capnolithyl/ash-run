import Phaser from "phaser";
import { BuildingLayer } from "../view/BuildingLayer.js";
import { GridLayer } from "../view/GridLayer.js";
import { SelectionLayer } from "../view/SelectionLayer.js";
import { UnitLayer } from "../view/UnitLayer.js";

function isBattleScreen(state) {
  return state?.screen === "battle" && state?.battleSnapshot;
}

export class BattleScene extends Phaser.Scene {
  constructor() {
    super("BattleScene");
    this.latestState = null;
    this.hoveredTile = null;
  }

  create() {
    this.controller = this.game.registry.get("controller");
    this.gridLayer = new GridLayer(this);
    this.selectionLayer = new SelectionLayer(this);
    this.buildingLayer = new BuildingLayer(this);
    this.unitLayer = new UnitLayer(this);

    if (!this.controller) {
      return;
    }

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

    this.input.on("pointerdown", async (pointer) => {
      if (!isBattleScreen(this.latestState) || this.latestState?.battleUi?.pauseMenuOpen) {
        return;
      }

      const layout = this.getBoardLayout(this.latestState.battleSnapshot);
      const tileX = Math.floor((pointer.x - layout.originX) / layout.cellSize);
      const tileY = Math.floor((pointer.y - layout.originY) / layout.cellSize);

      if (
        tileX < 0 ||
        tileY < 0 ||
        tileX >= this.latestState.battleSnapshot.map.width ||
        tileY >= this.latestState.battleSnapshot.map.height
      ) {
        return;
      }

      await this.controller.handleBattleTileClick(tileX, tileY);
    });

    this.input.on("pointermove", (pointer) => {
      if (!isBattleScreen(this.latestState)) {
        return;
      }

      const layout = this.getBoardLayout(this.latestState.battleSnapshot);
      const tileX = Math.floor((pointer.x - layout.originX) / layout.cellSize);
      const tileY = Math.floor((pointer.y - layout.originY) / layout.cellSize);

      const isInsideBoard =
        tileX >= 0 &&
        tileY >= 0 &&
        tileX < this.latestState.battleSnapshot.map.width &&
        tileY < this.latestState.battleSnapshot.map.height;

      const nextHoveredTile = isInsideBoard ? { x: tileX, y: tileY } : null;
      const hoveredChanged =
        this.hoveredTile?.x !== nextHoveredTile?.x ||
        this.hoveredTile?.y !== nextHoveredTile?.y;

      if (hoveredChanged) {
        this.hoveredTile = nextHoveredTile;
        this.renderBattle();
      }
    });
  }

  getBoardLayout(snapshot) {
    const maxBoardWidth = this.scale.width * 0.56;
    const maxBoardHeight = this.scale.height * 0.72;
    const cellSize = Math.floor(
      Math.min(maxBoardWidth / snapshot.map.width, maxBoardHeight / snapshot.map.height)
    );
    const boardWidth = snapshot.map.width * cellSize;
    const boardHeight = snapshot.map.height * cellSize;

    return {
      cellSize,
      originX: Math.round((this.scale.width - boardWidth) / 2),
      originY: Math.round((this.scale.height - boardHeight) / 2)
    };
  }

  renderBattle() {
    if (!isBattleScreen(this.latestState)) {
      this.gridLayer.clear();
      this.selectionLayer.clear();
      this.buildingLayer.clear();
      this.unitLayer.clear();
      this.hoveredTile = null;
      return;
    }

    const snapshot = this.latestState.battleSnapshot;
    const layout = this.getBoardLayout(snapshot);
    const showGrid = this.latestState.metaState.options.showGrid;

    this.gridLayer.render(snapshot, layout);
    this.selectionLayer.render(snapshot, layout, showGrid, this.hoveredTile);
    this.buildingLayer.render(snapshot, layout);
    this.unitLayer.render(snapshot, layout);
  }
}
