import {
  getUnitColorDefinition,
  normalizeUnitColorOptions
} from "../game/core/unitColors.js";

export function getUnitColorCssVariables(options = {}) {
  const normalized = normalizeUnitColorOptions(options);

  return {
    "--player-color": getUnitColorDefinition(normalized.playerColor).hex,
    "--enemy-color": getUnitColorDefinition(normalized.enemyColor).hex
  };
}

export function applyUnitColorTheme(target, options = {}) {
  if (!target?.style) {
    return;
  }

  for (const [property, value] of Object.entries(getUnitColorCssVariables(options))) {
    target.style.setProperty(property, value);
  }
}
