import { UNIT_TAGS } from "../core/constants.js";
import { describeBuilding } from "../content/buildings.js";
import { appendLog } from "./battleLog.js";

export function canCaptureBuilding(unit, building) {
  return Boolean(
    unit &&
    building &&
    unit.family === UNIT_TAGS.INFANTRY &&
    building.owner !== unit.owner
  );
}

export function captureBuildingForUnit(state, unit, building) {
  building.owner = unit.owner;
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(state, `${unit.name} captured ${describeBuilding(building).name}.`);
}
