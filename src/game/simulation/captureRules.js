import { BATTLE_MODES, BUILDING_KEYS, UNIT_TAGS } from "../core/constants.js";
import { describeBuilding } from "../content/buildings.js";
import { appendLog } from "./battleLog.js";

export function canCaptureBuilding(unit, building) {
  return Boolean(
    unit &&
    building &&
    unit.family === UNIT_TAGS.INFANTRY &&
    !["medic", "mechanic"].includes(unit.unitTypeId) &&
    building.owner !== unit.owner &&
    building.canCapture !== false
  );
}

export function captureBuildingForUnit(state, unit, building) {
  const previousOwner = building.owner;
  building.owner = unit.owner;
  if (
    state.mode !== BATTLE_MODES.RUN &&
    state.mode !== BATTLE_MODES.TUTORIAL &&
    previousOwner !== unit.owner &&
    building.type === BUILDING_KEYS.SECTOR
  ) {
    state[unit.owner].funds += 100;
    appendLog(state, `${unit.name} secured immediate sector funds (+100).`);
  }
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(state, `${unit.name} captured ${describeBuilding(building).name}.`);
}
