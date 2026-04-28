import { BUILDING_KEYS, TERRAIN_KEYS, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { randomInt } from "../core/random.js";
import {
  getArmorModifier,
  getAttackModifier,
  getLuckModifier,
  getRangeModifier
} from "./commanderEffects.js";
import {
  canUnitAttackTarget,
  getBuildingAt,
  getTargetsInRange,
  getTerrainAt,
  getUnitAttackProfile
} from "./selectors.js";

const EFFECTIVE_ATTACK_BONUS = 6;

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

  if (!building) {
    return 0;
  }

  if (building.type === BUILDING_KEYS.COMMAND) {
    return 4;
  }

  return 3;
}

export function getPositionArmorBonus(state, unit) {
  const buildingArmorBonus = getBuildingArmorBonus(state, unit);

  if (buildingArmorBonus > 0) {
    return buildingArmorBonus;
  }

  return getTerrainArmorBonus(state, unit);
}

function getArmorBreakMultiplier(attacker, defender) {
  return attacker?.unitTypeId === "breaker" && defender.family === UNIT_TAGS.VEHICLE ? 0.5 : 1;
}

function getEffectivenessBonus(attacker, defender) {
  return attacker.effectiveAgainstTags.includes(defender.family) ? EFFECTIVE_ATTACK_BONUS : 0;
}

export function getDefenderArmor(state, defender, attacker = null) {
  const baseArmor = Math.floor(defender.stats.armor * getArmorBreakMultiplier(attacker, defender));

  return (
    baseArmor +
    getArmorModifier(state, defender) +
    getPositionArmorBonus(state, defender)
  );
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
  const defenderArmor = getDefenderArmor(state, defender, attacker);
  const effectivenessBonus = getEffectivenessBonus(attacker, defender);
  const healthRatio = Math.max(0, attacker.current.hp / attacker.stats.maxHealth);

  const attackRoll = randomInt(state.seed, 0, Math.max(0, attacker.stats.luck + getLuckModifier(state, attacker)));
  state.seed = attackRoll.seed;

  const scaledAttack = Math.round((attackerAttack + effectivenessBonus) * healthRatio);
  const damage = Math.max(0, scaledAttack + attackRoll.value - defenderArmor);

  return {
    damage,
    isEffective: effectivenessBonus > 0,
    weaponType: attackProfile.type
  };
}

function getDamageAmount(attackerAttack, defenderArmor, effectivenessBonus, hp, maxHealth, luckRoll) {
  const healthRatio = Math.max(0, hp / maxHealth);
  const scaledAttack = Math.round((attackerAttack + effectivenessBonus) * healthRatio);
  return Math.max(0, scaledAttack + luckRoll - defenderArmor);
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
  const defenderArmor = getDefenderArmor(state, defender, attacker);
  const effectivenessBonus = getEffectivenessBonus(attacker, defender);
  const normalizedHpMin = Math.max(0, Math.min(hpMin, hpMax));
  const normalizedHpMax = Math.max(0, Math.max(hpMin, hpMax));
  const luckMin = 0;
  const luckMax = Math.max(0, attacker.stats.luck + getLuckModifier(state, attacker));

  return {
    min: getDamageAmount(
      attackerAttack,
      defenderArmor,
      effectivenessBonus,
      normalizedHpMin,
      attacker.stats.maxHealth,
      luckMin
    ),
    max: getDamageAmount(
      attackerAttack,
      defenderArmor,
      effectivenessBonus,
      normalizedHpMax,
      attacker.stats.maxHealth,
      luckMax
    ),
    isEffective: effectivenessBonus > 0
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
  const carriers = [...state.player.units, ...state.enemy.units].filter((unit) => unit.current.hp <= 0);
  for (const carrier of carriers) {
    const carriedUnitId = carrier.transport?.carryingUnitId;
    if (!carriedUnitId) {
      continue;
    }

    const allUnits = [...state.player.units, ...state.enemy.units];
    const carried = allUnits.find((unit) => unit.id === carriedUnitId);
    if (carried) {
      carried.current.hp = 0;
    }
  }

  for (const side of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
    state[side].units = state[side].units.filter((unit) => unit.current.hp > 0);
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getMatchupXpMultiplier(attackerFamily, defenderFamily) {
  if (attackerFamily === UNIT_TAGS.INFANTRY) {
    if (defenderFamily === UNIT_TAGS.VEHICLE) {
      return 1.5;
    }

    return 1;
  }

  if (attackerFamily === UNIT_TAGS.VEHICLE) {
    if (defenderFamily === UNIT_TAGS.INFANTRY) {
      return 0.75;
    }

    if (defenderFamily === UNIT_TAGS.AIR) {
      return 1.25;
    }

    return 1;
  }

  if (attackerFamily === UNIT_TAGS.AIR) {
    if (defenderFamily === UNIT_TAGS.INFANTRY) {
      return 0.75;
    }

    if (defenderFamily === UNIT_TAGS.VEHICLE) {
      return 0.9;
    }

    return 1;
  }

  return 1;
}

export function getCombatExperience(attacker, defender, damageDealt, killed = false) {
  if (damageDealt <= 0) {
    return 0;
  }

  const damageRatio = clamp(damageDealt / defender.stats.maxHealth, 0, 1);
  const baseXp = damageRatio * 60;
  const levelMultiplier = clamp(1 + (defender.level - attacker.level) * 0.25, 0.4, 1.8);
  const matchupMultiplier = getMatchupXpMultiplier(attacker.family, defender.family);
  const damageXp = baseXp * levelMultiplier * matchupMultiplier;
  const killXp = killed ? 20 * levelMultiplier * matchupMultiplier : 0;

  return Math.max(2, Math.round(damageXp + killXp));
}

export function getAttackableUnitIds(state, unit) {
  const attackProfile = getUnitAttackProfile(unit);

  if (!unit || unit.hasAttacked || !attackProfile) {
    return [];
  }

  const rangeCap = getAttackRangeCap(state, unit, attackProfile);

  return getTargetsInRange(state, unit, attackProfile.minRange, rangeCap).map((target) => target.id);
}
