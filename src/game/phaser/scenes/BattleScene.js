import Phaser from "phaser";
import {
  BATTLE_ATTACK_IMPACT_DELAY_MS,
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
      this.fxLayer.clear();
      this.hoveredTile = null;
      this.previousSnapshot = null;
      return;
    }

    const snapshot = this.latestState.battleSnapshot;
    const layout = this.getBoardLayout(snapshot);
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

    for (const event of animationEvents) {
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
            event.toY - event.fromY
          )
        );
        this.fxLayer.schedule(attackDelay + BATTLE_ATTACK_IMPACT_DELAY_MS, () =>
          this.unitLayer.playDamage(event.targetId)
        );
      }
    }

    this.fxLayer.playEvents(animationEvents, layout, {
      baseDelay: turnTransitionDelay
    });
    this.previousSnapshot = structuredClone(snapshot);
  }
}
