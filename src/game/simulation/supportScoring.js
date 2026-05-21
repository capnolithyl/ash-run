import { canResupplyUnit } from "./commanderEffects.js";

export function unitNeedsService(state, unit) {
  const canResupply = canResupplyUnit(state, unit);

  return (
    unit.current.hp < unit.stats.maxHealth ||
    (canResupply && unit.current.ammo < unit.stats.ammoMax) ||
    (canResupply && unit.current.stamina < unit.stats.staminaMax)
  );
}

export function getSupportNeedScore(state, target) {
  const missingHp = target.stats.maxHealth - target.current.hp;
  const canResupply = canResupplyUnit(state, target);
  const missingAmmo = canResupply ? target.stats.ammoMax - target.current.ammo : 0;
  const missingStamina = canResupply ? target.stats.staminaMax - target.current.stamina : 0;

  return missingHp * 2 + missingAmmo * 3 + missingStamina * 2;
}
