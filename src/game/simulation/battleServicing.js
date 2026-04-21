import { BUILDING_KEYS, TURN_SIDES } from "../core/constants.js";
import { appendLog } from "./battleLog.js";
import { getBuildingAt, getLivingUnits } from "./selectors.js";

export function serviceUnitsOnSectors(state, side) {
  let servicedUnits = 0;

  for (const unit of getLivingUnits(state, side)) {
    const building = getBuildingAt(state, unit.x, unit.y);

    if (!building || building.type !== BUILDING_KEYS.SECTOR || building.owner !== side) {
      continue;
    }

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

  if (servicedUnits > 0) {
    appendLog(
      state,
      `${side === TURN_SIDES.PLAYER ? "Allied" : "Enemy"} sector nodes serviced ${servicedUnits} unit${
        servicedUnits === 1 ? "" : "s"
      }.`
    );
  }
}
