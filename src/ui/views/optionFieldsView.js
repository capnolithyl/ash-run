export function renderOptionFields(options) {
  return `
    <label class="option-row">
      <span>Master Volume</span>
      <input
        type="range"
        min="0"
        max="100"
        value="${options.masterVolume}"
        data-option="masterVolume"
      />
    </label>
    <label class="option-row option-row--toggle">
      <span>Show Grid Highlights</span>
      <input type="checkbox" ${options.showGrid ? "checked" : ""} data-option="showGrid" />
    </label>
    <label class="option-row option-row--toggle">
      <span>Allow Screen Shake</span>
      <input type="checkbox" ${options.screenShake ? "checked" : ""} data-option="screenShake" />
    </label>
  `;
}
