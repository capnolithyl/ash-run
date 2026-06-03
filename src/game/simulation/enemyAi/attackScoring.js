import { ENEMY_AI_ARCHETYPES, TURN_SIDES } from "../../core/constants.js";
import { getAttackForecast, getPositionArmorBonus, getTargetsForUnit } from "../combatResolver.js";
import { getUnitAttackProfile } from "../selectors.js";
import { getTargetProfileForAttack } from "../../content/weaponClasses.js";
import { getEnemyAiArchetype } from "./profiles.js";
import {
  getPlayerAttackThreatMargin,
  getPlayerCommandBuilding,
  getPlayerMovementThreatMargin
} from "./shared.js";

function getAverageDamage(damageRange) {
  return (damageRange.min + damageRange.max) / 2;
}

function scoreAttackTrade(state, attacker, defender) {
  const forecast = getAttackForecast(state, attacker, defender);
  const dealtAverage = getAverageDamage(forecast.dealt);
  const receivedAverage = forecast.received ? getAverageDamage(forecast.received) : 0;
  const killsTarget = forecast.dealt.max >= defender.current.hp;
  const damageRatio = defender.stats.maxHealth > 0 ? dealtAverage / defender.stats.maxHealth : 0;
  const targetValue = Math.max(1, defender.cost / 300);
  const attackProfile = getUnitAttackProfile(attacker);
  const attackDistance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
  const isRangedAttack = Boolean(attackProfile && attackDistance > 1);
  const targetProfile = getTargetProfileForAttack(attacker, defender, attackProfile);
  const isEffective = Boolean(targetProfile?.isEffective);
  const canCounter = Boolean(forecast.received);
  const netDamage = dealtAverage - receivedAverage;
  const attackThreatMargin = getPlayerAttackThreatMargin(state, attacker, { x: attacker.x, y: attacker.y });
  const movementThreatMargin = getPlayerMovementThreatMargin(state, attacker, { x: attacker.x, y: attacker.y });
  const positionArmorBonus = getPositionArmorBonus(state, attacker);
  const playerCommand = getPlayerCommandBuilding(state);
  const defenderCommandDistance = playerCommand
    ? Math.abs(defender.x - playerCommand.x) + Math.abs(defender.y - playerCommand.y)
    : Number.POSITIVE_INFINITY;
  const score =
    dealtAverage * 2.35 -
    receivedAverage * 2.1 +
    damageRatio * 13 +
    targetValue +
    (isEffective ? 8 : 0) +
    (isRangedAttack ? 6 : 0) +
    (!canCounter ? 6 : 0) +
    (killsTarget ? 55 : 0) +
    (movementThreatMargin > 0 ? 5 : 0) +
    positionArmorBonus * 1.8 +
    (defenderCommandDistance <= 2 ? 8 : 0);

  return {
    forecast,
    dealtAverage,
    receivedAverage,
    netDamage,
    killsTarget,
    isEffective,
    isRangedAttack,
    canCounter,
    positionArmorBonus,
    attackThreatMargin,
    movementThreatMargin,
    safeFromImmediateThreat: attackThreatMargin > 0,
    safeFromMovementThreat: movementThreatMargin > 0,
    canEscapeThreatAfterAttack: movementThreatMargin > 0,
    defenderCommandDistance,
    isFavorable:
      killsTarget ||
      (!canCounter && dealtAverage >= 3) ||
      (isEffective && dealtAverage >= 3) ||
      (dealtAverage >= Math.max(5, defender.stats.maxHealth * 0.3) &&
        dealtAverage >= receivedAverage + 1) ||
      (dealtAverage >= 4 && dealtAverage >= receivedAverage * 1.15 + 1),
    score
  };
}

export function getScoredAttackOptions(state, unit) {
  return getTargetsForUnit(state, unit)
    .map((target) => ({
      target,
      trade: scoreAttackTrade(state, unit, target)
    }))
    .sort((left, right) => right.trade.score - left.trade.score);
}

export function isAttackAcceptable(state, option, { allowRisky = false } = {}) {
  if (!option) {
    return false;
  }

  const archetype = getEnemyAiArchetype(state);
  const trade = option.trade;
  const hqRushPressure = trade.defenderCommandDistance <= 2;
  const effectiveBias = trade.isEffective && trade.dealtAverage >= 2;

  if (allowRisky) {
    return trade.dealtAverage >= 2 || trade.killsTarget || effectiveBias;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE) {
    return (
      trade.killsTarget ||
      hqRushPressure ||
      trade.score >= 14 ||
      trade.dealtAverage >= 3.5 ||
      effectiveBias ||
      (trade.dealtAverage >= 4 && trade.netDamage >= -2)
    );
  }

  if (archetype === ENEMY_AI_ARCHETYPES.TURTLE) {
    return (
      trade.killsTarget ||
      (!trade.canCounter && trade.dealtAverage >= 3) ||
      (trade.safeFromMovementThreat && trade.score >= 22) ||
      (trade.dealtAverage >= 5 && trade.netDamage >= 2)
    );
  }

  if (archetype === ENEMY_AI_ARCHETYPES.CAPTURE) {
    return (
      trade.killsTarget ||
      trade.score >= 19 ||
      (!trade.canCounter && trade.dealtAverage >= 3) ||
      effectiveBias
    );
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HQ_RUSH) {
    return (
      trade.killsTarget ||
      hqRushPressure ||
      trade.score >= 15 ||
      trade.dealtAverage >= 3 ||
      effectiveBias
    );
  }

  return (
    trade.killsTarget ||
    trade.score >= 18 ||
    (!trade.canCounter && trade.dealtAverage >= 3) ||
    effectiveBias ||
    (trade.dealtAverage >= 4 && trade.netDamage >= -0.5)
  );
}

export function isPriorityAttack(option) {
  return Boolean(option?.trade?.killsTarget);
}

export function pickBestPriorityAttack(state, unit) {
  return getScoredAttackOptions(state, unit).find((option) => isPriorityAttack(option)) ?? null;
}

export function pickBestFavorableAttack(state, unit) {
  return getScoredAttackOptions(state, unit).find((option) => isAttackAcceptable(state, option)) ?? null;
}

export function pickBestAvailableAttack(state, unit) {
  return getScoredAttackOptions(state, unit)[0] ?? null;
}
