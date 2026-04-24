import { BUILDING_KEYS, UNIT_TAGS } from "../core/constants.js";
import { describeBuilding } from "../content/buildings.js";
import { appendLog } from "./battleLog.js";
import {
  hasBuildingBeenUsedByOwner,
  markBuildingServiceUsed,
  resetBuildingServiceUse,
  restoreUnitServiceResources
} from "./battleServicing.js";

export function canCaptureBuilding(unit, building) {
  return Boolean(
    unit &&
    building &&
    unit.family === UNIT_TAGS.INFANTRY &&
    !["medic", "mechanic"].includes(unit.unitTypeId) &&
    building.owner !== unit.owner
  );
}

export function captureBuildingForUnit(state, unit, building) {
  const previousOwner = building.owner;
  building.owner = unit.owner;
  if (previousOwner !== unit.owner && building.type === BUILDING_KEYS.SECTOR) {
    state[unit.owner].funds += 100;
    appendLog(state, `${unit.name} secured immediate sector funds (+100).`);
  }
  if (building.type === BUILDING_KEYS.HOSPITAL && unit.family === UNIT_TAGS.INFANTRY) {
    if (!hasBuildingBeenUsedByOwner(building, unit.owner)) {
      restoreUnitServiceResources(state, unit, { healToFull: true });
      markBuildingServiceUsed(building, unit.owner);
      appendLog(state, `${unit.name} was fully restored at the hospital.`);
    }
  } else if (building.type === BUILDING_KEYS.REPAIR_STATION) {
    if (previousOwner !== unit.owner) {
      resetBuildingServiceUse(building);
    }
  }
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(state, `${unit.name} captured ${describeBuilding(building).name}.`);
}
