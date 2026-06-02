import { DEFAULT_SAVE_VERSION, PROTOTYPE_RUN_GOAL, SLOT_IDS } from "../core/constants.js";
import { normalizeDisplayOptions } from "../core/displayOptions.js";
import { DEFAULT_UNLOCKED_COMMANDER_IDS } from "../content/commanders.js";
import {
  getDefaultUnlockedRunCardIds,
  getRunUpgradeById,
  UNIT_UNLOCK_TIERS
} from "../content/runUpgrades.js";

export function createDefaultOptions() {
  return {
    showGrid: true,
    screenShake: true,
    combatCutsceneAnimations: true,
    masterVolume: 0.4,
    muted: false,
    ...normalizeDisplayOptions()
  };
}

export function normalizeMetaOptions(options = {}) {
  return {
    ...createDefaultOptions(),
    ...options,
    ...normalizeDisplayOptions(options)
  };
}

export function normalizeUnlockedRunCardIds(ids = []) {
  return [
    ...new Set([
      ...getDefaultUnlockedRunCardIds(),
      ...(Array.isArray(ids) ? ids : [])
    ])
  ].filter((id) => Boolean(getRunUpgradeById(id)));
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
    unlockedRunCardIds: normalizeUnlockedRunCardIds()
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
