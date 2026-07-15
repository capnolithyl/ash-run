import { TURN_SIDES } from "./constants.js";
import { GENERATED_UNIT_COLOR_IDS } from "./generated/unitColorIds.js";

export const UNIT_COLOR_IDS = [...GENERATED_UNIT_COLOR_IDS];

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
  if (!isUnitColorId(colorId)) {
    return null;
  }

  if (UNIT_COLOR_DEFINITIONS[colorId]) {
    return UNIT_COLOR_DEFINITIONS[colorId];
  }

  const hash = Array.from(colorId).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    17
  );
  const hue = hash % 360;
  const saturation = 0.82;
  const lightness = 0.66;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [redBase, greenBase, blueBase] =
    segment < 1 ? [chroma, secondary, 0] :
      segment < 2 ? [secondary, chroma, 0] :
        segment < 3 ? [0, chroma, secondary] :
          segment < 4 ? [0, secondary, chroma] :
            segment < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  const channels = [redBase, greenBase, blueBase].map((channel) =>
    Math.round((channel + match) * 255)
  );
  const color = (channels[0] << 16) | (channels[1] << 8) | channels[2];
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  return {
    id: colorId,
    label: colorId
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
      .join(" "),
    hex,
    color
  };
}

export function getUnitColorDefinitionForOwner(owner, options = {}) {
  return getUnitColorDefinition(getUnitColorIdForOwner(owner, options));
}
