import { UNIT_TAGS } from "../core/constants.js";

export const RUN_CARD_TYPES = {
  PASSIVE: "passive",
  GEAR: "gear",
  UNIT: "unit"
};

export const GEAR_DEFAULTS = {
  "gear-aa-kit": {
    ammoPerMap: 6,
    badgeLabel: "AA"
  },
  "gear-field-meds": {
    badgeLabel: "MED"
  }
};

const RUN_UPGRADE_SCHEDULE = {
  2: RUN_CARD_TYPES.UNIT,
  4: RUN_CARD_TYPES.UNIT,
  6: RUN_CARD_TYPES.UNIT,
  8: RUN_CARD_TYPES.UNIT
};

export const RUN_UPGRADES = [
  { id: "passive-drill", type: RUN_CARD_TYPES.PASSIVE, name: "Drill Doctrine", summary: "+1 movement to all infantry." },
  { id: "passive-plating", type: RUN_CARD_TYPES.PASSIVE, name: "Reactive Plating", summary: "+1 armor to all vehicles." },
  {
    id: "gear-aa-kit",
    type: RUN_CARD_TYPES.GEAR,
    name: "AA Kit",
    repeatable: true,
    eligibleFamily: UNIT_TAGS.INFANTRY,
    summary: "Equip one infantry unit to attack and counter aircraft. Starts each map with 6 ammo.",
    detailLines: [
      "Can attack and counter aircraft.",
      "Deals reduced damage to air targets.",
      "Uses 6 dedicated AA shots each map."
    ]
  },
  {
    id: "gear-field-meds",
    type: RUN_CARD_TYPES.GEAR,
    name: "Field Medpack",
    repeatable: true,
    eligibleFamily: UNIT_TAGS.INFANTRY,
    summary: "Equip one infantry unit with a one-use medpack. Heals self or an adjacent infantry ally.",
    detailLines: [
      "One use per map.",
      "Heals 33% max HP, rounded up.",
      "Can target self or an adjacent infantry ally."
    ]
  }
];

export function getRunUpgradeById(upgradeId) {
  return RUN_UPGRADES.find((upgrade) => upgrade.id === upgradeId) ?? null;
}

export function isGearUpgrade(upgrade) {
  return (typeof upgrade === "string" ? getRunUpgradeById(upgrade) : upgrade)?.type === RUN_CARD_TYPES.GEAR;
}

export function canUnitEquipRunUpgrade(unit, upgrade) {
  const resolvedUpgrade = typeof upgrade === "string" ? getRunUpgradeById(upgrade) : upgrade;

  if (!unit || !resolvedUpgrade || !isGearUpgrade(resolvedUpgrade)) {
    return false;
  }

  return unit.family === resolvedUpgrade.eligibleFamily;
}

export function createInitialGearState(gearSlot = null) {
  if (gearSlot === "gear-aa-kit") {
    return {
      aaKitAmmo: GEAR_DEFAULTS["gear-aa-kit"].ammoPerMap
    };
  }

  return {};
}

export function getGearBadgeLabel(gearSlot = null) {
  return GEAR_DEFAULTS[gearSlot]?.badgeLabel ?? null;
}

export function getRunRewardTypeForMap(mapNumber) {
  return RUN_UPGRADE_SCHEDULE[mapNumber] ?? null;
}

export const UNIT_UNLOCK_TIERS = [
  { tier: 0, unitIds: ["grunt", "breaker", "runner", "skyguard", "gunship"] },
  { tier: 1, unitIds: ["longshot", "medic", "bruiser"], unlockCost: 120 },
  { tier: 2, unitIds: ["mechanic", "siege-gun", "interceptor"], unlockCost: 260 },
  { tier: 3, unitIds: ["juggernaut", "payload"], unlockCost: 480 }
];
