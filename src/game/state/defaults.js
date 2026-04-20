import {
  DEFAULT_SAVE_VERSION,
  PROTOTYPE_RUN_GOAL,
  SLOT_IDS
} from "../core/constants.js";
import { DEFAULT_UNLOCKED_COMMANDER_IDS } from "../content/commanders.js";

export function createDefaultOptions() {
  return {
    masterVolume: 70,
    showGrid: true,
    screenShake: true
  };
}

export function createDefaultMetaState() {
  return {
    version: DEFAULT_SAVE_VERSION,
    unlockedCommanderIds: [...DEFAULT_UNLOCKED_COMMANDER_IDS],
    options: createDefaultOptions(),
    highestClearGoal: PROTOTYPE_RUN_GOAL,
    lastPlayedSlotId: null
  };
}

export function createEmptySlotSummaries() {
  return SLOT_IDS.map((slotId) => ({
    slotId,
    exists: false,
    updatedAt: null,
    summary: null
  }));
}

