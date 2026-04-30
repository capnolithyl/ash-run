export const RUN_CARD_TYPES = {
  PASSIVE: "passive",
  GEAR: "gear",
  UNIT: "unit"
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
  { id: "gear-aa-kit", type: RUN_CARD_TYPES.GEAR, name: "AA Kit", summary: "Infantry gear: can counter air with reduced damage.", unitIds: ["grunt", "breaker"] },
  { id: "gear-field-meds", type: RUN_CARD_TYPES.GEAR, name: "Field Medpack", summary: "Restore 3 HP at turn start once per map.", unitIds: ["medic", "grunt"] }
];

export function getRunRewardTypeForMap(mapNumber) {
  return RUN_UPGRADE_SCHEDULE[mapNumber] ?? null;
}

export const UNIT_UNLOCK_TIERS = [
  { tier: 0, unitIds: ["grunt", "breaker", "runner", "skyguard", "gunship"] },
  { tier: 1, unitIds: ["longshot", "medic", "bruiser"], unlockCost: 120 },
  { tier: 2, unitIds: ["mechanic", "siege-gun", "interceptor"], unlockCost: 260 },
  { tier: 3, unitIds: ["juggernaut", "payload"], unlockCost: 480 }
];
