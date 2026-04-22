import { BUILDING_KEYS, TURN_SIDES } from "../core/constants.js";
import { appendLog } from "./battleLog.js";
import { getBuildingAt, getLivingUnits } from "./selectors.js";

export function serviceUnitsOnSectors(state, side) {
  let servicedUnits = 0;
  let repairedVehicles = 0;

  for (const unit of getLivingUnits(state, side)) {
    if (unit.transport?.carriedByUnitId) {
      continue;
    }

    const building = getBuildingAt(state, unit.x, unit.y);

    if (!building || building.owner !== side) {
      continue;
    }

    if (building.type === BUILDING_KEYS.SECTOR) {
      const healAmount = Math.max(1, Math.ceil(unit.stats.maxHealth / 3));
      const previousHp = unit.current.hp;
      const previousAmmo = unit.current.ammo;
      const previousStamina = unit.current.stamina;

      unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + healAmount);
      unit.current.ammo = unit.stats.ammoMax;
      unit.current.stamina = unit.stats.staminaMax;

      if (
        unit.current.hp !== previousHp ||
        unit.current.ammo !== previousAmmo ||
        unit.current.stamina !== previousStamina
      ) {
        servicedUnits += 1;
      }
    }

    if (
      building.type === BUILDING_KEYS.REPAIR_STATION &&
      building.lastServiceOwner !== side &&
      unit.family === "vehicle"
    ) {
      unit.current.hp = unit.stats.maxHealth;
      unit.current.ammo = unit.stats.ammoMax;
      unit.current.stamina = unit.stats.staminaMax;
      building.lastServiceOwner = side;
      repairedVehicles += 1;
    }
  }

  if (servicedUnits > 0) {
    appendLog(
      state,
      `${side === TURN_SIDES.PLAYER ? "Allied" : "Enemy"} sector nodes serviced ${servicedUnits} unit${
        servicedUnits === 1 ? "" : "s"
      }.`
    );
  }

  if (repairedVehicles > 0) {
    appendLog(
      state,
      `${side === TURN_SIDES.PLAYER ? "Allied" : "Enemy"} repair stations restored ${repairedVehicles} vehicle${
        repairedVehicles === 1 ? "" : "s"
      }.`
    );
  }
}
