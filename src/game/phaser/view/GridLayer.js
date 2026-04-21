import Phaser from "phaser";
import { MAP_THEME_PALETTES, TERRAIN_LIBRARY } from "../../content/terrain.js";
import { getTerrainSpriteKey } from "../assets.js";

export class GridLayer {
  constructor(scene) {
    this.scene = scene;
    this.glowGraphics = scene.add.graphics();
    this.glowGraphics.setBlendMode(Phaser.BlendModes.ADD);
    this.glowGraphics.setDepth(0);
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(1);
    this.overlayGraphics = scene.add.graphics();
    this.overlayGraphics.setDepth(6);
    this.terrainSprites = [];
    this.terrainRenderKey = null;
  }

  clear() {
    this.glowGraphics.clear();
    this.graphics.clear();
    this.overlayGraphics.clear();
    this.clearTerrainSprites();
  }

  clearTerrainSprites() {
    this.terrainSprites.forEach((sprite) => sprite.destroy());
    this.terrainSprites = [];
    this.terrainRenderKey = null;
  }

  getTerrainRenderKey(snapshot, layout) {
    const tileSignature = snapshot.map.tiles.map((row) => row.join(",")).join("|");
    return [
      snapshot.map.id,
      layout.cellSize,
      layout.originX,
      layout.originY,
      tileSignature
    ].join(":");
  }

  renderTerrainSprites(snapshot, layout) {
    const renderKey = this.getTerrainRenderKey(snapshot, layout);

    if (renderKey === this.terrainRenderKey) {
      return;
    }

    this.clearTerrainSprites();

    for (let row = 0; row < snapshot.map.height; row += 1) {
      for (let column = 0; column < snapshot.map.width; column += 1) {
        const terrainId = snapshot.map.tiles[row][column];
        const textureKey = getTerrainSpriteKey(terrainId);
        const x = layout.originX + column * layout.cellSize;
        const y = layout.originY + row * layout.cellSize;

        if (!textureKey || !this.scene.textures.exists(textureKey)) {
          const terrain = TERRAIN_LIBRARY[terrainId];
          this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(terrain.color).color, 0.96);
          this.graphics.fillRect(x, y, layout.cellSize, layout.cellSize);
          continue;
        }

        const sprite = this.scene.add
          .image(x + layout.cellSize / 2, y + layout.cellSize / 2, textureKey)
          .setDepth(4)
          .setDisplaySize(layout.cellSize, layout.cellSize);

        this.terrainSprites.push(sprite);
      }
    }

    this.terrainRenderKey = renderKey;
  }

  render(snapshot, layout) {
    const theme = MAP_THEME_PALETTES[snapshot.map.theme];
    this.glowGraphics.clear();
    this.graphics.clear();
    this.overlayGraphics.clear();
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

    this.renderTerrainSprites(snapshot, layout);

    this.overlayGraphics.lineStyle(1.5, Phaser.Display.Color.HexStringToColor(theme.gridGlow).color, 0.18);
    this.overlayGraphics.strokeRoundedRect(
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
        this.graphics.fillRect(x, y, layout.cellSize, layout.cellSize);
      }
    }
  }
}
