import Phaser from "phaser";

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

export class SelectionLayer {
  constructor(scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
  }

  clear() {
    this.graphics.clear();
  }

  render(snapshot, layout, showGridHighlights, hoveredTile) {
    this.clear();

    const presentation = snapshot.presentation ?? {};

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
      drawCornerMarkers(this.graphics, x, y, layout.cellSize - 2, 0xfff1c9, 0.96);
      drawCornerMarkers(this.graphics, x + 2, y + 2, layout.cellSize - 6, 0xff8a3d, 0.82);
    }
  }
}
