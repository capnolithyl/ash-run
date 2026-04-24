import { BUILDING_KEYS, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { appendLog } from "./battleLog.js";
import { canReceiveService, resupplyUnitIfAllowed } from "./commanderEffects.js";
import { getBuildingAt, getLivingUnits } from "./selectors.js";

export function hasBuildingBeenUsedByOwner(building, owner) {
  return building?.lastServiceOwner === owner;
}

export function markBuildingServiceUsed(building, owner) {
  building.lastServiceOwner = owner;
}

export function resetBuildingServiceUse(building) {
  building.lastServiceOwner = null;
}

export function restoreUnitServiceResources(
  state,
  unit,
  { healAmount = 0, healToFull = false, resupply = true } = {}
) {
  const previousHp = unit.current.hp;
  const previousAmmo = unit.current.ammo;
  const previousStamina = unit.current.stamina;

  if (healToFull) {
    unit.current.hp = unit.stats.maxHealth;
  } else if (healAmount > 0) {
    unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + healAmount);
  }

  if (resupply) {
    resupplyUnitIfAllowed(state, unit);
  }

  return {
    hpChanged: unit.current.hp !== previousHp,
    resupplied: unit.current.ammo !== previousAmmo || unit.current.stamina !== previousStamina,
    changed:
      unit.current.hp !== previousHp ||
      unit.current.ammo !== previousAmmo ||
      unit.current.stamina !== previousStamina
  };
}

export function serviceUnitsOnSectors(state, side) {
  let servicedUnits = 0;
  let repairedVehicles = 0;

  for (const unit of getLivingUnits(state, side)) {
    if (unit.transport?.carriedByUnitId || !canReceiveService(state, unit)) {
      continue;
    }

    const building = getBuildingAt(state, unit.x, unit.y);

    if (!building || building.owner !== side) {
      continue;
    }

    if (building.type === BUILDING_KEYS.SECTOR) {
      const healAmount = Math.max(1, Math.ceil(unit.stats.maxHealth / 3));
      const result = restoreUnitServiceResources(state, unit, { healAmount });

      if (result.changed) {
        servicedUnits += 1;
      }
    }

    if (
      building.type === BUILDING_KEYS.REPAIR_STATION &&
      !hasBuildingBeenUsedByOwner(building, side) &&
      unit.family === UNIT_TAGS.VEHICLE
    ) {
      restoreUnitServiceResources(state, unit, { healToFull: true });
      markBuildingServiceUsed(building, side);
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
