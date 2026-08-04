import { DEFAULT_SAVE_VERSION, PROTOTYPE_RUN_GOAL, SLOT_IDS } from "../core/constants.js";
import { createDefaultTutorialProgress } from "./tutorialProgress.js";
import { normalizeDisplayOptions } from "../core/displayOptions.js";
import { normalizeUnitColorOptions } from "../core/unitColors.js";
import { DEFAULT_UNLOCKED_COMMANDER_IDS } from "../content/commanders.js";
import {
  getDefaultUnlockedRunCardIds,
  getRunUpgradeById,
  UNIT_UNLOCK_TIERS
} from "../content/runUpgrades.js";

const DEFAULT_AUDIO_OPTIONS = Object.freeze({
  masterVolume: 0.45,
  musicVolume: 0.6,
  sfxVolume: 0.45,
  muted: false
});

function normalizeVolume(value, fallback) {
  if (value === null || value === "" || typeof value === "boolean") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

export function createDefaultOptions() {
  return {
    showGrid: true,
    screenShake: true,
    battlefieldNameTooltips: true,
    combatCutsceneAnimations: true,
    ...DEFAULT_AUDIO_OPTIONS,
    ...normalizeUnitColorOptions(),
    ...normalizeDisplayOptions()
  };
}

export function normalizeMetaOptions(options = {}) {
  return {
    ...createDefaultOptions(),
    ...options,
    masterVolume: normalizeVolume(
      options.masterVolume,
      DEFAULT_AUDIO_OPTIONS.masterVolume
    ),
    musicVolume: normalizeVolume(
      options.musicVolume,
      DEFAULT_AUDIO_OPTIONS.musicVolume
    ),
    sfxVolume: normalizeVolume(options.sfxVolume, DEFAULT_AUDIO_OPTIONS.sfxVolume),
    muted: options.muted === true,
    ...normalizeUnitColorOptions(options),
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
    unlockedRunCardIds: normalizeUnlockedRunCardIds(),
    tutorial: createDefaultTutorialProgress()
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
