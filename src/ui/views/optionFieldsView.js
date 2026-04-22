export function renderOptionFields(options = {}) {
  const masterVolume = Number.isFinite(Number(options.masterVolume))
    ? Math.max(0, Math.min(1, Number(options.masterVolume)))
    : 0.4;
  const masterVolumePercent = Math.round(masterVolume * 100);

  return `
    <label class="option-row option-row--toggle">
      <span>Show Grid Highlights</span>
      <input type="checkbox" ${options.showGrid ? "checked" : ""} data-option="showGrid" />
    </label>
    <label class="option-row option-row--toggle">
      <span>Allow Screen Shake</span>
      <input type="checkbox" ${options.screenShake ? "checked" : ""} data-option="screenShake" />
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
