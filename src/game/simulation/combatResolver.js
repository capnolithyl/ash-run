import { BUILDING_KEYS, TERRAIN_KEYS, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { randomInt } from "../core/random.js";
import {
  getArmorModifier,
  getAttackModifier,
  getRangeModifier
} from "./commanderEffects.js";
import { getXpThreshold } from "./progression.js";
import {
  canUnitAttackTarget,
  getBuildingAt,
  getTargetsInRange,
  getTerrainAt,
  getUnitAttackProfile
} from "./selectors.js";

function getTerrainArmorBonus(state, unit) {
  if (unit.family === UNIT_TAGS.AIR) {
    return 0;
  }

  const terrain = getTerrainAt(state, unit.x, unit.y);
  return terrain?.armorBonus ?? 0;
}

function getBuildingArmorBonus(state, unit) {
  if (unit.family === UNIT_TAGS.AIR) {
    return 0;
  }

  const building = getBuildingAt(state, unit.x, unit.y);

  if (!building || building.owner !== unit.owner) {
    return 0;
  }

  if (building.type === BUILDING_KEYS.COMMAND) {
    return 5;
  }

  if (building.type === BUILDING_KEYS.SECTOR) {
    return 3;
  }

  return 3;
}

export function getElevationRangeBonus(state, unit) {
  if (unit.unitTypeId !== "longshot") {
    return 0;
  }

  return state.map.tiles[unit.y]?.[unit.x] === TERRAIN_KEYS.MOUNTAIN ? 1 : 0;
}

export function getAttackRangeCap(state, unit, attackProfile = getUnitAttackProfile(unit)) {
  if (!attackProfile) {
    return 0;
  }

  if (attackProfile.type === "secondary") {
    return attackProfile.maxRange;
  }

  return attackProfile.maxRange + getRangeModifier(state, unit) + getElevationRangeBonus(state, unit);
}

export function getTargetsForUnit(state, unit) {
  const attackProfile = getUnitAttackProfile(unit);

  if (!attackProfile) {
    return [];
  }

  return getTargetsInRange(
    state,
    unit,
    attackProfile.minRange,
    getAttackRangeCap(state, unit, attackProfile)
  );
}

export function getDamageResult(state, attacker, defender, attackProfile = getUnitAttackProfile(attacker)) {
  const attackerAttack = attackProfile.attack + getAttackModifier(state, attacker);
  const defenderArmor =
    defender.stats.armor +
    getArmorModifier(state, defender) +
    getTerrainArmorBonus(state, defender) +
    getBuildingArmorBonus(state, defender);
  const isEffective = attacker.effectiveAgainstTags.includes(defender.family);
  const healthRatio = Math.max(0, attacker.current.hp / attacker.stats.maxHealth);

  const attackRoll = randomInt(state.seed, 0, attacker.stats.luck);
  state.seed = attackRoll.seed;

  const baseAttack = isEffective
    ? attackerAttack * attackProfile.effectiveMultiplier
    : attackerAttack;
  const scaledAttack = Math.round((baseAttack + attackRoll.value) * healthRatio);
  const damage = Math.max(1, scaledAttack - defenderArmor);

  return {
    damage,
    isEffective,
    weaponType: attackProfile.type
  };
}

function getDamageAmount(
  attackerAttack,
  defenderArmor,
  isEffective,
  effectiveMultiplier,
  hp,
  maxHealth,
  luckRoll
) {
  const healthRatio = Math.max(0, hp / maxHealth);
  const baseAttack = isEffective ? attackerAttack * effectiveMultiplier : attackerAttack;
  const scaledAttack = Math.round((baseAttack + luckRoll) * healthRatio);
  return Math.max(1, scaledAttack - defenderArmor);
}

function getDamageRange(
  state,
  attacker,
  defender,
  hpMin,
  hpMax,
  attackProfile = getUnitAttackProfile(attacker)
) {
  const attackerAttack = attackProfile.attack + getAttackModifier(state, attacker);
  const defenderArmor = defender.stats.armor + getArmorModifier(state, defender);
  const isEffective = attacker.effectiveAgainstTags.includes(defender.family);
  const normalizedHpMin = Math.max(0, Math.min(hpMin, hpMax));
  const normalizedHpMax = Math.max(0, Math.max(hpMin, hpMax));
  const luckMin = 0;
  const luckMax = Math.max(0, attacker.stats.luck);

  return {
    min: getDamageAmount(
      attackerAttack,
      defenderArmor,
      isEffective,
      attackProfile.effectiveMultiplier,
      normalizedHpMin,
      attacker.stats.maxHealth,
      luckMin
    ),
    max: getDamageAmount(
      attackerAttack,
      defenderArmor,
      isEffective,
      attackProfile.effectiveMultiplier,
      normalizedHpMax,
      attacker.stats.maxHealth,
      luckMax
    ),
    isEffective
  };
}

export function getAttackForecast(state, attacker, defender) {
  const attackerProfile = getUnitAttackProfile(attacker);
  const dealt = getDamageRange(
    state,
    attacker,
    defender,
    attacker.current.hp,
    attacker.current.hp,
    attackerProfile
  );
  const defenderHpAfterHitMin = Math.max(0, defender.current.hp - dealt.max);
  const defenderHpAfterHitMax = Math.max(0, defender.current.hp - dealt.min);
  const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
  const defenderProfile = getUnitAttackProfile(defender);
  const defenderRangeCap = getAttackRangeCap(state, defender, defenderProfile);
  const canCounter =
    defenderProfile &&
    defenderHpAfterHitMax > 0 &&
    distance >= defenderProfile.minRange &&
    distance <= defenderRangeCap &&
    canUnitAttackTarget(defender, attacker);
  const received = canCounter
    ? getDamageRange(
        state,
        defender,
        attacker,
        Math.max(1, defenderHpAfterHitMin),
        defenderHpAfterHitMax,
        defenderProfile
      )
    : null;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    dealt: {
      min: dealt.min,
      max: dealt.max
    },
    received: received
      ? {
          min: received.min,
          max: received.max
        }
      : null,
    defenderHpAfterHit: {
      min: defenderHpAfterHitMin,
      max: defenderHpAfterHitMax
    }
  };
}

export function removeDeadUnits(state) {
  for (const side of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
    state[side].units = state[side].units.filter((unit) => unit.current.hp > 0);
  }
}

function getTargetValueMultiplier(unit) {
  return Math.max(0.75, Math.min(2.4, unit.cost / 550));
}

export function getNonKillExperience(damage, target) {
  if (damage <= 0) {
    return 0;
  }

  const valueMultiplier = getTargetValueMultiplier(target);
  return Math.max(6, Math.round(damage * (1.8 + valueMultiplier)));
}

export function getDefenseExperience(damage, attacker) {
  if (damage <= 0) {
    return 0;
  }

  const attackerValue = getTargetValueMultiplier(attacker);
  return Math.max(4, Math.round(damage * (1.1 + attackerValue * 0.45)));
}

export function getKillExperience(attacker, defender, damageDealt, defenderHpBefore) {
  const levelDelta = defender.level - attacker.level;
  const threshold = getXpThreshold(attacker.level);
  const levelMultiplier = Math.max(0.45, 1 + levelDelta * 0.25);
  const valueMultiplier = getTargetValueMultiplier(defender);
  const hpBeforeRatio = Math.max(0.05, Math.min(1, defenderHpBefore / defender.stats.maxHealth));
  const damageExperience = getNonKillExperience(damageDealt, defender);
  const killBonus = threshold * (0.16 + valueMultiplier * 0.12) * hpBeforeRatio * levelMultiplier;

  return Math.max(damageExperience + 4, Math.round(damageExperience + killBonus));
}

export function getAttackableUnitIds(state, unit) {
  const attackProfile = getUnitAttackProfile(unit);

  if (!unit || unit.hasAttacked || !attackProfile) {
    return [];
  }

  const rangeCap = getAttackRangeCap(state, unit, attackProfile);

  return getTargetsInRange(state, unit, attackProfile.minRange, rangeCap).map((target) => target.id);
}
