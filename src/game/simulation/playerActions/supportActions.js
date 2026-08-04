import { UNIT_TAGS } from "../../core/constants.js";
import { appendLog } from "../battleLog.js";
import { restoreUnitServiceResources } from "../battleServicing.js";
import { getLivingUnits } from "../selectors.js";
import { getSupportNeedScore } from "../supportScoring.js";

const FIELD_MEDPACK_HEAL_RATIO = 0.33;
export const SUPPORT_HEAL_RATIO = 0.5;
export const SUPPORT_COOLDOWN_BY_UNIT_TYPE = Object.freeze({
  medic: 2,
  mechanic: 3
});

export function getSupportTargetForUnit(system, unit, { requireNeed = false } = {}) {
  return getSupportTargetsForUnit(system, unit, { requireNeed })[0]?.target ?? null;
}

export function getSupportTargetsForUnit(system, unit, { requireNeed = true } = {}) {
  const targetFamily =
    unit?.unitTypeId === "medic"
      ? UNIT_TAGS.INFANTRY
      : unit?.unitTypeId === "mechanic"
        ? UNIT_TAGS.VEHICLE
        : null;

  if (!targetFamily || (unit.cooldowns?.support ?? 0) > 0 || unit.transport?.carriedByUnitId) {
    return [];
  }

  return getLivingUnits(system.state, unit.owner)
    .filter((candidate) => {
      if (
        candidate.id === unit.id ||
        candidate.family !== targetFamily ||
        candidate.transport?.carriedByUnitId
      ) {
        return false;
      }

      return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
    })
    .map((target) => ({
      target,
      needScore: getSupportNeedScore(system.state, target)
    }))
    .filter((option) => !requireNeed || option.needScore > 0)
    .sort((left, right) => right.needScore - left.needScore || left.target.id.localeCompare(right.target.id));
}

export function applySupportAbility(system, unit, target) {
  if (!unit || !target) {
    return false;
  }

  const before = {
    hp: target.current.hp,
    ammo: target.current.ammo,
    stamina: target.current.stamina
  };

  const result = restoreUnitServiceResources(system.state, target, {
    healAmount: Math.ceil(target.stats.maxHealth * SUPPORT_HEAL_RATIO)
  });

  if (!result.changed) {
    return false;
  }

  unit.cooldowns.support = SUPPORT_COOLDOWN_BY_UNIT_TYPE[unit.unitTypeId];
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(system.state, `${unit.name} serviced ${target.name}.`);
  system.recordPresentationEvent("service", {
    actorId: unit.id,
    actorUnitTypeId: unit.unitTypeId,
    targetId: target.id,
    targetUnitTypeId: target.unitTypeId,
    owner: unit.owner,
    sourceKind: unit.unitTypeId === "medic" ? "medic" : "mechanic",
    sourceId: unit.id,
    buildingType: null,
    hpRecovered: Math.max(0, target.current.hp - before.hp),
    ammoRecovered: Math.max(0, target.current.ammo - before.ammo),
    staminaRecovered: Math.max(0, target.current.stamina - before.stamina),
    x: target.x,
    y: target.y
  });
  return true;
}

export function getMedpackTargetsForUnit(system, unit, { requireNeed = true } = {}) {
  if (
    !unit ||
    unit.family !== UNIT_TAGS.INFANTRY ||
    unit.gear?.slot !== "gear-field-meds" ||
    unit.transport?.carriedByUnitId
  ) {
    return [];
  }

  return getLivingUnits(system.state, unit.owner)
    .filter((candidate) => {
      if (candidate.family !== UNIT_TAGS.INFANTRY || candidate.transport?.carriedByUnitId) {
        return false;
      }

      if (candidate.id === unit.id) {
        return true;
      }

      return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
    })
    .map((target) => ({
      target,
      needScore: Math.max(0, target.stats.maxHealth - target.current.hp)
    }))
    .filter((option) => !requireNeed || option.needScore > 0)
    .sort((left, right) => right.needScore - left.needScore || left.target.id.localeCompare(right.target.id));
}

export function applyMedpackAbility(system, unit, target) {
  if (!unit || !target || unit.gear?.slot !== "gear-field-meds") {
    return false;
  }

  const healAmount = Math.ceil(target.stats.maxHealth * FIELD_MEDPACK_HEAL_RATIO);
  const nextHp = Math.min(target.stats.maxHealth, target.current.hp + healAmount);
  const restoredHp = nextHp - target.current.hp;

  if (restoredHp <= 0) {
    return false;
  }

  target.current.hp = nextHp;
  unit.gear = { slot: null };
  unit.gearState = {};
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(system.state, `${unit.name} used a Field Medpack on ${target.id === unit.id ? "themself" : target.name}, restoring ${restoredHp} HP.`);
  system.recordPresentationEvent("service", {
    actorId: unit.id,
    actorUnitTypeId: unit.unitTypeId,
    targetId: target.id,
    targetUnitTypeId: target.unitTypeId,
    owner: unit.owner,
    sourceKind: "field-medpack",
    sourceId: "gear-field-meds",
    buildingType: null,
    hpRecovered: restoredHp,
    ammoRecovered: 0,
    staminaRecovered: 0,
    x: target.x,
    y: target.y
  });
  return true;
}

export function getExtinguishTargetsForUnit(system, unit) {
  if (!unit || unit.family !== UNIT_TAGS.INFANTRY || unit.transport?.carriedByUnitId) {
    return [];
  }

  return getLivingUnits(system.state, unit.owner)
    .filter(
      (candidate) =>
        candidate.id !== unit.id &&
        (candidate.statuses ?? []).some((status) => status.type === "burn") &&
        Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1
    )
    .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
}

export function applyExtinguishAbility(system, unit, target) {
  if (!unit || !target) {
    return false;
  }

  const hadBurn = (target.statuses ?? []).some((status) => status.type === "burn");

  if (!hadBurn) {
    return false;
  }

  target.statuses = target.statuses.filter((status) => status.type !== "burn");
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(system.state, `${unit.name} extinguished ${target.name}.`);
  system.recordPresentationEvent("status", {
    action: "extinguish",
    actorId: unit.id,
    actorUnitTypeId: unit.unitTypeId,
    targetId: target.id,
    targetUnitTypeId: target.unitTypeId,
    owner: unit.owner,
    statusType: "burn",
    damage: 0,
    x: target.x,
    y: target.y
  });
  return true;
}
