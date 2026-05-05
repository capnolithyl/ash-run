import {
  BATTLE_FUNDS_GAIN_ANIMATION_MS,
  BATTLE_TURN_BANNER_DISPLAY_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  SCREEN_IDS
} from "../../game/core/constants.js";
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

export const appShellRenderMethods = {
  render(state) {
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
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderMapEditorView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.PROGRESSION:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderProgressionView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.SKIRMISH_SETUP:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderSkirmishSetupView(state);
        this.syncCommanderSliders(state);
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

    this.levelUpRevealUntil = 0;
    this.victoryRevealUntil = 0;
    this.turnBannerUntil = 0;
    this.turnBanner = null;
    this.lastTurnBannerKey = null;
    this.activeFundsGainElement = null;
    this.activeFundsGainId = null;
    this.battleDrawers.intel = false;
    this.battleDrawers.command = false;
  },

  resetCommanderSliderState() {
    this.commanderSliderStates.clear();
    this.commanderSliderTrackIndex = null;
    this.commanderSliderTransitioning = false;
    this.commanderSliderSwipeState = null;
    this.commanderSliderSuppressClick = false;
  },

  captureBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");

    if (intelDrawer) {
      this.battleDrawers.intel = intelDrawer.checked;
    }

    if (commandDrawer) {
      this.battleDrawers.command = commandDrawer.checked;
    }
  },

  applyBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");

    if (intelDrawer) {
      intelDrawer.checked = this.battleDrawers.intel;
    }

    if (commandDrawer) {
      commandDrawer.checked = this.battleDrawers.command;
    }
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

        if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
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

        if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
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

        if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
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
