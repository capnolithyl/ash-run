import Phaser from "phaser";
import {
  BATTLE_ATTACK_IMPACT_DELAY_MS,
  BATTLE_MOVE_SEGMENT_DURATION_MS,
  BATTLE_REINFORCEMENT_SPAWN_FLASH_MS
} from "../../core/constants.js";
import { getGearBadgeLabel } from "../../content/runUpgrades.js";
import { getUnitSpriteDefinition } from "../assets.js";
import { getClampedBattlefieldEffectMultiplier } from "../unitSpritePresentation.js";
import { ensureGrayscaleTexture } from "./grayscaleTexture.js";
import { getOwnerColor } from "./ownerPalette.js";
import {
  getAnimationRange,
  getAnimationRangeFrameIndices,
  getAnimationRangeFrameCount,
  getAttackAnimationPlayback,
  getOwnerIdleFlipX,
  getUnitDefaultTexture,
  getUnitMovementPlayback,
  getWalkAnimationPlayback,
} from "./unitAnimationHelpers.js";

function getPointDistance(left, right) {
  return Phaser.Math.Distance.Between(left.x, left.y, right.x, right.y);
}

function getUnitVisualSpec(scene, unit, colorOptions = {}) {
  const spriteDefinition = getUnitSpriteDefinition(
    unit.unitTypeId,
    unit.owner,
    colorOptions
  );

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

function ensureUnitAnimation(
  scene,
  animationSpec,
  rangeName = "default",
  repeat = -1,
  frameIndices = null,
) {
  const resolvedFrameIndices =
    frameIndices ?? getAnimationRangeFrameIndices(getAnimationRange(animationSpec, rangeName));

  if (!animationSpec?.key || resolvedFrameIndices.length <= 1) {
    return null;
  }

  const animationKey = `${animationSpec.animationKeyBase}:${rangeName}:${resolvedFrameIndices.join(",")}:${repeat}`;

  if (!scene.anims.exists(animationKey)) {
    scene.anims.create({
      key: animationKey,
      frames: resolvedFrameIndices.map((frame) => ({
        key: animationSpec.key,
        frame
      })),
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
const UNIT_GROUND_SHADOW_ALPHA = 0.24;

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

  createEntity(unit, layout, colorOptions = {}) {
    const color = getOwnerColor(unit.owner, colorOptions);
    const visualSpec = getUnitVisualSpec(this.scene, unit, colorOptions);
    const glow = this.scene.add
      .circle(0, 0, layout.cellSize * 0.44, color, 0.13)
      .setBlendMode(Phaser.BlendModes.ADD);
    const aura = this.scene.add
      .circle(0, 0, layout.cellSize * 0.35, color, 0.18)
      .setBlendMode(Phaser.BlendModes.ADD);

    let visual = null;
    let shadow = null;
    let fallbackLabel = null;
    let movementFlipX = getOwnerIdleFlipX(unit.owner);

    if (visualSpec) {
      const defaultTexture = getUnitDefaultTexture(visualSpec, unit.owner);
      const textureKey = defaultTexture?.key ?? visualSpec.fallbackKey ?? visualSpec.key;
      const textureFrame = defaultTexture?.frame;
      movementFlipX = defaultTexture?.flipX ?? movementFlipX;

      // Use a real ground shadow instead of a second offset copy of the unit art.
      shadow = this.scene.add
        .ellipse(
          0,
          layout.cellSize * 0.18,
          layout.cellSize * 0.42,
          layout.cellSize * 0.14,
          0x08040f,
          UNIT_GROUND_SHADOW_ALPHA,
        )
        .setOrigin(0.5);
      visual = this.scene.add.sprite(0, -layout.cellSize * 0.03, textureKey, textureFrame);
      const battlefieldScale = visualSpec.presentation?.battlefieldScale ?? 1;
      visual
        .setOrigin(0.5)
        .setDisplaySize(
          layout.cellSize * 0.88 * battlefieldScale,
          layout.cellSize * 0.88 * battlefieldScale,
        );
      visual.setFlipX(movementFlipX);
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
      visualDisplayWidth: visual.displayWidth,
      visualDisplayHeight: visual.displayHeight,
      visualBaseScaleX: visual.scaleX,
      visualBaseScaleY: visual.scaleY,
      fallbackLabel,
      textureKey: visualSpec?.key ?? null,
      moveTween: null,
      movementPhaseTimer: null,
      activeMovementPlayback: null,
      movementAnimationMode: null,
      movementFlipX,
      isSpent: false,
      deferSpentStyle: false,
      fallbackColor: color,
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
      awaitingRestore: false,
      awaitingPowerEffect: false,
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
    if (entity.moveTween) {
      entity.moveTween.stop();
      entity.moveTween = null;
    }

    this.stopMovementPhaseTimer(entity);
    entity.activeMovementPlayback = null;
    entity.movementAnimationMode = null;
  }

  stopMovementPhaseTimer(entity) {
    if (!entity?.movementPhaseTimer) {
      return;
    }

    entity.movementPhaseTimer.remove(false);
    entity.movementPhaseTimer = null;
  }

  isMovementActive(entity) {
    return Boolean(entity?.moveTween || entity?.movementPhaseTimer);
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
    const entity = this.entities.get(unitId);
    const tween = entity?.moveTween;

    if (!tween) {
      const timer = entity?.movementPhaseTimer;

      if (
        Number.isFinite(timer?.delay) &&
        timer.delay > 0 &&
        Number.isFinite(timer.elapsed)
      ) {
        return Math.max(0, timer.delay - timer.elapsed);
      }

      if (typeof timer?.getProgress === "function" && Number.isFinite(timer.delay)) {
        return Math.max(0, timer.delay * (1 - timer.getProgress()));
      }

      return 0;
    }

    let remainingDuration = 0;

    if (
      Number.isFinite(tween.totalDuration) &&
      tween.totalDuration > 0 &&
      Number.isFinite(tween.elapsed)
    ) {
      remainingDuration = Math.max(0, tween.totalDuration - tween.elapsed);
    } else if (
      Number.isFinite(tween.duration) &&
      tween.duration > 0 &&
      Number.isFinite(tween.progress)
    ) {
      remainingDuration = Math.max(0, tween.duration * (1 - tween.progress));
    } else if (
      typeof tween.getOverallProgress === "function" &&
      Number.isFinite(tween.totalDuration) &&
      tween.totalDuration > 0
    ) {
      remainingDuration = Math.max(0, tween.totalDuration * (1 - tween.getOverallProgress()));
    } else {
      remainingDuration = BATTLE_MOVE_SEGMENT_DURATION_MS;
    }

    const outroDuration =
      entity.activeMovementPlayback?.style === "phased-path"
        ? entity.activeMovementPlayback.phases?.end?.durationMs ?? 0
        : 0;

    return remainingDuration + outroDuration;
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

  finalizeMovement(entity) {
    entity.moveTween = null;
    this.stopMovementPhaseTimer(entity);
    entity.activeMovementPlayback = null;
    entity.movementAnimationMode = null;
    entity.container.setPosition(entity.targetX, entity.targetY);
    this.playIdleAnimation(entity);
    this.runAfterMoveCallbacks(entity);
    this.playQueuedAttack(entity);
  }

  completeMovement(entity) {
    entity.moveTween = null;
    entity.container.setPosition(entity.targetX, entity.targetY);

    const movementPlayback = entity.activeMovementPlayback;
    const endPhase = movementPlayback?.phases?.end;

    if (
      movementPlayback?.style !== "phased-path" ||
      !endPhase?.frameIndices?.length ||
      !(endPhase.durationMs > 0)
    ) {
      this.finalizeMovement(entity);
      return;
    }

    this.stopMovementPhaseTimer(entity);
    this.playMovementPhase(entity, movementPlayback, "end", 0);
    entity.movementPhaseTimer = this.scene.time.delayedCall(
      endPhase.durationMs,
      () => {
        entity.movementPhaseTimer = null;
        this.finalizeMovement(entity);
      },
    );
  }

  updatePhasedMovementDirection(
    entity,
    movementPlayback,
    directionX = 0,
    directionY = 0,
    { syncAnimation = false } = {},
  ) {
    const walkPlayback = getWalkAnimationPlayback(
      entity.owner,
      entity.visualSpec?.walk,
      directionX,
      directionY,
    );

    if (!walkPlayback) {
      return;
    }

    entity.movementFlipX = walkPlayback.flipX;
    entity.visual.setFlipX?.(walkPlayback.flipX);

    if (!syncAnimation) {
      return false;
    }

    const directionalFrameIndices =
      movementPlayback.directionalFrameIndices?.[walkPlayback.rangeName] ?? [];

    if (directionalFrameIndices.length > 0) {
      const animationMode = `direction:${walkPlayback.rangeName}`;

      if (entity.movementAnimationMode !== animationMode) {
        this.stopMovementPhaseTimer(entity);
        entity.visual.stop?.();
        this.setVisualTexture(
          entity,
          movementPlayback.animation.key,
          directionalFrameIndices[0],
          entity.movementFlipX,
        );
        const animationKey = ensureUnitAnimation(
          this.scene,
          movementPlayback.animation,
          `movement-direction-${walkPlayback.rangeName}`,
          -1,
          directionalFrameIndices,
        );

        if (animationKey) {
          entity.visual.play?.(animationKey);
        }

        entity.movementAnimationMode = animationMode;
      }

      return true;
    }

    if (entity.movementAnimationMode?.startsWith("direction:")) {
      this.stopMovementPhaseTimer(entity);
      this.playMovementPhase(entity, movementPlayback, "loop", -1);
    }

    return false;
  }

  playMovementPhase(entity, movementPlayback, phaseName, repeat) {
    const phase = movementPlayback?.phases?.[phaseName];
    const walkAnimation = movementPlayback?.animation;

    if (!phase?.frameIndices?.length || !walkAnimation?.key) {
      return false;
    }

    entity.visual.stop?.();
    this.setVisualTexture(
      entity,
      walkAnimation.key,
      phase.frameIndices[0],
      entity.movementFlipX,
    );
    const animationKey = ensureUnitAnimation(
      this.scene,
      walkAnimation,
      `movement-${phaseName}`,
      repeat,
      phase.frameIndices,
    );

    if (animationKey) {
      entity.visual.play?.(animationKey);
    }

    entity.movementAnimationMode = `phase:${phaseName}`;
    return true;
  }

  startPhasedMovement(entity, movementPlayback, directionX = 0, directionY = 0) {
    entity.activeMovementPlayback = movementPlayback;
    this.stopMovementPhaseTimer(entity);
    const usesDirectionalAnimation = this.updatePhasedMovementDirection(
      entity,
      movementPlayback,
      directionX,
      directionY,
      { syncAnimation: true },
    );

    if (usesDirectionalAnimation) {
      return;
    }

    this.playMovementPhase(entity, movementPlayback, "start", 0);

    const startDurationMs = movementPlayback.phases?.start?.durationMs ?? 0;
    const playLoop = () => {
      entity.movementPhaseTimer = null;

      if (
        entity.activeMovementPlayback !== movementPlayback ||
        !entity.moveTween
      ) {
        return;
      }

      this.playMovementPhase(entity, movementPlayback, "loop", -1);
    };

    if (startDurationMs > 0) {
      entity.movementPhaseTimer = this.scene.time.delayedCall(
        startDurationMs,
        playLoop,
      );
      return;
    }

    playLoop();
  }

  getTeleportAccessoryVisibility(entity) {
    return {
      glow: entity.glow.visible,
      aura: entity.aura.visible,
      shadow: entity.shadow?.visible ?? false,
      healthMeter: entity.healthMeter.visible,
      transportIcon: entity.transportIcon?.visible ?? false,
      gearIcon: entity.gearIcon?.visible ?? false,
      hostageIcon: entity.hostageIcon?.visible ?? false,
      fallbackLabel: entity.fallbackLabel?.visible ?? false,
    };
  }

  restoreTeleportAccessoryVisibility(entity, visibilityState) {
    entity.glow.setVisible(visibilityState.glow);
    entity.aura.setVisible(visibilityState.aura);
    entity.shadow?.setVisible(visibilityState.shadow);
    entity.healthMeter.setVisible(visibilityState.healthMeter);
    entity.transportIcon?.setVisible(visibilityState.transportIcon);
    entity.gearIcon?.setVisible(visibilityState.gearIcon);
    entity.hostageIcon?.setVisible(visibilityState.hostageIcon);
    entity.fallbackLabel?.setVisible(visibilityState.fallbackLabel);
  }

  hideTeleportAccessories(entity) {
    entity.glow.setVisible(false);
    entity.aura.setVisible(false);
    entity.shadow?.setVisible(false);
    entity.healthMeter.setVisible(false);
    entity.transportIcon?.setVisible(false);
    entity.gearIcon?.setVisible(false);
    entity.hostageIcon?.setVisible(false);
    entity.fallbackLabel?.setVisible(false);
  }

  playLinearPathMovement(entity, layout, path, movementPlayback) {
    const worldPoints = path.map((tile) =>
      this.getTileCenterFromCoordinates(layout, tile.x, tile.y)
    );
    const totalSegments = Math.max(0, worldPoints.length - 1);
    entity.container.setPosition(worldPoints[0].x, worldPoints[0].y);

    if (totalSegments === 0) {
      entity.container.setPosition(entity.targetX, entity.targetY);
      this.completeMovement(entity);
      return;
    }

    entity.activeMovementPlayback = movementPlayback;
    let activeSegmentIndex = -1;
    const playSegmentAnimation = (segmentIndex) => {
      if (segmentIndex === activeSegmentIndex) {
        return;
      }

      const isFirstSegment = activeSegmentIndex < 0;
      activeSegmentIndex = segmentIndex;
      const fromTile = path[segmentIndex];
      const toTile = path[segmentIndex + 1];
      const directionX = Math.sign(toTile.x - fromTile.x);
      const directionY = Math.sign(toTile.y - fromTile.y);

      if (movementPlayback.style === "phased-path") {
        if (isFirstSegment) {
          this.startPhasedMovement(
            entity,
            movementPlayback,
            directionX,
            directionY,
          );
        } else {
          this.updatePhasedMovementDirection(
            entity,
            movementPlayback,
            directionX,
            directionY,
            { syncAnimation: true },
          );
        }
        return;
      }

      this.playWalkAnimation(
        entity,
        directionX,
        directionY,
      );
    };
    playSegmentAnimation(0);

    entity.moveTween = this.scene.tweens.addCounter({
      from: 0,
      to: totalSegments,
      duration:
        movementPlayback.travelDurationMs ??
        totalSegments * BATTLE_MOVE_SEGMENT_DURATION_MS,
      ease: "Linear",
      onUpdate: (tween) => {
        const traveledSegments = Phaser.Math.Clamp(tween.getValue(), 0, totalSegments);
        const segmentIndex = Math.min(totalSegments - 1, Math.floor(traveledSegments));
        const segmentProgress = Math.min(1, traveledSegments - segmentIndex);
        const fromPoint = worldPoints[segmentIndex];
        const toPoint = worldPoints[segmentIndex + 1];
        playSegmentAnimation(segmentIndex);

        entity.container.setPosition(
          Phaser.Math.Linear(fromPoint.x, toPoint.x, segmentProgress),
          Phaser.Math.Linear(fromPoint.y, toPoint.y, segmentProgress)
        );
      },
      onComplete: () => {
        this.completeMovement(entity);
      }
    });
  }

  playTeleportMovement(entity, layout, path, movementPlayback) {
    const worldPoints = path.map((tile) =>
      this.getTileCenterFromCoordinates(layout, tile.x, tile.y)
    );
    const totalSegments = Math.max(0, worldPoints.length - 1);
    const walkAnimation = movementPlayback.animation;
    const forwardAnimationKey = ensureUnitAnimation(
      this.scene,
      walkAnimation,
      "default",
      0,
      movementPlayback.forwardFrameIndices,
    );
    const reverseAnimationKey = ensureUnitAnimation(
      this.scene,
      walkAnimation,
      "default",
      0,
      movementPlayback.reverseFrameIndices,
    );

    entity.container.setPosition(worldPoints[0].x, worldPoints[0].y);

    if (totalSegments === 0 || !forwardAnimationKey || !reverseAnimationKey) {
      entity.container.setPosition(entity.targetX, entity.targetY);
      this.completeMovement(entity);
      return;
    }

    this.stopAnimationTimer(entity);
    this.setVisualTexture(
      entity,
      walkAnimation.key,
      movementPlayback.forwardFrameIndices[0],
      getOwnerIdleFlipX(entity.owner),
    );
    entity.visual.play?.(forwardAnimationKey);

    let hasTeleported = false;
    entity.moveTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: movementPlayback.totalDurationMs,
      ease: "Linear",
      onUpdate: (tween) => {
        const progress = typeof tween.getOverallProgress === "function"
          ? tween.getOverallProgress()
          : tween.progress ?? 0;

        if (hasTeleported || progress < movementPlayback.splitProgress) {
          return;
        }

        hasTeleported = true;
        const accessoryVisibility = this.getTeleportAccessoryVisibility(entity);
        this.hideTeleportAccessories(entity);
        entity.container.setPosition(entity.targetX, entity.targetY);
        this.restoreTeleportAccessoryVisibility(entity, accessoryVisibility);
        this.setVisualTexture(
          entity,
          walkAnimation.key,
          movementPlayback.reverseFrameIndices[0],
          getOwnerIdleFlipX(entity.owner),
        );
        entity.visual.play?.(reverseAnimationKey);
      },
      onComplete: () => {
        this.completeMovement(entity);
      }
    });
  }

  playPathMovement(entity, layout, path) {
    const movementPlayback = getUnitMovementPlayback(
      entity.visualSpec,
      Math.max(0, (path?.length ?? 1) - 1),
    );

    if (movementPlayback.style === "teleport") {
      this.playTeleportMovement(entity, layout, path, movementPlayback);
      return;
    }

    this.playLinearPathMovement(entity, layout, path, movementPlayback);
  }

  setVisualScale(entity, multiplier = 1) {
    const effectMultiplier = getClampedBattlefieldEffectMultiplier(
      entity.visualSpec?.presentation,
      multiplier,
    );
    entity.visual.setScale(
      entity.visualBaseScaleX * effectMultiplier,
      entity.visualBaseScaleY * effectMultiplier
    );
  }

  getVisualScale(entity, multiplier = 1) {
    const effectMultiplier = getClampedBattlefieldEffectMultiplier(
      entity.visualSpec?.presentation,
      multiplier,
    );

    return {
      scaleX: entity.visualBaseScaleX * effectMultiplier,
      scaleY: entity.visualBaseScaleY * effectMultiplier,
    };
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
    entity.shadow?.setAlpha(UNIT_GROUND_SHADOW_ALPHA);
  }

  setVisualTexture(entity, textureKey, frame, flipX = getOwnerIdleFlipX(entity.owner)) {
    entity.visual.setTexture?.(textureKey, frame);
    if (
      Number.isFinite(entity.visualDisplayWidth) &&
      Number.isFinite(entity.visualDisplayHeight)
    ) {
      entity.visual.setDisplaySize?.(
        entity.visualDisplayWidth,
        entity.visualDisplayHeight,
      );
      entity.visualBaseScaleX = entity.visual.scaleX;
      entity.visualBaseScaleY = entity.visual.scaleY;
    }
    entity.visual.setFlipX?.(flipX);
  }

  playIdleAnimation(entity, { forceColor = false } = {}) {
    this.stopAnimationTimer(entity);

    const idleAnimation = entity.visualSpec?.idle;
    const useSpentStyle =
      entity.isSpent &&
      !entity.deferSpentStyle &&
      !forceColor;
    const grayscaleIdleKey =
      useSpentStyle && idleAnimation?.key
        ? ensureGrayscaleTexture(this.scene, idleAnimation.key)
        : null;
    const displayedIdleAnimation =
      grayscaleIdleKey
        ? {
            ...idleAnimation,
            key: grayscaleIdleKey,
            animationKeyBase: `${idleAnimation.animationKeyBase ?? idleAnimation.key}:spent`,
          }
        : idleAnimation;
    const idleAnimationKey = ensureUnitAnimation(
      this.scene,
      displayedIdleAnimation,
      "default",
      -1,
    );

    if (idleAnimationKey) {
      const range = getAnimationRange(displayedIdleAnimation, "default");
      this.setVisualTexture(
        entity,
        displayedIdleAnimation.key,
        range.start,
        getOwnerIdleFlipX(entity.owner),
      );
      entity.visual.play?.(idleAnimationKey);
      return;
    }

    entity.visual.stop?.();
    if (entity.visualSpec?.fallbackKey) {
      const fallbackTextureKey =
        useSpentStyle
          ? ensureGrayscaleTexture(this.scene, entity.visualSpec.fallbackKey) ??
            entity.visualSpec.fallbackKey
          : entity.visualSpec.fallbackKey;
      this.setVisualTexture(
        entity,
        fallbackTextureKey,
        undefined,
        getOwnerIdleFlipX(entity.owner),
      );
    } else if (entity.fallbackLabel) {
      entity.visual.setFillStyle?.(
        useSpentStyle ? 0x8a8a8a : entity.fallbackColor,
        0.95,
      );
    }
  }

  playWalkAnimation(entity, directionX = 0, directionY = 0) {
    const walkAnimation = entity.visualSpec?.walk;
    const walkPlayback = getWalkAnimationPlayback(
      entity.owner,
      walkAnimation,
      directionX,
      directionY,
    );

    if (!walkPlayback) {
      return;
    }

    this.stopAnimationTimer(entity);
    entity.visual.stop?.();
    this.setVisualTexture(
      entity,
      walkAnimation.key,
      walkPlayback.startFrame,
      walkPlayback.flipX,
    );
    const walkAnimationKey = ensureUnitAnimation(
      this.scene,
      walkAnimation,
      walkPlayback.rangeName,
      -1,
    );

    if (walkAnimationKey) {
      entity.visual.play?.(walkAnimationKey);
    }
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
    entity.awaitingRestore = false;
    entity.awaitingPowerEffect = false;
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

    if (!this.isMovementActive(entity)) {
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
    entity.glow.setAlpha(0.48);
    entity.aura.setAlpha(0.56);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: [entity.glow, entity.aura],
      scale: 1.72,
      alpha: { from: 0.56, to: 0.18 },
      duration: BATTLE_REINFORCEMENT_SPAWN_FLASH_MS,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.resetEntityEffects(entity);
      }
    }));
  }

  animateDisplayedHp(entity, duration = 220, ease = "Sine.Out") {
    const pendingHp = entity.pendingHp;

    if (!Number.isFinite(pendingHp) || pendingHp === entity.displayedHp) {
      return false;
    }

    this.scene.tweens.addCounter({
      from: entity.displayedHp,
      to: pendingHp,
      duration,
      ease,
      onUpdate: (tween) => {
        entity.displayedHp = tween.getValue();
        this.drawHealthMeter(entity);
      },
      onComplete: () => {
        entity.displayedHp = pendingHp;
        this.drawHealthMeter(entity);
      }
    });

    return true;
  }

  preparePowerEffect(unitId) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    entity.awaitingPowerEffect = true;
  }

  playAttack(unitId, directionX = 0, directionY = 0, callbacks = {}) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    if (this.isMovementActive(entity)) {
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
      this.playIdleAnimation(entity, { forceColor: true });
      const presentationDurationMs = Math.max(
        impactDelayMs,
        callbacks.durationMs ?? impactDelayMs,
      );
      entity.animationTimer = this.scene.time.delayedCall(
        presentationDurationMs,
        () => {
          entity.animationTimer = null;
          entity.deferSpentStyle = false;
          this.playIdleAnimation(entity);
        },
      );

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
    const attackScale = this.getVisualScale(
      entity,
      hasAttackAnimation ? 1.08 : 1.14,
    );
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.visual,
      ...attackScale,
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
          entity.deferSpentStyle = false;
          this.playIdleAnimation(entity);
        }
      );
    } else if (entity.isSpent || entity.deferSpentStyle) {
      this.playIdleAnimation(entity, { forceColor: true });
      entity.animationTimer = this.scene.time.delayedCall(180, () => {
        entity.animationTimer = null;
        entity.deferSpentStyle = false;
        this.playIdleAnimation(entity);
      });
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

    entity.awaitingRestore = false;
    entity.awaitingPowerEffect = false;
    this.stopEffectTweens(entity);
    this.animateDisplayedHp(entity);

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
    const damageScale = this.getVisualScale(entity, 1.24);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.visual,
      ...damageScale,
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

  playRestore(unitId, { tone = "heal" } = {}) {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    entity.awaitingRestore = false;
    entity.awaitingPowerEffect = false;
    this.stopEffectTweens(entity);
    this.animateDisplayedHp(entity, tone === "power-heal" ? 320 : 260, "Sine.Out");

    const isPowerHeal = tone === "power-heal";
    entity.glow.setAlpha(isPowerHeal ? 0.34 : 0.28);
    entity.aura.setAlpha(isPowerHeal ? 0.44 : 0.38);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: [entity.glow, entity.aura],
      scale: isPowerHeal ? 1.65 : 1.42,
      duration: isPowerHeal ? 320 : 240,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.resetEntityEffects(entity);
      }
    }));
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.container,
      y: entity.targetY - (isPowerHeal ? this.cellSize * 0.1 : this.cellSize * 0.06),
      duration: isPowerHeal ? 180 : 140,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        entity.container.y = entity.targetY;
      }
    }));
  }

  playHeal(unitId) {
    this.playRestore(unitId, { tone: "heal" });
  }

  playPowerPulse(unitId, tone = "boost") {
    const entity = this.entities.get(unitId);

    if (!entity) {
      return;
    }

    entity.awaitingPowerEffect = false;
    this.stopEffectTweens(entity);

    const config = {
      boost: {
        containerOffset: this.cellSize * 0.09,
        visualScale: 1.14,
        auraScale: 1.6,
        auraAlpha: 0.46,
        duration: 260
      },
      shield: {
        containerOffset: this.cellSize * 0.06,
        visualScale: 1.1,
        auraScale: 1.72,
        auraAlpha: 0.42,
        duration: 300
      },
      disrupt: {
        containerOffset: this.cellSize * 0.05,
        visualScale: 1.08,
        auraScale: 1.4,
        auraAlpha: 0.36,
        duration: 220
      },
      fortune: {
        containerOffset: this.cellSize * 0.07,
        visualScale: 1.16,
        auraScale: 1.68,
        auraAlpha: 0.48,
        duration: 280
      },
      deploy: {
        containerOffset: this.cellSize * 0.08,
        visualScale: 1.12,
        auraScale: 1.52,
        auraAlpha: 0.44,
        duration: 280
      }
    }[tone] ?? {
      containerOffset: this.cellSize * 0.08,
      visualScale: 1.12,
      auraScale: 1.54,
      auraAlpha: 0.42,
      duration: 260
    };

    entity.glow.setAlpha(config.auraAlpha * 0.72);
    entity.aura.setAlpha(config.auraAlpha);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.container,
      y: entity.targetY - config.containerOffset,
      duration: config.duration,
      yoyo: true,
      ease: tone === "disrupt" ? "Sine.InOut" : "Back.Out",
      onComplete: () => {
        entity.container.y = entity.targetY;
      }
    }));
    const powerScale = this.getVisualScale(entity, config.visualScale);
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: entity.visual,
      ...powerScale,
      duration: Math.round(config.duration * 0.72),
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.setVisualScale(entity, 1);
      }
    }));
    this.trackEffectTween(entity, this.scene.tweens.add({
      targets: [entity.glow, entity.aura],
      scale: config.auraScale,
      alpha: { from: config.auraAlpha, to: Math.max(0.16, config.auraAlpha * 0.45) },
      duration: config.duration,
      yoyo: true,
      ease: tone === "disrupt" ? "Sine.InOut" : "Cubic.Out",
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
    const restoreByUnitId = lifecycleEvents.restoreByUnitId ?? new Map();
    const attackingUnitIds = lifecycleEvents.attackingUnitIds ?? new Set();
    const colorOptions = lifecycleEvents.colorOptions ?? {};
    const spentUnitIds = new Set(snapshot.presentation?.spentUnitIds ?? []);

    for (const unit of units) {
      activeIds.add(unit.id);

      let entity = this.entities.get(unit.id);

      if (!entity) {
        entity = this.createEntity(unit, layout, colorOptions);
        this.entities.set(unit.id, entity);
        const initialPosition = this.getTileCenter(unit, layout);
        entity.container.setPosition(initialPosition.x, initialPosition.y);
        entity.targetX = initialPosition.x;
        entity.targetY = initialPosition.y;
        entity.awaitingDeploy = deployUnitIds.has(unit.id);
      } else if (deployUnitIds.has(unit.id)) {
        entity.awaitingDeploy = true;
      }

      const color = getOwnerColor(unit.owner, colorOptions);
      const visualSpec = getUnitVisualSpec(this.scene, unit, colorOptions);
      const colorChanged =
        entity.visualSpec?.colorId !== visualSpec?.colorId ||
        entity.visualSpec?.key !== visualSpec?.key;
      entity.owner = unit.owner;
      entity.visualSpec = visualSpec;
      entity.isSpent = spentUnitIds.has(unit.id);
      if (!entity.isSpent) {
        entity.deferSpentStyle = false;
      } else if (attackingUnitIds.has(unit.id)) {
        entity.deferSpentStyle = true;
      }
      entity.fallbackColor = color;
      entity.glow.setFillStyle(color, 0.13);
      entity.aura.setFillStyle(color, 0.18);
      if (
        visualSpec &&
        entity.textureKey !== visualSpec.key
      ) {
        entity.textureKey = visualSpec.key;
      }
      if (colorChanged && visualSpec && !this.isMovementActive(entity)) {
        entity.visual.stop?.();
        this.playIdleAnimation(entity);
      }
      entity.fallbackLabel?.setText(unit.name.slice(0, 2).toUpperCase());
      const pendingDamage = damageByUnitId.get(unit.id);
      const pendingRestore = restoreByUnitId.get(unit.id);
      entity.maxHealth = unit.stats.maxHealth;
      entity.pendingHp =
        pendingDamage?.nextHp ??
        pendingRestore?.nextHp ??
        unit.current.hp;

      if (pendingRestore) {
        entity.awaitingRestore = true;
      }

      if (
        !pendingDamage &&
        !pendingRestore &&
        !entity.awaitingRestore &&
        !entity.awaitingPowerEffect
      ) {
        entity.displayedHp = unit.current.hp;
      }

      this.drawHealthMeter(entity);
      entity.transportIcon?.setVisible(Boolean(unit.transport?.carryingUnitId));
      const gearBadgeLabel = getGearBadgeLabel(unit.gear?.slot);
      entity.gearIcon?.setText(gearBadgeLabel ?? "");
      entity.gearIcon?.setVisible(Boolean(gearBadgeLabel));
      entity.hostageIcon?.setVisible(Boolean(unit.temporary?.hostageCarrier));
      entity.alphaTarget = unit.current.hp > 0 ? 1 : 0.4;
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
          const directionX = Math.sign(nextPosition.x - entity.container.x);
          const directionY = Math.sign(nextPosition.y - entity.container.y);
          const movementPlayback = getUnitMovementPlayback(entity.visualSpec, 1);

          entity.activeMovementPlayback = movementPlayback;
          if (movementPlayback.style === "phased-path") {
            this.startPhasedMovement(
              entity,
              movementPlayback,
              directionX,
              directionY,
            );
          } else {
            this.playWalkAnimation(
              entity,
              directionX,
              directionY,
            );
          }
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
              this.completeMovement(entity);
            }
          });
        }
      }

      if (!this.isMovementActive(entity) && !entity.animationTimer) {
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
