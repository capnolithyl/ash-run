import Phaser from "phaser";
import { BATTLE_ATTACK_IMPACT_DELAY_MS, BATTLE_MOVE_SEGMENT_DURATION_MS } from "../../core/constants.js";
import { getGearBadgeLabel } from "../../content/runUpgrades.js";
import { getUnitSpriteDefinition } from "../assets.js";
import { getOwnerColor } from "./ownerPalette.js";
import {
  getAnimationRange,
  getAnimationRangeFrameCount,
  getAttackAnimationPlayback,
  getOwnerIdleFlipX,
  getUnitDefaultTexture,
} from "./unitAnimationHelpers.js";

function getPointDistance(left, right) {
  return Phaser.Math.Distance.Between(left.x, left.y, right.x, right.y);
}

function getUnitVisualSpec(scene, unit) {
  const spriteDefinition = getUnitSpriteDefinition(unit.unitTypeId, unit.owner);

  if (!spriteDefinition) {
    return null;
  }

  const hasLoadedAnimation = [spriteDefinition.idle, spriteDefinition.walk, spriteDefinition.attack].some(
    (animationSpec) => animationSpec && scene.textures.exists(animationSpec.key)
  );

  if (hasLoadedAnimation) {
    return spriteDefinition;
  }

  if (spriteDefinition.fallbackKey && scene.textures.exists(spriteDefinition.fallbackKey)) {
    return spriteDefinition;
  }

  return null;
}

function ensureUnitAnimation(scene, animationSpec, rangeName = "default", repeat = -1) {
  const range = getAnimationRange(animationSpec, rangeName);

  if (!animationSpec?.key || !range || getAnimationRangeFrameCount(range) <= 1) {
    return null;
  }

  const animationKey = `${animationSpec.animationKeyBase}:${rangeName}:${repeat}`;

  if (!scene.anims.exists(animationKey)) {
    scene.anims.create({
      key: animationKey,
      frames: scene.anims.generateFrameNumbers(animationSpec.key, {
        start: range.start,
        end: range.end
      }),
      frameRate: animationSpec.frameRate,
      repeat
    });
  }

  return animationKey;
}

const HEALTH_WEDGE_COLOR_STOPS = [
  { ratio: 0, color: 0xff4747 },
  { ratio: 0.35, color: 0xff9f43 },
  { ratio: 0.62, color: 0xffe65c },
  { ratio: 1, color: 0x5dff38 }
];

function blendHexColors(startColor, endColor, weight) {
  const clampedWeight = Math.max(0, Math.min(1, weight));
  const startRed = (startColor >> 16) & 0xff;
  const startGreen = (startColor >> 8) & 0xff;
  const startBlue = startColor & 0xff;
  const endRed = (endColor >> 16) & 0xff;
  const endGreen = (endColor >> 8) & 0xff;
  const endBlue = endColor & 0xff;
  const red = Math.round(startRed + (endRed - startRed) * clampedWeight);
  const green = Math.round(startGreen + (endGreen - startGreen) * clampedWeight);
  const blue = Math.round(startBlue + (endBlue - startBlue) * clampedWeight);
  return (red << 16) | (green << 8) | blue;
}

function getHealthWedgeColor(hpRatio) {
  if (hpRatio <= HEALTH_WEDGE_COLOR_STOPS[0].ratio) {
    return HEALTH_WEDGE_COLOR_STOPS[0].color;
  }

  for (let index = 1; index < HEALTH_WEDGE_COLOR_STOPS.length; index += 1) {
    const previousStop = HEALTH_WEDGE_COLOR_STOPS[index - 1];
    const nextStop = HEALTH_WEDGE_COLOR_STOPS[index];

    if (hpRatio <= nextStop.ratio) {
      const localWeight = (hpRatio - previousStop.ratio) / (nextStop.ratio - previousStop.ratio);
      return blendHexColors(previousStop.color, nextStop.color, localWeight);
    }
  }

  return HEALTH_WEDGE_COLOR_STOPS[HEALTH_WEDGE_COLOR_STOPS.length - 1].color;
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
      entity.afterMoveCallbacks = [];
      this.stopMoveTween(entity);
      this.stopDestroyTimer(entity);
      this.stopAnimationTimer(entity);
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
      const defaultTexture = getUnitDefaultTexture(visualSpec, unit.owner);
      const textureKey = defaultTexture?.key ?? visualSpec.fallbackKey ?? visualSpec.key;
      const textureFrame = defaultTexture?.frame;
      shadow = this.scene.add
        .image(layout.cellSize * 0.04, layout.cellSize * 0.05, textureKey, textureFrame)
        .setOrigin(0.5)
        .setDisplaySize(layout.cellSize * 0.92, layout.cellSize * 0.92)
        .setTint(0x08040f)
        .setAlpha(0.64);
      visual = this.scene.add.sprite(0, -layout.cellSize * 0.03, textureKey, textureFrame);
      visual.setOrigin(0.5).setDisplaySize(layout.cellSize * 0.88, layout.cellSize * 0.88);
      shadow.setFlipX(defaultTexture?.flipX ?? getOwnerIdleFlipX(unit.owner));
      visual.setFlipX(defaultTexture?.flipX ?? getOwnerIdleFlipX(unit.owner));
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

    const healthMeter = this.scene.add.graphics();
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
    const gearIcon = this.scene.add
      .text(0, -layout.cellSize * 0.34, "", {
        fontFamily: "Bahnschrift SemiCondensed, sans-serif",
        fontSize: `${Math.max(8, Math.floor(layout.cellSize * 0.14))}px`,
        color: "#fefae0",
        backgroundColor: "#16334d"
      })
      .setPadding(4, 1, 4, 1)
      .setOrigin(0.5)
      .setVisible(false);
    const hostageIcon = this.scene.add
      .text(0, layout.cellSize * 0.33, "VIP", {
        fontFamily: "Bahnschrift SemiCondensed, sans-serif",
        fontSize: `${Math.max(8, Math.floor(layout.cellSize * 0.14))}px`,
        color: "#12061f",
        backgroundColor: "#fff18a"
      })
      .setPadding(4, 1, 4, 1)
      .setOrigin(0.5)
      .setVisible(false);
    const children = fallbackLabel
      ? [glow, aura, visual, healthMeter, fallbackLabel, transportIcon, gearIcon, hostageIcon]
      : [glow, aura, shadow, visual, healthMeter, transportIcon, gearIcon, hostageIcon];

    const container = this.scene.add.container(0, 0, children);
    container.setDepth(28);

    return {
      unitId: unit.id,
      owner: unit.owner,
      container,
      glow,
      aura,
      healthMeter,
      shadow,
      visual,
      visualSpec,
      visualBaseScaleX: visual.scaleX,
      visualBaseScaleY: visual.scaleY,
      fallbackLabel,
      textureKey: visualSpec?.key ?? null,
      moveTween: null,
      effectTweens: [],
      targetX: 0,
      targetY: 0,
      alphaTarget: 1,
      displayedHp: unit.current.hp,
      pendingHp: unit.current.hp,
      maxHealth: unit.stats.maxHealth,
      queuedAttack: null,
      afterMoveCallbacks: [],
      awaitingDeploy: false,
      awaitingDestroy: false,
      destroyTimer: null,
      animationTimer: null,
      transportIcon,
      gearIcon,
      hostageIcon
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

  stopDestroyTimer(entity) {
    if (!entity.destroyTimer) {
      return;
    }

    entity.destroyTimer.remove(false);
    entity.destroyTimer = null;
  }

  stopAnimationTimer(entity) {
    if (!entity?.animationTimer) {
      return;
    }

    entity.animationTimer.remove(false);
    entity.animationTimer = null;
  }

  runAfterMoveCallbacks(entity) {
    if (!entity?.afterMoveCallbacks?.length) {
      return;
    }

    const callbacks = entity.afterMoveCallbacks.splice(0);

    callbacks.forEach(({ callback, delay }) => {
      if (delay > 0) {
        this.scene.time.delayedCall(delay, callback);
        return;
      }

      callback();
    });
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
    this.playWalkAnimation(entity);

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
      this.playIdleAnimation(entity);
      this.runAfterMoveCallbacks(entity);
      this.playQueuedAttack(entity);
      return;
    }

    entity.moveTween = this.scene.tweens.chain({
      targets: entity.container,
      tweens,
      onComplete: () => {
        entity.moveTween = null;
        entity.container.setPosition(entity.targetX, entity.targetY);
        this.playIdleAnimation(entity);
        this.runAfterMoveCallbacks(entity);
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

  drawHealthMeter(entity) {
    const hpRatio = Math.max(0, Math.min(1, entity.displayedHp / Math.max(1, entity.maxHealth)));
    const wedgeSize = Math.max(8, Math.round(this.cellSize * 0.22));
    const wedgeX = -Math.round(this.cellSize * 0.34);
    const wedgeY = -Math.round(this.cellSize * 0.45);
    const wedgeColor = getHealthWedgeColor(hpRatio);
    const innerInset = Math.max(1, Math.round(wedgeSize * 0.16));
    const foldLength = Math.max(2, Math.round(wedgeSize * 0.42));

    entity.healthMeter.clear();
    entity.healthMeter.fillStyle(0x100816, 0.92);
    entity.healthMeter.fillTriangle(
      wedgeX,
      wedgeY,
      wedgeX + wedgeSize,
      wedgeY,
      wedgeX,
      wedgeY + wedgeSize
    );
    entity.healthMeter.fillStyle(wedgeColor, 0.98);
    entity.healthMeter.fillTriangle(
      wedgeX + innerInset,
      wedgeY + innerInset,
      wedgeX + wedgeSize - innerInset,
      wedgeY + innerInset,
      wedgeX + innerInset,
      wedgeY + wedgeSize - innerInset
    );
    entity.healthMeter.lineStyle(1.4, 0xfdfbff, 0.98);
    entity.healthMeter.beginPath();
    entity.healthMeter.moveTo(wedgeX + 0.5, wedgeY + 0.5);
    entity.healthMeter.lineTo(wedgeX + wedgeSize + 0.5, wedgeY + 0.5);
    entity.healthMeter.lineTo(wedgeX + 0.5, wedgeY + wedgeSize + 0.5);
    entity.healthMeter.closePath();
    entity.healthMeter.strokePath();
    entity.healthMeter.lineStyle(1, 0x120816, 0.95);
    entity.healthMeter.beginPath();
    entity.healthMeter.moveTo(wedgeX + foldLength, wedgeY + 1.5);
    entity.healthMeter.lineTo(wedgeX + 1.5, wedgeY + foldLength);
    entity.healthMeter.strokePath();
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

  setVisualTexture(entity, textureKey, frame, flipX = getOwnerIdleFlipX(entity.owner)) {
    entity.visual.setTexture?.(textureKey, frame);
    entity.visual.setFlipX?.(flipX);
  }

  syncShadowTexture(entity) {
    if (!entity.shadow || !entity.visualSpec) {
      return;
    }

    const defaultTexture = getUnitDefaultTexture({
      ...entity.visualSpec,
      owner: entity.owner,
    });

    if (!defaultTexture?.key) {
      return;
    }

    entity.shadow.setTexture?.(defaultTexture.key, defaultTexture.frame);
    entity.shadow.setFlipX?.(defaultTexture.flipX ?? getOwnerIdleFlipX(entity.owner));
  }

  playIdleAnimation(entity) {
    this.stopAnimationTimer(entity);

    const idleAnimation = entity.visualSpec?.idle;
    const idleAnimationKey = ensureUnitAnimation(this.scene, idleAnimation, "default", -1);

    if (idleAnimationKey) {
      const range = getAnimationRange(idleAnimation, "default");
      this.setVisualTexture(entity, idleAnimation.key, range.start, false);
      this.syncShadowTexture(entity);
      entity.visual.play?.(idleAnimationKey);
      return;
    }

    entity.visual.stop?.();
    if (entity.visualSpec?.fallbackKey) {
      this.setVisualTexture(
        entity,
        entity.visualSpec.fallbackKey,
        undefined,
        getOwnerIdleFlipX(entity.owner),
      );
      this.syncShadowTexture(entity);
    }
  }

  playWalkAnimation(entity) {
    const walkAnimation = entity.visualSpec?.walk;
    const walkAnimationKey = ensureUnitAnimation(this.scene, walkAnimation, "default", -1);

    if (!walkAnimationKey) {
      return;
    }

    this.stopAnimationTimer(entity);
    const range = getAnimationRange(walkAnimation, "default");
    this.setVisualTexture(entity, walkAnimation.key, range.start, false);
    this.syncShadowTexture(entity);
    entity.visual.play?.(walkAnimationKey);
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
    entity.afterMoveCallbacks = [];
    entity.awaitingDestroy = false;
    this.stopMoveTween(entity);
    this.stopDestroyTimer(entity);
    this.stopAnimationTimer(entity);

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

  scheduleDestroy(unitId, delay = 0) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    entity.awaitingDestroy = true;

    if (delay <= 0) {
      this.destroyEntity(unitId);
      return;
    }

    this.stopDestroyTimer(entity);
    entity.destroyTimer = this.scene.time.delayedCall(delay, () => {
      entity.destroyTimer = null;
      this.destroyEntity(unitId);
    });
  }

  holdForDestroy(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    entity.awaitingDestroy = true;
  }

  queueAfterMovement(unitId, callback, delay = 0) {
    const entity = this.entities.get(unitId);

    if (!entity?.moveTween) {
      if (delay > 0) {
        this.scene.time.delayedCall(delay, callback);
        return;
      }

      callback();
      return;
    }

    entity.afterMoveCallbacks.push({
      callback,
      delay
    });
  }

  playDeploy(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    entity.awaitingDeploy = false;
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
    const suppressVisuals = callbacks.suppressVisuals === true;
    const impactDelayMs = Math.max(0, callbacks.impactDelayMs ?? BATTLE_ATTACK_IMPACT_DELAY_MS);

    if (suppressVisuals) {
      if (callbacks.onImpact) {
        this.scene.time.delayedCall(impactDelayMs, callbacks.onImpact);
      }

      return;
    }

    this.stopEffectTweens(entity);
    this.stopAnimationTimer(entity);

    const attackAnimation = entity.visualSpec?.attack;
    const attackPlayback = getAttackAnimationPlayback(entity.owner, attackAnimation, directionX);
    const attackRange = attackPlayback?.range ?? null;
    const attackAnimationKey = ensureUnitAnimation(
      this.scene,
      attackAnimation,
      attackPlayback?.rangeName ?? "default",
      0
    );
    const hasAttackAnimation = Boolean(attackAnimationKey && attackRange);

    const offsetX = Math.sign(directionX) * Math.max(5, (this.cellSize ?? 40) * 0.12);
    const offsetY = Math.sign(directionY) * Math.max(5, (this.cellSize ?? 40) * 0.12);
    entity.glow.setAlpha(0.3);
    entity.aura.setAlpha(0.45);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.container,
      x: entity.targetX + offsetX,
      y: entity.targetY + offsetY,
      duration: hasAttackAnimation ? 90 : 120,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        entity.container.setPosition(entity.targetX, entity.targetY);
      }
    }));
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.visual,
      scaleX: entity.visualBaseScaleX * (hasAttackAnimation ? 1.08 : 1.14),
      scaleY: entity.visualBaseScaleY * (hasAttackAnimation ? 1.08 : 1.14),
      duration: hasAttackAnimation ? 90 : 110,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.setVisualScale(entity, 1);
      }
    }));
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: [entity.glow, entity.aura],
      scale: hasAttackAnimation ? 1.16 : 1.24,
      duration: hasAttackAnimation ? 150 : 180,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.resetEntityEffects(entity);
      }
    }));

    if (hasAttackAnimation) {
      this.setVisualTexture(
        entity,
        attackAnimation.key,
        attackPlayback.startFrame,
        attackPlayback.flipX ?? false
      );
      entity.visual.play?.(attackAnimationKey);
      entity.animationTimer = this.scene.time.delayedCall(
        attackPlayback.durationMs,
        () => {
          entity.animationTimer = null;
          this.playIdleAnimation(entity);
        }
      );
    }

    if (callbacks.onImpact) {
      this.scene.time.delayedCall(impactDelayMs, callbacks.onImpact);
    }
  }

  playDamage(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    this.stopEffectTweens(entity);
    const damageFromHp = entity.pendingHp;

    if (Number.isFinite(damageFromHp) && damageFromHp !== entity.displayedHp) {
      const hpTweenState = { hp: entity.displayedHp };

      this.scene.tweens.addCounter({
        from: entity.displayedHp,
        to: damageFromHp,
        duration: 220,
        ease: "Sine.Out",
        onUpdate: (tween) => {
          hpTweenState.hp = tween.getValue();
          entity.displayedHp = hpTweenState.hp;
          this.drawHealthMeter(entity);
        },
        onComplete: () => {
          entity.displayedHp = damageFromHp;
          this.drawHealthMeter(entity);
        }
      });
    }

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

  render(snapshot, layout, movementEvents = [], lifecycleEvents = {}) {
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
    const deployUnitIds = lifecycleEvents.deployUnitIds ?? new Set();
    const destroyUnitIds = lifecycleEvents.destroyUnitIds ?? new Set();
    const damageByUnitId = lifecycleEvents.damageByUnitId ?? new Map();

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
        entity.awaitingDeploy = deployUnitIds.has(unit.id);
      } else if (deployUnitIds.has(unit.id)) {
        entity.awaitingDeploy = true;
      }

      const color = getOwnerColor(unit.owner);
      const visualSpec = getUnitVisualSpec(this.scene, unit);
      entity.owner = unit.owner;
      entity.visualSpec = visualSpec;
      entity.glow.setFillStyle(color, 0.13);
      entity.aura.setFillStyle(color, 0.18);
      if (
        visualSpec &&
        entity.textureKey !== visualSpec.key
      ) {
        entity.textureKey = visualSpec.key;
      }
      entity.fallbackLabel?.setText(unit.name.slice(0, 2).toUpperCase());
      const pendingDamage = damageByUnitId.get(unit.id);
      entity.maxHealth = unit.stats.maxHealth;
      entity.pendingHp = pendingDamage ? pendingDamage.nextHp : unit.current.hp;

      if (!pendingDamage) {
        entity.displayedHp = unit.current.hp;
      }

      this.drawHealthMeter(entity);
      entity.transportIcon?.setVisible(Boolean(unit.transport?.carryingUnitId));
      const gearBadgeLabel = getGearBadgeLabel(unit.gear?.slot);
      entity.gearIcon?.setText(gearBadgeLabel ?? "");
      entity.gearIcon?.setVisible(Boolean(gearBadgeLabel));
      entity.hostageIcon?.setVisible(Boolean(unit.temporary?.hostageCarrier));
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
      entity.container.setAlpha(entity.awaitingDeploy ? 0 : entity.alphaTarget);

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
          this.playWalkAnimation(entity);
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
              this.playIdleAnimation(entity);
              this.runAfterMoveCallbacks(entity);
              this.playQueuedAttack(entity);
            }
          });
        }
      }

      if (!entity.moveTween && !entity.animationTimer) {
        this.playIdleAnimation(entity);
      }
    }

    for (const existingUnitId of [...this.entities.keys()]) {
      if (!activeIds.has(existingUnitId)) {
        const entity = this.entities.get(existingUnitId);
        const pendingDamage = damageByUnitId.get(existingUnitId);

        if (pendingDamage && entity) {
          entity.pendingHp = pendingDamage.nextHp;
          entity.maxHealth = pendingDamage.maxHealth;
        }

        if (destroyUnitIds.has(existingUnitId) || entity?.awaitingDestroy) {
          continue;
        }

        this.destroyEntity(existingUnitId);
      }
    }
  }
}
