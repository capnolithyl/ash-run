import { TERRAIN_KEYS, UNIT_TAGS } from "../core/constants.js";

/**
 * Terrain metadata drives both rendering and movement costs.
 */
export const TERRAIN_LIBRARY = {
  [TERRAIN_KEYS.PLAIN]: {
    label: "Plain",
    color: "#24193c",
    border: "#8f58ff",
    armorBonus: 1,
    moveCost: 1,
    vehicleMoveCost: 1,
    blocksGround: false,
    blockedFamilies: []
  },
  [TERRAIN_KEYS.ROAD]: {
    label: "Road",
    color: "#5f3452",
    border: "#ff9e4d",
    armorBonus: 0,
    moveCost: 1,
    vehicleMoveCost: 1,
    blocksGround: false,
    blockedFamilies: []
  },
  [TERRAIN_KEYS.FOREST]: {
    label: "Forest",
    color: "#1b2c4a",
    border: "#ff4fd8",
    armorBonus: 2,
    moveCost: 2,
    vehicleMoveCost: 3,
    blocksGround: false,
    blockedFamilies: []
  },
  [TERRAIN_KEYS.MOUNTAIN]: {
    label: "Mountain",
    color: "#3f2f4c",
    border: "#e1b6ff",
    armorBonus: 4,
    moveCost: 2,
    vehicleMoveCost: 99,
    blocksGround: false,
    blockedFamilies: [UNIT_TAGS.VEHICLE]
  },
  [TERRAIN_KEYS.WATER]: {
    label: "Water",
    color: "#1a225f",
    border: "#ff7cf1",
    armorBonus: 0,
    moveCost: 99,
    vehicleMoveCost: 99,
    blocksGround: true,
    blockedFamilies: [UNIT_TAGS.INFANTRY, UNIT_TAGS.VEHICLE]
  },
  [TERRAIN_KEYS.RIDGE]: {
    label: "Ridge",
    color: "#4b224e",
    border: "#ff6f78",
    armorBonus: 0,
    moveCost: 99,
    vehicleMoveCost: 99,
    blocksGround: true,
    blockedFamilies: [UNIT_TAGS.INFANTRY, UNIT_TAGS.VEHICLE]
  }
};

export const MAP_THEME_PALETTES = {
  ash: {
    background: "#0a0618",
    accent: "#ff8a3d",
    gridGlow: "#5625a9"
  },
  dusk: {
    background: "#120821",
    accent: "#ff4fd8",
    gridGlow: "#7b2cff"
  },
  storm: {
    background: "#0d0c29",
    accent: "#ff6d8c",
    gridGlow: "#4238c7"
  },
  frost: {
    background: "#12092b",
    accent: "#ffb34d",
    gridGlow: "#6b46ff"
  }
};
