import Phaser from "phaser";
import {
  BATTLE_ATTACK_IMPACT_DELAY_MS,
  BATTLE_ATTACK_WINDOW_MS
} from "../../core/constants.js";

function ownerColor(owner) {
  return owner === "player" ? 0xff5fd6 : 0xff8a3d;
}

function toWorldPoint(layout, x, y) {
  return {
    x: layout.originX + x * layout.cellSize + layout.cellSize / 2,
    y: layout.originY + y * layout.cellSize + layout.cellSize / 2
  };
}

function getScheduledDelay(baseDelay, eventDelay = 0) {
  return baseDelay + eventDelay;
}

function destroyAfterTween(object, tween) {
  tween.setCallback("onComplete", () => {
    object.destroy();
  });
}

export class BattleFxLayer {
  constructor(scene) {
    this.scene = scene;
    this.activeObjects = new Set();
    this.activeTimers = new Set();
    this.screenShakeEnabled = true;
  }

  clear() {
    for (const object of this.activeObjects) {
      object.destroy();
    }

    this.activeObjects.clear();

    for (const timer of this.activeTimers) {
      timer.remove(false);
    }

    this.activeTimers.clear();
  }

  track(object) {
    this.activeObjects.add(object);
    object.once?.("destroy", () => {
      this.activeObjects.delete(object);
    });
    return object;
  }

  schedule(delay, callback) {
    const timer = this.scene.time.delayedCall(delay, () => {
      this.activeTimers.delete(timer);
      callback();
    });
    this.activeTimers.add(timer);
  }

  setScreenShakeEnabled(enabled) {
    this.screenShakeEnabled = enabled;
  }

  playEvents(events, layout, options = {}) {
    const baseDelay = options.baseDelay ?? 0;
    const skipAttackVisuals = options.skipAttackVisuals === true;
    const attackEvents = events.filter((event) => event.type === "attack");
    const destroyDelaysByUnitId = new Map(
      attackEvents.map((event) => [
        event.targetId,
        getScheduledDelay(baseDelay, event.delay ?? 0) + BATTLE_ATTACK_IMPACT_DELAY_MS
      ])
    );
    const combatDelay = attackEvents.length
      ? getScheduledDelay(
          baseDelay,
          Math.max(...attackEvents.map((event) => event.delay ?? 0)) + BATTLE_ATTACK_WINDOW_MS
        )
      : baseDelay;

    for (const event of events) {
      switch (event.type) {
        case "move":
          break;
        case "attack":
          if (!skipAttackVisuals) {
            this.schedule(getScheduledDelay(baseDelay, event.delay ?? 0), () =>
              this.playAttack(event, layout)
            );
          }
          break;
        case "heal":
        case "resupply":
          this.schedule(baseDelay, () => this.playRestore(event, layout));
          break;
        case "experience":
          this.schedule(combatDelay, () => this.playExperience(event, layout));
          break;
        case "capture":
          this.schedule(baseDelay, () => this.playCapture(event, layout));
          break;
        case "deploy":
          this.schedule(baseDelay, () => this.playDeploy(event, layout));
          break;
        case "destroy":
          this.schedule(destroyDelaysByUnitId.get(event.unitId) ?? baseDelay, () =>
            this.playDestroy(event, layout)
          );
          break;
        default:
          break;
      }
    }
  }

  playAttack(event, layout) {
    const color = ownerColor(event.owner);
    const from = toWorldPoint(layout, event.fromX, event.fromY);
    const to = toWorldPoint(layout, event.toX, event.toY);
    const length = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
    const muzzle = this.track(
      this.scene.add
        .circle(from.x, from.y, layout.cellSize * 0.16, color, 0.4)
        .setDepth(42)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const beam = this.track(
      this.scene.add
        .rectangle((from.x + to.x) / 2, (from.y + to.y) / 2, Math.max(18, length), 8, color, 0.92)
        .setRotation(angle)
        .setDepth(42)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    beam.setScale(0.2, 1);
    const beamCore = this.track(
      this.scene.add
        .rectangle((from.x + to.x) / 2, (from.y + to.y) / 2, Math.max(18, length), 3, 0xfff6dd, 0.98)
        .setRotation(angle)
        .setDepth(43)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    beamCore.setScale(0.2, 1);

    const impact = this.track(
      this.scene.add
        .circle(to.x, to.y, layout.cellSize * 0.22, color, 0.4)
        .setDepth(43)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const shock = this.track(
      this.scene.add
        .circle(to.x, to.y, layout.cellSize * 0.14, 0xfff6dd, 0.34)
        .setDepth(44)
        .setBlendMode(Phaser.BlendModes.ADD)
    );

    const muzzleTween = this.scene.tweens.add({
      targets: muzzle,
      alpha: 0,
      scale: 2.4,
      duration: 220,
      ease: "Cubic.Out"
    });
    destroyAfterTween(muzzle, muzzleTween);

    const beamTween = this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      scaleX: 1.14,
      duration: 260,
      ease: "Sine.Out"
    });
    destroyAfterTween(beam, beamTween);

    const coreTween = this.scene.tweens.add({
      targets: beamCore,
      alpha: 0,
      scaleX: 1.18,
      duration: 220,
      ease: "Sine.Out"
    });
    destroyAfterTween(beamCore, coreTween);

    const impactTween = this.scene.tweens.add({
      targets: impact,
      alpha: 0,
      scale: 3.1,
      duration: 360,
      ease: "Cubic.Out"
    });
    destroyAfterTween(impact, impactTween);

    const shockTween = this.scene.tweens.add({
      targets: shock,
      alpha: 0,
      scale: 4,
      duration: 300,
      ease: "Cubic.Out"
    });
    destroyAfterTween(shock, shockTween);

    if (this.screenShakeEnabled) {
      this.scene.cameras.main.shake(100, 0.0032);
    }
  }

  playRestore(event, layout) {
    const color = event.type === "heal" ? 0x7dffbf : 0x6de7ff;
    const point = toWorldPoint(layout, event.x, event.y);
    const outerRing = this.track(
      this.scene.add
        .circle(point.x, point.y, layout.cellSize * 0.18, color, 0.18)
        .setDepth(39)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const ring = this.track(
      this.scene.add
        .circle(point.x, point.y, layout.cellSize * 0.24, color, 0.32)
        .setDepth(40)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const sparkle = this.track(
      this.scene.add
        .text(
          point.x,
          point.y - layout.cellSize * 0.26,
          event.type === "heal" ? `+${event.amount ?? 0}` : "REFILL",
          {
          fontFamily: "Bahnschrift SemiCondensed, sans-serif",
          fontSize: `${Math.max(14, Math.floor(layout.cellSize * 0.22))}px`,
          color: "#f7fffb"
          }
        )
        .setOrigin(0.5)
        .setDepth(41)
    );
    sparkle.setShadow(0, 0, "#7dffbf", 16, false, true);

    const outerTween = this.scene.tweens.add({
      targets: outerRing,
      alpha: 0,
      scale: 3.4,
      duration: 520,
      ease: "Cubic.Out"
    });
    destroyAfterTween(outerRing, outerTween);

    const ringTween = this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 2.9,
      duration: 440,
      ease: "Cubic.Out"
    });
    destroyAfterTween(ring, ringTween);

    const textTween = this.scene.tweens.add({
      targets: sparkle,
      alpha: 0,
      y: sparkle.y - layout.cellSize * 0.4,
      duration: 560,
      ease: "Sine.Out"
    });
    destroyAfterTween(sparkle, textTween);
  }

  playExperience(event, layout) {
    const point = toWorldPoint(layout, event.x, event.y);
    const container = this.track(
      this.scene.add.container(point.x, point.y - layout.cellSize * 0.64)
    );
    container.setDepth(46);

    const width = Math.max(72, layout.cellSize * 1.9);
    const height = Math.max(12, layout.cellSize * 0.24);
    const background = this.scene.add.graphics();
    const baseFill = this.scene.add.graphics();
    const gainFill = this.scene.add.graphics();
    const title = this.scene.add
      .text(0, -height - 12, "EXP", {
        fontFamily: "Bahnschrift SemiCondensed, sans-serif",
        fontSize: `${Math.max(11, Math.floor(layout.cellSize * 0.15))}px`,
        letterSpacing: 1.2,
        color: "#ffd76b"
      })
      .setOrigin(0.5);
    const value = this.scene.add
      .text(0, height + 10, "", {
        fontFamily: "Bahnschrift SemiCondensed, sans-serif",
        fontSize: `${Math.max(12, Math.floor(layout.cellSize * 0.16))}px`,
        color: "#fff7dd"
      })
      .setOrigin(0.5);
    value.setShadow(0, 0, "#ffd76b", 12, false, true);

    background.fillStyle(0x10061b, 0.94);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    background.lineStyle(2, 0xffd76b, 0.75);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    container.add([background, baseFill, gainFill, title, value]);

    const progress = { segmentIndex: 0, value: 0 };
    const updateValueLabel = () => {
      const segment = event.segments[Math.min(progress.segmentIndex, event.segments.length - 1)];

      if (!segment) {
        return;
      }

      value.setText(`Lv ${segment.level} ${Math.round(progress.value)}/${segment.threshold}`);
    };

    const getTrackWidth = () => width - 6;
    const getFillWidthForValue = (segment, experienceValue) =>
      Math.max(
        0,
        getTrackWidth() *
          (segment.threshold > 0 ? Phaser.Math.Clamp(experienceValue / segment.threshold, 0, 1) : 0)
      );

    const drawBaseFill = (segment) => {
      baseFill.clear();

      if (!segment) {
        return;
      }

      const fillWidth = getFillWidthForValue(segment, segment.fromExperience);

      if (fillWidth <= 0) {
        return;
      }

      baseFill.fillStyle(0xffc58a, 0.96);
      baseFill.fillRoundedRect(-width / 2 + 3, -height / 2 + 3, fillWidth, height - 6, (height - 6) / 2);
    };

    const drawGainFill = (segment) => {
      gainFill.clear();

      if (!segment) {
        return;
      }

      const fromWidth = getFillWidthForValue(segment, segment.fromExperience);
      const toWidth = getFillWidthForValue(segment, progress.value);
      const gainWidth = Math.max(0, toWidth - fromWidth);

      if (gainWidth <= 0) {
        updateValueLabel();
        return;
      }

      gainFill.fillStyle(0xff5fd6, 0.96);
      gainFill.fillRoundedRect(
        -width / 2 + 3 + fromWidth,
        -height / 2 + 3,
        gainWidth,
        height - 6,
        (height - 6) / 2
      );
      updateValueLabel();
    };

    const drawSegment = () => {
      const segment = event.segments[Math.min(progress.segmentIndex, event.segments.length - 1)];
      drawBaseFill(segment);
      drawGainFill(segment);
    };

    const playSegment = (segmentIndex) => {
      if (segmentIndex >= event.segments.length) {
        const exitTween = this.scene.tweens.add({
          targets: container,
          alpha: 0,
          y: container.y - layout.cellSize * 0.22,
          duration: 280,
          delay: 120,
          ease: "Sine.Out"
        });
        destroyAfterTween(container, exitTween);
        return;
      }

      const segment = event.segments[segmentIndex];
      progress.segmentIndex = segmentIndex;
      progress.value = segment.fromExperience;
      drawSegment();

      this.scene.tweens.addCounter({
        from: segment.fromExperience,
        to: segment.toExperience,
        duration: segment.toExperience >= segment.threshold ? 440 : 620,
        ease: "Sine.Out",
        onUpdate: (tween) => {
          progress.value = tween.getValue();
          drawSegment();
        },
        onComplete: () => {
          if (segment.toExperience >= segment.threshold && segmentIndex < event.segments.length - 1) {
            this.scene.time.delayedCall(120, () => playSegment(segmentIndex + 1));
            return;
          }

          playSegment(segmentIndex + 1);
        }
      });
    };

    const firstSegment = event.segments[0];

    if (!firstSegment) {
      container.destroy();
      return;
    }

    progress.segmentIndex = 0;
    progress.value = firstSegment.fromExperience;
    drawSegment();
    playSegment(0);
  }

  playCapture(event, layout) {
    const color = ownerColor(event.owner);
    const point = toWorldPoint(layout, event.x, event.y);
    const pulse = this.track(
      this.scene.add
        .rectangle(point.x, point.y, layout.cellSize * 0.84, layout.cellSize * 0.84, color, 0.22)
        .setDepth(39)
        .setAngle(45)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const ring = this.track(
      this.scene.add
        .circle(point.x, point.y, layout.cellSize * 0.18, color, 0.34)
        .setDepth(40)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const stamp = this.track(
      this.scene.add
        .text(point.x, point.y - layout.cellSize * 0.02, "CAP", {
          fontFamily: "Bahnschrift SemiCondensed, sans-serif",
          fontSize: `${Math.max(12, Math.floor(layout.cellSize * 0.18))}px`,
          color: "#fff6dc"
        })
        .setOrigin(0.5)
        .setDepth(41)
    );

    const pulseTween = this.scene.tweens.add({
      targets: pulse,
      alpha: 0,
      scale: 1.9,
      angle: 90,
      duration: 520,
      ease: "Cubic.Out"
    });
    destroyAfterTween(pulse, pulseTween);

    const ringTween = this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 3.4,
      duration: 460,
      ease: "Sine.Out"
    });
    destroyAfterTween(ring, ringTween);

    const stampTween = this.scene.tweens.add({
      targets: stamp,
      alpha: 0,
      scale: 1.28,
      y: stamp.y - layout.cellSize * 0.18,
      duration: 460,
      ease: "Sine.Out"
    });
    destroyAfterTween(stamp, stampTween);
  }

  playDeploy(event, layout) {
    const color = ownerColor(event.owner);
    const point = toWorldPoint(layout, event.x, event.y);
    const beam = this.track(
      this.scene.add
        .rectangle(point.x, point.y, layout.cellSize * 0.5, layout.cellSize * 1.12, color, 0.28)
        .setDepth(39)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const burst = this.track(
      this.scene.add
        .circle(point.x, point.y, layout.cellSize * 0.2, color, 0.36)
        .setDepth(40)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const ring = this.track(
      this.scene.add
        .circle(point.x, point.y, layout.cellSize * 0.12, 0xfff6dd, 0.24)
        .setDepth(41)
        .setBlendMode(Phaser.BlendModes.ADD)
    );

    const beamTween = this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      scaleY: 1.52,
      duration: 420,
      ease: "Cubic.Out"
    });
    destroyAfterTween(beam, beamTween);

    const burstTween = this.scene.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 3,
      duration: 340,
      ease: "Sine.Out"
    });
    destroyAfterTween(burst, burstTween);

    const ringTween = this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 3.6,
      duration: 380,
      ease: "Cubic.Out"
    });
    destroyAfterTween(ring, ringTween);
  }

  playDestroy(event, layout) {
    const point = toWorldPoint(layout, event.x, event.y);
    const blast = this.track(
      this.scene.add
        .circle(point.x, point.y, layout.cellSize * 0.24, 0xffcf7a, 0.4)
        .setDepth(44)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    const shock = this.track(
      this.scene.add
        .circle(point.x, point.y, layout.cellSize * 0.16, 0xfff2d2, 0.26)
        .setDepth(45)
        .setBlendMode(Phaser.BlendModes.ADD)
    );

    const blastTween = this.scene.tweens.add({
      targets: blast,
      alpha: 0,
      scale: 3.6,
      duration: 340,
      ease: "Cubic.Out"
    });
    destroyAfterTween(blast, blastTween);

    const shockTween = this.scene.tweens.add({
      targets: shock,
      alpha: 0,
      scale: 4.2,
      duration: 300,
      ease: "Cubic.Out"
    });
    destroyAfterTween(shock, shockTween);
  }
}
