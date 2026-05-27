import { getSelectedUnit } from "../../simulation/selectors.js";
import {
  DEFAULT_VISUAL_EFFECTS_QUALITY,
  normalizeVisualEffectsQuality,
  VISUAL_EFFECTS_QUALITY
} from "../../state/options.js";
import { canUseBuiltinPhaserFx } from "../rendererConfig.js";

const COMBAT_PLATE_DEPTH = 31;
const POWER_PLATE_DEPTH = 36;

const MANAGED_FX_KEYS = Object.freeze([
  "selection-range",
  "selection-building",
  "selection-focus",
  "unit-selected",
  "unit-active",
  "combat-plate",
  "power-plate"
]);

const COMMANDER_POWER_THEMES = Object.freeze({
  atlas: {
    color: 0x7ba9da,
    lowAlpha: 0.12,
    fullAlpha: 0.17,
    durationMs: 420,
    glowColor: 0xa8d8ff,
    useVignette: false,
    useShine: false,
    useBloom: false
  },
  viper: {
    color: 0xd95c87,
    lowAlpha: 0.14,
    fullAlpha: 0.2,
    durationMs: 430,
    glowColor: 0xff73ab,
    useVignette: true,
    useShine: false,
    useBloom: false
  },
  rook: {
    color: 0xc2bb67,
    lowAlpha: 0.13,
    fullAlpha: 0.18,
    durationMs: 520,
    glowColor: 0xf0d86a,
    useVignette: false,
    useShine: true,
    useBloom: false
  },
  echo: {
    color: 0x74d2c6,
    lowAlpha: 0.11,
    fullAlpha: 0.16,
    durationMs: 360,
    glowColor: 0x9df0e3,
    useVignette: true,
    useShine: false,
    useBloom: false
  },
  blaze: {
    color: 0xff8a3d,
    lowAlpha: 0.16,
    fullAlpha: 0.21,
    durationMs: 460,
    glowColor: 0xffb066,
    useVignette: true,
    useShine: false,
    useBloom: false
  },
  knox: {
    color: 0x17223a,
    lowAlpha: 0.18,
    fullAlpha: 0.24,
    durationMs: 560,
    glowColor: 0x8ea1c2,
    useVignette: true,
    useShine: false,
    useBloom: false
  },
  falcon: {
    color: 0x6ebeff,
    lowAlpha: 0.12,
    fullAlpha: 0.18,
    durationMs: 400,
    glowColor: 0xa8e3ff,
    useVignette: false,
    useShine: true,
    useBloom: false
  },
  sable: {
    color: 0xb58ad8,
    lowAlpha: 0.12,
    fullAlpha: 0.17,
    durationMs: 500,
    glowColor: 0xf0cf7a,
    useVignette: false,
    useShine: true,
    useBloom: false
  },
  nova: {
    color: 0xffc7f3,
    lowAlpha: 0.18,
    fullAlpha: 0.25,
    durationMs: 320,
    glowColor: 0xfff2ff,
    useVignette: false,
    useShine: false,
    useBloom: true
  },
  graves: {
    color: 0xb68f6e,
    lowAlpha: 0.13,
    fullAlpha: 0.18,
    durationMs: 420,
    glowColor: 0xd7b08d,
    useVignette: true,
    useShine: false,
    useBloom: false
  }
});

function resolveHexColor(value, fallback) {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  const normalizedValue = value.trim().replace(/^#|^0x/i, "");

  if (!/^[0-9a-f]{6}$/i.test(normalizedValue)) {
    return fallback;
  }

  return Number.parseInt(normalizedValue, 16);
}

function createOverlayPlate(scene, depth) {
  return scene.add
    .rectangle(0, 0, 4, 4, 0xffffff, 1)
    .setOrigin(0.5)
    .setDepth(depth)
    .setScrollFactor(0)
    .setVisible(false)
    .setAlpha(0);
}

function removeManagedFxEntry(entry) {
  if (!entry) {
    return;
  }

  for (const controller of entry.controllers ?? []) {
    try {
      entry.target?.postFX?.remove?.(controller);
    } catch {
      // The effect host may already have been reset or destroyed.
    }
  }
}

function getUnitFxTint(role, owner = "player") {
  if (role === "selected-active") {
    return owner === "enemy" ? 0xffd7a1 : 0xb4f2ff;
  }

  if (role === "active") {
    return owner === "enemy" ? 0xffb068 : 0x7be3ff;
  }

  return 0xfff2d4;
}

function applyUnitColorMatrix(colorMatrix, role) {
  if (!colorMatrix) {
    return;
  }

  colorMatrix.saturate(role === "active" ? 0.18 : 0.12);
  colorMatrix.brightness(role === "selected-active" ? 0.08 : 0.05, true);
}

export class VisualEffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.requestedQuality = DEFAULT_VISUAL_EFFECTS_QUALITY;
    this.effectiveQuality = VISUAL_EFFECTS_QUALITY.OFF;
    this.managedFx = new Map();
    this.activeTimers = new Set();

    // Keep fullscreen overlay plates centralized here so future custom shader
    // passes can slot in without rewriting BattleScene or the HUD flow.
    this.combatPlate = createOverlayPlate(scene, COMBAT_PLATE_DEPTH);
    this.powerPlate = createOverlayPlate(scene, POWER_PLATE_DEPTH);
  }

  schedule(delay, callback) {
    const timer = this.scene.time.delayedCall(delay, () => {
      this.activeTimers.delete(timer);
      callback();
    });
    this.activeTimers.add(timer);
    return timer;
  }

  setQuality(requestedQuality = DEFAULT_VISUAL_EFFECTS_QUALITY) {
    this.requestedQuality = normalizeVisualEffectsQuality(requestedQuality);
    this.effectiveQuality = canUseBuiltinPhaserFx(this.scene.game)
      ? this.requestedQuality
      : VISUAL_EFFECTS_QUALITY.OFF;
    return this.effectiveQuality;
  }

  updateOverlayPlateBounds() {
    const centerX = this.scene.scale.width / 2;
    const centerY = this.scene.scale.height / 2;

    this.combatPlate
      .setPosition(centerX, centerY)
      .setSize(this.scene.scale.width, this.scene.scale.height)
      .setDisplaySize(this.scene.scale.width, this.scene.scale.height);
    this.powerPlate
      .setPosition(centerX, centerY)
      .setSize(this.scene.scale.width, this.scene.scale.height)
      .setDisplaySize(this.scene.scale.width, this.scene.scale.height);
  }

  releaseManagedFx(key) {
    const entry = this.managedFx.get(key);

    removeManagedFxEntry(entry);
    this.managedFx.delete(key);
  }

  applyManagedFx(key, target, signature, createControllers) {
    const existingEntry = this.managedFx.get(key);

    if (
      existingEntry &&
      existingEntry.target === target &&
      existingEntry.signature === signature
    ) {
      return existingEntry.controllers;
    }

    this.releaseManagedFx(key);

    if (!target?.postFX || !signature) {
      return [];
    }

    let controllers = [];

    try {
      controllers = createControllers(target) ?? [];
    } catch {
      controllers = [];
    }

    this.managedFx.set(key, {
      target,
      signature,
      controllers
    });

    return controllers;
  }

  clearManagedTacticalFx() {
    for (const key of [
      "selection-range",
      "selection-building",
      "selection-focus",
      "unit-selected",
      "unit-active"
    ]) {
      this.releaseManagedFx(key);
    }
  }

  clearTransientEffects() {
    this.scene.tweens.killTweensOf(this.combatPlate);
    this.scene.tweens.killTweensOf(this.powerPlate);
    this.combatPlate.setVisible(false).setAlpha(0);
    this.powerPlate.setVisible(false).setAlpha(0);
    this.releaseManagedFx("combat-plate");
    this.releaseManagedFx("power-plate");
  }

  clear() {
    for (const timer of this.activeTimers) {
      timer.remove(false);
    }

    this.activeTimers.clear();
    for (const key of MANAGED_FX_KEYS) {
      this.releaseManagedFx(key);
    }
    this.clearTransientEffects();
  }

  destroy() {
    this.clear();
    this.combatPlate.destroy();
    this.powerPlate.destroy();
  }

  syncSelectionLayerFx(selectionLayer) {
    const fxTargets = selectionLayer?.getFxTargets?.() ?? {};
    const fxState = selectionLayer?.getFxState?.() ?? {};

    this.applyManagedFx(
      "selection-range",
      fxTargets.rangeGraphics,
      fxState.hasRangeHighlights ? `range:${this.effectiveQuality}` : null,
      (target) => {
        const glow = target.postFX.addGlow(
          0xff76de,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 1.8 : 1.2,
          0.2,
          false,
          0.07,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 11 : 8
        );

        if (this.effectiveQuality !== VISUAL_EFFECTS_QUALITY.FULL) {
          return [glow];
        }

        return [
          glow,
          target.postFX.addShadow(0, 0, 0.03, 0.85, 0x12061f, 3, 0.35)
        ];
      }
    );

    this.applyManagedFx(
      "selection-building",
      fxTargets.buildingGraphics,
      fxState.hasBuildingHighlights ? `building:${this.effectiveQuality}` : null,
      (target) => [
        target.postFX.addGlow(
          0xffb068,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 1.6 : 1.05,
          0.1,
          false,
          0.07,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 10 : 7
        )
      ]
    );

    this.applyManagedFx(
      "selection-focus",
      fxTargets.focusGraphics,
      fxState.hasFocusHighlights ? `focus:${this.effectiveQuality}` : null,
      (target) => {
        const glow = target.postFX.addGlow(
          0xfff2d4,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 2 : 1.25,
          0.3,
          false,
          0.08,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 12 : 8
        );

        if (this.effectiveQuality !== VISUAL_EFFECTS_QUALITY.FULL) {
          return [glow];
        }

        return [
          glow,
          target.postFX.addShadow(0, 0, 0.02, 0.8, 0x160812, 4, 0.32)
        ];
      }
    );
  }

  syncUnitFx(snapshot, unitLayer) {
    const selectedUnit = getSelectedUnit(snapshot);
    const activeUnitId =
      snapshot.presentation?.pendingAction?.unitId ?? snapshot.pendingAction?.unitId ?? null;
    const activeUnit = activeUnitId
      ? [...snapshot.player.units, ...snapshot.enemy.units].find((unit) => unit.id === activeUnitId) ??
        null
      : null;

    let selectedRole = selectedUnit ? "selected" : null;
    let activeRole = activeUnit ? "active" : null;

    if (selectedUnit && activeUnit && selectedUnit.id === activeUnit.id) {
      selectedRole = "selected-active";
      activeRole = null;
    }

    const selectedEntity = selectedUnit ? unitLayer?.getEntity?.(selectedUnit.id) : null;
    const activeEntity =
      activeRole && activeUnit ? unitLayer?.getEntity?.(activeUnit.id) : null;

    this.applyManagedFx(
      "unit-selected",
      selectedEntity?.container ?? null,
      selectedEntity && selectedRole
        ? `selected:${this.effectiveQuality}:${selectedUnit.id}:${selectedRole}`
        : null,
      (target) => {
        const color = getUnitFxTint(selectedRole, selectedEntity.owner);
        const glow = target.postFX.addGlow(
          color,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 1.8 : 1.15,
          0.25,
          false,
          0.08,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 11 : 8
        );

        if (this.effectiveQuality !== VISUAL_EFFECTS_QUALITY.FULL) {
          return [glow];
        }

        const colorMatrix = target.postFX.addColorMatrix();
        applyUnitColorMatrix(colorMatrix, selectedRole);

        return [
          glow,
          target.postFX.addShadow(0, 0, 0.03, 0.9, 0x160812, 4, 0.34),
          colorMatrix
        ];
      }
    );

    this.applyManagedFx(
      "unit-active",
      activeEntity?.container ?? null,
      activeEntity && activeRole
        ? `active:${this.effectiveQuality}:${activeUnit.id}:${activeRole}`
        : null,
      (target) => {
        const color = getUnitFxTint(activeRole, activeEntity.owner);
        const glow = target.postFX.addGlow(
          color,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 1.95 : 1.2,
          0.3,
          false,
          0.08,
          this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 12 : 8
        );

        if (this.effectiveQuality !== VISUAL_EFFECTS_QUALITY.FULL) {
          return [glow];
        }

        const colorMatrix = target.postFX.addColorMatrix();
        applyUnitColorMatrix(colorMatrix, activeRole);

        return [
          glow,
          target.postFX.addShadow(0, 0, 0.03, 0.95, 0x101620, 4, 0.3),
          colorMatrix
        ];
      }
    );
  }

  syncCombatPlate(combatCutsceneActive) {
    if (
      !combatCutsceneActive ||
      this.effectiveQuality === VISUAL_EFFECTS_QUALITY.OFF
    ) {
      this.scene.tweens.killTweensOf(this.combatPlate);
      this.combatPlate.setVisible(false).setAlpha(0);
      this.releaseManagedFx("combat-plate");
      return;
    }

    this.combatPlate
      .setFillStyle(
        this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 0x15213a : 0x10192d,
        1
      )
      .setAlpha(this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 0.17 : 0.11)
      .setVisible(true);

    this.applyManagedFx(
      "combat-plate",
      this.combatPlate,
      `combat:${this.effectiveQuality}`,
      (target) => {
        if (this.effectiveQuality !== VISUAL_EFFECTS_QUALITY.FULL) {
          return [
            target.postFX.addGlow(0x8fb8ff, 0.9, 0, false, 0.05, 6)
          ];
        }

        return [
          target.postFX.addGlow(0x9ac4ff, 1.1, 0, false, 0.06, 8),
          target.postFX.addBloom(0xa8d0ff, 1, 1, 1.2, 0.45, 4),
          target.postFX.addVignette(0.5, 0.5, 0.56, 0.45)
        ];
      }
    );
  }

  syncBattlefield({
    requestedQuality = this.requestedQuality,
    snapshot,
    selectionLayer,
    unitLayer,
    combatCutsceneActive = false
  } = {}) {
    this.setQuality(requestedQuality);
    this.updateOverlayPlateBounds();

    if (!snapshot || this.effectiveQuality === VISUAL_EFFECTS_QUALITY.OFF) {
      this.clearManagedTacticalFx();
      this.clearTransientEffects();
      return this.effectiveQuality;
    }

    this.syncSelectionLayerFx(selectionLayer);
    this.syncUnitFx(snapshot, unitLayer);
    this.syncCombatPlate(combatCutsceneActive);

    return this.effectiveQuality;
  }

  playCommanderPowerPulse(event) {
    if (!event || this.effectiveQuality === VISUAL_EFFECTS_QUALITY.OFF) {
      return;
    }

    this.updateOverlayPlateBounds();
    this.scene.tweens.killTweensOf(this.powerPlate);
    this.powerPlate.setVisible(false).setAlpha(0);
    this.releaseManagedFx("power-plate");

    const fallbackColor = resolveHexColor(event.accent, 0xff8a3d);
    const theme = COMMANDER_POWER_THEMES[event.commanderId] ?? {
      color: fallbackColor,
      lowAlpha: 0.13,
      fullAlpha: 0.18,
      durationMs: 420,
      glowColor: fallbackColor,
      useVignette: true,
      useShine: false,
      useBloom: false
    };
    const fillColor = theme.color ?? fallbackColor;
    const glowColor = theme.glowColor ?? fillColor;
    const peakAlpha =
      this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL
        ? theme.fullAlpha
        : theme.lowAlpha;

    this.powerPlate
      .setFillStyle(fillColor, 1)
      .setVisible(true)
      .setAlpha(0);

    this.applyManagedFx(
      "power-plate",
      this.powerPlate,
      `power:${this.effectiveQuality}:${event.commanderId}:${fillColor}`,
      (target) => {
        const controllers = [
          target.postFX.addGlow(
            glowColor,
            this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 1.6 : 1,
            0,
            false,
            0.05,
            this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL ? 9 : 7
          )
        ];

        if (theme.useShine) {
          controllers.push(target.postFX.addShine(1.1, 0.24, 2.8, false));
        }

        if (event.commanderId === "echo") {
          const glitchMatrix = target.postFX.addColorMatrix();
          glitchMatrix.grayscale(1);
          controllers.push(glitchMatrix);

          if (this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL) {
            controllers.push(target.postFX.addPixelate(2));
          }
        }

        if (this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL && theme.useVignette) {
          controllers.push(target.postFX.addVignette(0.5, 0.5, 0.6, 0.34));
        }

        if (this.effectiveQuality === VISUAL_EFFECTS_QUALITY.FULL && theme.useBloom) {
          controllers.push(target.postFX.addBloom(glowColor, 1, 1, 1.2, 0.42, 4));
        }

        return controllers;
      }
    );

    this.scene.tweens.add({
      targets: this.powerPlate,
      alpha: peakAlpha,
      duration: Math.round(theme.durationMs * 0.32),
      hold: Math.round(theme.durationMs * 0.16),
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => {
        this.powerPlate.setVisible(false).setAlpha(0);
        this.releaseManagedFx("power-plate");
      }
    });
  }
}
