/**
 * Global prototype constants live here so scenes, UI, and simulation
 * all read from the same set of tuning knobs.
 */
export const SLOT_IDS = ["slot-1", "slot-2", "slot-3"];
export const PROTOTYPE_ROSTER_CAP = 10;
export const PROTOTYPE_RUN_GOAL = 10;
export const DEFAULT_SAVE_VERSION = 1;
export const PLAYER_STARTING_FUNDS = 0;
export const ENEMY_STARTING_FUNDS = 0;
export const COMMANDER_POWER_MAX = 100;
// Keep the JS timing values aligned with the turn-banner CSS animation.
export const BATTLE_TURN_BANNER_DISPLAY_MS = 1100;
export const BATTLE_TURN_BANNER_SETTLE_MS = 1120;
// Movement timing is shared between Phaser tweens and the enemy turn queue.
export const BATTLE_MOVE_SEGMENT_DURATION_MS = 230;
export const BATTLE_MOVE_SETTLE_MS = 70;
export const BATTLE_ATTACK_STAGGER_MS = 380;
export const BATTLE_ATTACK_IMPACT_DELAY_MS = 140;
export const BATTLE_ATTACK_WINDOW_MS = 620;

export function getBattleMoveDuration(moveSegments = 0) {
  return Math.max(0, moveSegments) * BATTLE_MOVE_SEGMENT_DURATION_MS;
}

export const BUILDING_INCOME = {
  sector: 100,
  command: 100,
  barracks: 100,
  "motor-pool": 100,
  airfield: 100
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
  MOUNTAIN: "mountain",
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
