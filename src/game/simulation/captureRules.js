import { UNIT_TAGS } from "../core/constants.js";
import { describeBuilding } from "../content/buildings.js";
import { appendLog } from "./battleLog.js";

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
  if (previousOwner !== unit.owner && building.type === "sector") {
    state[unit.owner].funds += 100;
    appendLog(state, `${unit.name} secured immediate sector funds (+100).`);
  }
  if (building.type === "hospital") {
    if (building.lastServiceOwner !== unit.owner) {
      unit.current.hp = unit.stats.maxHealth;
      unit.current.ammo = unit.stats.ammoMax;
      unit.current.stamina = unit.stats.staminaMax;
      building.lastServiceOwner = unit.owner;
      appendLog(state, `${unit.name} was fully restored at the hospital.`);
    }
  } else if (building.type === "repair-station") {
    if (previousOwner !== unit.owner) {
      building.lastServiceOwner = null;
    }
  }
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(state, `${unit.name} captured ${describeBuilding(building).name}.`);
}
