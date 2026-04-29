import { DEFAULT_SAVE_VERSION, PROTOTYPE_RUN_GOAL, SLOT_IDS } from "../core/constants.js";
import { DEFAULT_UNLOCKED_COMMANDER_IDS } from "../content/commanders.js";
import { RUN_UPGRADES, UNIT_UNLOCK_TIERS } from "../content/runUpgrades.js";

function createDefaultOptions() {
  return {
    showGrid: true,
    screenShake: true,
    masterVolume: 0.4,
    muted: false
  };
}

export function createDefaultMetaState() {
  return {
    version: DEFAULT_SAVE_VERSION,
    unlockedCommanderIds: [...DEFAULT_UNLOCKED_COMMANDER_IDS],
    options: createDefaultOptions(),
    highestClearGoal: PROTOTYPE_RUN_GOAL,
    lastPlayedSlotId: null,
    latestClearTurnCount: null,
    bestClearTurnCount: null,
    metaCurrency: 0,
    unlockedUnitIds: [...UNIT_UNLOCK_TIERS[0].unitIds],
    unlockedRunCardIds: RUN_UPGRADES.map((entry) => entry.id)
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
