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

function recordStrikePresentationEvent(
  system,
  {
    combatId,
    order,
    phase,
    attacker,
    defender,
    attackProfile,
    strike,
    damage
  }
) {
  return system.recordPresentationEvent("strike", {
    combatId,
    order,
    phase,
    profile: attackProfile?.type ?? strike?.weaponType ?? "primary",
    weaponType: strike?.weaponType ?? attackProfile?.type ?? "primary",
    weaponClass:
      attackProfile?.weaponClass ??
      (attackProfile?.type === "gear-aa"
        ? "anti_air_gear"
        : attacker?.stats?.weaponClass ?? null),
    attackerId: attacker.id,
    attackerUnitTypeId: attacker.unitTypeId,
    attackerOwner: attacker.owner,
    targetId: defender.id,
    targetUnitTypeId: defender.unitTypeId,
    targetOwner: defender.owner,
    fromX: attacker.x,
    fromY: attacker.y,
    toX: defender.x,
    toY: defender.y,
    damage: Math.max(0, damage ?? 0),
    isCrit: Boolean(strike?.isCrit),
    isGlance: Boolean(strike?.isGlance),
    isEffective: Boolean(strike?.isEffective),
    killed: defender.current.hp <= 0
  });
}

function snapshotUnitResources(state) {
  return new Map(
    [...state.player.units, ...state.enemy.units].map((unit) => [
      unit.id,
      {
        hp: unit.current.hp,
        ammo: unit.current.ammo,
        stamina: unit.current.stamina
      }
    ])
  );
}

function recordRunCardDamageChanges(
  system,
  previousResources,
  actor,
  sourceId,
  { combatId = null, order = null } = {}
) {
  for (const unit of [...system.state.player.units, ...system.state.enemy.units]) {
    const previousHp = previousResources.get(unit.id)?.hp;
    if (!Number.isFinite(previousHp) || unit.current.hp >= previousHp) {
      continue;
    }

    system.recordPresentationEvent("status", {
      action: "effect-damage",
      actorId: actor?.id ?? null,
      actorUnitTypeId: actor?.unitTypeId ?? null,
      targetId: unit.id,
      targetUnitTypeId: unit.unitTypeId,
      owner: unit.owner,
      sourceKind: "run-card",
      sourceId,
      combatId,
      order,
      statusType: null,
      damage: previousHp - unit.current.hp,
      killed: unit.current.hp <= 0,
      x: unit.x,
      y: unit.y
    });
  }
}

function recordRunCardServiceChanges(system, previousResources, sourceId) {
  for (const unit of [...system.state.player.units, ...system.state.enemy.units]) {
    const previous = previousResources.get(unit.id);
    if (!previous) {
      continue;
    }

    const hpRecovered = Math.max(0, unit.current.hp - previous.hp);
    const ammoRecovered = Math.max(0, unit.current.ammo - previous.ammo);
    const staminaRecovered = Math.max(0, unit.current.stamina - previous.stamina);
    if (hpRecovered + ammoRecovered + staminaRecovered === 0) {
      continue;
    }

    system.recordPresentationEvent("service", {
      actorId: unit.id,
      actorUnitTypeId: unit.unitTypeId,
      targetId: unit.id,
      targetUnitTypeId: unit.unitTypeId,
      owner: unit.owner,
      sourceKind: "run-card",
      sourceId,
      buildingType: null,
      hpRecovered,
      ammoRecovered,
      staminaRecovered,
      x: unit.x,
      y: unit.y
    });
  }
}

function applyRunCardEffectWithChanges(system, actor, sourceId, applyEffect, combat = {}) {
  const previousResources = snapshotUnitResources(system.state);
  const notes = applyEffect();
  recordRunCardDamageChanges(system, previousResources, actor, sourceId, combat);
  recordRunCardServiceChanges(system, previousResources, sourceId);
  return notes;
}

function getAddedStatusEntries(previousStatuses, nextStatuses) {
  const remaining = new Map();
  previousStatuses.forEach((status) => {
    const key = JSON.stringify(status);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  });

  return nextStatuses.filter((status) => {
    const key = JSON.stringify(status);
    const count = remaining.get(key) ?? 0;
    if (count <= 0) {
      return true;
    }
    remaining.set(key, count - 1);
    return false;
  });
}

function recordStrikeModifierEffects(system, attacker, effects = [], combat = {}) {
  effects
    .filter((effect) => effect.type === "self-damage" && effect.damage > 0)
    .forEach((effect) => {
      system.recordPresentationEvent("status", {
        action: "effect-damage",
        actorId: attacker.id,
        actorUnitTypeId: attacker.unitTypeId,
        targetId: attacker.id,
        targetUnitTypeId: attacker.unitTypeId,
        owner: attacker.owner,
        sourceKind: "run-card",
        sourceId: effect.sourceId,
        combatId: combat.combatId ?? null,
        order: combat.order ?? null,
        statusType: null,
        damage: effect.damage,
        killed: attacker.current.hp <= 0,
        x: attacker.x,
        y: attacker.y
      });
    });
}

function applyDamageDealtEffects(system, attacker, defender, damageDealt, combat = {}) {
  const previousStatuses = structuredClone(defender.statuses ?? []);
  const previousResources = snapshotUnitResources(system.state);
  const notes = applyRunCardOnDamageDealt(system.state, attacker, defender, damageDealt);
  recordRunCardDamageChanges(system, previousResources, attacker, "on-damage-dealt", combat);
  const addedStatuses = getAddedStatusEntries(previousStatuses, defender.statuses ?? []);
  if (
    addedStatuses.length === 0 &&
    attacker.gear?.slot === "gear-flamethrower"
  ) {
    const reappliedBurn = (defender.statuses ?? []).find((status) => status.type === "burn");
    if (reappliedBurn) {
      addedStatuses.push(reappliedBurn);
    }
  }

  addedStatuses.forEach((status) => {
    system.recordPresentationEvent("status", {
      action: "apply",
      actorId: attacker.id,
      actorUnitTypeId: attacker.unitTypeId,
      targetId: defender.id,
      targetUnitTypeId: defender.unitTypeId,
      owner: defender.owner,
      combatId: combat.combatId ?? null,
      order: combat.order ?? null,
      sourceKind: "gear",
      sourceId: attacker.gear?.slot ?? "on-damage-dealt",
      statusType: status.type,
      status: structuredClone(status),
      damage: 0,
      x: defender.x,
      y: defender.y
    });
  });

  return notes;
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

function resolveFinalTransmission(system, fallenUnit, targetUnit, { combatId, order }) {
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

  recordStrikePresentationEvent(system, {
    combatId,
    order,
    phase: "final-transmission",
    attacker: fallenUnit,
    defender: targetUnit,
    attackProfile,
    strike: strikeResult.strike,
    damage: damageDealt
  });

  appendStrikeLog(system.state, fallenUnit, targetUnit, strikeResult.strike, damageDealt, "final-transmitted into");
  appendNotes(system.state, strikeResult.notes);

  if (targetUnit.current.hp <= 0) {
    appendLog(system.state, `${targetUnit.name} was destroyed.`);
  }

  return true;
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
  const combatId = system.createPresentationEventGroup("combat");
  let strikeOrder = 0;
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
    const presentationOrder = strikeOrder++;
    recordStrikePresentationEvent(system, {
      combatId,
      order: presentationOrder,
      phase: "preemptive-counter",
      attacker: defender,
      defender: attacker,
      attackProfile: defenderProfile,
      strike: modifiedStrike.strike,
      damage: counterDamageDealt
    });
    recordStrikeModifierEffects(system, defender, modifiedStrike.effects, {
      combatId,
      order: presentationOrder
    });
    consumeAttackResources(system.state, defender, defenderProfile);
    appendStrikeLog(system.state, defender, attacker, modifiedStrike.strike, counterDamageDealt, "countered");
    appendNotes(system.state, modifiedStrike.notes);
    appendNotes(
      system.state,
      applyDamageDealtEffects(system, defender, attacker, counterDamageDealt, {
        combatId,
        order: presentationOrder
      })
    );
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
    const presentationOrder = strikeOrder++;
    recordStrikePresentationEvent(system, {
      combatId,
      order: presentationOrder,
      phase: "primary",
      attacker,
      defender,
      attackProfile,
      strike: modifiedStrike.strike,
      damage: primaryDamageDealt
    });
    recordStrikeModifierEffects(system, attacker, modifiedStrike.effects, {
      combatId,
      order: presentationOrder
    });
    consumeAttackResources(system.state, attacker, attackProfile);
    appendStrikeLog(system.state, attacker, defender, modifiedStrike.strike, primaryDamageDealt);
    appendNotes(system.state, modifiedStrike.notes);
    appendNotes(
      system.state,
      applyDamageDealtEffects(system, attacker, defender, primaryDamageDealt, {
        combatId,
        order: presentationOrder
      })
    );
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
    const presentationOrder = strikeOrder++;
    recordStrikePresentationEvent(system, {
      combatId,
      order: presentationOrder,
      phase: "counter",
      attacker: defender,
      defender: attacker,
      attackProfile: defenderProfile,
      strike: modifiedStrike.strike,
      damage: counterDamageDealt
    });
    recordStrikeModifierEffects(system, defender, modifiedStrike.effects, {
      combatId,
      order: presentationOrder
    });
    consumeAttackResources(system.state, defender, defenderProfile);
    appendStrikeLog(system.state, defender, attacker, modifiedStrike.strike, counterDamageDealt, "countered");
    appendNotes(system.state, modifiedStrike.notes);
    appendNotes(
      system.state,
      applyDamageDealtEffects(system, defender, attacker, counterDamageDealt, {
        combatId,
        order: presentationOrder
      })
    );
    applyChargeFromCombat(system.state, defender.owner, attacker.owner, counterDamageDealt, counterDamageDealt);
  }

  awardCombatXpToUnit(system, attacker, defender, primaryDamageDealt, defender.current.hp <= 0);

  if (defender.current.hp > 0) {
    awardCombatXpToUnit(system, defender, attacker, counterDamageDealt, attacker.current.hp <= 0);
  }

  if (defender.current.hp <= 0) {
    appendLog(system.state, `${defender.name} was destroyed.`);
    appendNotes(
      system.state,
      applyRunCardEffectWithChanges(
        system,
        attacker,
        attacker.gear?.slot === "gear-scavengers" ? "gear-scavengers" : "on-kill",
        () => applyRunCardOnKillEffects(system.state, attacker, defender),
        { combatId, order: Math.max(0, strikeOrder - 1) }
      )
    );
    appendNotes(
      system.state,
      applyRunCardEffectWithChanges(
        system,
        attacker,
        "chain-reaction",
        () => applyRunCardChainReaction(system.state, attacker, defender),
        { combatId, order: Math.max(0, strikeOrder - 1) }
      )
    );
  }

  if (attacker.current.hp <= 0) {
    appendLog(system.state, `${attacker.name} was destroyed.`);
    appendNotes(
      system.state,
      applyRunCardEffectWithChanges(
        system,
        defender,
        defender.gear?.slot === "gear-scavengers" ? "gear-scavengers" : "on-kill",
        () => applyRunCardOnKillEffects(system.state, defender, attacker),
        { combatId, order: Math.max(0, strikeOrder - 1) }
      )
    );
  }

  if (defender.current.hp <= 0) {
    if (resolveFinalTransmission(system, defender, attacker, { combatId, order: strikeOrder })) {
      strikeOrder += 1;
    }
  }

  if (attacker.current.hp <= 0) {
    resolveFinalTransmission(system, attacker, defender, { combatId, order: strikeOrder });
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
