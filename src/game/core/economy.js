import { BUILDING_INCOME } from "./constants.js";

export function getBuildingIncomeForSide(buildings, side, incomeByType = BUILDING_INCOME) {
  return buildings
    .filter((building) => building.owner === side)
    .reduce((sum, building) => sum + (incomeByType[building.type] ?? 0), 0);
}
