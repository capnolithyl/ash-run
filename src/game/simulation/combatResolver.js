import { TERRAIN_KEYS, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { getBuildingArmorBonusForType } from "../content/buildings.js";
import { getTargetProfileForAttack } from "../content/weaponClasses.js";
import { randomInt } from "../core/random.js";
import {
  getArmorModifier,
  getAttackPowerForProfile,
  getLuckModifier,
  getPositionArmorMultiplier,
  getRangeModifier,
  getStrikeOutcomeRange,
  rollStrikeOutcome
} from "./commanderEffects.js";
import {
  getAttackProfileForTarget,
  canUnitAttackTarget,
  getBuildingAt,
  getLivingUnits,
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

  if (!building) {
    return 0;
  }

  return getBuildingArmorBonusForType(building.type);
}

export function getPositionArmorBonus(state, unit) {
  const buildingArmorBonus = getBuildingArmorBonus(state, unit);
  const rawBonus = buildingArmorBonus > 0
    ? buildingArmorBonus
    : getTerrainArmorBonus(state, unit);

  return Math.round(rawBonus * getPositionArmorMultiplier(state, unit));
}

function getProfiledBaseArmor(state, defender, attacker, attackProfile) {
  const targetProfile = attacker
    ? getTargetProfileForAttack(attacker, defender, attackProfile)
    : null;
  const armorMultiplier = targetProfile?.armorMultiplier ?? 1;
  return Math.round(defender.stats.armor * armorMultiplier);
}

export function getDefenderArmor(state, defender, attacker = null, attackProfile = null) {
  const baseArmor = getProfiledBaseArmor(state, defender, attacker, attackProfile);

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
  if (!unit || unit.hasAttacked) {
    return [];
  }

  const enemySide = unit.owner === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;

  return getLivingUnits(state, enemySide).filter((target) => {
    const attackProfile = getAttackProfileForTarget(unit, target);

    if (!attackProfile || !canUnitAttackTarget(unit, target)) {
      return false;
    }

    const distance = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);
    const rangeCap = getAttackRangeCap(state, unit, attackProfile);
    return distance >= attackProfile.minRange && distance <= rangeCap;
  });
}

export function getDamageResult(state, attacker, defender, attackProfile = getAttackProfileForTarget(attacker, defender)) {
  const targetProfile = getTargetProfileForAttack(attacker, defender, attackProfile);

  if (!attackProfile || !targetProfile) {
    return {
      damage: 0,
      isEffective: false,
      weaponType: attackProfile?.type ?? null
    };
  }

  const modifiedAttack = getAttackPowerForProfile(state, attacker, attackProfile);
  const profiledAttack = Math.round(modifiedAttack * targetProfile.powerMultiplier);
  const defenderArmor = getDefenderArmor(state, defender, attacker, attackProfile);
  const healthRatio = Math.max(0, attacker.current.hp / attacker.stats.maxHealth);

  const luckMax = Math.max(0, attacker.stats.luck + getLuckModifier(state, attacker));
  const attackRoll = randomInt(state.seed, 0, luckMax);
  state.seed = attackRoll.seed;

  const antiAirGearPenalty =
    attacker.gear?.slot === "gear-aa-kit" && defender.family === UNIT_TAGS.AIR ? 0.6 : 1;
  const damage = calculateDamageAmount({
    attack: profiledAttack,
    armor: defenderArmor,
    hp: attacker.current.hp,
    maxHealth: attacker.stats.maxHealth,
    luck: attackRoll.value,
    antiAirGearPenalty
  });
  const outcome = rollStrikeOutcome(state, attacker, defender, damage);

  return {
    damage: outcome.damage,
    isEffective: Boolean(targetProfile.isEffective),
    weaponType: attackProfile.type,
    isCrit: outcome.isCrit,
    isGlance: outcome.isGlance
  };
}

function calculateDamageAmount({
  attack,
  armor,
  hp,
  maxHealth,
  luck,
  antiAirGearPenalty
}) {
  const fullHpBaseDamage = Math.max(0, attack - armor);
  const scaledDamage = Math.round(fullHpBaseDamage * Math.max(0, hp / maxHealth));
  return Math.max(0, Math.round((scaledDamage + luck) * antiAirGearPenalty));
}

function getDamageRange(
  state,
  attacker,
  defender,
  hpMin,
  hpMax,
  attackProfile = getAttackProfileForTarget(attacker, defender)
) {
  const targetProfile = getTargetProfileForAttack(attacker, defender, attackProfile);
  const normalizedHpMin = Math.max(0, Math.min(hpMin, hpMax));
  const normalizedHpMax = Math.max(0, Math.max(hpMin, hpMax));

  if (!attackProfile || !targetProfile) {
    return {
      min: 0,
      max: 0,
      isEffective: false
    };
  }

  const modifiedAttack = getAttackPowerForProfile(state, attacker, attackProfile);
  const profiledAttack = Math.round(modifiedAttack * targetProfile.powerMultiplier);
  const defenderArmor = getDefenderArmor(state, defender, attacker, attackProfile);
  const luckMin = 0;
  const luckMax = Math.max(0, attacker.stats.luck + getLuckModifier(state, attacker));
  const antiAirGearPenalty =
    attacker.gear?.slot === "gear-aa-kit" && defender.family === UNIT_TAGS.AIR ? 0.6 : 1;

  return getStrikeOutcomeRange(state, attacker, defender, {
    min: calculateDamageAmount({
      attack: profiledAttack,
      armor: defenderArmor,
      hp: normalizedHpMin,
      maxHealth: attacker.stats.maxHealth,
      luck: luckMin,
      antiAirGearPenalty
    }),
    max: calculateDamageAmount({
      attack: profiledAttack,
      armor: defenderArmor,
      hp: normalizedHpMax,
      maxHealth: attacker.stats.maxHealth,
      luck: luckMax,
      antiAirGearPenalty
    })
  });
}

export function getAttackForecast(state, attacker, defender) {
  const attackerProfile = getAttackProfileForTarget(attacker, defender);
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
  const defenderProfile = getAttackProfileForTarget(defender, attacker);
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

function getMatchupXpMultiplier(attackerFamily, defenderFamily) {
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
  if (!unit || unit.hasAttacked) {
    return [];
  }

  return getTargetsForUnit(state, unit).map((target) => target.id);
}
