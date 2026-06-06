import { TURN_SIDES } from "./constants.js";

export const UNIT_COLOR_IDS = ["purple", "blue", "green", "orange", "pink"];

export const DEFAULT_PLAYER_COLOR = "purple";
export const DEFAULT_ENEMY_COLOR = "blue";

export const UNIT_COLOR_DEFINITIONS = {
  purple: {
    id: "purple",
    label: "Purple",
    hex: "#b65cff",
    color: 0xb65cff
  },
  blue: {
    id: "blue",
    label: "Blue",
    hex: "#5db8ff",
    color: 0x5db8ff
  },
  green: {
    id: "green",
    label: "Green",
    hex: "#66ffbf",
    color: 0x66ffbf
  },
  orange: {
    id: "orange",
    label: "Orange",
    hex: "#ff8a3d",
    color: 0xff8a3d
  },
  pink: {
    id: "pink",
    label: "Pink",
    hex: "#ff4fd8",
    color: 0xff4fd8
  }
};

export function isUnitColorId(value) {
  return UNIT_COLOR_IDS.includes(value);
}

export function normalizeUnitColorOptions(options = {}) {
  const playerColor = isUnitColorId(options.playerColor)
    ? options.playerColor
    : DEFAULT_PLAYER_COLOR;
  let enemyColor = isUnitColorId(options.enemyColor)
    ? options.enemyColor
    : DEFAULT_ENEMY_COLOR;

  if (enemyColor === playerColor) {
    enemyColor = [
      DEFAULT_ENEMY_COLOR,
      DEFAULT_PLAYER_COLOR,
      ...UNIT_COLOR_IDS
    ].find((colorId) => colorId !== playerColor);
  }

  return {
    playerColor,
    enemyColor
  };
}

export function getUnitColorIdForOwner(owner, options = {}) {
  const normalized = normalizeUnitColorOptions(options);

  if (owner === TURN_SIDES.PLAYER) {
    return normalized.playerColor;
  }

  if (owner === TURN_SIDES.ENEMY) {
    return normalized.enemyColor;
  }

  return null;
}

export function getUnitColorDefinition(colorId) {
  return UNIT_COLOR_DEFINITIONS[colorId] ?? null;
}

export function getUnitColorDefinitionForOwner(owner, options = {}) {
  return getUnitColorDefinition(getUnitColorIdForOwner(owner, options));
}
