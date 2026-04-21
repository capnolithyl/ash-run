import { DEFAULT_SAVE_VERSION, SLOT_IDS } from "../core/constants.js";
import { DEFAULT_UNLOCKED_COMMANDER_IDS } from "../content/commanders.js";

function createDefaultOptions() {
  return {
    showGrid: true,
    screenShake: true
  };
}

export function createDefaultMetaState() {
  return {
    version: DEFAULT_SAVE_VERSION,
    unlockedCommanderIds: [...DEFAULT_UNLOCKED_COMMANDER_IDS],
    options: createDefaultOptions(),
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
    lastPlayedSlotId: null
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
    highestClearGoal: PROTOTYPE_RUN_GOAL,
    lastPlayedSlotId: null,
    latestClearTurnCount: null,
    bestClearTurnCount: null
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
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
