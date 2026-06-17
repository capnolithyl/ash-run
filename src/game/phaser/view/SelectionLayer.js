import Phaser from "phaser";
import { buildForecastTooltipLabel } from "./selectionTooltip.js";
import {
  createMovementPathTransitionState,
  getMovementPathAnimationDurationMs,
  getMovementPathKey,
  resolveMovementPathFrame
} from "./selectionPathAnimation.js";
import { getOwnerColor } from "./ownerPalette.js";

const SELECTION_DEPTH = 24;
const CURSOR_DEPTH = 34;
const TOOLTIP_BACKGROUND_DEPTH = 62;
const TOOLTIP_LABEL_DEPTH = 63;

function drawCornerMarkers(graphics, x, y, size, color, alpha = 1) {
  const inset = Math.max(3, Math.floor(size * 0.08));
  const arm = Math.max(7, Math.floor(size * 0.16));
  const left = x + inset;
  const right = x + size - inset;
  const top = y + inset;
  const bottom = y + size - inset;

  graphics.lineStyle(3, color, alpha);

  graphics.beginPath();
  graphics.moveTo(left, top + arm);
  graphics.lineTo(left, top);
  graphics.lineTo(left + arm, top);
  graphics.strokePath();

  graphics.beginPath();
  graphics.moveTo(right - arm, top);
  graphics.lineTo(right, top);
  graphics.lineTo(right, top + arm);
  graphics.strokePath();

  graphics.beginPath();
  graphics.moveTo(left, bottom - arm);
  graphics.lineTo(left, bottom);
  graphics.lineTo(left + arm, bottom);
  graphics.strokePath();

  graphics.beginPath();
  graphics.moveTo(right - arm, bottom);
  graphics.lineTo(right, bottom);
  graphics.lineTo(right, bottom - arm);
  graphics.strokePath();
}

function getTileCenter(layout, tile) {
  return {
    x: layout.originX + tile.x * layout.cellSize + layout.cellSize / 2,
    y: layout.originY + tile.y * layout.cellSize + layout.cellSize / 2
  };
}

function getSceneTime(scene) {
  return scene?.time?.now ?? scene?.game?.loop?.time ?? 0;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function getMovementPathContextKey(snapshot, layout) {
  return [
    snapshot?.id ?? "",
    snapshot?.map?.id ?? "",
    snapshot?.map?.width ?? "",
    snapshot?.map?.height ?? "",
    snapshot?.presentation?.selectedUnitId ?? "",
    layout.originX,
    layout.originY,
    layout.cellSize
  ].join(":");
}

function drawMovementPath(graphics, layout, path, accentColor = 0xff8a3d) {
  if (!path || path.length < 2) {
    return;
  }

  const points = path.map((tile) => getTileCenter(layout, tile));

  graphics.lineStyle(Math.max(7, Math.floor(layout.cellSize * 0.16)), 0x12061f, 0.92);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();

  graphics.lineStyle(Math.max(4, Math.floor(layout.cellSize * 0.1)), 0xfff2d4, 0.96);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();

  graphics.lineStyle(Math.max(2, Math.floor(layout.cellSize * 0.05)), accentColor, 0.95);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();

  for (const point of points.slice(1, -1)) {
    graphics.fillStyle(0xfff2d4, 0.94);
    graphics.fillCircle(point.x, point.y, Math.max(3.5, layout.cellSize * 0.07));
    graphics.lineStyle(2, accentColor, 0.9);
    graphics.strokeCircle(point.x, point.y, Math.max(3.5, layout.cellSize * 0.07));
  }

  const tip = points.at(-1);
  const previous = points.at(-2);
  const angle = Phaser.Math.Angle.Between(previous.x, previous.y, tip.x, tip.y);
  const headSize = Math.max(10, layout.cellSize * 0.2);
  const leftAngle = angle + Math.PI * 0.82;
  const rightAngle = angle - Math.PI * 0.82;

  graphics.fillStyle(0xfff2d4, 0.98);
  graphics.lineStyle(2, accentColor, 0.96);
  graphics.beginPath();
  graphics.moveTo(tip.x, tip.y);
  graphics.lineTo(
    tip.x + Math.cos(leftAngle) * headSize,
    tip.y + Math.sin(leftAngle) * headSize
  );
  graphics.lineTo(
    tip.x + Math.cos(rightAngle) * headSize,
    tip.y + Math.sin(rightAngle) * headSize
  );
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

function drawSpawnMarker(graphics, layout, spawn, color, label) {
  const center = getTileCenter(layout, spawn);
  const radius = Math.max(8, layout.cellSize * 0.16);

  graphics.fillStyle(0x12061f, 0.9);
  graphics.fillCircle(center.x, center.y, radius + 3);
  graphics.fillStyle(color, 0.92);
  graphics.fillCircle(center.x, center.y, radius);
  graphics.lineStyle(2, 0xfff2d4, 0.95);
  graphics.strokeCircle(center.x, center.y, radius + 1);
  graphics.fillStyle(0xfff8ef, 0.96);
  graphics.fillRoundedRect(center.x - radius * 0.55, center.y - radius * 0.7, radius * 1.1, radius * 1.3, 4);
  graphics.lineStyle(1.5, 0x12061f, 0.7);
  graphics.strokeRoundedRect(center.x - radius * 0.55, center.y - radius * 0.7, radius * 1.1, radius * 1.3, 4);
  graphics.lineStyle(2.2, 0x12061f, 0.92);
  graphics.strokeLineShape(
    new Phaser.Geom.Line(center.x, center.y + radius * 0.65, center.x, center.y + radius * 1.65)
  );

  const text = graphics.scene.add
    .text(center.x, center.y - 1, label, {
      fontFamily: "Bahnschrift SemiCondensed, sans-serif",
      fontSize: `${Math.max(11, Math.floor(layout.cellSize * 0.18))}px`,
      color: "#12061f"
    })
    .setOrigin(0.5)
    .setDepth(CURSOR_DEPTH + 1);

  return text;
}

function drawObjectiveMarker(graphics, layout, marker, colorOptions = {}) {
  const center = getTileCenter(layout, marker);
  const radius = Math.max(10, layout.cellSize * 0.18);
  const markerColor = marker.owner
    ? getOwnerColor(marker.owner, colorOptions)
    : marker.color ?? 0xff8a3d;

  graphics.fillStyle(0x12061f, 0.9);
  graphics.fillCircle(center.x, center.y, radius + 4);
  graphics.fillStyle(markerColor, 0.95);
  graphics.fillCircle(center.x, center.y, radius);
  graphics.lineStyle(2, 0xfff2d4, 0.95);
  graphics.strokeCircle(center.x, center.y, radius + 1);

  return graphics.scene.add
    .text(center.x, center.y, marker.label ?? "!", {
      fontFamily: "Bahnschrift SemiCondensed, sans-serif",
      fontSize: `${Math.max(10, Math.floor(layout.cellSize * 0.16))}px`,
      color: "#12061f"
    })
    .setOrigin(0.5)
    .setDepth(CURSOR_DEPTH + 1);
}

function drawReinforcementMarker(graphics, layout, marker, enemyColor, index = 0) {
  const center = getTileCenter(layout, marker);
  const isSelected = marker.selected === true;
  const radius = Math.max(8, layout.cellSize * (isSelected ? 0.17 : 0.13));
  const offset = Math.min(index, 3) * Math.max(3, layout.cellSize * 0.055);
  const markerX = center.x + offset;
  const markerY = center.y - offset;
  const color = isSelected ? enemyColor : 0x777180;
  const label = marker.kind === "trigger"
    ? "T"
    : `${String(marker.unitTypeId ?? "?").charAt(0).toUpperCase()}${marker.level ?? 1}`;

  graphics.fillStyle(0x12061f, isSelected ? 0.92 : 0.58);
  graphics.fillCircle(markerX, markerY, radius + 3);
  graphics.fillStyle(color, isSelected ? 0.96 : 0.5);
  graphics.fillCircle(markerX, markerY, radius);
  graphics.lineStyle(isSelected ? 3 : 1.5, isSelected ? 0xfff2d4 : 0xc1b8c9, isSelected ? 0.96 : 0.5);
  graphics.strokeCircle(markerX, markerY, radius + 1);

  return graphics.scene.add
    .text(markerX, markerY, label, {
      fontFamily: "Bahnschrift SemiCondensed, sans-serif",
      fontSize: `${Math.max(9, Math.floor(layout.cellSize * (isSelected ? 0.16 : 0.13)))}px`,
      color: isSelected ? "#12061f" : "#e8dfea"
    })
    .setOrigin(0.5)
    .setDepth(CURSOR_DEPTH + (isSelected ? 2 : 1))
    .setAlpha(isSelected ? 1 : 0.72);
}

function getTutorialHighlightColor(tone, colorOptions = {}) {
  switch (tone) {
    case "ally":
      return getOwnerColor("player", colorOptions);
    case "danger":
      return 0xff6f78;
    case "goal":
      return 0xffc45a;
    default:
      return 0x7fd8ff;
  }
}

function resolveTutorialHighlight(snapshot, highlight) {
  if (!highlight) {
    return null;
  }

  if (highlight.type === "tile" && Number.isInteger(highlight.x) && Number.isInteger(highlight.y)) {
    return {
      ...highlight,
      x: highlight.x,
      y: highlight.y
    };
  }

  if (highlight.type === "unit") {
    const unit = [...(snapshot.player?.units ?? []), ...(snapshot.enemy?.units ?? [])].find(
      (candidate) => candidate.id === highlight.id
    );

    return unit
      ? {
          ...highlight,
          x: unit.x,
          y: unit.y
        }
      : null;
  }

  if (highlight.type === "building") {
    const building = (snapshot.map?.buildings ?? []).find((candidate) => candidate.id === highlight.id);

    return building
      ? {
          ...highlight,
          x: building.x,
          y: building.y
        }
      : null;
  }

  return null;
}

function drawTutorialHighlight(
  graphics,
  layout,
  snapshot,
  highlight,
  index,
  colorOptions = {}
) {
  const resolved = resolveTutorialHighlight(snapshot, highlight);

  if (!resolved) {
    return null;
  }

  const color = getTutorialHighlightColor(resolved.tone, colorOptions);
  const x = layout.originX + resolved.x * layout.cellSize;
  const y = layout.originY + resolved.y * layout.cellSize;
  const inset = Math.max(3, Math.floor(layout.cellSize * 0.06));
  const labelText = resolved.label ?? String(index + 1);

  graphics.fillStyle(color, 0.16);
  graphics.fillRoundedRect(x + 2, y + 2, layout.cellSize - 6, layout.cellSize - 6, 8);
  graphics.lineStyle(4, 0x12061f, 0.72);
  graphics.strokeRoundedRect(x + inset - 1, y + inset - 1, layout.cellSize - inset * 2, layout.cellSize - inset * 2, 8);
  graphics.lineStyle(3, color, 0.98);
  graphics.strokeRoundedRect(x + inset, y + inset, layout.cellSize - inset * 2, layout.cellSize - inset * 2, 8);
  drawCornerMarkers(graphics, x + 5, y + 5, layout.cellSize - 12, 0xfff2d4, 0.94);

  const badgeX = x + layout.cellSize * 0.5;
  const badgeY = y - Math.max(8, layout.cellSize * 0.12);
  const label = graphics.scene.add
    .text(badgeX, badgeY, labelText, {
      fontFamily: "Bahnschrift SemiCondensed, sans-serif",
      fontSize: `${Math.max(11, Math.floor(layout.cellSize * 0.18))}px`,
      color: "#12061f",
      backgroundColor: "#fff2d4",
      padding: {
        x: 7,
        y: 3
      }
    })
    .setOrigin(0.5)
    .setDepth(CURSOR_DEPTH + 2);

  return label;
}

export class SelectionLayer {
  constructor(scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(SELECTION_DEPTH);
    this.movementPathGraphics = scene.add.graphics();
    this.movementPathGraphics.setDepth(SELECTION_DEPTH + 1);
    this.cursorGraphics = scene.add.graphics();
    this.cursorGraphics.setDepth(CURSOR_DEPTH);
    this.tooltipBackground = scene.add.rectangle(0, 0, 10, 10, 0x12061f, 0.9).setVisible(false);
    this.tooltipBackground.setStrokeStyle(2, 0xff8a3d, 0.95);
    this.tooltipLabel = scene.add
      .text(0, 0, "", {
        fontFamily: "Bahnschrift SemiCondensed, sans-serif",
        fontSize: "16px",
        color: "#fff2d4",
        align: "left",
        lineSpacing: 4
      })
      .setVisible(false);
    this.tooltipBackground.setDepth(TOOLTIP_BACKGROUND_DEPTH);
    this.tooltipLabel.setDepth(TOOLTIP_LABEL_DEPTH);
    this.markerLabels = [];
    this.movementPathState = null;
    this.movementPathLayout = null;
    this.movementPathColor = 0xff8a3d;
  }

  clearStatic() {
    this.graphics.clear();
    this.cursorGraphics.clear();
    this.markerLabels.forEach((label) => label.destroy());
    this.markerLabels = [];
    this.tooltipBackground.setVisible(false);
    this.tooltipLabel.setVisible(false);
  }

  resetMovementPath() {
    this.movementPathGraphics.clear();
    this.movementPathState = null;
    this.movementPathLayout = null;
  }

  clear() {
    this.clearStatic();
    this.resetMovementPath();
  }

  setHoveredMovementPath(snapshot, layout, path, color = 0xff8a3d) {
    const contextKey = getMovementPathContextKey(snapshot, layout);
    const targetKey = getMovementPathKey(path);
    const nowMs = getSceneTime(this.scene);

    this.renderMovementPathFrame(nowMs);

    if (
      this.movementPathState?.contextKey === contextKey &&
      this.movementPathState?.targetKey === targetKey
    ) {
      this.movementPathLayout = layout;
      this.movementPathColor = color;
      return;
    }

    this.movementPathLayout = layout;
    this.movementPathColor = color;
    this.movementPathState = createMovementPathTransitionState(this.movementPathState, {
      targetPath: path,
      contextKey,
      nowMs,
      durationMs: getMovementPathAnimationDurationMs(prefersReducedMotion())
    });
    this.renderMovementPathFrame(nowMs, { force: true });
  }

  renderMovementPathFrame(time = getSceneTime(this.scene), { force = false } = {}) {
    if (!this.movementPathState || !this.movementPathLayout) {
      if (force) {
        this.movementPathGraphics.clear();
      }
      return;
    }

    if (!force && !this.movementPathState.isAnimating) {
      return;
    }

    this.movementPathState = resolveMovementPathFrame(
      this.movementPathState,
      time,
      Phaser.Math.Easing.Cubic.Out
    );
    this.movementPathGraphics.clear();
    drawMovementPath(
      this.movementPathGraphics,
      this.movementPathLayout,
      this.movementPathState.displayPath,
      this.movementPathColor
    );
  }

  render(
    snapshot,
    layout,
    showGridHighlights,
    hoveredTile,
    hoveredMovementPath = [],
    hoveredAttackForecast = null,
    options = {}
  ) {
    this.clearStatic();
    const markerLabels = [];
    const colorOptions = options.colorOptions ?? {};
    const playerColor = getOwnerColor("player", colorOptions);
    const enemyColor = getOwnerColor("enemy", colorOptions);
    this.tooltipBackground.setStrokeStyle(2, enemyColor, 0.95);

    const presentation = snapshot.presentation ?? {};
    const unloadTiles =
      presentation.pendingAction?.mode === "unload"
        ? presentation.pendingAction.unloadPreviewTiles ?? presentation.unloadPreviewTiles ?? []
        : presentation.unloadPreviewTiles ?? [];

    for (const tile of unloadTiles) {
      const x = layout.originX + tile.x * layout.cellSize;
      const y = layout.originY + tile.y * layout.cellSize;
      this.graphics.fillStyle(playerColor, 0.28);
      this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
      this.graphics.lineStyle(3, 0xf6fffe, 0.78);
      this.graphics.strokeRoundedRect(x + 3, y + 3, layout.cellSize - 8, layout.cellSize - 8, 4);
      drawCornerMarkers(this.graphics, x + 4, y + 4, layout.cellSize - 10, playerColor, 0.95);
    }

    if (showGridHighlights) {
      const moveTiles =
        presentation.reachableTiles?.length > 0
          ? presentation.reachableTiles
          : (presentation.movePreviewTiles ?? []);
      const moveFillAlpha = presentation.reachableTiles?.length > 0 ? 0.22 : 0.12;
      const moveStrokeAlpha = presentation.reachableTiles?.length > 0 ? 0.42 : 0.24;

      for (const tile of moveTiles) {
        const x = layout.originX + tile.x * layout.cellSize;
        const y = layout.originY + tile.y * layout.cellSize;
        this.graphics.fillStyle(playerColor, moveFillAlpha);
        this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.graphics.lineStyle(2, playerColor, moveStrokeAlpha);
        this.graphics.strokeRoundedRect(x + 2, y + 2, layout.cellSize - 6, layout.cellSize - 6, 4);
      }

      for (const tile of presentation.attackPreviewTiles ?? []) {
        const x = layout.originX + tile.x * layout.cellSize;
        const y = layout.originY + tile.y * layout.cellSize;
        this.graphics.lineStyle(1.8, enemyColor, 0.36);
        this.graphics.strokeRoundedRect(x + 6, y + 6, layout.cellSize - 14, layout.cellSize - 14, 6);
      }

      for (const unitId of presentation.attackableUnitIds ?? []) {
        const target = [...snapshot.player.units, ...snapshot.enemy.units].find(
          (unit) => unit.id === unitId
        );

        if (!target) {
          continue;
        }

        const x = layout.originX + target.x * layout.cellSize;
        const y = layout.originY + target.y * layout.cellSize;
        this.graphics.lineStyle(3, enemyColor, 0.92);
        this.graphics.strokeRoundedRect(x + 4, y + 4, layout.cellSize - 10, layout.cellSize - 10, 6);
      }

      for (const unitId of presentation.transportTargetUnitIds ?? []) {
        const target = [...snapshot.player.units, ...snapshot.enemy.units].find(
          (unit) => unit.id === unitId
        );

        if (!target) {
          continue;
        }

        const x = layout.originX + target.x * layout.cellSize;
        const y = layout.originY + target.y * layout.cellSize;
        this.graphics.lineStyle(3, playerColor, 0.96);
        this.graphics.strokeRoundedRect(x + 3, y + 3, layout.cellSize - 8, layout.cellSize - 8, 6);
        drawCornerMarkers(this.graphics, x + 5, y + 5, layout.cellSize - 12, 0xf6fffe, 0.9);
      }

      for (const unitId of presentation.supportTargetUnitIds ?? []) {
        const target = [...snapshot.player.units, ...snapshot.enemy.units].find(
          (unit) => unit.id === unitId
        );

        if (!target) {
          continue;
        }

        const x = layout.originX + target.x * layout.cellSize;
        const y = layout.originY + target.y * layout.cellSize;
        this.graphics.fillStyle(playerColor, 0.2);
        this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.graphics.lineStyle(3, playerColor, 0.96);
        this.graphics.strokeRoundedRect(x + 3, y + 3, layout.cellSize - 8, layout.cellSize - 8, 6);
        drawCornerMarkers(this.graphics, x + 5, y + 5, layout.cellSize - 12, 0xf6fffe, 0.9);
      }

      for (const unitId of presentation.medpackTargetUnitIds ?? []) {
        const target = [...snapshot.player.units, ...snapshot.enemy.units].find(
          (unit) => unit.id === unitId
        );

        if (!target) {
          continue;
        }

        const x = layout.originX + target.x * layout.cellSize;
        const y = layout.originY + target.y * layout.cellSize;
        this.graphics.fillStyle(0x9fffa8, 0.18);
        this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.graphics.lineStyle(3, 0x9fffa8, 0.96);
        this.graphics.strokeRoundedRect(x + 3, y + 3, layout.cellSize - 8, layout.cellSize - 8, 6);
        drawCornerMarkers(this.graphics, x + 5, y + 5, layout.cellSize - 12, 0xfefae0, 0.9);
      }

      for (const unitId of presentation.extinguishTargetUnitIds ?? []) {
        const target = [...snapshot.player.units, ...snapshot.enemy.units].find(
          (unit) => unit.id === unitId
        );

        if (!target) {
          continue;
        }

        const x = layout.originX + target.x * layout.cellSize;
        const y = layout.originY + target.y * layout.cellSize;
        this.graphics.fillStyle(0x7be3ff, 0.18);
        this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.graphics.lineStyle(3, 0x7be3ff, 0.96);
        this.graphics.strokeRoundedRect(x + 3, y + 3, layout.cellSize - 8, layout.cellSize - 8, 6);
        drawCornerMarkers(this.graphics, x + 5, y + 5, layout.cellSize - 12, 0xe8fbff, 0.9);
      }

      this.setHoveredMovementPath(snapshot, layout, hoveredMovementPath, playerColor);
    } else {
      this.setHoveredMovementPath(snapshot, layout, [], playerColor);
    }

    for (const movementPath of options.enemyMovementPaths ?? []) {
      drawMovementPath(this.graphics, layout, movementPath, enemyColor);
    }

    for (const spawn of options.editorSpawns?.player ?? []) {
      markerLabels.push(drawSpawnMarker(this.cursorGraphics, layout, spawn, playerColor, "P"));
    }

    for (const spawn of options.editorSpawns?.enemy ?? []) {
      markerLabels.push(drawSpawnMarker(this.cursorGraphics, layout, spawn, enemyColor, "E"));
    }

    const reinforcementMarkers = [
      ...(options.editorReinforcements?.units ?? []).map((unit) => ({
        ...unit,
        kind: "unit"
      })),
      ...(options.editorReinforcements?.triggerTiles ?? []).map((tile) => ({
        ...tile,
        kind: "trigger"
      }))
    ].sort((left, right) => Number(left.selected) - Number(right.selected));

    const reinforcementMarkerCounts = new Map();
    reinforcementMarkers.forEach((marker) => {
      const key = `${marker.x},${marker.y}`;
      const tileIndex = reinforcementMarkerCounts.get(key) ?? 0;
      reinforcementMarkerCounts.set(key, tileIndex + 1);
      markerLabels.push(
        drawReinforcementMarker(this.cursorGraphics, layout, marker, enemyColor, tileIndex)
      );
    });

    for (const marker of presentation.mission?.markers ?? []) {
      markerLabels.push(
        drawObjectiveMarker(this.cursorGraphics, layout, marker, colorOptions)
      );
    }

    for (const [index, highlight] of (options.tutorialHighlights ?? []).entries()) {
      const label = drawTutorialHighlight(
        this.cursorGraphics,
        layout,
        snapshot,
        highlight,
        index,
        colorOptions
      );

      if (label) {
        markerLabels.push(label);
      }
    }

    if (presentation.selectedTile) {
      const x = layout.originX + presentation.selectedTile.x * layout.cellSize;
      const y = layout.originY + presentation.selectedTile.y * layout.cellSize;
      this.graphics.lineStyle(3, playerColor, 0.98);
      this.graphics.strokeRoundedRect(x + 2, y + 2, layout.cellSize - 6, layout.cellSize - 6, 6);
    }

    if (hoveredTile) {
      const x = layout.originX + hoveredTile.x * layout.cellSize;
      const y = layout.originY + hoveredTile.y * layout.cellSize;
      drawCornerMarkers(this.cursorGraphics, x, y, layout.cellSize - 2, 0xfff1c9, 0.96);
      drawCornerMarkers(
        this.cursorGraphics,
        x + 2,
        y + 2,
        layout.cellSize - 6,
        hoveredAttackForecast ? enemyColor : playerColor,
        0.82
      );
    }

    if (hoveredAttackForecast) {
      const label = buildForecastTooltipLabel(hoveredAttackForecast);
      const margin = Math.max(10, Math.floor(layout.cellSize * 0.2));
      const width = Math.max(150, Math.floor(layout.cellSize * 3.2));
      const x = Phaser.Math.Clamp(
        layout.originX + hoveredTile.x * layout.cellSize + layout.cellSize + margin,
        margin,
        this.scene.scale.width - width - margin
      );
      const y = Phaser.Math.Clamp(
        layout.originY + hoveredTile.y * layout.cellSize - margin * 0.5,
        margin,
        this.scene.scale.height - 72 - margin
      );

      this.tooltipLabel.setText(label).setPosition(x + 10, y + 10).setVisible(true);
      const bounds = this.tooltipLabel.getBounds();
      this.tooltipBackground
        .setPosition(bounds.centerX, bounds.centerY)
        .setSize(bounds.width + 20, bounds.height + 18)
        .setVisible(true);
    }

    this.markerLabels = markerLabels;
  }
}
