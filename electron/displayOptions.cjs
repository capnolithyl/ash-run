const DISPLAY_MODES = Object.freeze({
  WINDOWED: "windowed",
  FULLSCREEN: "fullscreen",
  BORDERLESS: "borderless"
});

const DISPLAY_RESOLUTION_PRESETS = Object.freeze([
  { id: "1280x720", width: 1280, height: 720, label: "1280 x 720" },
  { id: "1366x768", width: 1366, height: 768, label: "1366 x 768" },
  { id: "1440x900", width: 1440, height: 900, label: "1440 x 900" },
  { id: "1600x900", width: 1600, height: 900, label: "1600 x 900" },
  { id: "1920x1080", width: 1920, height: 1080, label: "1920 x 1080" },
  { id: "2560x1440", width: 2560, height: 1440, label: "2560 x 1440" }
]);

const DEFAULT_DISPLAY_MODE = DISPLAY_MODES.FULLSCREEN;
const DEFAULT_WINDOW_RESOLUTION = "1920x1080";

const DISPLAY_RESOLUTION_PRESET_BY_ID = new Map(
  DISPLAY_RESOLUTION_PRESETS.map((preset) => [preset.id, preset])
);

function isDisplayMode(value) {
  return Object.values(DISPLAY_MODES).includes(value);
}

function getDisplayResolutionPreset(id) {
  return DISPLAY_RESOLUTION_PRESET_BY_ID.get(id) ?? null;
}

function normalizeDisplayOptions(options = {}) {
  const displayMode = isDisplayMode(options.displayMode)
    ? options.displayMode
    : DEFAULT_DISPLAY_MODE;
  const windowResolution = getDisplayResolutionPreset(options.windowResolution)
    ? options.windowResolution
    : DEFAULT_WINDOW_RESOLUTION;

  return {
    displayMode,
    windowResolution
  };
}

function getDisplayPresetAvailability(workArea = {}) {
  const width = Number.isFinite(Number(workArea.width)) ? Number(workArea.width) : Infinity;
  const height = Number.isFinite(Number(workArea.height)) ? Number(workArea.height) : Infinity;

  return DISPLAY_RESOLUTION_PRESETS.map((preset) => ({
    ...preset,
    available: preset.width <= width && preset.height <= height,
    windowedAvailable: preset.width <= width && preset.height <= height,
    nativeAvailable: preset.width <= width && preset.height <= height
  }));
}

function resolveWindowResolutionForWorkArea(resolutionId, workArea = {}) {
  const availablePresets = getDisplayPresetAvailability(workArea).filter(
    (preset) => preset.available
  );
  const requestedPreset = availablePresets.find((preset) => preset.id === resolutionId);

  return (
    requestedPreset ??
    availablePresets.at(-1) ??
    getDisplayResolutionPreset("1280x720") ??
    getDisplayResolutionPreset(DEFAULT_WINDOW_RESOLUTION)
  );
}

function getClosestDisplayResolutionPreset(bounds = {}) {
  const width = Number.isFinite(Number(bounds.width)) ? Number(bounds.width) : Infinity;
  const height = Number.isFinite(Number(bounds.height)) ? Number(bounds.height) : Infinity;
  const availablePresets = DISPLAY_RESOLUTION_PRESETS.filter(
    (preset) => preset.width <= width && preset.height <= height
  );

  return (
    availablePresets.at(-1) ??
    getDisplayResolutionPreset("1280x720") ??
    getDisplayResolutionPreset(DEFAULT_WINDOW_RESOLUTION)
  );
}

function resolveDisplayResolutionForBounds(resolutionId, bounds = {}) {
  const requestedPreset = getDisplayResolutionPreset(resolutionId);
  const closestPreset = getClosestDisplayResolutionPreset(bounds);

  if (!requestedPreset) {
    return closestPreset;
  }

  const width = Number.isFinite(Number(bounds.width)) ? Number(bounds.width) : Infinity;
  const height = Number.isFinite(Number(bounds.height)) ? Number(bounds.height) : Infinity;

  return requestedPreset.width <= width && requestedPreset.height <= height
    ? requestedPreset
    : closestPreset;
}

module.exports = {
  DEFAULT_DISPLAY_MODE,
  DEFAULT_WINDOW_RESOLUTION,
  DISPLAY_MODES,
  DISPLAY_RESOLUTION_PRESETS,
  getClosestDisplayResolutionPreset,
  getDisplayPresetAvailability,
  getDisplayResolutionPreset,
  normalizeDisplayOptions,
  resolveDisplayResolutionForBounds,
  resolveWindowResolutionForWorkArea
};
