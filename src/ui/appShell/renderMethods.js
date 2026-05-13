import {
  BATTLE_COMBAT_CUTSCENE_SHAKE_MS,
  BATTLE_FUNDS_GAIN_ANIMATION_MS,
  BATTLE_TURN_BANNER_DISPLAY_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  SCREEN_IDS
} from "../../game/core/constants.js";
import { getBattleCombatCutsceneState } from "../../game/phaser/view/battleCombatCutscene.js";
import { titleCaseSlot } from "../formatters.js";
import { renderBattleHudView } from "../views/battleHudView.js";
import { renderCommanderSelectView } from "../views/commanderSelectView.js";
import { renderOptionsView } from "../views/optionsView.js";
import { renderMapEditorView } from "../views/mapEditorView.js";
import { renderProgressionView } from "../views/progressionView.js";
import { renderRunLoadoutView } from "../views/runLoadoutView.js";
import { renderSaveSlotView } from "../views/saveSlotView.js";
import { renderSkirmishSetupView } from "../views/skirmishSetupView.js";
import { renderTitleView } from "../views/titleView.js";
import { renderTutorialView } from "../views/tutorialView.js";
import { BATTLE_HP_METER_ANIMATION_MS } from "./shared.js";

function formatCombatCutsceneWeaponLabel(weaponClass) {
  if (!weaponClass) {
    return "Combat Exchange";
  }

  return weaponClass
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const appShellRenderMethods = {
  render(state) {
    if (state.screen !== SCREEN_IDS.MAP_EDITOR) {
      this.resetMapEditorUiState();
    }

    if (state.screen !== SCREEN_IDS.SKIRMISH_SETUP) {
      this.resetSkirmishUiState();
    }

    if (state.screen === SCREEN_IDS.COMMANDER_SELECT) {
      this.renderCommanderSelect(state);
      this.syncControllerFocusAfterRender();
      return;
    }

    if (state.screen === SCREEN_IDS.RUN_LOADOUT) {
      this.renderRunLoadout(state);
      this.syncControllerFocusAfterRender();
      return;
    }

    if (state.screen === SCREEN_IDS.SKIRMISH_SETUP) {
      this.renderSkirmishSetup(state);
      this.syncControllerFocusAfterRender();
      return;
    }

    this.resetCommanderSliderState();

    switch (state.screen) {
      case SCREEN_IDS.LOAD_SLOT:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderSaveSlotView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.OPTIONS:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderOptionsView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.MAP_EDITOR:
        this.renderMapEditor(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.PROGRESSION:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderProgressionView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.TUTORIAL:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderTutorialView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.BATTLE: {
        const suppressLevelUpOverlay = this.shouldSuppressLevelUpOverlay(state);
        const suppressOutcomeOverlay = this.shouldSuppressOutcomeOverlay(state);
        const turnBanner = this.getTurnBanner(state);
        const previousMeterState = this.captureBattleMeterState();
        this.captureBattleDrawerState();
        this.root.innerHTML = renderBattleHudView(state, {
          suppressLevelUpOverlay,
          suppressOutcomeOverlay,
          turnBanner
        });
        this.syncDebugSpawnStatFields();
        this.applyBattleDrawerState();
        this.animateBattleMeters(previousMeterState);
        this.animateFundsGain(state);
        this.syncCombatCutscenePlayback(state);
        this.previousBattleSnapshot = state.battleSnapshot;
        this.syncControllerFocusAfterRender();
        return;
      }
      case SCREEN_IDS.TITLE:
      default:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderTitleView(state);
        this.syncControllerFocusAfterRender();
    }
  },

  resetBattleUiTimers() {
    if (this.levelUpRevealTimer) {
      window.clearTimeout(this.levelUpRevealTimer);
      this.levelUpRevealTimer = null;
    }

    if (this.victoryRevealTimer) {
      window.clearTimeout(this.victoryRevealTimer);
      this.victoryRevealTimer = null;
    }

    if (this.turnBannerTimer) {
      window.clearTimeout(this.turnBannerTimer);
      this.turnBannerTimer = null;
    }

    if (this.fundsAnimationFrame) {
      window.cancelAnimationFrame(this.fundsAnimationFrame);
      this.fundsAnimationFrame = null;
    }

    this.stopCombatCutscenePlayback();

    this.levelUpRevealUntil = 0;
    this.victoryRevealUntil = 0;
    this.turnBannerUntil = 0;
    this.turnBanner = null;
    this.lastTurnBannerKey = null;
    this.activeFundsGainElement = null;
    this.activeFundsGainId = null;
    this.battleDrawers.intel = false;
    this.battleDrawers.command = false;
    this.battleDrawers.intelTab = "selected";
  },

  resetCommanderSliderState() {
    this.commanderSliderStates.clear();
    this.commanderSliderTrackIndex = null;
    this.commanderSliderTransitioning = false;
    this.commanderSliderSwipeState = null;
    this.commanderSliderSuppressClick = false;
  },

  resetMapEditorUiState() {
    this.mapEditorUi = {
      openAccordion: null,
      leftRailScrollTop: 0,
      rightRailScrollTop: 0,
      unitsScrollTop: 0,
      focusedField: null
    };
  },

  resetSkirmishUiState() {
    this.skirmishUi = {
      mapListScrollTop: 0
    };
  },

  captureBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");
    const selectedIntelTab = this.root.querySelector('[name="battle-intel-tab"]:checked');

    if (intelDrawer) {
      this.battleDrawers.intel = intelDrawer.checked;
    }

    if (commandDrawer) {
      this.battleDrawers.command = commandDrawer.checked;
    }

    if (selectedIntelTab?.value) {
      this.battleDrawers.intelTab = selectedIntelTab.value;
    }
  },

  applyBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");
    const selectedIntelTab = this.root.querySelector(
      `[name="battle-intel-tab"][value="${this.battleDrawers.intelTab ?? "selected"}"]`
    );

    if (intelDrawer) {
      intelDrawer.checked = this.battleDrawers.intel;
    }

    if (commandDrawer) {
      commandDrawer.checked = this.battleDrawers.command;
    }

    if (selectedIntelTab) {
      selectedIntelTab.checked = true;
    }
  },

  stopCombatCutscenePlayback() {
    if (!this.combatCutscenePlayback) {
      return;
    }

    for (const timer of this.combatCutscenePlayback.timers ?? []) {
      window.clearTimeout(timer);
    }

    this.combatCutscenePlayback = null;
  },

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
  },

  getVictoryKey(snapshot) {
    const victory = snapshot?.victory;

    if (!victory) {
      return null;
    }

    return `${snapshot.id}-${victory.winner}-${victory.message}`;
  },

  getTurnKey(snapshot) {
    if (!snapshot) {
      return null;
    }

    return `${snapshot.id}-${snapshot.turn.number}-${snapshot.turn.activeSide}`;
  },

  getLevelUpKey(snapshot) {
    const levelUpEvent = snapshot?.levelUpQueue?.[0];

    if (!levelUpEvent) {
      return null;
    }

    return `${levelUpEvent.unitId}-${levelUpEvent.previousLevel}-${levelUpEvent.newLevel}`;
  },

  shouldSuppressLevelUpOverlay(state) {
    const currentKey = this.getLevelUpKey(state.battleSnapshot);
    const previousKey = this.getLevelUpKey(this.previousBattleSnapshot);
    const isFreshReveal = currentKey && !previousKey;

    if (isFreshReveal) {
      this.levelUpRevealUntil = Date.now() + 2200;

      if (this.levelUpRevealTimer) {
        window.clearTimeout(this.levelUpRevealTimer);
      }

      this.levelUpRevealTimer = window.setTimeout(() => {
        this.levelUpRevealTimer = null;

        if (
          this.latestState?.screen === SCREEN_IDS.BATTLE &&
          !this.latestState?.battleUi?.combatCutscene
        ) {
          this.render(this.latestState);
        }
      }, 2220);
    }

    if (!currentKey) {
      this.levelUpRevealUntil = 0;
      return false;
    }

    return Date.now() < this.levelUpRevealUntil;
  },

  shouldSuppressOutcomeOverlay(state) {
    const currentKey = this.getVictoryKey(state.battleSnapshot);
    const previousKey = this.getVictoryKey(this.previousBattleSnapshot);
    const isFreshVictory = currentKey && !previousKey;

    if (isFreshVictory) {
      this.victoryRevealUntil = Date.now() + 1800;

      if (this.victoryRevealTimer) {
        window.clearTimeout(this.victoryRevealTimer);
      }

      this.victoryRevealTimer = window.setTimeout(() => {
        this.victoryRevealTimer = null;

        if (
          this.latestState?.screen === SCREEN_IDS.BATTLE &&
          !this.latestState?.battleUi?.combatCutscene
        ) {
          this.render(this.latestState);
        }
      }, 1820);
    }

    if (!currentKey) {
      this.victoryRevealUntil = 0;
      return false;
    }

    if (state.battleSnapshot?.levelUpQueue?.length) {
      return true;
    }

    return Date.now() < this.victoryRevealUntil;
  },

  getTurnBanner(state) {
    const snapshot = state.battleSnapshot;
    const currentKey = this.getTurnKey(snapshot);

    if (!snapshot || !currentKey || snapshot.victory) {
      return null;
    }

    if (currentKey !== this.lastTurnBannerKey) {
      this.lastTurnBannerKey = currentKey;
      this.turnBanner = {
        key: currentKey,
        side: snapshot.turn.activeSide,
        number: snapshot.turn.number
      };
      this.turnBannerUntil = Date.now() + BATTLE_TURN_BANNER_DISPLAY_MS;

      if (this.turnBannerTimer) {
        window.clearTimeout(this.turnBannerTimer);
      }

      this.turnBannerTimer = window.setTimeout(() => {
        this.turnBannerTimer = null;

        if (
          this.latestState?.screen === SCREEN_IDS.BATTLE &&
          !this.latestState?.battleUi?.combatCutscene
        ) {
          this.render(this.latestState);
        }
      }, BATTLE_TURN_BANNER_SETTLE_MS);
    }

    if (Date.now() >= this.turnBannerUntil) {
      return null;
    }

    return this.turnBanner;
  },

  animateFundsGain(state) {
    const fundsGain = state.battleUi?.fundsGain;

    if (!fundsGain || fundsGain.pending) {
      if (this.fundsAnimationFrame) {
        window.cancelAnimationFrame(this.fundsAnimationFrame);
        this.fundsAnimationFrame = null;
      }

      this.activeFundsGainId = null;
      this.activeFundsGainElement = null;
      return;
    }

    const valueElement = this.root.querySelector(`[data-funds-value="${fundsGain.side}"]`);

    if (!valueElement) {
      return;
    }

    if (this.activeFundsGainId === fundsGain.id && this.activeFundsGainElement === valueElement) {
      return;
    }

    if (this.fundsAnimationFrame) {
      window.cancelAnimationFrame(this.fundsAnimationFrame);
      this.fundsAnimationFrame = null;
    }

    this.activeFundsGainId = fundsGain.id;
    this.activeFundsGainElement = valueElement;

    const from = Number(fundsGain.from);
    const to = Number(fundsGain.to);
    const duration = Number(fundsGain.durationMs) || BATTLE_FUNDS_GAIN_ANIMATION_MS;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      valueElement.textContent = `${to}`;
      return;
    }

    const startedAt = performance.now();
    valueElement.textContent = `${from}`;

    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const easedProgress = 1 - (1 - progress) ** 3;
      const currentValue = Math.round(from + (to - from) * easedProgress);

      valueElement.textContent = `${currentValue}`;

      if (progress < 1 && this.activeFundsGainId === fundsGain.id) {
        this.fundsAnimationFrame = window.requestAnimationFrame(tick);
        return;
      }

      valueElement.textContent = `${to}`;
      this.fundsAnimationFrame = null;
    };

    this.fundsAnimationFrame = window.requestAnimationFrame(tick);
  },

  captureBattleMeterState() {
    const meterState = new Map();

    for (const card of this.root.querySelectorAll("[data-selection-unit-card]")) {
      const unitId = card.dataset.selectionUnitCard;

      if (!unitId) {
        continue;
      }

      const hpFill = card.querySelector('[data-meter-fill="hp"]');
      const xpFill = card.querySelector('.selection-section--xp [data-meter-fill="xp"]');

      meterState.set(unitId, {
        hp: Number(hpFill?.dataset.meterValue),
        xp: Number(xpFill?.dataset.meterValue)
      });
    }

    return meterState;
  },

  animateBattleMeters(previousMeterState) {
    if (
      !previousMeterState?.size ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    for (const card of this.root.querySelectorAll("[data-selection-unit-card]")) {
      const unitId = card.dataset.selectionUnitCard;

      if (!unitId) {
        continue;
      }

      const previousMeter = previousMeterState.get(unitId);

      if (!previousMeter) {
        continue;
      }

      const hpFill = card.querySelector('[data-meter-fill="hp"]');
      const nextHp = Number(hpFill?.dataset.meterValue);

      if (Number.isFinite(previousMeter.hp) && Number.isFinite(nextHp) && previousMeter.hp !== nextHp) {
        this.animateBattleMeterFill(hpFill, previousMeter.hp, nextHp, {
          duration: BATTLE_HP_METER_ANIMATION_MS,
          emphasisClass: nextHp < previousMeter.hp ? "is-animating-loss" : "is-animating-gain"
        });
      }
    }
  },

  animateBattleMeterFill(fill, from, to, { duration, emphasisClass } = {}) {
    if (!fill || !Number.isFinite(from) || !Number.isFinite(to) || Math.abs(from - to) < 0.1) {
      return;
    }

    fill.style.transition = "none";
    fill.style.width = `${from}%`;
    fill.classList.remove("is-animating-loss", "is-animating-gain");
    void fill.offsetWidth;

    if (emphasisClass) {
      fill.classList.add(emphasisClass);
    }

    window.requestAnimationFrame(() => {
      fill.style.transition = `width ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      fill.style.width = `${to}%`;
    });

    window.setTimeout(() => {
      if (!document.body.contains(fill)) {
        return;
      }

      fill.style.transition = "";
      fill.classList.remove("is-animating-loss", "is-animating-gain");
    }, duration + 140);
  },

  renderCommanderSelect(state) {
    const existingScreen = this.root.querySelector('[data-screen-id="commander-select"]');

    if (!existingScreen) {
      this.root.innerHTML = renderCommanderSelectView(state);
      this.syncCommanderSlider(state);
      return;
    }

    for (const commanderCard of existingScreen.querySelectorAll("[data-commander-id]")) {
      commanderCard.classList.toggle(
        "commander-card--selected",
        commanderCard.dataset.commanderId === state.selectedCommanderId
      );
    }

    for (const slotCard of existingScreen.querySelectorAll("[data-slot-id]")) {
      slotCard.classList.toggle(
        "slot-card--active",
        slotCard.dataset.slotId === state.selectedSlotId
      );
    }

    const selectedSlot = state.slots.find((slot) => slot.slotId === state.selectedSlotId);
    const selectedSlotText = existingScreen.querySelector('[data-role="selected-slot-text"]');
    const selectedSlotNote = existingScreen.querySelector('[data-role="selected-slot-note"]');
    const startRunButton = existingScreen.querySelector('[data-role="start-run-button"]');

    if (selectedSlotText) {
      selectedSlotText.textContent = `Selected slot: ${titleCaseSlot(state.selectedSlotId)}`;
    }

    if (selectedSlotNote) {
      selectedSlotNote.textContent = selectedSlot?.exists
        ? "Existing save will be replaced."
        : "Fresh save slot.";
    }

    if (startRunButton) {
      startRunButton.disabled = !state.selectedCommanderId;
    }

    this.syncCommanderSlider(state);
  },

  renderRunLoadout(state) {
    this.resetBattleUiTimers();
    this.previousBattleSnapshot = null;

    const existingScreen = this.root.querySelector('[data-screen-id="run-loadout"]');

    if (!existingScreen) {
      this.root.innerHTML = renderRunLoadoutView(state);
      return;
    }

    this.captureRunLoadoutTableScroll();

    const nextMarkup = renderRunLoadoutView(state);
    const template = document.createElement("template");
    template.innerHTML = nextMarkup.trim();

    const nextPanel = template.content.querySelector(".run-loadout-panel");
    const currentPanel = existingScreen.querySelector(".run-loadout-panel");

    if (!nextPanel || !currentPanel) {
      this.root.innerHTML = nextMarkup;
      this.applyRunLoadoutTableScroll();
      return;
    }

    currentPanel.replaceWith(nextPanel);
    this.applyRunLoadoutTableScroll();
  },

  renderSkirmishSetup(state) {
    this.resetBattleUiTimers();
    this.previousBattleSnapshot = null;

    if (this.root.querySelector('[data-screen-id="skirmish-setup"]')) {
      this.captureSkirmishUiState();
    }

    this.root.innerHTML = renderSkirmishSetupView(state);
    this.syncCommanderSliders(state);
    this.applySkirmishUiState();
  },

  renderMapEditor(state) {
    this.resetBattleUiTimers();
    this.previousBattleSnapshot = null;

    if (this.root.querySelector(".map-editor-shell")) {
      this.captureMapEditorUiState();
    }

    this.root.innerHTML = renderMapEditorView(state, {
      openAccordion: this.mapEditorUi.openAccordion
    });
    this.applyMapEditorUiState();
  },

  captureMapEditorUiState() {
    const leftRail = this.root.querySelector('[data-map-editor-rail="left"]');
    const rightRail = this.root.querySelector('[data-map-editor-rail="right"]');
    const unitsGrid = this.root.querySelector('[data-map-editor-scroll="units"]');
    const openAccordion = this.root.querySelector("details[data-map-editor-accordion][open]");
    const focusedField = globalThis.document?.activeElement;
    const isFocusedMapEditorField =
      focusedField &&
      this.root.contains(focusedField) &&
      focusedField.hasAttribute?.("data-map-editor-field");

    this.mapEditorUi.leftRailScrollTop = leftRail?.scrollTop ?? 0;
    this.mapEditorUi.rightRailScrollTop = rightRail?.scrollTop ?? 0;
    this.mapEditorUi.unitsScrollTop = unitsGrid?.scrollTop ?? 0;
    this.mapEditorUi.openAccordion = openAccordion?.dataset.mapEditorAccordion ?? null;
    this.mapEditorUi.focusedField = isFocusedMapEditorField
      ? {
          field: focusedField.dataset.mapEditorField,
          selectionStart:
            typeof focusedField.selectionStart === "number" ? focusedField.selectionStart : null,
          selectionEnd:
            typeof focusedField.selectionEnd === "number" ? focusedField.selectionEnd : null
        }
      : null;
  },

  captureSkirmishUiState() {
    const mapList = this.root.querySelector('[data-role="skirmish-map-list"]');
    this.skirmishUi.mapListScrollTop = mapList?.scrollTop ?? 0;
  },

  applyMapEditorUiState() {
    const leftRail = this.root.querySelector('[data-map-editor-rail="left"]');
    const rightRail = this.root.querySelector('[data-map-editor-rail="right"]');
    const unitsGrid = this.root.querySelector('[data-map-editor-scroll="units"]');

    if (leftRail) {
      leftRail.scrollTop = this.mapEditorUi.leftRailScrollTop ?? 0;
    }

    if (rightRail) {
      rightRail.scrollTop = this.mapEditorUi.rightRailScrollTop ?? 0;
    }

    if (unitsGrid) {
      unitsGrid.scrollTop = this.mapEditorUi.unitsScrollTop ?? 0;
    }

    const focusedField = this.mapEditorUi.focusedField;

    if (!focusedField?.field) {
      return;
    }

    const nextField = this.root.querySelector(
      `[data-map-editor-field="${focusedField.field}"]`
    );

    if (!nextField) {
      return;
    }

    nextField.focus?.({ preventScroll: true });

    if (
      typeof focusedField.selectionStart === "number" &&
      typeof focusedField.selectionEnd === "number" &&
      typeof nextField.setSelectionRange === "function"
    ) {
      nextField.setSelectionRange(focusedField.selectionStart, focusedField.selectionEnd);
    }
  },

  applySkirmishUiState() {
    const mapList = this.root.querySelector('[data-role="skirmish-map-list"]');

    if (mapList) {
      mapList.scrollTop = this.skirmishUi.mapListScrollTop ?? 0;
    }
  },

  captureRunLoadoutTableScroll() {
    const tableShell = this.root.querySelector('[data-role="run-loadout-table-shell"]');

    if (!tableShell) {
      return;
    }

    this.runLoadoutTableScroll = {
      top: tableShell.scrollTop,
      left: tableShell.scrollLeft
    };
  },

  applyRunLoadoutTableScroll() {
    const tableShell = this.root.querySelector('[data-role="run-loadout-table-shell"]');

    if (!tableShell) {
      return;
    }

    tableShell.scrollTop = this.runLoadoutTableScroll.top ?? 0;
    tableShell.scrollLeft = this.runLoadoutTableScroll.left ?? 0;
  }
};
