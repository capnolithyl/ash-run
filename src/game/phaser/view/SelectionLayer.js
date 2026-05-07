import Phaser from "phaser";
import { buildForecastTooltipLabel } from "./selectionTooltip.js";

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

function drawMovementPath(graphics, layout, path) {
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

  graphics.lineStyle(Math.max(2, Math.floor(layout.cellSize * 0.05)), 0xff8a3d, 0.95);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();

  for (const point of points.slice(1, -1)) {
    graphics.fillStyle(0xfff2d4, 0.94);
    graphics.fillCircle(point.x, point.y, Math.max(3.5, layout.cellSize * 0.07));
    graphics.lineStyle(2, 0xff8a3d, 0.9);
    graphics.strokeCircle(point.x, point.y, Math.max(3.5, layout.cellSize * 0.07));
  }

  const tip = points.at(-1);
  const previous = points.at(-2);
  const angle = Phaser.Math.Angle.Between(previous.x, previous.y, tip.x, tip.y);
  const headSize = Math.max(10, layout.cellSize * 0.2);
  const leftAngle = angle + Math.PI * 0.82;
  const rightAngle = angle - Math.PI * 0.82;

  graphics.fillStyle(0xfff2d4, 0.98);
  graphics.lineStyle(2, 0xff8a3d, 0.96);
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

export class SelectionLayer {
  constructor(scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(SELECTION_DEPTH);
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
  }

  clear() {
    this.graphics.clear();
    this.cursorGraphics.clear();
    this.markerLabels.forEach((label) => label.destroy());
    this.markerLabels = [];
    this.tooltipBackground.setVisible(false);
    this.tooltipLabel.setVisible(false);
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
    this.clear();
    const markerLabels = [];

    const presentation = snapshot.presentation ?? {};
    const unloadTiles =
      presentation.pendingAction?.mode === "unload"
        ? presentation.pendingAction.unloadPreviewTiles ?? presentation.unloadPreviewTiles ?? []
        : presentation.unloadPreviewTiles ?? [];

    for (const tile of unloadTiles) {
      const x = layout.originX + tile.x * layout.cellSize;
      const y = layout.originY + tile.y * layout.cellSize;
      this.graphics.fillStyle(0x66ffbf, 0.28);
      this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
      this.graphics.lineStyle(3, 0xf6fffe, 0.78);
      this.graphics.strokeRoundedRect(x + 3, y + 3, layout.cellSize - 8, layout.cellSize - 8, 4);
      drawCornerMarkers(this.graphics, x + 4, y + 4, layout.cellSize - 10, 0x66ffbf, 0.95);
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
        this.graphics.fillStyle(0x985dff, moveFillAlpha);
        this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.graphics.lineStyle(2, 0xff4fd8, moveStrokeAlpha);
        this.graphics.strokeRoundedRect(x + 2, y + 2, layout.cellSize - 6, layout.cellSize - 6, 4);
      }

      for (const tile of presentation.attackPreviewTiles ?? []) {
        const x = layout.originX + tile.x * layout.cellSize;
        const y = layout.originY + tile.y * layout.cellSize;
        this.graphics.lineStyle(1.8, 0xff8a3d, 0.36);
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
        this.graphics.lineStyle(3, 0xff8a3d, 0.92);
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
        this.graphics.lineStyle(3, 0x66ffbf, 0.96);
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
        this.graphics.fillStyle(0x66ffbf, 0.2);
        this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.graphics.lineStyle(3, 0x66ffbf, 0.96);
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

      drawMovementPath(this.graphics, layout, hoveredMovementPath);
    }

    for (const spawn of options.editorSpawns?.player ?? []) {
      markerLabels.push(drawSpawnMarker(this.cursorGraphics, layout, spawn, 0x66ffbf, "P"));
    }

    for (const spawn of options.editorSpawns?.enemy ?? []) {
      markerLabels.push(drawSpawnMarker(this.cursorGraphics, layout, spawn, 0xff8a3d, "E"));
    }

    if (presentation.selectedTile) {
      const x = layout.originX + presentation.selectedTile.x * layout.cellSize;
      const y = layout.originY + presentation.selectedTile.y * layout.cellSize;
      this.graphics.lineStyle(3, 0xff4fd8, 0.98);
      this.graphics.strokeRoundedRect(x + 2, y + 2, layout.cellSize - 6, layout.cellSize - 6, 6);
    }

    if (hoveredTile) {
      const x = layout.originX + hoveredTile.x * layout.cellSize;
      const y = layout.originY + hoveredTile.y * layout.cellSize;
      drawCornerMarkers(this.cursorGraphics, x, y, layout.cellSize - 2, 0xfff1c9, 0.96);
      drawCornerMarkers(this.cursorGraphics, x + 2, y + 2, layout.cellSize - 6, 0xff8a3d, 0.82);
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
