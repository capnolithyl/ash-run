export const VISUAL_EFFECTS_QUALITY = Object.freeze({
  OFF: "off",
  LOW: "low",
  FULL: "full"
});

export const VISUAL_EFFECTS_QUALITY_VALUES = Object.freeze([
  VISUAL_EFFECTS_QUALITY.OFF,
  VISUAL_EFFECTS_QUALITY.LOW,
  VISUAL_EFFECTS_QUALITY.FULL
]);

export const DEFAULT_VISUAL_EFFECTS_QUALITY = VISUAL_EFFECTS_QUALITY.LOW;

export function normalizeVisualEffectsQuality(value) {
  if (typeof value !== "string") {
    return DEFAULT_VISUAL_EFFECTS_QUALITY;
  }

  const normalizedValue = value.trim().toLowerCase();

  return VISUAL_EFFECTS_QUALITY_VALUES.includes(normalizedValue)
    ? normalizedValue
    : DEFAULT_VISUAL_EFFECTS_QUALITY;
}

export function normalizeMetaOptions(options = {}) {
  return {
    ...options,
    visualEffectsQuality: normalizeVisualEffectsQuality(options.visualEffectsQuality)
  };
}

export function coerceOptionInputValue(optionKey, input) {
  if (!input) {
    return null;
  }

  if (input.type === "checkbox") {
    return input.checked;
  }

  if (optionKey === "visualEffectsQuality") {
    return normalizeVisualEffectsQuality(input.value);
  }

  return Number(input.value);
}
