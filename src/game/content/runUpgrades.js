import { UNIT_TAGS } from "../core/constants.js";
import { pickWeighted, stringToSeed } from "../core/random.js";
import {
  RUN_UPGRADE_CARD_DEFINITIONS,
  RUN_UPGRADE_DRAW_TUNING,
  RUN_UPGRADE_EFFECT_VALUES,
  RUN_UPGRADE_GEAR_DEFAULTS,
  RUN_UPGRADE_RARITIES,
  RUN_UPGRADE_RARITY_ASSETS,
  RUN_UPGRADE_RARITY_LABELS,
  RUN_UPGRADE_RARITY_ORDER,
  RUN_UPGRADE_SCHEDULE
} from "./runUpgradeConstants.js";

export {
  RUN_UPGRADE_DRAW_TUNING,
  RUN_UPGRADE_EFFECT_VALUES,
  RUN_UPGRADE_RARITIES,
  RUN_UPGRADE_RARITY_ASSETS,
  RUN_UPGRADE_RARITY_LABELS,
  RUN_UPGRADE_RARITY_ORDER
};

export const RUN_CARD_TYPES = {
  PASSIVE: "passive",
  GEAR: "gear",
  UNIT: "unit"
};

export const RUN_UPGRADES = RUN_UPGRADE_CARD_DEFINITIONS.map((definition) => ({
  weight: 1,
  unlockCost: 80,
  repeatable: false,
  type: RUN_CARD_TYPES.PASSIVE,
  ...definition,
  values: {
    ...(RUN_UPGRADE_EFFECT_VALUES[definition.id] ?? {})
  }
}));

const RUN_UPGRADES_BY_ID = new Map(RUN_UPGRADES.map((upgrade) => [upgrade.id, upgrade]));

function uniqueIds(ids = []) {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

export function getRunUpgradeById(upgradeId) {
  return RUN_UPGRADES_BY_ID.get(upgradeId) ?? null;
}

export function isGearUpgrade(upgrade) {
  return (typeof upgrade === "string" ? getRunUpgradeById(upgrade) : upgrade)?.type === RUN_CARD_TYPES.GEAR;
}

export function isUnitReward(reward) {
  return reward?.type === RUN_CARD_TYPES.UNIT;
}

export function isHiddenRunUpgrade(upgrade) {
  return Boolean((typeof upgrade === "string" ? getRunUpgradeById(upgrade) : upgrade)?.hidden);
}

export function canUnitEquipRunUpgrade(unit, upgrade) {
  const resolvedUpgrade = typeof upgrade === "string" ? getRunUpgradeById(upgrade) : upgrade;

  if (!unit || !resolvedUpgrade || !isGearUpgrade(resolvedUpgrade)) {
    return false;
  }

  return !resolvedUpgrade.eligibleFamily || unit.family === resolvedUpgrade.eligibleFamily;
}

export function createInitialGearState(gearSlot = null) {
  if (gearSlot === "gear-aa-kit") {
    return {
      aaKitAmmo: RUN_UPGRADE_GEAR_DEFAULTS["gear-aa-kit"].ammoPerMap
    };
  }

  return {};
}

export function getGearBadgeLabel(gearSlot = null) {
  return RUN_UPGRADE_GEAR_DEFAULTS[gearSlot]?.badgeLabel ?? null;
}

export function getRunRewardTypeForMap(mapNumber) {
  return RUN_UPGRADE_SCHEDULE[mapNumber] ?? null;
}

export function getRunUpgradeValue(upgradeId, key, fallback = 0) {
  const value = getRunUpgradeById(upgradeId)?.values?.[key];
  return value ?? fallback;
}

export function getRarityWeightsForStage(stage = 1) {
  const safeStage = Math.max(1, Number(stage) || 1);
  return {
    ...RUN_UPGRADE_DRAW_TUNING.stageRarityWeights.find((entry) => safeStage <= entry.maxStage)?.weights
  };
}

export function getOwnedRunCardIds(runStateOrIds = null) {
  if (Array.isArray(runStateOrIds)) {
    return uniqueIds(runStateOrIds);
  }

  const runState = runStateOrIds ?? {};
  const explicitIds = runState.ownedRunCardIds ?? runState.runCards?.ownedCardIds;

  if (explicitIds?.length) {
    return uniqueIds(explicitIds);
  }

  return uniqueIds((runState.selectedRewards ?? []).map((reward) => reward.id));
}

export function normalizeOwnedRunCardIds(runStateOrIds = null) {
  return getOwnedRunCardIds(runStateOrIds).filter((id) => Boolean(getRunUpgradeById(id)));
}

export function getEquippedRunGearIdsFromUnits(units = []) {
  return uniqueIds(units.map((unit) => unit?.gear?.slot).filter(Boolean));
}

export function getEffectiveRunUpgrades(upgradeIds = []) {
  const selected = new Map();

  for (const id of uniqueIds(upgradeIds)) {
    const upgrade = getRunUpgradeById(id);

    if (!upgrade) {
      continue;
    }

    const group = upgrade.evolutionGroup ?? upgrade.id;
    const current = selected.get(group);

    if (!current || (upgrade.tier ?? 1) >= (current.tier ?? 1)) {
      selected.set(group, upgrade);
    }
  }

  return [...selected.values()];
}

export function getEffectiveRunUpgradeIds(upgradeIds = []) {
  return getEffectiveRunUpgrades(upgradeIds).map((upgrade) => upgrade.id);
}

export function getBattleRunCardIds(state) {
  return normalizeOwnedRunCardIds(state?.runCards?.ownedCardIds ?? state?.runCards ?? []);
}

export function getBattleEffectiveRunUpgrades(state) {
  return getEffectiveRunUpgrades(getBattleRunCardIds(state));
}

export function hasEffectiveRunUpgrade(state, upgradeId) {
  return getBattleEffectiveRunUpgrades(state).some((upgrade) => upgrade.id === upgradeId);
}

export function getRunUpgradeRarityAsset(upgrade) {
  const resolvedUpgrade = typeof upgrade === "string" ? getRunUpgradeById(upgrade) : upgrade;
  return RUN_UPGRADE_RARITY_ASSETS[resolvedUpgrade?.rarity] ?? RUN_UPGRADE_RARITY_ASSETS.common;
}

function ownsRequiredEvolutionCard(upgrade, ownedCardIds) {
  if (!upgrade.requiresCardId) {
    return true;
  }

  return ownedCardIds.has(upgrade.requiresCardId);
}

function isOwnedHigherOrEqualTier(upgrade, ownedCardIds) {
  if (!upgrade.evolutionGroup) {
    return ownedCardIds.has(upgrade.id);
  }

  return RUN_UPGRADES.some(
    (candidate) =>
      candidate.evolutionGroup === upgrade.evolutionGroup &&
      (candidate.tier ?? 1) >= (upgrade.tier ?? 1) &&
      ownedCardIds.has(candidate.id)
  );
}

export function getEligibleRunUpgrades(runState, options = {}) {
  const ownedCardIds = new Set(normalizeOwnedRunCardIds(runState));
  const includeHidden = options.includeHidden === true;
  const unlockedCardIds = new Set(
    (runState?.availableRunCardIds?.length
      ? runState.availableRunCardIds
      : RUN_UPGRADES
        .filter((upgrade) => includeHidden || !upgrade.hidden)
        .map((upgrade) => upgrade.id))
  );
  const includeGear = options.includeGear !== false;

  return RUN_UPGRADES.filter((upgrade) => {
    if (!unlockedCardIds.has(upgrade.id)) {
      return false;
    }

    if (!includeHidden && upgrade.hidden) {
      return false;
    }

    if (!includeGear && isGearUpgrade(upgrade)) {
      return false;
    }

    if (!upgrade.repeatable && isOwnedHigherOrEqualTier(upgrade, ownedCardIds)) {
      return false;
    }

    return ownsRequiredEvolutionCard(upgrade, ownedCardIds);
  });
}

function getDrawWeightForUpgrade(upgrade, runState, stage) {
  const rarityWeights = getRarityWeightsForStage(stage);
  const rarityWeight = rarityWeights[upgrade.rarity] ?? 0;
  const baseWeight = Math.max(1, Number(upgrade.weight) || 1);
  const ownedCardIds = new Set(normalizeOwnedRunCardIds(runState));
  const evolutionWeight =
    upgrade.requiresCardId && ownedCardIds.has(upgrade.requiresCardId)
      ? RUN_UPGRADE_DRAW_TUNING.evolutionBonusWeight
      : 1;

  return rarityWeight * baseWeight * evolutionWeight;
}

export function drawRunUpgradeChoices(runState, stage, seedSource, options = {}) {
  const choiceCount = options.choiceCount ?? RUN_UPGRADE_DRAW_TUNING.choicesPerReward;
  let candidates = getEligibleRunUpgrades(runState, options);
  const choices = [];
  let seed = typeof seedSource === "number" ? seedSource : stringToSeed(String(seedSource ?? "run-upgrades"));

  while (choices.length < choiceCount && candidates.length > 0) {
    const weightedCandidates = candidates.map((upgrade) => ({
      value: upgrade,
      weight: getDrawWeightForUpgrade(upgrade, runState, stage)
    }));
    const picked = pickWeighted(seed, weightedCandidates);
    seed = picked.seed;

    if (!picked.value) {
      break;
    }

    choices.push(picked.value);
    candidates = candidates.filter((upgrade) => upgrade.id !== picked.value.id);
  }

  return {
    seed,
    choices
  };
}

export function drawImmediateRunCards(runState, stage, seedSource, count = 2) {
  const ownedRunCardIds = normalizeOwnedRunCardIds(runState);
  const choices = [];
  let seed = typeof seedSource === "number" ? seedSource : stringToSeed(String(seedSource ?? "run-upgrades"));

  while (choices.length < count) {
    const result = drawRunUpgradeChoices(
      {
        ...runState,
        ownedRunCardIds
      },
      stage,
      seed,
      {
        choiceCount: 1,
        includeGear: false
      }
    );
    seed = result.seed;
    const picked = result.choices[0];

    if (!picked) {
      break;
    }

    ownedRunCardIds.push(picked.id);

    if (picked.id === "lottery-ticket") {
      continue;
    }

    choices.push(picked);
  }

  return {
    seed,
    choices
  };
}

export const UNIT_UNLOCK_TIERS = [
  { tier: 0, unitIds: ["grunt", "breaker", "runner", "skyguard", "gunship"] },
  { tier: 1, unitIds: ["longshot", "medic", "bruiser"], unlockCost: 120 },
  { tier: 2, unitIds: ["mechanic", "siege-gun", "interceptor"], unlockCost: 260 },
  { tier: 3, unitIds: ["juggernaut", "payload"], unlockCost: 480 }
];

export function getDefaultUnlockedRunCardIds() {
  return RUN_UPGRADES.filter((upgrade) => !upgrade.hidden).map((upgrade) => upgrade.id);
}

export function getGearFamilyLabel(upgrade) {
  const resolvedUpgrade = typeof upgrade === "string" ? getRunUpgradeById(upgrade) : upgrade;

  if (!resolvedUpgrade?.eligibleFamily) {
    return "Any Unit";
  }

  return resolvedUpgrade.eligibleFamily === UNIT_TAGS.INFANTRY
    ? "Infantry"
    : resolvedUpgrade.eligibleFamily;
}
