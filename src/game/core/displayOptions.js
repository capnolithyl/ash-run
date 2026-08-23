export const DISPLAY_MODES = Object.freeze({
  WINDOWED: "windowed",
  FULLSCREEN: "fullscreen",
  BORDERLESS: "borderless"
});

export const DISPLAY_MODE_LABELS = Object.freeze({
  [DISPLAY_MODES.WINDOWED]: "Windowed",
  [DISPLAY_MODES.FULLSCREEN]: "Fullscreen",
  [DISPLAY_MODES.BORDERLESS]: "Borderless"
});

export const DISPLAY_RESOLUTION_PRESETS = Object.freeze([
  { id: "1280x720", width: 1280, height: 720, label: "1280 x 720" },
  { id: "1366x768", width: 1366, height: 768, label: "1366 x 768" },
  { id: "1440x900", width: 1440, height: 900, label: "1440 x 900" },
  { id: "1600x900", width: 1600, height: 900, label: "1600 x 900" },
  { id: "1920x1080", width: 1920, height: 1080, label: "1920 x 1080" },
  { id: "2560x1440", width: 2560, height: 1440, label: "2560 x 1440" }
]);

export const DEFAULT_DISPLAY_MODE = DISPLAY_MODES.FULLSCREEN;
export const DEFAULT_WINDOW_RESOLUTION = "1920x1080";
export const DISPLAY_PREVIEW_TIMEOUT_SECONDS = 12;

const DISPLAY_RESOLUTION_PRESET_BY_ID = new Map(
  DISPLAY_RESOLUTION_PRESETS.map((preset) => [preset.id, preset])
);

export function isDisplayMode(value) {
  return Object.values(DISPLAY_MODES).includes(value);
}

export function getDisplayResolutionPreset(id) {
  return DISPLAY_RESOLUTION_PRESET_BY_ID.get(id) ?? null;
}

export function normalizeDisplayOptions(options = {}) {
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

export function getDisplayResolutionLabel(id) {
  return getDisplayResolutionPreset(id)?.label ?? getDisplayResolutionPreset(DEFAULT_WINDOW_RESOLUTION).label;
}

export function getDisplayPresetAvailability(workArea = {}) {
  const width = Number.isFinite(Number(workArea.width)) ? Number(workArea.width) : Infinity;
  const height = Number.isFinite(Number(workArea.height)) ? Number(workArea.height) : Infinity;

  return DISPLAY_RESOLUTION_PRESETS.map((preset) => ({
    ...preset,
    available: preset.width <= width && preset.height <= height,
    windowedAvailable: preset.width <= width && preset.height <= height,
    nativeAvailable: preset.width <= width && preset.height <= height
  }));
}

export function resolveWindowResolutionForWorkArea(resolutionId, workArea = {}) {
  const availablePresets = getDisplayPresetAvailability(workArea).filter(
    (preset) => preset.available
  );
  const requestedPreset = availablePresets.find((preset) => preset.id === resolutionId);

  if (requestedPreset ?? availablePresets.at(-1)) {
    return requestedPreset ?? availablePresets.at(-1);
  }

  const fallback = getDisplayResolutionPreset("1280x720") ??
    getDisplayResolutionPreset(DEFAULT_WINDOW_RESOLUTION);
  return {
    ...fallback,
    width: Math.max(1, Math.round(Number(workArea.width) || fallback.width)),
    height: Math.max(1, Math.round(Number(workArea.height) || fallback.height)),
    constrainedToWorkArea: true
  };
}

export function getClampedWindowBoundsForWorkArea(size = {}, workArea = {}) {
  const workAreaX = Math.round(Number(workArea.x) || 0);
  const workAreaY = Math.round(Number(workArea.y) || 0);
  const workAreaWidth = Math.max(1, Math.round(Number(workArea.width) || 1));
  const workAreaHeight = Math.max(1, Math.round(Number(workArea.height) || 1));
  const width = Math.min(workAreaWidth, Math.max(1, Math.round(Number(size.width) || 1)));
  const height = Math.min(workAreaHeight, Math.max(1, Math.round(Number(size.height) || 1)));

  return {
    x: Math.round(workAreaX + (workAreaWidth - width) / 2),
    y: Math.round(workAreaY + (workAreaHeight - height) / 2),
    width,
    height
  };
}

export function getClosestDisplayResolutionPreset(bounds = {}) {
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

export function resolveDisplayResolutionForBounds(resolutionId, bounds = {}) {
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
