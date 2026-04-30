import { BUILDING_RECRUITMENT } from "./unitCatalog.js";
import { BUILDING_INCOME, BUILDING_KEYS } from "../core/constants.js";

const BUILDING_LIBRARY = {
  [BUILDING_KEYS.COMMAND]: {
    name: "Command Post",
    shortLabel: "HQ",
    summary: "Primary headquarters. Grants extra income and restores ammo and stamina each turn.",
    canRecruit: false
  },
  [BUILDING_KEYS.BARRACKS]: {
    name: "Barracks",
    shortLabel: "INF",
    summary: "Deploys infantry units.",
    canRecruit: true
  },
  [BUILDING_KEYS.MOTOR_POOL]: {
    name: "Motor Pool",
    shortLabel: "ARM",
    summary: "Deploys vehicle units.",
    canRecruit: true
  },
  [BUILDING_KEYS.AIRFIELD]: {
    name: "Airfield",
    shortLabel: "AIR",
    summary: "Deploys air units.",
    canRecruit: true
  },
  [BUILDING_KEYS.SECTOR]: {
    name: "Sector Node",
    shortLabel: "SEC",
    summary: "Income site that slowly heals and resupplies units while held.",
    canRecruit: false
  },
  [BUILDING_KEYS.HOSPITAL]: {
    name: "Hospital",
    shortLabel: "MED",
    summary: "One-time instant infantry restoration on capture. Resets when lost.",
    canRecruit: false
  },
  [BUILDING_KEYS.REPAIR_STATION]: {
    name: "Repair Station",
    shortLabel: "REP",
    summary: "One-time vehicle restoration while held. Resets when captured by the enemy.",
    canRecruit: false
  }
};

function titleCaseOwner(owner) {
  if (!owner) {
    return "Neutral";
  }

  return owner.charAt(0).toUpperCase() + owner.slice(1);
}

export function getBuildingTypeMetadata(buildingTypeId) {
  const definition = BUILDING_LIBRARY[buildingTypeId];

  if (!definition) {
    return {
      id: buildingTypeId,
      name: buildingTypeId,
      shortLabel: buildingTypeId.slice(0, 3).toUpperCase(),
      summary: "Unknown structure.",
      canRecruit: false,
      income: 0,
      recruitmentFamilies: []
    };
  }

  return {
    id: buildingTypeId,
    ...definition,
    income: BUILDING_INCOME[buildingTypeId] ?? 0,
    recruitmentFamilies: [...(BUILDING_RECRUITMENT[buildingTypeId] ?? [])]
  };
}

export function describeBuilding(building) {
  const metadata = getBuildingTypeMetadata(building.type);

  return {
    id: building.id,
    owner: building.owner,
    ownerLabel: titleCaseOwner(building.owner),
    type: building.type,
    ...metadata
  };
}
