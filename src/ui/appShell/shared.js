export function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function normalizeLoopedIndex(index, count) {
  if (count <= 0) {
    return 0;
  }

  return ((index % count) + count) % count;
}

export function getVisibleLoopedIndices(startIndex, visibleCount, count) {
  return Array.from({ length: visibleCount }, (_, offset) =>
    normalizeLoopedIndex(startIndex + offset, count)
  );
}

export const DEBUG_SPAWN_STAT_DATASETS = [
  ["spawn-attack", "statAttack"],
  ["spawn-armor", "statArmor"],
  ["spawn-max-health", "statMaxHealth"],
  ["spawn-movement", "statMovement"],
  ["spawn-min-range", "statMinRange"],
  ["spawn-max-range", "statMaxRange"],
  ["spawn-max-stamina", "statMaxStamina"],
  ["spawn-max-ammo", "statMaxAmmo"],
  ["spawn-luck", "statLuck"]
];

const COMMANDER_SWIPE_THRESHOLD_PX = 44;
const COMMANDER_SWIPE_DIRECTION_RATIO = 1.2;

export const GAMEPAD_BUTTONS = {
  A: 0,
  B: 1,
  Y: 3,
  LB: 4,
  RB: 5,
  START: 9
};

export const GAMEPAD_REPEAT_INITIAL_MS = 220;
export const GAMEPAD_REPEAT_MS = 120;
export const GAMEPAD_AXIS_THRESHOLD = 0.5;
export const BATTLE_HP_METER_ANIMATION_MS = 380;

export function shouldTriggerCommanderSwipe(deltaX, deltaY) {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  return (
    horizontalDistance >= COMMANDER_SWIPE_THRESHOLD_PX &&
    horizontalDistance > verticalDistance * COMMANDER_SWIPE_DIRECTION_RATIO
  );
}
