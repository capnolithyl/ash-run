import Phaser from "phaser";
import {
  BATTLE_ATTACK_IMPACT_DELAY_MS,
  BATTLE_MOVE_SEGMENT_DURATION_MS
} from "../../core/constants.js";
import { getUnitSpriteDefinition } from "../assets.js";
import { getOwnerColor } from "./ownerPalette.js";

function getPointDistance(left, right) {
  return Phaser.Math.Distance.Between(left.x, left.y, right.x, right.y);
}

function getUnitVisualSpec(scene, unit) {
  const spriteDefinition = getUnitSpriteDefinition(unit.unitTypeId, unit.owner);

  if (spriteDefinition?.type === "spritesheet" && scene.textures.exists(spriteDefinition.key)) {
    return spriteDefinition;
  }

  if (spriteDefinition?.fallbackKey && scene.textures.exists(spriteDefinition.fallbackKey)) {
    return {
      type: "image",
      key: spriteDefinition.fallbackKey
    };
  }

  if (spriteDefinition?.type === "image" && scene.textures.exists(spriteDefinition.key)) {
    return spriteDefinition;
  }

  return null;
}

function ensureUnitIdleAnimation(scene, visualSpec) {
  if (visualSpec?.type !== "spritesheet" || visualSpec.frameCount <= 1) {
    return null;
  }

  if (!scene.anims.exists(visualSpec.animationKey)) {
    scene.anims.create({
      key: visualSpec.animationKey,
      frames: scene.anims.generateFrameNumbers(visualSpec.key, {
        start: 0,
        end: visualSpec.frameCount - 1
      }),
      frameRate: visualSpec.frameRate,
      repeat: -1
    });
  }

  return visualSpec.animationKey;
}

export class UnitLayer {
  constructor(scene) {
    this.scene = scene;
    this.entities = new Map();
    this.cellSize = null;
  }

  clear() {
    this.entities.forEach((entity) => {
      entity.queuedAttack = null;
      this.stopMoveTween(entity);
      for (const tween of entity.effectTweens) {
        tween.stop();
      }
      entity.effectTweens = [];
      entity.container.destroy();
    });
    this.entities.clear();
    this.cellSize = null;
  }

  createEntity(unit, layout) {
    const color = getOwnerColor(unit.owner);
    const visualSpec = getUnitVisualSpec(this.scene, unit);
    const glow = this.scene.add
      .circle(0, 0, layout.cellSize * 0.44, color, 0.13)
      .setBlendMode(Phaser.BlendModes.ADD);
    const aura = this.scene.add
      .circle(0, 0, layout.cellSize * 0.35, color, 0.18)
      .setBlendMode(Phaser.BlendModes.ADD);

    let visual = null;
    let shadow = null;
    let fallbackLabel = null;

    if (visualSpec) {
      const textureFrame = visualSpec.type === "spritesheet" ? 0 : undefined;
      shadow = this.scene.add
        .image(layout.cellSize * 0.04, layout.cellSize * 0.05, visualSpec.key, textureFrame)
        .setOrigin(0.5)
        .setDisplaySize(layout.cellSize * 0.92, layout.cellSize * 0.92)
        .setTint(0x08040f)
        .setAlpha(0.64);
      visual =
        visualSpec.type === "spritesheet"
          ? this.scene.add.sprite(0, -layout.cellSize * 0.03, visualSpec.key, 0)
          : this.scene.add.image(0, -layout.cellSize * 0.03, visualSpec.key);
      visual.setOrigin(0.5).setDisplaySize(layout.cellSize * 0.88, layout.cellSize * 0.88);
      shadow.setFlipX(unit.owner === "enemy");
      visual.setFlipX(unit.owner === "enemy");

      const animationKey = ensureUnitIdleAnimation(this.scene, visualSpec);

      if (animationKey) {
        visual.play(animationKey);
      }
    } else {
      visual = this.scene.add.circle(0, 0, layout.cellSize * 0.28, color, 0.95);
      visual.setStrokeStyle(2, 0xfff2fc, 0.78);
      fallbackLabel = this.scene.add
        .text(0, -4, unit.name.slice(0, 2).toUpperCase(), {
          fontFamily: "Bahnschrift SemiCondensed, sans-serif",
          fontSize: `${Math.max(12, Math.floor(layout.cellSize * 0.2))}px`,
          color: "#240817"
        })
        .setOrigin(0.5);
    }

    const healthRing = this.scene.add.graphics();
    const transportIcon = this.scene.add
      .text(layout.cellSize * 0.2, layout.cellSize * 0.2, "IN", {
        fontFamily: "Bahnschrift SemiCondensed, sans-serif",
        fontSize: `${Math.max(8, Math.floor(layout.cellSize * 0.15))}px`,
        color: "#f6fffe",
        backgroundColor: "#12233a"
      })
      .setPadding(3, 1, 3, 1)
      .setOrigin(0.5)
      .setVisible(false);
    const children = fallbackLabel
      ? [glow, aura, visual, healthRing, fallbackLabel, transportIcon]
      : [glow, aura, shadow, visual, healthRing, transportIcon];

    const container = this.scene.add.container(0, 0, children);
    container.setDepth(28);

    return {
      unitId: unit.id,
      container,
      glow,
      aura,
      healthRing,
      shadow,
      visual,
      visualBaseScaleX: visual.scaleX,
      visualBaseScaleY: visual.scaleY,
      fallbackLabel,
      textureKey: visualSpec?.key ?? null,
      visualType: visualSpec?.type ?? "fallback",
      moveTween: null,
      effectTweens: [],
      targetX: 0,
      targetY: 0,
      alphaTarget: 1,
      queuedAttack: null,
      transportIcon
    };
  }

  getTileCenter(unit, layout) {
    return {
      x: layout.originX + unit.x * layout.cellSize + layout.cellSize / 2,
      y: layout.originY + unit.y * layout.cellSize + layout.cellSize / 2
    };
  }

  getTileCenterFromCoordinates(layout, x, y) {
    return {
      x: layout.originX + x * layout.cellSize + layout.cellSize / 2,
      y: layout.originY + y * layout.cellSize + layout.cellSize / 2
    };
  }

  stopMoveTween(entity) {
    if (!entity.moveTween) {
      return;
    }

    entity.moveTween.stop();
    entity.moveTween = null;
  }

  getMoveTweenRemaining(unitId) {
    const tween = this.entities.get(unitId)?.moveTween;

    if (!tween) {
      return 0;
    }

    if (
      Number.isFinite(tween.totalDuration) &&
      tween.totalDuration > 0 &&
      Number.isFinite(tween.elapsed)
    ) {
      return Math.max(0, tween.totalDuration - tween.elapsed);
    }

    if (
      Number.isFinite(tween.duration) &&
      tween.duration > 0 &&
      Number.isFinite(tween.progress)
    ) {
      return Math.max(0, tween.duration * (1 - tween.progress));
    }

    if (
      typeof tween.getOverallProgress === "function" &&
      Number.isFinite(tween.totalDuration) &&
      tween.totalDuration > 0
    ) {
      return Math.max(0, tween.totalDuration * (1 - tween.getOverallProgress()));
    }

    return BATTLE_MOVE_SEGMENT_DURATION_MS;
  }

  playQueuedAttack(entity) {
    const queuedAttack = entity.queuedAttack;

    if (!queuedAttack) {
      return;
    }

    entity.queuedAttack = null;
    this.playAttack(
      entity.unitId,
      queuedAttack.directionX,
      queuedAttack.directionY,
      queuedAttack.callbacks
    );
  }

  playPathMovement(entity, layout, path) {
    const worldPoints = path.map((tile) =>
      this.getTileCenterFromCoordinates(layout, tile.x, tile.y)
    );
    const tweens = [];
    entity.container.setPosition(worldPoints[0].x, worldPoints[0].y);

    for (let index = 1; index < worldPoints.length; index += 1) {
      const point = worldPoints[index];

      tweens.push({
        x: point.x,
        y: point.y,
        duration: BATTLE_MOVE_SEGMENT_DURATION_MS,
        ease: "Sine.Out"
      });
    }

    if (tweens.length === 0) {
      entity.container.setPosition(entity.targetX, entity.targetY);
      entity.moveTween = null;
      this.playQueuedAttack(entity);
      return;
    }

    entity.moveTween = this.scene.tweens.chain({
      targets: entity.container,
      tweens,
      onComplete: () => {
        entity.moveTween = null;
        entity.container.setPosition(entity.targetX, entity.targetY);
        this.playQueuedAttack(entity);
      }
    });
  }

  setVisualScale(entity, multiplier = 1) {
    entity.visual.setScale(
      entity.visualBaseScaleX * multiplier,
      entity.visualBaseScaleY * multiplier
    );
  }

  resetEntityEffects(entity) {
    entity.container.setPosition(entity.targetX, entity.targetY);
    entity.container.setScale(1);
    entity.container.setAlpha(entity.alphaTarget);
    this.setVisualScale(entity, 1);
    entity.glow.setScale(1);
    entity.aura.setScale(1);
    entity.glow.setAlpha(0.13);
    entity.aura.setAlpha(0.18);
    entity.shadow?.setAlpha(0.64);
  }

  stopEffectTweens(entity) {
    for (const tween of entity.effectTweens) {
      tween.stop();
    }

    entity.effectTweens = [];
    this.resetEntityEffects(entity);
  }

  trackEffectTween(entity, tween) {
    entity.effectTweens.push(tween);
    tween.on("complete", () => {
      entity.effectTweens = entity.effectTweens.filter((activeTween) => activeTween !== tween);
    });
    return tween;
  }

  destroyEntity(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    entity.queuedAttack = null;
    this.stopMoveTween(entity);

    this.stopEffectTweens(entity);

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

  playDeploy(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    entity.container.setScale(0.22);
    entity.container.setAlpha(0);
    entity.container.y += this.cellSize ? this.cellSize * 0.14 : 6;
    this.scene.tweens.add({
      targets: entity.container,
      alpha: entity.alphaTarget,
      scaleX: 1,
      scaleY: 1,
      y: entity.targetY,
      duration: 460,
      ease: "Back.Out"
    });
  }

  playAttack(unitId, directionX = 0, directionY = 0, callbacks = {}) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    if (entity.moveTween) {
      entity.queuedAttack = {
        directionX,
        directionY,
        callbacks
      };
      return;
    }

    callbacks.onStart?.();
    this.stopEffectTweens(entity);

    const offsetX = Math.sign(directionX) * Math.max(5, (this.cellSize ?? 40) * 0.12);
    const offsetY = Math.sign(directionY) * Math.max(5, (this.cellSize ?? 40) * 0.12);
    entity.glow.setAlpha(0.3);
    entity.aura.setAlpha(0.45);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.container,
      x: entity.targetX + offsetX,
      y: entity.targetY + offsetY,
      duration: 120,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        entity.container.setPosition(entity.targetX, entity.targetY);
      }
    }));
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.visual,
      scaleX: entity.visualBaseScaleX * 1.14,
      scaleY: entity.visualBaseScaleY * 1.14,
      duration: 110,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.setVisualScale(entity, 1);
      }
    }));
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: [entity.glow, entity.aura],
      scale: 1.24,
      duration: 180,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.resetEntityEffects(entity);
      }
    }));

    if (callbacks.onImpact) {
      this.scene.time.delayedCall(BATTLE_ATTACK_IMPACT_DELAY_MS, callbacks.onImpact);
    }
  }

  playDamage(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    this.stopEffectTweens(entity);

    entity.aura.setAlpha(0.5);
    entity.glow.setAlpha(0.3);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.container,
      x: entity.targetX + (Math.random() > 0.5 ? 1 : -1) * Math.max(4, this.cellSize * 0.08),
      duration: 52,
      yoyo: true,
      repeat: 2,
      ease: "Sine.InOut"
    }));
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.visual,
      scaleX: entity.visualBaseScaleX * 1.24,
      scaleY: entity.visualBaseScaleY * 1.24,
      duration: 170,
      yoyo: true,
      ease: "Sine.InOut"
    }));
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.aura,
      scale: 1.32,
      alpha: { from: 0.5, to: 0.2 },
      duration: 170,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.resetEntityEffects(entity);
      }
    }));
  }

  playHeal(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    this.stopEffectTweens(entity);

    entity.glow.setAlpha(0.28);
    entity.aura.setAlpha(0.38);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: [entity.glow, entity.aura],
      scale: 1.42,
      duration: 240,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.resetEntityEffects(entity);
      }
    }));
  }

  render(snapshot, layout, movementEvents = []) {
    if (this.cellSize !== layout.cellSize) {
      this.clear();
      this.cellSize = layout.cellSize;
    }

    const units = [...snapshot.player.units, ...snapshot.enemy.units].filter(
      (unit) => !unit.transport?.carriedByUnitId
    );
    const activeIds = new Set();
    const movementEventMap = new Map(
      movementEvents.map((event) => [event.unitId, event])
    );

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

      const color = getOwnerColor(unit.owner);
      const visualSpec = getUnitVisualSpec(this.scene, unit);
      entity.glow.setFillStyle(color, 0.13);
      entity.aura.setFillStyle(color, 0.18);
      if (
        visualSpec &&
        entity.textureKey !== visualSpec.key &&
        entity.shadow &&
        entity.visual.setTexture
      ) {
        const textureFrame = visualSpec.type === "spritesheet" ? 0 : undefined;
        entity.shadow.setTexture(visualSpec.key, textureFrame);
        entity.visual.setTexture(visualSpec.key, textureFrame);
        entity.textureKey = visualSpec.key;
        entity.visualType = visualSpec.type;
      }
      if (visualSpec?.type === "spritesheet" && entity.visual.play) {
        const animationKey = ensureUnitIdleAnimation(this.scene, visualSpec);

        if (animationKey && entity.visual.anims?.currentAnim?.key !== animationKey) {
          entity.visual.play(animationKey);
        }
      }
      entity.visual.setFlipX?.(unit.owner === "enemy");
      entity.shadow?.setFlipX?.(unit.owner === "enemy");
      entity.fallbackLabel?.setText(unit.name.slice(0, 2).toUpperCase());
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
      entity.transportIcon?.setVisible(Boolean(unit.transport?.carryingUnitId));
      const dimmed =
        unit.hasMoved ||
        unit.hasAttacked ||
        snapshot.presentation?.pendingAction?.unitId === unit.id;
      entity.alphaTarget =
        unit.current.hp > 0
          ? dimmed
            ? 0.68
            : 1
          : 0.4;
      entity.container.setAlpha(entity.alphaTarget);

      const nextPosition = this.getTileCenter(unit, layout);
      const movementEvent = movementEventMap.get(unit.id);
      const distance =
        Math.abs(nextPosition.x - entity.targetX) + Math.abs(nextPosition.y - entity.targetY);

      if (distance > 0) {
        this.stopMoveTween(entity);

        entity.targetX = nextPosition.x;
        entity.targetY = nextPosition.y;

        if (movementEvent?.teleport) {
          entity.container.setPosition(entity.targetX, entity.targetY);
        } else if (movementEvent?.path?.length > 1) {
          this.playPathMovement(entity, layout, movementEvent.path);
        } else {
          const renderedDistance = getPointDistance(
            { x: entity.container.x, y: entity.container.y },
            nextPosition
          );
          entity.moveTween = this.scene.tweens.add({
            targets: entity.container,
            x: nextPosition.x,
            y: nextPosition.y,
            duration: 180 + Math.max(90, renderedDistance * 0.75),
            ease: "Sine.Out",
            onComplete: () => {
              entity.moveTween = null;
              entity.container.setPosition(entity.targetX, entity.targetY);
              this.playQueuedAttack(entity);
            }
          });
        }
      }
    }

    for (const existingUnitId of [...this.entities.keys()]) {
      if (!activeIds.has(existingUnitId)) {
        this.destroyEntity(existingUnitId);
      }
    }
  }
}
