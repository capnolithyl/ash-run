import Phaser from "phaser";
import { canCaptureBuilding } from "../../simulation/captureRules.js";
import {
  getBuildingAt,
  getSelectedBuilding,
  getSelectedUnit
} from "../../simulation/selectors.js";
import { buildForecastTooltipLabel } from "./selectionTooltip.js";

const RANGE_DEPTH = 24;
const BUILDING_HIGHLIGHT_DEPTH = 25;
const FOCUS_DEPTH = 26;
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

function drawTileFrame(graphics, layout, tile, color, fillAlpha, strokeAlpha) {
  const x = layout.originX + tile.x * layout.cellSize;
  const y = layout.originY + tile.y * layout.cellSize;

  graphics.fillStyle(color, fillAlpha);
  graphics.fillRoundedRect(x + 1, y + 1, layout.cellSize - 4, layout.cellSize - 4, 7);
  graphics.lineStyle(3, color, strokeAlpha);
  graphics.strokeRoundedRect(x + 3, y + 3, layout.cellSize - 8, layout.cellSize - 8, 6);
  drawCornerMarkers(graphics, x + 5, y + 5, layout.cellSize - 12, 0xfff2d4, 0.88);
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
  graphics.fillRoundedRect(
    center.x - radius * 0.55,
    center.y - radius * 0.7,
    radius * 1.1,
    radius * 1.3,
    4
  );
  graphics.lineStyle(1.5, 0x12061f, 0.7);
  graphics.strokeRoundedRect(
    center.x - radius * 0.55,
    center.y - radius * 0.7,
    radius * 1.1,
    radius * 1.3,
    4
  );
  graphics.lineStyle(2.2, 0x12061f, 0.92);
  graphics.strokeLineShape(
    new Phaser.Geom.Line(
      center.x,
      center.y + radius * 0.65,
      center.x,
      center.y + radius * 1.65
    )
  );

  return graphics.scene.add
    .text(center.x, center.y - 1, label, {
      fontFamily: "Bahnschrift SemiCondensed, sans-serif",
      fontSize: `${Math.max(11, Math.floor(layout.cellSize * 0.18))}px`,
      color: "#12061f"
    })
    .setOrigin(0.5)
    .setDepth(CURSOR_DEPTH + 1);
}

function drawObjectiveMarker(graphics, layout, marker) {
  const center = getTileCenter(layout, marker);
  const radius = Math.max(10, layout.cellSize * 0.18);

  graphics.fillStyle(0x12061f, 0.9);
  graphics.fillCircle(center.x, center.y, radius + 4);
  graphics.fillStyle(marker.color ?? 0xff8a3d, 0.95);
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

function getTutorialHighlightColor(tone) {
  switch (tone) {
    case "ally":
      return 0x66ffbf;
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
    const building = (snapshot.map?.buildings ?? []).find(
      (candidate) => candidate.id === highlight.id
    );

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

function drawTutorialHighlight(graphics, layout, snapshot, highlight, index) {
  const resolved = resolveTutorialHighlight(snapshot, highlight);

  if (!resolved) {
    return null;
  }

  const color = getTutorialHighlightColor(resolved.tone);
  const x = layout.originX + resolved.x * layout.cellSize;
  const y = layout.originY + resolved.y * layout.cellSize;
  const inset = Math.max(3, Math.floor(layout.cellSize * 0.06));
  const labelText = resolved.label ?? String(index + 1);

  graphics.fillStyle(color, 0.16);
  graphics.fillRoundedRect(x + 2, y + 2, layout.cellSize - 6, layout.cellSize - 6, 8);
  graphics.lineStyle(4, 0x12061f, 0.72);
  graphics.strokeRoundedRect(
    x + inset - 1,
    y + inset - 1,
    layout.cellSize - inset * 2,
    layout.cellSize - inset * 2,
    8
  );
  graphics.lineStyle(3, color, 0.98);
  graphics.strokeRoundedRect(
    x + inset,
    y + inset,
    layout.cellSize - inset * 2,
    layout.cellSize - inset * 2,
    8
  );
  drawCornerMarkers(graphics, x + 5, y + 5, layout.cellSize - 12, 0xfff2d4, 0.94);

  const badgeX = x + layout.cellSize * 0.5;
  const badgeY = y - Math.max(8, layout.cellSize * 0.12);

  return graphics.scene.add
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
}

function getRelevantBuildingToneRank(tone) {
  switch (tone) {
    case "selected":
      return 3;
    case "capture":
      return 2;
    case "mission":
      return 1;
    default:
      return 0;
  }
}

function addRelevantBuildingHighlight(highlights, building, tone) {
  if (!building) {
    return;
  }

  const key = `${building.x},${building.y}`;
  const nextHighlight = {
    x: building.x,
    y: building.y,
    tone
  };
  const existingHighlight = highlights.get(key);

  if (
    !existingHighlight ||
    getRelevantBuildingToneRank(tone) > getRelevantBuildingToneRank(existingHighlight.tone)
  ) {
    highlights.set(key, nextHighlight);
  }
}

function buildRelevantBuildingHighlights(snapshot) {
  const highlights = new Map();
  const selectedBuilding = getSelectedBuilding(snapshot);
  const selectedUnit = getSelectedUnit(snapshot);
  const presentation = snapshot.presentation ?? {};
  const pendingAction = presentation.pendingAction ?? snapshot.pendingAction ?? null;
  const unitsById = new Map(
    [...(snapshot.player?.units ?? []), ...(snapshot.enemy?.units ?? [])].map((unit) => [
      unit.id,
      unit
    ])
  );
  const reachableTileKeys = new Set(
    (presentation.reachableTiles ?? []).map((tile) => `${tile.x},${tile.y}`)
  );

  if (selectedBuilding) {
    addRelevantBuildingHighlight(highlights, selectedBuilding, "selected");
  }

  if (selectedUnit?.owner === "player" && reachableTileKeys.size > 0) {
    for (const building of snapshot.map?.buildings ?? []) {
      if (
        reachableTileKeys.has(`${building.x},${building.y}`) &&
        canCaptureBuilding(selectedUnit, building)
      ) {
        addRelevantBuildingHighlight(highlights, building, "capture");
      }
    }
  }

  if (
    pendingAction?.unitId &&
    Number.isInteger(pendingAction.toX) &&
    Number.isInteger(pendingAction.toY)
  ) {
    const actingUnit = unitsById.get(pendingAction.unitId);
    const pendingBuilding = getBuildingAt(snapshot, pendingAction.toX, pendingAction.toY);

    if (canCaptureBuilding(actingUnit, pendingBuilding)) {
      addRelevantBuildingHighlight(highlights, pendingBuilding, "capture");
    }
  }

  for (const marker of presentation.mission?.markers ?? []) {
    const missionBuilding = getBuildingAt(snapshot, marker.x, marker.y);

    if (missionBuilding) {
      addRelevantBuildingHighlight(highlights, missionBuilding, "mission");
    }
  }

  return [...highlights.values()];
}

function drawRelevantBuildingOverlay(graphics, layout, highlight) {
  const color =
    highlight.tone === "selected"
      ? 0xffd06a
      : highlight.tone === "capture"
        ? 0x78dcff
        : 0xff8a3d;
  const fillAlpha =
    highlight.tone === "selected"
      ? 0.18
      : highlight.tone === "capture"
        ? 0.14
        : 0.12;
  const strokeAlpha = highlight.tone === "mission" ? 0.84 : 0.92;

  drawTileFrame(graphics, layout, highlight, color, fillAlpha, strokeAlpha);
}

function drawUnitFocusOverlay(graphics, layout, unit, config = {}) {
  if (!unit) {
    return;
  }

  drawTileFrame(
    graphics,
    layout,
    unit,
    config.color ?? 0xfff2d4,
    config.fillAlpha ?? 0.1,
    config.strokeAlpha ?? 0.92
  );
}

export class SelectionLayer {
  constructor(scene) {
    this.scene = scene;
    this.rangeGraphics = scene.add.graphics();
    this.rangeGraphics.setDepth(RANGE_DEPTH);
    this.buildingGraphics = scene.add.graphics();
    this.buildingGraphics.setDepth(BUILDING_HIGHLIGHT_DEPTH);
    this.focusGraphics = scene.add.graphics();
    this.focusGraphics.setDepth(FOCUS_DEPTH);
    this.cursorGraphics = scene.add.graphics();
    this.cursorGraphics.setDepth(CURSOR_DEPTH);
    this.tooltipBackground = scene.add
      .rectangle(0, 0, 10, 10, 0x12061f, 0.9)
      .setVisible(false);
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
    this.fxState = {
      hasRangeHighlights: false,
      hasFocusHighlights: false,
      hasBuildingHighlights: false
    };
  }

  clear() {
    this.rangeGraphics.clear();
    this.buildingGraphics.clear();
    this.focusGraphics.clear();
    this.cursorGraphics.clear();
    this.markerLabels.forEach((label) => label.destroy());
    this.markerLabels = [];
    this.tooltipBackground.setVisible(false);
    this.tooltipLabel.setVisible(false);
    this.fxState = {
      hasRangeHighlights: false,
      hasFocusHighlights: false,
      hasBuildingHighlights: false
    };
  }

  getFxTargets() {
    return {
      rangeGraphics: this.rangeGraphics,
      buildingGraphics: this.buildingGraphics,
      focusGraphics: this.focusGraphics
    };
  }

  getFxState() {
    return { ...this.fxState };
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
    let hasRangeHighlights = false;
    let hasFocusHighlights = false;
    let hasBuildingHighlights = false;

    const presentation = snapshot.presentation ?? {};
    const selectedUnit = getSelectedUnit(snapshot);
    const activeUnitId = presentation.pendingAction?.unitId ?? snapshot.pendingAction?.unitId ?? null;
    const activeUnit = activeUnitId
      ? [...snapshot.player.units, ...snapshot.enemy.units].find((unit) => unit.id === activeUnitId) ??
        null
      : null;
    const unloadTiles =
      presentation.pendingAction?.mode === "unload"
        ? presentation.pendingAction.unloadPreviewTiles ??
          presentation.unloadPreviewTiles ??
          []
        : presentation.unloadPreviewTiles ?? [];

    for (const tile of unloadTiles) {
      const x = layout.originX + tile.x * layout.cellSize;
      const y = layout.originY + tile.y * layout.cellSize;
      this.rangeGraphics.fillStyle(0x66ffbf, 0.28);
      this.rangeGraphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
      this.rangeGraphics.lineStyle(3, 0xf6fffe, 0.78);
      this.rangeGraphics.strokeRoundedRect(
        x + 3,
        y + 3,
        layout.cellSize - 8,
        layout.cellSize - 8,
        4
      );
      drawCornerMarkers(
        this.rangeGraphics,
        x + 4,
        y + 4,
        layout.cellSize - 10,
        0x66ffbf,
        0.95
      );
      hasRangeHighlights = true;
    }

    if (showGridHighlights) {
      const moveTiles =
        presentation.reachableTiles?.length > 0
          ? presentation.reachableTiles
          : presentation.movePreviewTiles ?? [];
      const moveFillAlpha = presentation.reachableTiles?.length > 0 ? 0.22 : 0.12;
      const moveStrokeAlpha = presentation.reachableTiles?.length > 0 ? 0.42 : 0.24;

      for (const tile of moveTiles) {
        const x = layout.originX + tile.x * layout.cellSize;
        const y = layout.originY + tile.y * layout.cellSize;
        this.rangeGraphics.fillStyle(0x985dff, moveFillAlpha);
        this.rangeGraphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.rangeGraphics.lineStyle(2, 0xff4fd8, moveStrokeAlpha);
        this.rangeGraphics.strokeRoundedRect(
          x + 2,
          y + 2,
          layout.cellSize - 6,
          layout.cellSize - 6,
          4
        );
        hasRangeHighlights = true;
      }

      for (const tile of presentation.attackPreviewTiles ?? []) {
        const x = layout.originX + tile.x * layout.cellSize;
        const y = layout.originY + tile.y * layout.cellSize;
        this.rangeGraphics.lineStyle(1.8, 0xff8a3d, 0.36);
        this.rangeGraphics.strokeRoundedRect(
          x + 6,
          y + 6,
          layout.cellSize - 14,
          layout.cellSize - 14,
          6
        );
        hasRangeHighlights = true;
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
        this.focusGraphics.lineStyle(3, 0xff8a3d, 0.92);
        this.focusGraphics.strokeRoundedRect(
          x + 4,
          y + 4,
          layout.cellSize - 10,
          layout.cellSize - 10,
          6
        );
        hasFocusHighlights = true;
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
        this.focusGraphics.lineStyle(3, 0x66ffbf, 0.96);
        this.focusGraphics.strokeRoundedRect(
          x + 3,
          y + 3,
          layout.cellSize - 8,
          layout.cellSize - 8,
          6
        );
        drawCornerMarkers(
          this.focusGraphics,
          x + 5,
          y + 5,
          layout.cellSize - 12,
          0xf6fffe,
          0.9
        );
        hasFocusHighlights = true;
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
        this.focusGraphics.fillStyle(0x66ffbf, 0.2);
        this.focusGraphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.focusGraphics.lineStyle(3, 0x66ffbf, 0.96);
        this.focusGraphics.strokeRoundedRect(
          x + 3,
          y + 3,
          layout.cellSize - 8,
          layout.cellSize - 8,
          6
        );
        drawCornerMarkers(
          this.focusGraphics,
          x + 5,
          y + 5,
          layout.cellSize - 12,
          0xf6fffe,
          0.9
        );
        hasFocusHighlights = true;
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
        this.focusGraphics.fillStyle(0x9fffa8, 0.18);
        this.focusGraphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.focusGraphics.lineStyle(3, 0x9fffa8, 0.96);
        this.focusGraphics.strokeRoundedRect(
          x + 3,
          y + 3,
          layout.cellSize - 8,
          layout.cellSize - 8,
          6
        );
        drawCornerMarkers(
          this.focusGraphics,
          x + 5,
          y + 5,
          layout.cellSize - 12,
          0xfefae0,
          0.9
        );
        hasFocusHighlights = true;
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
        this.focusGraphics.fillStyle(0x7be3ff, 0.18);
        this.focusGraphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.focusGraphics.lineStyle(3, 0x7be3ff, 0.96);
        this.focusGraphics.strokeRoundedRect(
          x + 3,
          y + 3,
          layout.cellSize - 8,
          layout.cellSize - 8,
          6
        );
        drawCornerMarkers(
          this.focusGraphics,
          x + 5,
          y + 5,
          layout.cellSize - 12,
          0xe8fbff,
          0.9
        );
        hasFocusHighlights = true;
      }

      drawMovementPath(this.rangeGraphics, layout, hoveredMovementPath);
      hasRangeHighlights = hasRangeHighlights || hoveredMovementPath.length > 1;
    }

    for (const buildingHighlight of buildRelevantBuildingHighlights(snapshot)) {
      drawRelevantBuildingOverlay(this.buildingGraphics, layout, buildingHighlight);
      hasBuildingHighlights = true;
    }

    drawUnitFocusOverlay(this.focusGraphics, layout, selectedUnit, {
      color: 0xfff2d4,
      fillAlpha: 0.08,
      strokeAlpha: 0.84
    });
    hasFocusHighlights = hasFocusHighlights || Boolean(selectedUnit);

    if (activeUnit) {
      drawUnitFocusOverlay(this.focusGraphics, layout, activeUnit, {
        color: activeUnit.owner === "player" ? 0x7be3ff : 0xffb068,
        fillAlpha: 0.1,
        strokeAlpha: 0.92
      });
      hasFocusHighlights = true;
    }

    for (const movementPath of options.enemyMovementPaths ?? []) {
      drawMovementPath(this.rangeGraphics, layout, movementPath);
      hasRangeHighlights = hasRangeHighlights || movementPath.length > 1;
    }

    for (const spawn of options.editorSpawns?.player ?? []) {
      markerLabels.push(drawSpawnMarker(this.cursorGraphics, layout, spawn, 0x66ffbf, "P"));
    }

    for (const spawn of options.editorSpawns?.enemy ?? []) {
      markerLabels.push(drawSpawnMarker(this.cursorGraphics, layout, spawn, 0xff8a3d, "E"));
    }

    for (const marker of presentation.mission?.markers ?? []) {
      markerLabels.push(drawObjectiveMarker(this.cursorGraphics, layout, marker));
    }

    for (const [index, highlight] of (options.tutorialHighlights ?? []).entries()) {
      const label = drawTutorialHighlight(this.cursorGraphics, layout, snapshot, highlight, index);

      if (label) {
        markerLabels.push(label);
      }
    }

    if (presentation.selectedTile) {
      const x = layout.originX + presentation.selectedTile.x * layout.cellSize;
      const y = layout.originY + presentation.selectedTile.y * layout.cellSize;
      this.focusGraphics.lineStyle(3, 0xff4fd8, 0.98);
      this.focusGraphics.strokeRoundedRect(
        x + 2,
        y + 2,
        layout.cellSize - 6,
        layout.cellSize - 6,
        6
      );
      hasFocusHighlights = true;
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
    this.fxState = {
      hasRangeHighlights,
      hasFocusHighlights,
      hasBuildingHighlights
    };
  }
}
