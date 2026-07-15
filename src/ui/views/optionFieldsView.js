import {
  DISPLAY_MODE_LABELS,
  DISPLAY_MODES,
  DISPLAY_RESOLUTION_PRESETS,
  normalizeDisplayOptions
} from "../../game/core/displayOptions.js";
import {
  UNIT_COLOR_DEFINITIONS,
  UNIT_COLOR_IDS,
  normalizeUnitColorOptions
} from "../../game/core/unitColors.js";
import { getUnitSpriteColorAvailability } from "../../game/phaser/assets.js";

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

function renderUnitColorPicker({
  owner,
  label,
  selectedColor,
  opposingColor,
  availability
}) {
  return `
    <fieldset class="unit-color-picker">
      <legend>${label}</legend>
      <div class="unit-color-picker__swatches">
        ${UNIT_COLOR_IDS.map((colorId) => {
          const definition = UNIT_COLOR_DEFINITIONS[colorId];
          const available = availability[colorId] === true;
          const selected = selectedColor === colorId;
          const conflicts = opposingColor === colorId && !selected;
          const disabled = !available || conflicts;
          const status = !available
            ? "Coming soon"
            : conflicts
              ? "Used by the other side"
              : "Available";

          return `
            <label
              class="unit-color-swatch${selected ? " unit-color-swatch--selected" : ""}${disabled ? " unit-color-swatch--disabled" : ""}"
              style="--unit-color-swatch:${definition.hex}"
              title="${definition.label}: ${status}"
            >
              <input
                type="radio"
                name="${owner}Color"
                value="${colorId}"
                data-option="${owner}Color"
                aria-label="${label}: ${definition.label}${available ? "" : " (coming soon)"}"
                ${selected ? "checked" : ""}
                ${disabled ? "disabled" : ""}
              />
              <span class="unit-color-swatch__chip" aria-hidden="true"></span>
              <span class="unit-color-swatch__label">${definition.label}</span>
            </label>
          `;
        }).join("")}
      </div>
    </fieldset>
  `;
}

function renderUnitColorSettings(options = {}) {
  const normalized = normalizeUnitColorOptions(options);
  const availability = getUnitSpriteColorAvailability();

  return `
    <section class="options-section options-section--unit-colors" aria-label="Unit color settings">
      <div class="options-section__header">
        <span>Unit Colors</span>
        <strong>Choose distinct sides</strong>
      </div>
      <div class="unit-color-settings">
        ${renderUnitColorPicker({
          owner: "player",
          label: "Player Units",
          selectedColor: normalized.playerColor,
          opposingColor: normalized.enemyColor,
          availability
        })}
        ${renderUnitColorPicker({
          owner: "enemy",
          label: "Enemy Units",
          selectedColor: normalized.enemyColor,
          opposingColor: normalized.playerColor,
          availability
        })}
      </div>
      <small class="unit-color-settings__note">
        Additional colors unlock when their complete unit sprite sets are installed.
      </small>
    </section>
  `;
}

export function renderOptionFields(options = {}, displayContext = {}) {
  const masterVolume = Number.isFinite(Number(options.masterVolume))
    ? Math.max(0, Math.min(1, Number(options.masterVolume)))
    : 0.4;
  const masterVolumePercent = Math.round(masterVolume * 100);
  const musicVolume = Number.isFinite(Number(options.musicVolume))
    ? Math.max(0, Math.min(1, Number(options.musicVolume)))
    : 1;
  const musicVolumePercent = Math.round(musicVolume * 100);
  const sfxVolume = Number.isFinite(Number(options.sfxVolume))
    ? Math.max(0, Math.min(1, Number(options.sfxVolume)))
    : 0.85;
  const sfxVolumePercent = Math.round(sfxVolume * 100);
  const combatCutsceneAnimations = options.combatCutsceneAnimations !== false;

  return `
    ${renderDisplaySettings(options, displayContext)}
    ${renderUnitColorSettings(options)}
    <label class="option-row option-row--toggle">
      <span>Show Grid Highlights</span>
      <input type="checkbox" ${options.showGrid ? "checked" : ""} data-option="showGrid" />
    </label>
    <label class="option-row option-row--toggle">
      <span>Battlefield Name Tooltips</span>
      <input type="checkbox" ${options.battlefieldNameTooltips !== false ? "checked" : ""} data-option="battlefieldNameTooltips" />
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
    <label class="option-row option-row--range">
      <span>Music Volume <strong>${musicVolumePercent}%</strong></span>
      <input type="range" min="0" max="1" step="0.01" value="${musicVolume}" data-option="musicVolume" />
    </label>
    <label class="option-row option-row--range">
      <span>SFX Volume <strong>${sfxVolumePercent}%</strong></span>
      <input type="range" min="0" max="1" step="0.01" value="${sfxVolume}" data-option="sfxVolume" />
    </label>
    <label class="option-row option-row--toggle">
      <span>Mute Audio</span>
      <input type="checkbox" ${options.muted ? "checked" : ""} data-option="muted" />
    </label>
  `;
}
