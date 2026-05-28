import {
  DISPLAY_MODE_LABELS,
  DISPLAY_MODES,
  DISPLAY_RESOLUTION_PRESETS,
  normalizeDisplayOptions
} from "../../game/core/displayOptions.js";

function renderDisplaySettings(options, displayContext = {}) {
  if (!displayContext.showDisplayOptions) {
    return "";
  }

  const draft = normalizeDisplayOptions(displayContext.draft ?? options);
  const presets = displayContext.presets ?? DISPLAY_RESOLUTION_PRESETS;
  const currentMode = normalizeDisplayOptions(displayContext.displayState?.current ?? draft).displayMode;
  const applyDisabled = displayContext.applyDisabled || !displayContext.desktopAvailable;
  const confirmation = displayContext.confirmation;

  return `
    <section class="options-section options-section--display" aria-label="Display settings">
      <div class="options-section__header">
        <span>Display</span>
        <strong>${DISPLAY_MODE_LABELS[currentMode] ?? DISPLAY_MODE_LABELS[DISPLAY_MODES.WINDOWED]}</strong>
      </div>
      <label class="option-row option-row--select">
        <span>Display Mode</span>
        <select data-display-option="displayMode" ${confirmation ? "disabled" : ""}>
          ${Object.values(DISPLAY_MODES)
            .map(
              (mode) => `
                <option value="${mode}" ${draft.displayMode === mode ? "selected" : ""}>
                  ${DISPLAY_MODE_LABELS[mode]}
                </option>
              `
            )
            .join("")}
        </select>
      </label>
      <label class="option-row option-row--select">
        <span>
          Resolution Preset
          ${
            draft.displayMode === DISPLAY_MODES.WINDOWED
              ? ""
              : "<small>Fullscreen and Borderless use monitor bounds.</small>"
          }
        </span>
        <select data-display-option="windowResolution" ${confirmation ? "disabled" : ""}>
          ${presets
            .map(
              (preset) => `
                <option
                  value="${preset.id}"
                  ${draft.windowResolution === preset.id ? "selected" : ""}
                  ${preset.available === false ? "disabled" : ""}
                >
                  ${preset.label}${preset.available === false ? " (Unavailable)" : ""}
                </option>
              `
            )
            .join("")}
        </select>
      </label>
      <div class="display-actions">
        <button
          class="menu-button menu-button--small"
          type="button"
          data-action="apply-display-settings"
          ${applyDisabled ? "disabled" : ""}
        >
          Apply
        </button>
        ${
          currentMode === DISPLAY_MODES.WINDOWED || confirmation
            ? ""
            : `
              <button
                class="ghost-button ghost-button--small"
                type="button"
                data-action="return-windowed-display"
              >
                Return Windowed
              </button>
            `
        }
      </div>
      ${
        confirmation
          ? `
            <div class="display-confirmation" role="alert">
              <span>Keep these display settings?</span>
              <strong data-display-countdown>${confirmation.secondsRemaining}s</strong>
              <div class="display-confirmation__actions">
                <button class="menu-button menu-button--small" type="button" data-action="keep-display-settings">
                  Keep
                </button>
                <button class="ghost-button ghost-button--small" type="button" data-action="revert-display-settings">
                  Revert
                </button>
              </div>
            </div>
          `
          : ""
      }
    </section>
  `;
}

export function renderOptionFields(options = {}, displayContext = {}) {
  const masterVolume = Number.isFinite(Number(options.masterVolume))
    ? Math.max(0, Math.min(1, Number(options.masterVolume)))
    : 0.4;
  const masterVolumePercent = Math.round(masterVolume * 100);
  const combatCutsceneAnimations = options.combatCutsceneAnimations !== false;

  return `
    ${renderDisplaySettings(options, displayContext)}
    <label class="option-row option-row--toggle">
      <span>Show Grid Highlights</span>
      <input type="checkbox" ${options.showGrid ? "checked" : ""} data-option="showGrid" />
    </label>
    <label class="option-row option-row--toggle">
      <span>Allow Screen Shake</span>
      <input type="checkbox" ${options.screenShake ? "checked" : ""} data-option="screenShake" />
    </label>
    <label class="option-row option-row--toggle">
      <span>Combat Cutscene Animations</span>
      <input type="checkbox" ${combatCutsceneAnimations ? "checked" : ""} data-option="combatCutsceneAnimations" />
    </label>
    <label class="option-row option-row--range">
      <span>Master Volume <strong>${masterVolumePercent}%</strong></span>
      <input type="range" min="0" max="1" step="0.01" value="${masterVolume}" data-option="masterVolume" />
    </label>
    <label class="option-row option-row--toggle">
      <span>Mute Audio</span>
      <input type="checkbox" ${options.muted ? "checked" : ""} data-option="muted" />
    </label>
  `;
}
