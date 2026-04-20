import { SCREEN_IDS } from "../game/core/constants.js";
import { renderBattleHudView } from "./views/battleHudView.js";
import { renderCommanderSelectView } from "./views/commanderSelectView.js";
import { titleCaseSlot } from "./formatters.js";
import { renderOptionsView } from "./views/optionsView.js";
import { renderSaveSlotView } from "./views/saveSlotView.js";
import { renderTitleView } from "./views/titleView.js";

/**
 * The DOM shell handles all text-heavy UI.
 * Phaser remains focused on the animated background and battlefield itself.
 */
export class AppShell {
  constructor(root, controller) {
    this.root = root;
    this.controller = controller;
    this.latestState = null;

    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => this.handleChange(event));

    this.controller.subscribe((state) => {
      this.latestState = state;
      this.render(state);
    });
  }

  render(state) {
    if (state.screen === SCREEN_IDS.COMMANDER_SELECT) {
      this.renderCommanderSelect(state);
      return;
    }

    switch (state.screen) {
      case SCREEN_IDS.LOAD_SLOT:
        this.root.innerHTML = renderSaveSlotView(state);
        return;
      case SCREEN_IDS.OPTIONS:
        this.root.innerHTML = renderOptionsView(state);
        return;
      case SCREEN_IDS.BATTLE:
        this.root.innerHTML = renderBattleHudView(state);
        return;
      case SCREEN_IDS.TITLE:
      default:
        this.root.innerHTML = renderTitleView(state);
    }
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
      case "acknowledge-level-up":
        await this.controller.acknowledgeLevelUp();
        break;
      case "quit-game":
        await this.controller.quitGame();
        break;
      case "select-commander":
        this.controller.selectCommander(commanderId);
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
      case "wait-unit":
        await this.controller.waitWithSelectedUnit();
        break;
      case "begin-attack":
        await this.controller.beginSelectedAttack();
        break;
      case "cancel-attack":
        await this.controller.cancelSelectedAttack();
        break;
      case "capture-building":
        await this.controller.captureWithSelectedUnit();
        break;
      case "redo-move":
        await this.controller.redoSelectedMove();
        break;
      case "advance-run":
        await this.controller.advanceRun();
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
