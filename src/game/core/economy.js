import { BUILDING_INCOME } from "./constants.js";

export function getBuildingIncomeForSide(buildings, side) {
  return buildings
    .filter((building) => building.owner === side)
    .reduce((sum, building) => sum + (BUILDING_INCOME[building.type] ?? 0), 0);
}
