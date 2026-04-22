import {
  BATTLE_FUNDS_GAIN_ANIMATION_MS,
  BATTLE_TURN_BANNER_DISPLAY_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  SCREEN_IDS
} from "../game/core/constants.js";
import { renderBattleHudView } from "./views/battleHudView.js";
import { renderCommanderSelectView } from "./views/commanderSelectView.js";
import { titleCaseSlot } from "./formatters.js";
import { renderOptionsView } from "./views/optionsView.js";
import { renderSaveSlotView } from "./views/saveSlotView.js";
import { renderTitleView } from "./views/titleView.js";

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * The DOM shell handles all text-heavy UI.
 * Phaser remains focused on the animated background and battlefield itself.
 */
export class AppShell {
  constructor(root, controller) {
    this.root = root;
    this.controller = controller;
    this.latestState = null;
    this.previousBattleSnapshot = null;
    this.levelUpRevealUntil = 0;
    this.levelUpRevealTimer = null;
    this.victoryRevealUntil = 0;
    this.victoryRevealTimer = null;
    this.turnBanner = null;
    this.turnBannerUntil = 0;
    this.turnBannerTimer = null;
    this.lastTurnBannerKey = null;
    this.fundsAnimationFrame = null;
    this.activeFundsGainElement = null;
    this.activeFundsGainId = null;
    this.battleDrawers = {
      intel: false,
      command: false
    };

    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => this.handleChange(event));
    this.root.addEventListener("contextmenu", (event) => this.handleContextMenu(event));

    this.controller.subscribe((state) => {
      this.latestState = state;
      this.render(state);
    });
  }

  getDebugField(field, fallback = "") {
    return this.root.querySelector(`[data-debug-field="${field}"]`)?.value ?? fallback;
  }

  getDebugNumberField(field, fallback = 0) {
    const parsed = Number(this.getDebugField(field, fallback));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  render(state) {
    if (state.screen === SCREEN_IDS.COMMANDER_SELECT) {
      this.renderCommanderSelect(state);
      return;
    }

    switch (state.screen) {
      case SCREEN_IDS.LOAD_SLOT:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderSaveSlotView(state);
        return;
      case SCREEN_IDS.OPTIONS:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderOptionsView(state);
        return;
      case SCREEN_IDS.BATTLE: {
        const suppressLevelUpOverlay = this.shouldSuppressLevelUpOverlay(state);
        const suppressOutcomeOverlay = this.shouldSuppressOutcomeOverlay(state);
        const turnBanner = this.getTurnBanner(state);
        this.captureBattleDrawerState();
        this.root.innerHTML = renderBattleHudView(state, {
          suppressLevelUpOverlay,
          suppressOutcomeOverlay,
          turnBanner
        });
        this.applyBattleDrawerState();
        this.animateFundsGain(state);
        this.previousBattleSnapshot = state.battleSnapshot;
        return;
      }
      case SCREEN_IDS.TITLE:
      default:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderTitleView(state);
    }
  }

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
  }

  captureBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");

    if (intelDrawer) {
      this.battleDrawers.intel = intelDrawer.checked;
    }

    if (commandDrawer) {
      this.battleDrawers.command = commandDrawer.checked;
    }
  }

  applyBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");

    if (intelDrawer) {
      intelDrawer.checked = this.battleDrawers.intel;
    }

    if (commandDrawer) {
      commandDrawer.checked = this.battleDrawers.command;
    }
  }

  getVictoryKey(snapshot) {
    const victory = snapshot?.victory;

    if (!victory) {
      return null;
    }

    return `${snapshot.id}-${victory.winner}-${victory.message}`;
  }

  getTurnKey(snapshot) {
    if (!snapshot) {
      return null;
    }

    return `${snapshot.id}-${snapshot.turn.number}-${snapshot.turn.activeSide}`;
  }

  getLevelUpKey(snapshot) {
    const levelUpEvent = snapshot?.levelUpQueue?.[0];

    if (!levelUpEvent) {
      return null;
    }

    return `${levelUpEvent.unitId}-${levelUpEvent.previousLevel}-${levelUpEvent.newLevel}`;
  }

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
  }

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
  }

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
  }

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
  }

  renderCommanderSelect(state) {
    const existingScreen = this.root.querySelector('[data-screen-id="commander-select"]');

    if (!existingScreen) {
      this.root.innerHTML = renderCommanderSelectView(state);
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
  }

  scrollCommanderSlider(direction) {
    const slider = this.root.querySelector('[data-role="commander-slider"]');

    if (!slider) {
      return;
    }

    const distance = Math.max(240, slider.clientWidth * 0.88);
    slider.scrollBy({
      left: direction * distance,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  }

  async handleContextMenu(event) {
    if (
      this.latestState?.screen !== SCREEN_IDS.BATTLE ||
      !event.target?.closest?.(".battle-shell")
    ) {
      return;
    }

    event.preventDefault();
    await this.controller.handleBattleContextAction();
  }

  async handleClick(event) {
    const trigger = event.target.closest("[data-action]");

    if (!trigger || !this.latestState) {
      return;
    }

    const { action, commanderId, slotId, unitTypeId } = trigger.dataset;

    switch (action) {
      case "open-new-run":
        this.controller.openNewRun();
        break;
      case "open-continue":
        this.controller.openContinue();
        break;
      case "open-options":
        this.controller.openOptions();
        break;
      case "open-debug-run":
        this.controller.startDebugRun();
        break;
      case "back-to-title":
        await this.controller.returnToTitle();
        break;
      case "pause-battle":
        this.controller.openPauseMenu();
        break;
      case "resume-battle":
        this.controller.closePauseMenu();
        break;
      case "prompt-abandon-run":
        this.controller.promptAbandonRun();
        break;
      case "cancel-abandon-run":
        this.controller.cancelAbandonRun();
        break;
      case "confirm-abandon-run":
        await this.controller.abandonRun();
        break;
      case "acknowledge-level-up": {
        const overlay = this.root.querySelector(".battle-overlay--level-up");
        const card = overlay?.querySelector(".overlay-card--level-up");
        overlay?.classList.add("battle-overlay--closing");
        card?.classList.add("overlay-card--closing");
        await delay(220);
        await this.controller.acknowledgeLevelUp();
        break;
      }
      case "quit-game":
        await this.controller.quitGame();
        break;
      case "select-commander":
        this.controller.selectCommander(commanderId);
        break;
      case "commander-slider-prev":
        this.scrollCommanderSlider(-1);
        break;
      case "commander-slider-next":
        this.scrollCommanderSlider(1);
        break;
      case "select-slot":
        this.controller.selectSlot(slotId);
        break;
      case "start-run":
        await this.controller.startNewRun();
        break;
      case "load-slot":
        await this.controller.loadSlot(slotId);
        break;
      case "delete-slot":
        await this.controller.deleteSlot(slotId);
        break;
      case "end-turn":
        await this.controller.endTurn();
        break;
      case "activate-power":
        await this.controller.activatePower();
        break;
      case "recruit-unit":
        await this.controller.recruitUnit(unitTypeId);
        break;
      case "select-next-unit":
        await this.controller.selectNextReadyUnit();
        break;
      case "wait-unit":
        await this.controller.waitWithSelectedUnit();
        break;
      case "begin-attack":
        await this.controller.beginSelectedAttack();
        break;
      case "cancel-attack":
        await this.controller.cancelSelectedAttack();
        break;
      case "cancel-transport-choice":
        await this.controller.handleBattleContextAction();
        break;
      case "cancel-support-choice":
        await this.controller.handleBattleContextAction();
        break;
      case "capture-building":
        await this.controller.captureWithSelectedUnit();
        break;
      case "use-support":
        await this.controller.useSelectedSupportAbility();
        break;
      case "enter-transport":
        await this.controller.enterSelectedTransport();
        break;
      case "begin-unload":
        await this.controller.beginSelectedUnload();
        break;
      case "redo-move":
        await this.controller.redoSelectedMove();
        break;
      case "advance-run":
        await this.controller.advanceRun();
        break;
      case "debug-spawn-unit":
        await this.controller.debugSpawnUnit({
          owner: this.getDebugField("spawn-owner", "player"),
          unitTypeId: this.getDebugField("spawn-unit-type", "grunt"),
          x: this.getDebugNumberField("spawn-x", 0),
          y: this.getDebugNumberField("spawn-y", 0),
          stats: {
            attack: this.getDebugNumberField("spawn-attack", NaN),
            armor: this.getDebugNumberField("spawn-armor", NaN),
            maxHealth: this.getDebugNumberField("spawn-max-health", NaN),
            movement: this.getDebugNumberField("spawn-movement", NaN),
            minRange: this.getDebugNumberField("spawn-min-range", NaN),
            maxRange: this.getDebugNumberField("spawn-max-range", NaN),
            staminaMax: this.getDebugNumberField("spawn-max-stamina", NaN),
            ammoMax: this.getDebugNumberField("spawn-max-ammo", NaN),
            luck: this.getDebugNumberField("spawn-luck", NaN)
          }
        });
        break;
      case "debug-apply-selected-stats":
        await this.controller.debugApplySelectedUnitStats({
          hp: this.getDebugNumberField("unit-hp", NaN),
          maxHealth: this.getDebugNumberField("unit-max-health", NaN),
          attack: this.getDebugNumberField("unit-attack", NaN),
          armor: this.getDebugNumberField("unit-armor", NaN),
          movement: this.getDebugNumberField("unit-movement", NaN),
          minRange: this.getDebugNumberField("unit-min-range", NaN),
          maxRange: this.getDebugNumberField("unit-max-range", NaN),
          stamina: this.getDebugNumberField("unit-stamina", NaN),
          staminaMax: this.getDebugNumberField("unit-max-stamina", NaN),
          ammo: this.getDebugNumberField("unit-ammo", NaN),
          ammoMax: this.getDebugNumberField("unit-max-ammo", NaN),
          luck: this.getDebugNumberField("unit-luck", NaN),
          level: this.getDebugNumberField("unit-level", NaN),
          experience: this.getDebugNumberField("unit-experience", NaN)
        });
        break;
      case "debug-full-charge-player":
        await this.controller.debugSetCharge("player", 100);
        break;
      case "debug-full-charge-enemy":
        await this.controller.debugSetCharge("enemy", 100);
        break;
      case "debug-refresh-player-actions":
        await this.controller.debugRefreshActions("player");
        break;
      case "debug-refresh-enemy-actions":
        await this.controller.debugRefreshActions("enemy");
        break;
      default:
        break;
    }
  }

  async handleChange(event) {
    const optionKey = event.target.dataset.option;

    if (!optionKey) {
      return;
    }

    const nextValue =
      event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);

    await this.controller.updateOptions({
      [optionKey]: nextValue
    });
  }
}
