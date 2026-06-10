import { getRunCardAmmoCostForAttack } from "./runCardEffects.js";
import { getAntiAirGearAmmo } from "./selectors.js";

export function consumeAttackResources(state, unit, attackProfile) {
  if (attackProfile?.consumesAmmo) {
    unit.current.ammo = Math.max(
      0,
      unit.current.ammo - getRunCardAmmoCostForAttack(state, unit, 1)
    );
  }

  if (attackProfile?.consumesGearAmmo) {
    unit.gearState.aaKitAmmo = Math.max(0, getAntiAirGearAmmo(unit) - 1);
  }
}
