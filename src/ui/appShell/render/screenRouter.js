import { SCREEN_IDS } from "../../../game/core/constants.js";
import { titleCaseSlot } from "../../formatters.js";
import { renderCommanderSelectView } from "../../views/commanderSelectView.js";
import { renderMapEditorView } from "../../views/mapEditorView.js";
import { renderOptionsView } from "../../views/optionsView.js";
import { renderProgressionView } from "../../views/progressionView.js";
import { renderRunLoadoutView } from "../../views/runLoadoutView.js";
import { renderSaveSlotView } from "../../views/saveSlotView.js";
import { renderSkirmishSetupView } from "../../views/skirmishSetupView.js";
import { renderTitleView } from "../../views/titleView.js";
import { renderTutorialView } from "../../views/tutorialView.js";
import { renderAppToast } from "../../views/appToastView.js";
import { applyUnitColorTheme } from "../../unitColorTheme.js";

function getOptionControlKey(control) {
  const valueKey = control.type === "radio" ? `:${control.value}` : "";
  return `${control.dataset.option}:${control.type}${valueKey}`;
}

export function syncOptionsControls(currentContainer, nextContainer) {
  const nextControls = new Map(
    Array.from(nextContainer.querySelectorAll("[data-option]")).map((control) => [
      getOptionControlKey(control),
      control
    ])
  );

  for (const currentControl of currentContainer.querySelectorAll("[data-option]")) {
    const nextControl = nextControls.get(getOptionControlKey(currentControl));

    if (!nextControl) {
      continue;
    }

    if (currentControl.type === "checkbox" || currentControl.type === "radio") {
      currentControl.checked = nextControl.checked;
    } else {
      currentControl.value = nextControl.value;
    }

    currentControl.disabled = nextControl.disabled;

    const currentSwatch = currentControl.closest?.(".unit-color-swatch");
    const nextSwatch = nextControl.closest?.(".unit-color-swatch");

    if (currentSwatch && nextSwatch) {
      currentSwatch.className = nextSwatch.className;
      currentSwatch.title = nextSwatch.title;
    }

    const currentValueLabel = currentControl.closest?.(".option-row")?.querySelector?.("strong");
    const nextValueLabel = nextControl.closest?.(".option-row")?.querySelector?.("strong");

    if (currentValueLabel && nextValueLabel) {
      currentValueLabel.textContent = nextValueLabel.textContent;
    }
  }
}

export const appShellScreenRouterMethods = {
  syncAppToast(state) {
    const existingToast = this.root.querySelector(".app-toast");
    const nextToastMarkup = renderAppToast(state.toast);

    if (!nextToastMarkup) {
      existingToast?.remove();
      return;
    }

    if (existingToast) {
      existingToast.outerHTML = nextToastMarkup;
      return;
    }

    this.root.insertAdjacentHTML("beforeend", nextToastMarkup);
  },

  render(state) {
    this.applyDisplayRootAttributes?.();
    applyUnitColorTheme(this.root, state.metaState?.options);
    this.renderWindowChrome?.();

    if (state.screen !== SCREEN_IDS.MAP_EDITOR) {
      this.resetMapEditorUiState();
    }

    if (state.screen !== SCREEN_IDS.SKIRMISH_SETUP) {
      this.resetSkirmishUiState();
    }

    if (state.screen === SCREEN_IDS.COMMANDER_SELECT) {
      this.renderCommanderSelect(state);
      this.syncAppToast(state);
      this.syncControllerFocusAfterRender();
      return;
    }

    if (state.screen === SCREEN_IDS.RUN_LOADOUT) {
      this.renderRunLoadout(state);
      this.syncAppToast(state);
      this.syncControllerFocusAfterRender();
      return;
    }

    if (state.screen === SCREEN_IDS.SKIRMISH_SETUP) {
      this.renderSkirmishSetup(state);
      this.syncAppToast(state);
      this.syncControllerFocusAfterRender();
      return;
    }

    this.resetCommanderSliderState();

    switch (state.screen) {
      case SCREEN_IDS.LOAD_SLOT:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderSaveSlotView(state);
        this.syncAppToast(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.OPTIONS:
        this.renderOptions(state);
        this.syncAppToast(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.MAP_EDITOR:
        this.renderMapEditor(state);
        this.syncAppToast(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.PROGRESSION:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderProgressionView(state);
        this.syncAppToast(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.TUTORIAL:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderTutorialView(state);
        this.syncAppToast(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.BATTLE:
        this.renderBattleScreen(state);
        this.syncAppToast(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.TITLE:
      default:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderTitleView(state, this.controller.buildProfileConfig);
        this.syncLoadedTitleButtonImages();
        this.syncAppToast(state);
        this.syncControllerFocusAfterRender();
    }
  },

  syncLoadedTitleButtonImages() {
    const titleButtonImages = this.root.querySelectorAll(".title-button__image");

    for (const image of titleButtonImages) {
      if (!image.complete || image.naturalWidth === 0) {
        continue;
      }

      image.closest("button")?.classList.add("title-button--image-loaded");
    }
  },

  renderOptions(state) {
    this.resetBattleUiTimers();
    this.previousBattleSnapshot = null;

    const nextMarkup = renderOptionsView(state, this.getDisplayRenderContext?.(state));
    const existingScreen = this.root.querySelector('[data-screen-id="options"]');

    if (!existingScreen) {
      this.root.innerHTML = nextMarkup;
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = nextMarkup.trim();

    const nextScreen = template.content.querySelector('[data-screen-id="options"]');

    if (!nextScreen) {
      this.root.innerHTML = nextMarkup;
      return;
    }

    syncOptionsControls(existingScreen, nextScreen);

    const currentDisplaySection = existingScreen.querySelector(".options-section--display");
    const nextDisplaySection = nextScreen.querySelector(".options-section--display");

    if (
      currentDisplaySection &&
      nextDisplaySection &&
      currentDisplaySection.innerHTML !== nextDisplaySection.innerHTML
    ) {
      currentDisplaySection.replaceWith(nextDisplaySection);
    }
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
      loadDialogListScrollTop: 0,
      loadDialogOpenGroupKey: null,
      focusedField: null
    };
  },

  resetSkirmishUiState() {
    this.skirmishUi = {
      mapListScrollTop: 0
    };
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
  }
};
