import {
  BATTLE_COMBAT_CUTSCENE_SHAKE_MS,
  SCREEN_IDS
} from "../../../game/core/constants.js";
import { getBattleCombatCutsceneState } from "../../../game/phaser/view/battleCombatCutscene.js";

function formatCombatCutsceneWeaponLabel(weaponClass) {
  if (!weaponClass) {
    return "Combat Exchange";
  }

  return weaponClass
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const appShellCombatCutsceneMethods = {
  stopCombatCutscenePlayback() {
    if (!this.combatCutscenePlayback) {
      return;
    }

    for (const timer of this.combatCutscenePlayback.timers ?? []) {
      window.clearTimeout(timer);
    }

    this.combatCutscenePlayback = null;
  },

  // The DOM overlay has to stay in lockstep with the simulation timeline, so we
  // treat the cutscene as scheduled playback rather than rerendering every frame.
  syncCombatCutscenePlayback(state) {
    const cutscene = state.battleUi?.combatCutscene ?? null;
    const overlay = this.root.querySelector("[data-combat-cutscene-id]");

    if (!cutscene || !overlay) {
      this.stopCombatCutscenePlayback();
      return;
    }

    const playbackKey = `${cutscene.id}:${cutscene.startedAt}`;
    const currentPlayback = this.combatCutscenePlayback;

    if (currentPlayback?.key === playbackKey && currentPlayback.element === overlay) {
      return;
    }

    this.stopCombatCutscenePlayback();

    const playback = {
      key: playbackKey,
      element: overlay,
      timers: []
    };
    const timeline = getBattleCombatCutsceneState(cutscene);
    const elapsedMs = timeline.elapsedMs;
    const schedule = (targetMs, callback) => {
      if (!Number.isFinite(targetMs) || targetMs <= elapsedMs || targetMs >= cutscene.durationMs) {
        return;
      }

      const timer = window.setTimeout(() => {
        if (
          this.latestState?.screen !== SCREEN_IDS.BATTLE ||
          this.latestState?.battleUi?.combatCutscene?.id !== cutscene.id ||
          this.combatCutscenePlayback?.key !== playbackKey
        ) {
          return;
        }

        callback();
      }, targetMs - elapsedMs);

      playback.timers.push(timer);
    };

    this.combatCutscenePlayback = playback;
    this.primeCombatCutsceneSpriteSheets(overlay);
    this.applyCombatCutsceneDomState(overlay, cutscene, timeline);

    schedule(cutscene.revealStartMs ?? 0, () => {
      this.applyCombatCutsceneDomState(
        overlay,
        cutscene,
        getBattleCombatCutsceneState(cutscene)
      );
    });
    schedule((cutscene.revealStartMs ?? 0) + (cutscene.openMs ?? 0), () => {
      this.applyCombatCutsceneDomState(
        overlay,
        cutscene,
        getBattleCombatCutsceneState(cutscene)
      );
    });

    cutscene.steps.forEach((step, stepIndex) => {
      schedule(step.startMs, () => this.activateCombatCutsceneStep(overlay, cutscene, stepIndex));
      schedule(step.impactMs, () =>
        this.playCombatCutsceneImpact(overlay, cutscene, stepIndex, state.metaState?.options)
      );
    });

    const lastStep = cutscene.steps[cutscene.steps.length - 1] ?? null;

    if (lastStep) {
      schedule(lastStep.endMs, () => this.clearCombatCutsceneActiveStep(overlay));
    }

    schedule(cutscene.durationMs - (cutscene.closeMs ?? 0), () => {
      overlay.classList.add("battle-overlay--combat-cutscene-outro");
    });
  },

  primeCombatCutsceneSpriteSheets(overlay) {
    for (const image of overlay.querySelectorAll("[data-cutscene-sheet]")) {
      const applyMetrics = () => {
        const frameWidth = Number(image.dataset.frameWidth);
        const frameHeight = Number(image.dataset.frameHeight);
        const naturalWidth = Number(image.naturalWidth);
        const naturalHeight = Number(image.naturalHeight);

        if (!(frameWidth > 0 && frameHeight > 0 && naturalWidth > 0 && naturalHeight > 0)) {
          return;
        }

        const columns = Math.max(1, Math.round(naturalWidth / frameWidth));
        const rows = Math.max(1, Math.round(naturalHeight / frameHeight));
        image.dataset.sheetColumns = `${columns}`;
        image.dataset.sheetRows = `${rows}`;
        image.style.setProperty("--sheet-columns", `${columns}`);
        image.style.setProperty("--sheet-rows", `${rows}`);

        const pendingFrameIndex = Number(image.dataset.pendingFrameIndex);
        const frameStart = Number(image.dataset.frameStart ?? 0);
        this.setCombatCutsceneSheetFrame(
          image,
          Number.isFinite(pendingFrameIndex) ? pendingFrameIndex : frameStart
        );
      };

      if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        applyMetrics();
        continue;
      }

      image.addEventListener("load", applyMetrics, { once: true });
    }
  },

  setCombatCutsceneSheetFrame(image, frameIndex) {
    if (!image) {
      return;
    }

    const normalizedFrameIndex = Math.max(0, Math.round(Number(frameIndex) || 0));
    image.dataset.pendingFrameIndex = `${normalizedFrameIndex}`;
    const columns = Number(image.dataset.sheetColumns);
    const rows = Number(image.dataset.sheetRows);

    if (!(columns > 0 && rows > 0)) {
      return;
    }

    const frameColumn = normalizedFrameIndex % columns;
    const frameRow = Math.floor(normalizedFrameIndex / columns);
    image.style.setProperty("--frame-column", `${frameColumn}`);
    image.style.setProperty("--frame-row", `${frameRow}`);
  },

  applyCombatCutsceneDomState(overlay, cutscene, timeline) {
    const activeStep = timeline.activeStep ?? null;
    const finalStep = cutscene.steps[cutscene.steps.length - 1] ?? null;
    const impactStep = timeline.impactStep ?? null;
    const resolvedWeaponClass =
      activeStep?.attackerSide === "enemy"
        ? cutscene.enemyUnit.weaponClass
        : activeStep?.attackerSide === "player"
          ? cutscene.playerUnit.weaponClass
          : finalStep?.attackerSide === "enemy"
            ? cutscene.enemyUnit.weaponClass
            : cutscene.playerUnit.weaponClass;
    const weaponLabel = overlay.querySelector("[data-cutscene-weapon-label]");

    overlay.classList.toggle("battle-overlay--combat-cutscene-opening", timeline.isOpening);
    overlay.classList.toggle(
      "battle-overlay--combat-cutscene-hidden",
      Boolean(timeline.isWaitingForReveal)
    );
    overlay.classList.toggle("battle-overlay--combat-cutscene-outro", timeline.isClosing);
    overlay.classList.toggle(
      "battle-overlay--combat-cutscene-shake",
      Boolean(impactStep && this.latestState?.metaState?.options?.screenShake !== false)
    );

    for (const side of ["player", "enemy"]) {
      const lane = overlay.querySelector(`[data-cutscene-lane="${side}"]`);
      const hpValue = overlay.querySelector(`[data-cutscene-hp-value="${side}"]`);
      const hpFill = overlay.querySelector(`[data-cutscene-hp-fill="${side}"]`);
      const unit = side === "player" ? cutscene.playerUnit : cutscene.enemyUnit;
      const currentHp = timeline.displayedHpBySide[side];
      const hpRatio = Math.max(0, Math.min(1, currentHp / Math.max(1, unit.maxHealth)));

      lane?.classList.toggle("combat-cutscene__lane--attacking", activeStep?.attackerSide === side);
      lane?.classList.toggle("combat-cutscene__lane--impact", impactStep?.targetSide === side);

      if (hpValue) {
        hpValue.textContent = `${Math.round(currentHp)}`;
      }

      if (hpFill) {
        hpFill.style.setProperty("--hp-ratio", hpRatio.toFixed(4));
        hpFill.style.setProperty("--hp-from-ratio", hpRatio.toFixed(4));
        hpFill.classList.remove("combat-cutscene__health-fill--animate");
      }

      this.setCombatCutsceneSheetFrame(
        overlay.querySelector(`[data-cutscene-sheet="${side}:idle"]`),
        Number(overlay.querySelector(`[data-cutscene-sheet="${side}:idle"]`)?.dataset.frameStart ?? 0)
      );
      this.setCombatCutsceneSheetFrame(
        overlay.querySelector(`[data-cutscene-sheet="${side}:attack"]`),
        Number(overlay.querySelector(`[data-cutscene-sheet="${side}:attack"]`)?.dataset.frameStart ?? 0)
      );
    }

    if (weaponLabel) {
      weaponLabel.textContent = formatCombatCutsceneWeaponLabel(resolvedWeaponClass);
    }
  },

  clearCombatCutsceneActiveStep(overlay) {
    overlay
      .querySelectorAll(".combat-cutscene__lane--attacking")
      .forEach((lane) => lane.classList.remove("combat-cutscene__lane--attacking"));
    for (const side of ["player", "enemy"]) {
      const attackSheet = overlay.querySelector(`[data-cutscene-sheet="${side}:attack"]`);
      this.setCombatCutsceneSheetFrame(attackSheet, Number(attackSheet?.dataset.frameStart ?? 0));
    }
  },

  activateCombatCutsceneStep(overlay, cutscene, stepIndex) {
    const step = cutscene.steps[stepIndex] ?? null;
    const weaponLabel = overlay.querySelector("[data-cutscene-weapon-label]");

    if (!step) {
      return;
    }

    for (const side of ["player", "enemy"]) {
      const lane = overlay.querySelector(`[data-cutscene-lane="${side}"]`);
      lane?.classList.toggle("combat-cutscene__lane--attacking", step.attackerSide === side);
      lane?.classList.remove("combat-cutscene__lane--impact");
    }

    if (weaponLabel) {
      weaponLabel.textContent = formatCombatCutsceneWeaponLabel(
        step.attackerSide === "enemy"
          ? cutscene.enemyUnit.weaponClass
          : cutscene.playerUnit.weaponClass
      );
    }

    this.playCombatCutsceneAttackAnimation(overlay, step);
  },

  playCombatCutsceneAttackAnimation(overlay, step) {
    const image = overlay.querySelector(`[data-cutscene-attack-strip="${step.attackerSide}"]`);

    if (!image) {
      return;
    }

    const frameStart = Number(image.dataset.frameStart ?? 0);
    const frameCount = Math.max(1, Number(image.dataset.frameCount ?? 1));
    const loopCount = Math.max(1, Number(step.loopCount ?? image.dataset.loopCount ?? 1));
    const totalFrames = Math.max(1, frameCount * loopCount);
    const frameDurationMs = Math.max(80, Math.floor(step.windowMs / totalFrames));

    this.setCombatCutsceneSheetFrame(image, frameStart);

    for (let frameIndex = 1; frameIndex < totalFrames; frameIndex += 1) {
      const timer = window.setTimeout(() => {
        this.setCombatCutsceneSheetFrame(
          image,
          frameStart + (frameIndex % frameCount)
        );
      }, frameIndex * frameDurationMs);
      this.combatCutscenePlayback?.timers.push(timer);
    }

    const resetTimer = window.setTimeout(() => {
      this.setCombatCutsceneSheetFrame(image, frameStart);
    }, step.windowMs);
    this.combatCutscenePlayback?.timers.push(resetTimer);
  },

  playCombatCutsceneImpact(overlay, cutscene, stepIndex, options = {}) {
    const step = cutscene.steps[stepIndex] ?? null;
    const lane = step
      ? overlay.querySelector(`[data-cutscene-lane="${step.targetSide}"]`)
      : null;

    if (!step) {
      return;
    }

    lane?.classList.add("combat-cutscene__lane--impact");

    if (options.screenShake !== false) {
      overlay.classList.remove("battle-overlay--combat-cutscene-shake");
      void overlay.offsetWidth;
      overlay.classList.add("battle-overlay--combat-cutscene-shake");

      const shakeTimer = window.setTimeout(() => {
        overlay.classList.remove("battle-overlay--combat-cutscene-shake");
      }, BATTLE_COMBAT_CUTSCENE_SHAKE_MS);
      this.combatCutscenePlayback?.timers.push(shakeTimer);
    }

    const unit = step.targetSide === "player" ? cutscene.playerUnit : cutscene.enemyUnit;
    const hpValue = overlay.querySelector(`[data-cutscene-hp-value="${step.targetSide}"]`);
    const hpFill = overlay.querySelector(`[data-cutscene-hp-fill="${step.targetSide}"]`);
    const beforeRatio = Math.max(
      0,
      Math.min(1, step.targetHpBefore / Math.max(1, unit.maxHealth))
    );
    const afterRatio = Math.max(
      0,
      Math.min(1, step.targetHpAfter / Math.max(1, unit.maxHealth))
    );

    if (hpFill) {
      hpFill.style.setProperty("--hp-from-ratio", beforeRatio.toFixed(4));
      hpFill.style.setProperty("--hp-ratio", afterRatio.toFixed(4));
      hpFill.classList.remove("combat-cutscene__health-fill--animate");
      void hpFill.offsetWidth;
      hpFill.classList.add("combat-cutscene__health-fill--animate");
    }

    if (hpValue) {
      hpValue.textContent = `${Math.round(step.targetHpAfter)}`;
    }

    const impactTimer = window.setTimeout(() => {
      lane?.classList.remove("combat-cutscene__lane--impact");
      hpFill?.classList.remove("combat-cutscene__health-fill--animate");
    }, 220);
    this.combatCutscenePlayback?.timers.push(impactTimer);
  }
};
