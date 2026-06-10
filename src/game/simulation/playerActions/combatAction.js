import { BATTLE_MODES, TURN_SIDES } from "../../core/constants.js";
import { appendLog, pushLevelUpEvents } from "../battleLog.js";
import { findUnitById } from "../battleUnits.js";
import {
  applyChargeFromCombat,
  getExperienceModifier,
  shouldDefenderPreemptCombat,
  shouldPreventCombatDamage
} from "../commanderEffects.js";
import {
  getAttackRangeCap,
  getCombatExperience,
  getDamageResult,
  removeDeadUnits
} from "../combatResolver.js";
import { consumeAttackResources } from "../combatResources.js";
import { awardExperience } from "../progression.js";
import { canUnitAttackTarget, getAttackProfileForTarget } from "../selectors.js";
import {
  applyRunCardChainReaction,
  applyRunCardOnDamageDealt,
  applyRunCardOnKillEffects,
  applyRunCardStrikeModifiers
} from "../runCardEffects.js";
import { prepareSlipstreamReposition } from "./shared.js";

function appendNotes(state, notes = []) {
  notes.forEach((note) => appendLog(state, note));
}

function appendStrikeLog(state, attacker, defender, strike, damageDealt, verb = "hit") {
  const qualityParts = [];

  if (strike.weaponType === "secondary") {
    qualityParts.push("with secondary fire");
  }

  if (strike.isEffective) {
    qualityParts.push("effective");
  }

  if (strike.isCrit) {
    qualityParts.push("critical");
  }

  if (strike.isGlance) {
    qualityParts.push("glancing");
  }

  appendLog(
    state,
    `${attacker.name} ${verb} ${defender.name}${qualityParts.length ? ` ${qualityParts.join(" ")}` : ""} for ${damageDealt} damage.`
  );
}

function canDefenderCounter(state, attacker, defender, distance) {
  const defenderProfile = getAttackProfileForTarget(defender, attacker);

  if (!defenderProfile || defender.current.hp <= 0) {
    return { canCounter: false, defenderProfile: null };
  }

  const counterRange = getAttackRangeCap(state, defender, defenderProfile);
  const canCounter =
    distance >= defenderProfile.minRange &&
    distance <= counterRange &&
    canUnitAttackTarget(defender, attacker);

  return {
    canCounter,
    defenderProfile
  };
}

function awardCombatXpToUnit(system, unit, target, damageDealt, killed) {
  if (system.state.mode === BATTLE_MODES.TUTORIAL) {
    return;
  }

  let xpGain = getCombatExperience(unit, target, damageDealt, killed);
  xpGain = Math.round(xpGain * (1 + getExperienceModifier(system.state, unit, { combatXp: xpGain > 0, killed })));

  if (xpGain <= 0) {
    return;
  }

  const nextUnit = awardExperience(unit, xpGain, system.state.seed);
  system.state.seed = nextUnit.seed;
  Object.assign(unit, nextUnit.unit);
  nextUnit.notes.forEach((note) => appendLog(system.state, note));
  pushLevelUpEvents(system.state, unit, nextUnit.levelUps);
}

function resolveFinalTransmission(system, fallenUnit, targetUnit) {
  if (
    !fallenUnit ||
    !targetUnit ||
    fallenUnit.current.hp > 0 ||
    targetUnit.current.hp <= 0 ||
    fallenUnit.gear?.slot !== "gear-final-transmission"
  ) {
    return false;
  }

  const attackProfile = getAttackProfileForTarget(fallenUnit, targetUnit);

  if (!attackProfile) {
    return false;
  }

  const previousFallenHp = fallenUnit.current.hp;
  const targetHpBefore = targetUnit.current.hp;
  fallenUnit.current.hp = fallenUnit.stats.maxHealth;
  const strikeResult = applyRunCardStrikeModifiers(
    system.state,
    fallenUnit,
    targetUnit,
    getDamageResult(system.state, fallenUnit, targetUnit, attackProfile)
  );
  fallenUnit.current.hp = previousFallenHp;
  targetUnit.current.hp = Math.max(0, targetUnit.current.hp - strikeResult.strike.damage);
  const damageDealt = targetHpBefore - targetUnit.current.hp;

  appendStrikeLog(system.state, fallenUnit, targetUnit, strikeResult.strike, damageDealt, "final-transmitted into");
  appendNotes(system.state, strikeResult.notes);

  if (targetUnit.current.hp <= 0) {
    appendLog(system.state, `${targetUnit.name} was destroyed.`);
  }

  return damageDealt > 0;
}

export function attackTarget(system, attackerId, defenderId) {
  const attacker = findUnitById(system.state, attackerId);
  const defender = findUnitById(system.state, defenderId);
  const attackProfile = getAttackProfileForTarget(attacker, defender);

  if (!attacker || !defender || attacker.hasAttacked || !attackProfile) {
    return false;
  }

  const rangeCap = getAttackRangeCap(system.state, attacker, attackProfile);
  const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);

  if (
    distance < attackProfile.minRange ||
    distance > rangeCap ||
    !canUnitAttackTarget(attacker, defender)
  ) {
    return false;
  }

  const zeroDamageCombat = shouldPreventCombatDamage(system.state, attacker.owner, defender.owner);
  const { canCounter, defenderProfile } = canDefenderCounter(system.state, attacker, defender, distance);
  const usesPreemptiveCounter = shouldDefenderPreemptCombat(system.state, attacker, defender, { canCounter });
  let primaryDamageDealt = 0;
  let counterDamageDealt = 0;

  attacker.hasAttacked = true;
  attacker.hasMoved = true;
  if (attacker.unitTypeId === "runner" && attacker.transport?.carryingUnitId) {
    attacker.transport.hasLockedUnload = true;
  }

  if (usesPreemptiveCounter) {
    const attackerHpBefore = attacker.current.hp;
    const preemptiveStrike = zeroDamageCombat
      ? { damage: 0, weaponType: defenderProfile.type, isEffective: false, isCrit: false, isGlance: false }
      : getDamageResult(system.state, defender, attacker, defenderProfile);
    const modifiedStrike = zeroDamageCombat
      ? { strike: preemptiveStrike, notes: [] }
      : applyRunCardStrikeModifiers(system.state, defender, attacker, preemptiveStrike);

    attacker.current.hp = Math.max(0, attacker.current.hp - modifiedStrike.strike.damage);
    counterDamageDealt = attackerHpBefore - attacker.current.hp;
    consumeAttackResources(system.state, defender, defenderProfile);
    appendStrikeLog(system.state, defender, attacker, modifiedStrike.strike, counterDamageDealt, "countered");
    appendNotes(system.state, modifiedStrike.notes);
    appendNotes(system.state, applyRunCardOnDamageDealt(system.state, defender, attacker, counterDamageDealt));
    applyChargeFromCombat(system.state, defender.owner, attacker.owner, counterDamageDealt, counterDamageDealt);
  }

  if (attacker.current.hp > 0) {
    const defenderHpBefore = defender.current.hp;
    const primaryStrike = zeroDamageCombat
      ? { damage: 0, weaponType: attackProfile.type, isEffective: false, isCrit: false, isGlance: false }
      : getDamageResult(system.state, attacker, defender, attackProfile);
    const modifiedStrike = zeroDamageCombat
      ? { strike: primaryStrike, notes: [] }
      : applyRunCardStrikeModifiers(system.state, attacker, defender, primaryStrike);

    defender.current.hp = Math.max(0, defender.current.hp - modifiedStrike.strike.damage);
    primaryDamageDealt = defenderHpBefore - defender.current.hp;
    consumeAttackResources(system.state, attacker, attackProfile);
    appendStrikeLog(system.state, attacker, defender, modifiedStrike.strike, primaryDamageDealt);
    appendNotes(system.state, modifiedStrike.notes);
    appendNotes(system.state, applyRunCardOnDamageDealt(system.state, attacker, defender, primaryDamageDealt));
    applyChargeFromCombat(system.state, attacker.owner, defender.owner, primaryDamageDealt, primaryDamageDealt);
  }

  if (attacker.current.hp > 0 && defender.current.hp > 0 && canCounter && !usesPreemptiveCounter) {
    const attackerHpBefore = attacker.current.hp;
    const counterStrike = zeroDamageCombat
      ? { damage: 0, weaponType: defenderProfile.type, isEffective: false, isCrit: false, isGlance: false }
      : getDamageResult(system.state, defender, attacker, defenderProfile);
    const modifiedStrike = zeroDamageCombat
      ? { strike: counterStrike, notes: [] }
      : applyRunCardStrikeModifiers(system.state, defender, attacker, counterStrike);

    attacker.current.hp = Math.max(0, attacker.current.hp - modifiedStrike.strike.damage);
    counterDamageDealt = attackerHpBefore - attacker.current.hp;
    consumeAttackResources(system.state, defender, defenderProfile);
    appendStrikeLog(system.state, defender, attacker, modifiedStrike.strike, counterDamageDealt, "countered");
    appendNotes(system.state, modifiedStrike.notes);
    appendNotes(system.state, applyRunCardOnDamageDealt(system.state, defender, attacker, counterDamageDealt));
    applyChargeFromCombat(system.state, defender.owner, attacker.owner, counterDamageDealt, counterDamageDealt);
  }

  awardCombatXpToUnit(system, attacker, defender, primaryDamageDealt, defender.current.hp <= 0);

  if (defender.current.hp > 0) {
    awardCombatXpToUnit(system, defender, attacker, counterDamageDealt, attacker.current.hp <= 0);
  }

  if (defender.current.hp <= 0) {
    appendLog(system.state, `${defender.name} was destroyed.`);
    appendNotes(system.state, applyRunCardOnKillEffects(system.state, attacker, defender));
    appendNotes(system.state, applyRunCardChainReaction(system.state, attacker, defender));
  }

  if (attacker.current.hp <= 0) {
    appendLog(system.state, `${attacker.name} was destroyed.`);
    appendNotes(system.state, applyRunCardOnKillEffects(system.state, defender, attacker));
  }

  if (defender.current.hp <= 0) {
    resolveFinalTransmission(system, defender, attacker);
  }

  if (attacker.current.hp <= 0) {
    resolveFinalTransmission(system, attacker, defender);
  }

  const defenderKilled = defender.current.hp <= 0;
  removeDeadUnits(system.state);
  const updatedAttacker = findUnitById(system.state, attacker.id);
  const preparedSlipstream =
    updatedAttacker &&
    updatedAttacker.owner === TURN_SIDES.PLAYER &&
    system.state.turn.activeSide === TURN_SIDES.PLAYER &&
    prepareSlipstreamReposition(system, updatedAttacker, { killed: defenderKilled });

  if (!preparedSlipstream) {
    system.clearPendingAction();
    system.clearSelection();
  }

  system.updateVictoryState();
  return true;
}
