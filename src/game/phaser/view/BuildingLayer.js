import Phaser from "phaser";
import { getBuildingTypeMetadata } from "../../content/buildings.js";

function buildingColorForOwner(owner) {
  if (owner === "player") {
    return 0xff5fd6;
  }

  if (owner === "enemy") {
    return 0xff8a3d;
  }

  return 0xffd166;
}

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
      const accent = buildingColorForOwner(building.owner);
      const centerX = layout.originX + building.x * layout.cellSize + layout.cellSize / 2;
      const centerY = layout.originY + building.y * layout.cellSize + layout.cellSize / 2;
      const glow = this.scene.add
        .circle(0, 0, layout.cellSize * 0.28, accent, 0.18)
        .setBlendMode(Phaser.BlendModes.ADD);

      const capsule = this.scene.add.graphics();
      capsule.fillStyle(0x11061f, 0.92);
      capsule.fillRoundedRect(
        -layout.cellSize * 0.24,
        -layout.cellSize * 0.14,
        layout.cellSize * 0.48,
        layout.cellSize * 0.28,
        8
      );
      capsule.lineStyle(2, accent, 0.82);
      capsule.strokeRoundedRect(
        -layout.cellSize * 0.24,
        -layout.cellSize * 0.14,
        layout.cellSize * 0.48,
        layout.cellSize * 0.28,
        8
      );

      const label = this.scene.add
        .text(0, 0, metadata.shortLabel, {
          fontFamily: "Bahnschrift SemiCondensed, sans-serif",
          fontSize: `${Math.max(11, Math.floor(layout.cellSize * 0.18))}px`,
          color: "#fff8ff"
        })
        .setOrigin(0.5);

      label.setShadow(0, 0, "#ff4fd8", 10, false, true);

      const container = this.scene.add.container(centerX, centerY, [glow, capsule, label]);
      container.setDepth(18);
      this.containers.push(container);
    }
  }
}
