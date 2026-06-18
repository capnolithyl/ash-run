import { BUILDING_RECRUITMENT } from "./unitCatalog.js";
import {
  BUILDING_INCOME,
  BUILDING_KEYS,
  UNIT_TAGS,
} from "../core/constants.js";

export const BUILDING_SERVICE_PROFILES = {
  [BUILDING_KEYS.COMMAND]: {
    hpRatio: 0.25,
    ammoRatio: 0.5,
    staminaRatio: 0.5,
    unitFamily: null,
  },
  [BUILDING_KEYS.SECTOR]: {
    hpRatio: 0.1,
    ammoRatio: 0.25,
    staminaRatio: 0.25,
    unitFamily: null,
  },
  [BUILDING_KEYS.REPAIR_STATION]: {
    hpRatio: 1,
    ammoRatio: 1,
    staminaRatio: 1,
    unitFamily: UNIT_TAGS.VEHICLE,
  },
  [BUILDING_KEYS.HOSPITAL]: {
    hpRatio: 1,
    ammoRatio: 1,
    staminaRatio: 1,
    unitFamily: UNIT_TAGS.INFANTRY,
  },
};

function formatServicePercent(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

function buildServiceSummary(profile, { familyLabel = null } = {}) {
  if (!profile) {
    return null;
  }

  const hpLabel = formatServicePercent(profile.hpRatio);
  const ammoLabel = formatServicePercent(profile.ammoRatio);
  const staminaLabel = formatServicePercent(profile.staminaRatio);
  const familyPrefix = familyLabel ? `${familyLabel} ` : "";

  return `Owned ${familyPrefix}service site. Use Supply here to restore ${hpLabel} HP, ${ammoLabel} ammo, and ${staminaLabel} stamina.`;
}

const BUILDING_LIBRARY = {
  [BUILDING_KEYS.COMMAND]: {
    name: "Command Post",
    shortLabel: "HQ",
    summary: buildServiceSummary(
      BUILDING_SERVICE_PROFILES[BUILDING_KEYS.COMMAND],
    ),
    canRecruit: false,
  },
  [BUILDING_KEYS.BARRACKS]: {
    name: "Barracks",
    shortLabel: "INF",
    summary: "Deploys infantry units.",
    canRecruit: true,
  },
  [BUILDING_KEYS.MOTOR_POOL]: {
    name: "Motor Pool",
    shortLabel: "ARM",
    summary: "Deploys vehicle units.",
    canRecruit: true,
  },
  [BUILDING_KEYS.AIRFIELD]: {
    name: "Airfield",
    shortLabel: "AIR",
    summary: "Deploys air units.",
    canRecruit: true,
  },
  [BUILDING_KEYS.SECTOR]: {
    name: "Sector Node",
    shortLabel: "SEC",
    summary: buildServiceSummary(
      BUILDING_SERVICE_PROFILES[BUILDING_KEYS.SECTOR],
    ),
    canRecruit: false,
  },
  [BUILDING_KEYS.HOSPITAL]: {
    name: "Hospital",
    shortLabel: "MED",
    summary: buildServiceSummary(
      BUILDING_SERVICE_PROFILES[BUILDING_KEYS.HOSPITAL],
      {
        familyLabel: "infantry",
      },
    ),
    canRecruit: false,
  },
  [BUILDING_KEYS.REPAIR_STATION]: {
    name: "Repair Station",
    shortLabel: "REP",
    summary: buildServiceSummary(
      BUILDING_SERVICE_PROFILES[BUILDING_KEYS.REPAIR_STATION],
      {
        familyLabel: "vehicle",
      },
    ),
    canRecruit: false,
  },
};

export function getBuildingArmorBonusForType(buildingType) {
  if (buildingType === BUILDING_KEYS.COMMAND) {
    return 18;
  }

  if (
    buildingType === BUILDING_KEYS.BARRACKS ||
    buildingType === BUILDING_KEYS.MOTOR_POOL ||
    buildingType === BUILDING_KEYS.AIRFIELD ||
    buildingType === BUILDING_KEYS.SECTOR ||
    buildingType === BUILDING_KEYS.HOSPITAL ||
    buildingType === BUILDING_KEYS.REPAIR_STATION
  ) {
    return 13;
  }

  return 0;
}

function titleCaseOwner(owner) {
  if (!owner) {
    return "Neutral";
  }

  return owner.charAt(0).toUpperCase() + owner.slice(1);
}

export function getBuildingTypeMetadata(buildingTypeId) {
  const definition = BUILDING_LIBRARY[buildingTypeId];
  const serviceProfile = BUILDING_SERVICE_PROFILES[buildingTypeId] ?? null;

  if (!definition) {
    return {
      id: buildingTypeId,
      name: buildingTypeId,
      shortLabel: buildingTypeId.slice(0, 3).toUpperCase(),
      summary: "Unknown structure.",
      canRecruit: false,
      serviceProfile,
      income: 0,
      recruitmentFamilies: [],
    };
  }

  return {
    id: buildingTypeId,
    ...definition,
    serviceProfile: serviceProfile ? { ...serviceProfile } : null,
    income: BUILDING_INCOME[buildingTypeId] ?? 0,
    recruitmentFamilies: [...(BUILDING_RECRUITMENT[buildingTypeId] ?? [])],
  };
}

export function getBuildingServiceProfile(buildingTypeId) {
  const profile = BUILDING_SERVICE_PROFILES[buildingTypeId] ?? null;
  return profile ? { ...profile } : null;
}

export function describeBuilding(building) {
  const metadata = getBuildingTypeMetadata(building.type);

  return {
    id: building.id,
    owner: building.owner,
    ownerLabel: titleCaseOwner(building.owner),
    type: building.type,
    armorBonus: getBuildingArmorBonusForType(building.type),
    ...metadata,
  };
}
