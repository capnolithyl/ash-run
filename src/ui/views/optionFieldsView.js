import {
  DEFAULT_VISUAL_EFFECTS_QUALITY,
  normalizeVisualEffectsQuality
} from "../../game/state/options.js";

export function renderOptionFields(options = {}) {
  const masterVolume = Number.isFinite(Number(options.masterVolume))
    ? Math.max(0, Math.min(1, Number(options.masterVolume)))
    : 0.4;
  const masterVolumePercent = Math.round(masterVolume * 100);
  const combatCutsceneAnimations = options.combatCutsceneAnimations !== false;
  const visualEffectsQuality = normalizeVisualEffectsQuality(
    options.visualEffectsQuality ?? DEFAULT_VISUAL_EFFECTS_QUALITY
  );

  return `
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
    <label class="option-row option-row--select">
      <span>Visual Effects</span>
      <select data-option="visualEffectsQuality" data-option-value-type="string" aria-label="Visual Effects Quality">
        <option value="off" ${visualEffectsQuality === "off" ? "selected" : ""}>Off</option>
        <option value="low" ${visualEffectsQuality === "low" ? "selected" : ""}>Low</option>
        <option value="full" ${visualEffectsQuality === "full" ? "selected" : ""}>Full</option>
      </select>
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
