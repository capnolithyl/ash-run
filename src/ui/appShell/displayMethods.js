import {
  DISPLAY_MODE_LABELS,
  DISPLAY_MODES,
  DISPLAY_PREVIEW_TIMEOUT_SECONDS,
  DISPLAY_RESOLUTION_PRESETS,
  getDisplayResolutionPreset,
  getDisplayResolutionLabel,
  normalizeDisplayOptions
} from "../../game/core/displayOptions.js";
import {
  classifyUiActionAudioCue,
  getAudioFeedbackKey,
  isAudioFeedbackElementEnabled
} from "./audioFeedback.js";

function isWindowedMode(displayMode) {
  return displayMode === DISPLAY_MODES.WINDOWED;
}

function isSameDisplayOptions(left, right) {
  const normalizedLeft = normalizeDisplayOptions(left);
  const normalizedRight = normalizeDisplayOptions(right);

  return (
    normalizedLeft.displayMode === normalizedRight.displayMode &&
    normalizedLeft.windowResolution === normalizedRight.windowResolution
  );
}

function formatWindowChromeLabel(displayState) {
  const current = normalizeDisplayOptions(displayState?.current);

  return `${DISPLAY_MODE_LABELS[current.displayMode]} ${getDisplayResolutionLabel(
    current.windowResolution
  )}`;
}

export const appShellDisplayMethods = {
  initializeDisplayState() {
    this.applyDisplayRootAttributes();
    this.renderWindowChrome();

    const desktopApi = this.getDesktopApi?.();

    if (!desktopApi) {
      return;
    }

    if (typeof desktopApi.onDisplayChanged === "function") {
      this.displayUnsubscribe = desktopApi.onDisplayChanged((displayState) => {
        this.setDesktopDisplayState(displayState);
      });
    }

    void this.refreshDesktopDisplayState({ render: false });
  },

  async refreshDesktopDisplayState(options = {}) {
    const { render = true } = options;
    const desktopApi = this.getDesktopApi?.();

    if (!desktopApi?.getDisplayState) {
      return null;
    }

    const displayState = await desktopApi.getDisplayState();
    this.setDesktopDisplayState(displayState, { render });
    return displayState;
  },

  setDesktopDisplayState(displayState, options = {}) {
    const { render = true } = options;
    this.desktopDisplayState = displayState;
    this.applyDisplayRootAttributes();
    this.renderWindowChrome();

    if (render && this.latestState) {
      if (this.displayConfirmation) {
        this.syncDisplayConfirmationCountdown();
        return;
      }

      this.queueDisplayStateRender();
    }
  },

  queueDisplayStateRender() {
    if (!this.latestState) {
      return;
    }

    if (this.displayStateRenderTimer) {
      window.clearTimeout(this.displayStateRenderTimer);
    }

    this.displayStateRenderTimer = window.setTimeout(() => {
      this.displayStateRenderTimer = null;

      if (!this.displayConfirmation && this.latestState) {
        this.render(this.latestState);
      }
    }, 90);
  },

  applyDisplayRootAttributes() {
    const desktopApi = this.getDesktopApi?.();
    const normalizedOptions = normalizeDisplayOptions(
      this.desktopDisplayState?.current ?? this.latestState?.metaState?.options
    );
    const displayOptions = desktopApi
      ? normalizedOptions
      : {
          ...normalizedOptions,
          displayMode: "browser"
        };
    const targetRoots = [
      document.documentElement,
      document.body,
      document.getElementById("app"),
      this.root
    ].filter(Boolean);
    const preset = getDisplayResolutionPreset(displayOptions.windowResolution);

    for (const target of targetRoots) {
      target.dataset.displayMode = displayOptions.displayMode;
      target.dataset.windowResolution = displayOptions.windowResolution;
      target.dataset.windowWidth = String(preset?.width ?? "");
      target.dataset.windowHeight = String(preset?.height ?? "");

      if (preset) {
        target.style.setProperty("--app-window-width", `${preset.width}px`);
        target.style.setProperty("--app-window-height", `${preset.height}px`);
      }
    }
  },

  getDisplayDraft(state = this.latestState) {
    if (this.displayDraft) {
      return normalizeDisplayOptions(this.displayDraft);
    }

    return normalizeDisplayOptions(this.desktopDisplayState?.current ?? state?.metaState?.options);
  },

  setDisplayDraft(patch = {}) {
    this.displayDraft = normalizeDisplayOptions({
      ...this.getDisplayDraft(),
      ...patch
    });
  },

  getDisplayRenderContext(state = this.latestState) {
    const savedOptions = normalizeDisplayOptions(state?.metaState?.options);
    const draft = this.getDisplayDraft(state);
    const displayState = this.desktopDisplayState;
    const currentMode = draft.displayMode;
    const presetsWithAvailability =
      displayState?.presets ?? DISPLAY_RESOLUTION_PRESETS.map((preset) => ({
        ...preset,
        available: true,
        windowedAvailable: true,
        nativeAvailable: true
      }));
    const presetAvailability = new Map(
      presetsWithAvailability.map((preset) => [
        preset.id,
        (isWindowedMode(currentMode)
          ? preset.windowedAvailable ?? preset.available
          : preset.nativeAvailable ?? preset.available) !== false
      ])
    );

    return {
      desktopAvailable: Boolean(this.getDesktopApi?.()?.applyDisplaySettings),
      displayState,
      draft,
      confirmation: this.displayConfirmation,
      presets: DISPLAY_RESOLUTION_PRESETS.map((preset) => ({
        ...preset,
        available: presetAvailability.get(preset.id) !== false
      })),
      applyDisabled:
        Boolean(this.displayConfirmation) || isSameDisplayOptions(draft, savedOptions)
    };
  },

  renderWindowChrome() {
    if (!this.windowChromeRoot) {
      return;
    }

    const desktopApi = this.getDesktopApi?.();
    const displayState = this.desktopDisplayState;
    const current = normalizeDisplayOptions(displayState?.current);

    if (!desktopApi || current.displayMode !== DISPLAY_MODES.WINDOWED) {
      this.windowChromeRoot.innerHTML = "";
      return;
    }

    this.windowChromeRoot.innerHTML = `
      <div class="window-chrome" role="toolbar" aria-label="Window controls">
        <div class="window-chrome__drag">
          <strong>Ash Run '84</strong>
          <span>${formatWindowChromeLabel(displayState)}</span>
        </div>
        <div class="window-chrome__actions">
          <button type="button" aria-label="Minimize" data-window-action="minimize">_</button>
          <button type="button" aria-label="Close" data-window-action="close">x</button>
        </div>
      </div>
    `;
  },

  async handleWindowChromeClick(event) {
    const trigger = event.target.closest("[data-window-action]");

    if (!trigger || !isAudioFeedbackElementEnabled(trigger)) {
      return;
    }

    this.controller.emitAudioCue?.(
      classifyUiActionAudioCue(null, trigger),
      {
        dedupeKey: `window:${getAudioFeedbackKey(trigger)}`,
        source: "window-chrome"
      }
    );

    const desktopApi = this.getDesktopApi?.();

    switch (trigger.dataset.windowAction) {
      case "minimize":
        await desktopApi?.minimizeWindow?.();
        break;
      case "close":
        await desktopApi?.closeWindow?.();
        break;
      default:
        break;
    }
  },

  handleDisplayOptionChange(event) {
    const displayOption = event.target.dataset.displayOption;

    if (!displayOption) {
      return false;
    }

    this.setDisplayDraft({
      [displayOption]: event.target.value
    });
    this.render(this.latestState);
    return true;
  },

  async applyDisplaySettings() {
    const desktopApi = this.getDesktopApi?.();

    if (!desktopApi?.applyDisplaySettings || this.displayConfirmation) {
      return;
    }

    const requestedOptions = this.getDisplayDraft();
    const displayState = await desktopApi.applyDisplaySettings(requestedOptions);
    const appliedOptions = normalizeDisplayOptions(displayState?.current ?? requestedOptions);

    this.displayDraft = appliedOptions;
    this.desktopDisplayState = displayState;
    this.startDisplayConfirmationTimer(appliedOptions);
    this.applyDisplayRootAttributes();
    this.renderWindowChrome();
    this.render(this.latestState);
  },

  async keepDisplaySettings() {
    const desktopApi = this.getDesktopApi?.();
    const nextOptions = normalizeDisplayOptions(this.displayConfirmation?.nextOptions ?? this.getDisplayDraft());

    if (desktopApi?.confirmDisplaySettings) {
      this.desktopDisplayState = await desktopApi.confirmDisplaySettings();
    }

    this.clearDisplayConfirmationTimer();
    this.displayDraft = nextOptions;
    this.applyDisplayRootAttributes();
    this.renderWindowChrome();
    await this.controller.updateOptions(nextOptions);
  },

  async revertDisplaySettings() {
    const desktopApi = this.getDesktopApi?.();

    if (desktopApi?.revertDisplaySettings) {
      this.desktopDisplayState = await desktopApi.revertDisplaySettings();
    }

    this.clearDisplayConfirmationTimer();
    this.displayDraft = normalizeDisplayOptions(this.latestState?.metaState?.options);
    this.applyDisplayRootAttributes();
    this.renderWindowChrome();
    this.render(this.latestState);
  },

  async returnToWindowedDisplay() {
    const desktopApi = this.getDesktopApi?.();

    if (!desktopApi?.returnToWindowed) {
      return;
    }

    this.desktopDisplayState = await desktopApi.returnToWindowed();
    const nextOptions = normalizeDisplayOptions(this.desktopDisplayState?.current);
    this.clearDisplayConfirmationTimer();
    this.displayDraft = nextOptions;
    this.applyDisplayRootAttributes();
    this.renderWindowChrome();
    await this.controller.updateOptions(nextOptions);
  },

  startDisplayConfirmationTimer(nextOptions) {
    this.clearDisplayConfirmationTimer();
    this.displayConfirmation = {
      nextOptions,
      secondsRemaining: DISPLAY_PREVIEW_TIMEOUT_SECONDS,
      expiresAt: Date.now() + DISPLAY_PREVIEW_TIMEOUT_SECONDS * 1000
    };
    this.displayConfirmationTimer = window.setInterval(() => {
      if (!this.displayConfirmation) {
        return;
      }

      const secondsRemaining = Math.max(
        0,
        Math.ceil((this.displayConfirmation.expiresAt - Date.now()) / 1000)
      );

      this.displayConfirmation = {
        ...this.displayConfirmation,
        secondsRemaining
      };

      if (secondsRemaining <= 0) {
        void this.revertDisplaySettings();
        return;
      }

      this.syncDisplayConfirmationCountdown();
    }, 1000);
  },

  syncDisplayConfirmationCountdown() {
    if (!this.displayConfirmation) {
      return;
    }

    for (const element of this.root.querySelectorAll("[data-display-countdown]")) {
      element.textContent = `${this.displayConfirmation.secondsRemaining}s`;
    }
  },

  clearDisplayConfirmationTimer() {
    if (this.displayConfirmationTimer) {
      window.clearInterval(this.displayConfirmationTimer);
      this.displayConfirmationTimer = null;
    }

    this.displayConfirmation = null;
  }
};
