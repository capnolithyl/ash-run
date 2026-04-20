import Phaser from "phaser";

function unitColor(owner) {
  return owner === "player" ? 0xff5fd6 : 0xff8a3d;
}

export class UnitLayer {
  constructor(scene) {
    this.scene = scene;
    this.entities = new Map();
    this.cellSize = null;
  }

  clear() {
    this.entities.forEach((entity) => entity.container.destroy());
    this.entities.clear();
    this.cellSize = null;
  }

  createEntity(unit, layout) {
    const color = unitColor(unit.owner);
    const glow = this.scene.add
      .circle(0, 0, layout.cellSize * 0.42, color, 0.12)
      .setBlendMode(Phaser.BlendModes.ADD);
    const aura = this.scene.add
      .circle(0, 0, layout.cellSize * 0.34, color, 0.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    const body = this.scene.add.circle(0, 0, layout.cellSize * 0.28, color, 0.95);
    body.setStrokeStyle(2, 0xfff2fc, 0.78);
    const label = this.scene.add
      .text(0, -4, unit.name.slice(0, 2).toUpperCase(), {
        fontFamily: "Bahnschrift SemiCondensed, sans-serif",
        fontSize: `${Math.max(12, Math.floor(layout.cellSize * 0.2))}px`,
        color: "#240817"
      })
      .setOrigin(0.5);
    const healthRing = this.scene.add.graphics();

    const container = this.scene.add.container(0, 0, [glow, aura, healthRing, body, label]);
    container.setDepth(28);

    return {
      container,
      glow,
      aura,
      healthRing,
      body,
      label,
      moveTween: null,
      targetX: 0,
      targetY: 0
    };
  }

  getTileCenter(unit, layout) {
    return {
      x: layout.originX + unit.x * layout.cellSize + layout.cellSize / 2,
      y: layout.originY + unit.y * layout.cellSize + layout.cellSize / 2
    };
  }

  destroyEntity(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    if (entity.moveTween) {
      entity.moveTween.stop();
    }

    this.scene.tweens.add({
      targets: entity.container,
      alpha: 0,
      duration: 120,
      onComplete: () => {
        entity.container.destroy();
      }
    });

    this.entities.delete(unitId);
  }

  render(snapshot, layout) {
    if (this.cellSize !== layout.cellSize) {
      this.clear();
      this.cellSize = layout.cellSize;
    }

    const units = [...snapshot.player.units, ...snapshot.enemy.units];
    const activeIds = new Set();

    for (const unit of units) {
      activeIds.add(unit.id);

      let entity = this.entities.get(unit.id);

      if (!entity) {
        entity = this.createEntity(unit, layout);
        this.entities.set(unit.id, entity);
        const initialPosition = this.getTileCenter(unit, layout);
        entity.container.setPosition(initialPosition.x, initialPosition.y);
        entity.targetX = initialPosition.x;
        entity.targetY = initialPosition.y;
      }

      const color = unitColor(unit.owner);
      entity.body.setFillStyle(color, 0.95);
      entity.glow.setFillStyle(color, 0.12);
      entity.aura.setFillStyle(color, 0.2);
      entity.label.setText(unit.name.slice(0, 2).toUpperCase());
      const ringYOffset = -layout.cellSize * 0.42;
      const ringRadius = layout.cellSize * 0.12;
      const hpRatio = Math.max(0, Math.min(1, unit.current.hp / unit.stats.maxHealth));
      entity.healthRing.clear();
      entity.healthRing.lineStyle(3, 0x11081c, 0.95);
      entity.healthRing.strokeCircle(0, ringYOffset, ringRadius);
      entity.healthRing.lineStyle(2.5, 0xffffff, 0.18);
      entity.healthRing.beginPath();
      entity.healthRing.arc(0, ringYOffset, ringRadius, -Math.PI / 2, Math.PI * 1.5, false);
      entity.healthRing.strokePath();
      entity.healthRing.lineStyle(
        3,
        hpRatio > 0.5 ? 0x7dffbf : hpRatio > 0.25 ? 0xffd166 : 0xff6b8c,
        0.95
      );
      entity.healthRing.beginPath();
      entity.healthRing.arc(
        0,
        ringYOffset,
        ringRadius,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * hpRatio,
        false
      );
      entity.healthRing.strokePath();
      const dimmed =
        unit.hasMoved ||
        unit.hasAttacked ||
        snapshot.presentation?.pendingAction?.unitId === unit.id;
      entity.container.setAlpha(
        unit.current.hp > 0
          ? dimmed
            ? 0.68
            : 1
          : 0.4
      );

      const nextPosition = this.getTileCenter(unit, layout);
      const distance =
        Math.abs(nextPosition.x - entity.targetX) + Math.abs(nextPosition.y - entity.targetY);

      if (distance > 0) {
        if (entity.moveTween) {
          entity.moveTween.stop();
        }

        entity.targetX = nextPosition.x;
        entity.targetY = nextPosition.y;
        entity.moveTween = this.scene.tweens.add({
          targets: entity.container,
          x: nextPosition.x,
          y: nextPosition.y,
          duration: 340 + Math.max(220, distance * 0.55),
          ease: "Sine.Out"
        });
      }
    }

    for (const existingUnitId of [...this.entities.keys()]) {
      if (!activeIds.has(existingUnitId)) {
        this.destroyEntity(existingUnitId);
      }
    }
  }
}
