/**
 * Global prototype constants live here so scenes, UI, and simulation
 * all read from the same set of tuning knobs.
 */
export const SLOT_IDS = ["slot-1", "slot-2", "slot-3"];
export const PROTOTYPE_ROSTER_CAP = 10;
export const PROTOTYPE_RUN_GOAL = 10;
export const DEFAULT_SAVE_VERSION = 1;
export const PLAYER_STARTING_FUNDS = 900;
export const ENEMY_STARTING_FUNDS = 900;
export const COMMANDER_POWER_MAX = 100;

export const BUILDING_INCOME = {
  sector: 100,
  command: 200
};

export const SCREEN_IDS = {
  TITLE: "title",
  COMMANDER_SELECT: "commander-select",
  LOAD_SLOT: "load-slot",
  OPTIONS: "options",
  BATTLE: "battle"
};

export const TURN_SIDES = {
  PLAYER: "player",
  ENEMY: "enemy"
};

export const TERRAIN_KEYS = {
  PLAIN: "plain",
  ROAD: "road",
  FOREST: "forest",
  WATER: "water",
  RIDGE: "ridge"
};

export const BUILDING_KEYS = {
  COMMAND: "command",
  BARRACKS: "barracks",
  MOTOR_POOL: "motor-pool",
  AIRFIELD: "airfield",
  SECTOR: "sector"
};

export const UNIT_TAGS = {
  INFANTRY: "infantry",
  VEHICLE: "vehicle",
  AIR: "air"
};

