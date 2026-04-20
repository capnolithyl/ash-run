import Phaser from "phaser";
import { MAP_THEME_PALETTES, TERRAIN_LIBRARY } from "../../content/terrain.js";

function buildingColorForOwner(owner) {
  if (owner === "player") {
    return 0xff5fd6;
  }

  if (owner === "enemy") {
    return 0xff8a3d;
  }

  return 0xffd166;
}

export class GridLayer {
  constructor(scene) {
    this.scene = scene;
    this.glowGraphics = scene.add.graphics();
    this.glowGraphics.setBlendMode(Phaser.BlendModes.ADD);
    this.graphics = scene.add.graphics();
  }

  clear() {
    this.glowGraphics.clear();
    this.graphics.clear();
  }

  render(snapshot, layout) {
    const theme = MAP_THEME_PALETTES[snapshot.map.theme];
    this.clear();
    this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(theme.background).color, 0.92);
    this.graphics.fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
    this.graphics.fillStyle(0x12061f, 0.66);
    this.graphics.fillRect(0, this.scene.scale.height * 0.82, this.scene.scale.width, this.scene.scale.height * 0.18);
    this.glowGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(theme.accent).color, 0.08);
    this.glowGraphics.fillCircle(this.scene.scale.width * 0.72, this.scene.scale.height * 0.18, 180);
    this.glowGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(theme.gridGlow).color, 0.07);
    this.glowGraphics.fillCircle(this.scene.scale.width * 0.24, this.scene.scale.height * 0.2, 220);
    this.glowGraphics.fillStyle(0xff4fd8, 0.035);
    this.glowGraphics.fillRoundedRect(
      layout.originX - 18,
      layout.originY - 18,
      snapshot.map.width * layout.cellSize + 36,
      snapshot.map.height * layout.cellSize + 36,
      24
    );

    this.graphics.lineStyle(2, Phaser.Display.Color.HexStringToColor(theme.gridGlow).color, 0.28);
    this.graphics.strokeRoundedRect(
      layout.originX - 8,
      layout.originY - 8,
      snapshot.map.width * layout.cellSize + 14,
      snapshot.map.height * layout.cellSize + 14,
      16
    );

    for (let row = 0; row < snapshot.map.height; row += 1) {
      for (let column = 0; column < snapshot.map.width; column += 1) {
        const terrain = TERRAIN_LIBRARY[snapshot.map.tiles[row][column]];
        const x = layout.originX + column * layout.cellSize;
        const y = layout.originY + row * layout.cellSize;

        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(terrain.color).color, 0.96);
        this.graphics.fillRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(theme.gridGlow).color, 0.08);
        this.graphics.fillRoundedRect(x + 2, y + 2, layout.cellSize - 6, layout.cellSize - 6, 4);
        this.graphics.lineStyle(1.4, Phaser.Display.Color.HexStringToColor(terrain.border).color, 0.62);
        this.graphics.strokeRoundedRect(x, y, layout.cellSize - 2, layout.cellSize - 2, 6);
      }
    }

    for (const building of snapshot.map.buildings) {
      const x = layout.originX + building.x * layout.cellSize;
      const y = layout.originY + building.y * layout.cellSize;
      this.glowGraphics.fillStyle(buildingColorForOwner(building.owner), 0.11);
      this.glowGraphics.fillRoundedRect(
        x + layout.cellSize * 0.05,
        y + layout.cellSize * 0.05,
        layout.cellSize * 0.9,
        layout.cellSize * 0.9,
        12
      );
      this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(theme.accent).color, 0.18);
      this.graphics.fillRoundedRect(
        x + layout.cellSize * 0.08,
        y + layout.cellSize * 0.08,
        layout.cellSize * 0.82,
        layout.cellSize * 0.82,
        10
      );
      this.graphics.fillStyle(buildingColorForOwner(building.owner), 0.92);
      this.graphics.fillRoundedRect(
        x + layout.cellSize * 0.15,
        y + layout.cellSize * 0.15,
        layout.cellSize * 0.68,
        layout.cellSize * 0.68,
        8
      );
      this.graphics.lineStyle(2, buildingColorForOwner(building.owner), 0.85);
      this.graphics.strokeRoundedRect(
        x + layout.cellSize * 0.15,
        y + layout.cellSize * 0.15,
        layout.cellSize * 0.68,
        layout.cellSize * 0.68,
        8
      );
    }
  }
}
