import Phaser from "phaser";
import { getBuildingTypeMetadata } from "../../content/buildings.js";
import { getBuildingSpriteKey } from "../assets.js";
import { getOwnerColor } from "./ownerPalette.js";

export class BuildingLayer {
  constructor(scene) {
    this.scene = scene;
    this.containers = [];
  }

  clear() {
    this.containers.forEach((container) => container.destroy());
    this.containers = [];
  }

  render(snapshot, layout) {
    this.clear();

    for (const building of snapshot.map.buildings) {
      const metadata = getBuildingTypeMetadata(building.type);
      const accent = getOwnerColor(building.owner);
      const centerX = layout.originX + building.x * layout.cellSize + layout.cellSize / 2;
      const centerY = layout.originY + building.y * layout.cellSize + layout.cellSize / 2;
      const textureKey = getBuildingSpriteKey(building.type, building.owner);
      const glow = this.scene.add
        .circle(0, 0, layout.cellSize * 0.44, accent, 0.18)
        .setBlendMode(Phaser.BlendModes.ADD);

      let visual = null;
      let shadow = null;
      let label = null;

      if (textureKey && this.scene.textures.exists(textureKey)) {
        shadow = this.scene.add
          .image(layout.cellSize * 0.04, layout.cellSize * 0.05, textureKey)
          .setOrigin(0.5)
          .setDisplaySize(layout.cellSize * 0.9, layout.cellSize * 0.9)
          .setTint(0x08040f)
          .setAlpha(0.55);
        visual = this.scene.add
          .image(0, 0, textureKey)
          .setOrigin(0.5)
          .setDisplaySize(layout.cellSize * 0.86, layout.cellSize * 0.86);
      } else {
        const fallback = this.scene.add.graphics();
        fallback.fillStyle(0x11061f, 0.92);
        fallback.fillRoundedRect(
          -layout.cellSize * 0.24,
          -layout.cellSize * 0.14,
          layout.cellSize * 0.48,
          layout.cellSize * 0.28,
          8
        );
        visual = fallback;
        label = this.scene.add
          .text(0, 0, metadata.shortLabel, {
            fontFamily: "Bahnschrift SemiCondensed, sans-serif",
            fontSize: `${Math.max(11, Math.floor(layout.cellSize * 0.18))}px`,
            color: "#fff8ff"
          })
          .setOrigin(0.5);

        label.setShadow(0, 0, "#ff4fd8", 10, false, true);
      }

      const children = label
        ? [glow, visual, label]
        : [glow, shadow, visual];
      const container = this.scene.add.container(centerX, centerY, children);
      container.setDepth(18);
      this.containers.push(container);
    }
  }
}
