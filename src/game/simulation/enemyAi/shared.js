import { BUILDING_KEYS, TURN_SIDES } from "../../core/constants.js";
import { randomInt } from "../../core/random.js";
import { getMovementModifier } from "../commanderEffects.js";
import { getAttackRangeCap } from "../combatResolver.js";
import {
  canUnitAttackTarget,
  getLivingUnits,
  getUnitAttackProfile,
  getUnitMovementAllowance
} from "../selectors.js";

export function takeRandomInt(state, minimum, maximum) {
  const roll = randomInt(state.seed, minimum, maximum);
  state.seed = roll.seed;
  return roll.value;
}

export function getPlayerCommandBuilding(state) {
  return state.map.buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.PLAYER
  ) ?? null;
}

export function getPlayerAttackThreatMargin(state, unit, tile) {
  let lowestMargin = Number.POSITIVE_INFINITY;

  for (const playerUnit of getLivingUnits(state, TURN_SIDES.PLAYER)) {
    if (!canUnitAttackTarget(playerUnit, unit)) {
      continue;
    }

    const attackProfile = getUnitAttackProfile(playerUnit);
    const distance = Math.abs(playerUnit.x - tile.x) + Math.abs(playerUnit.y - tile.y);

    if (!attackProfile) {
      continue;
    }

    lowestMargin = Math.min(
      lowestMargin,
      distance - getAttackRangeCap(state, playerUnit, attackProfile)
    );
  }

  return lowestMargin;
}

export function getPlayerMovementThreatMargin(state, unit, tile) {
  let lowestMargin = Number.POSITIVE_INFINITY;

  for (const playerUnit of getLivingUnits(state, TURN_SIDES.PLAYER)) {
    if (!canUnitAttackTarget(playerUnit, unit)) {
      continue;
    }

    const attackProfile = getUnitAttackProfile(playerUnit);

    if (!attackProfile) {
      continue;
    }

    const movementBudget = getUnitMovementAllowance(
      playerUnit,
      playerUnit.stats.movement + getMovementModifier(state, playerUnit)
    );
    const threatRange = movementBudget + getAttackRangeCap(state, playerUnit, attackProfile);
    const distance = Math.abs(playerUnit.x - tile.x) + Math.abs(playerUnit.y - tile.y);
    lowestMargin = Math.min(lowestMargin, distance - threatRange);
  }

  return lowestMargin;
}

export function getNearestPlayerDistance(state, tile) {
  const playerUnits = getLivingUnits(state, TURN_SIDES.PLAYER);

  if (playerUnits.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return playerUnits.reduce((nearest, playerUnit) => {
    const distance = Math.abs(tile.x - playerUnit.x) + Math.abs(tile.y - playerUnit.y);
    return Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);
}

function compareDescending(left, right) {
  return right - left;
}

function compareAscending(left, right) {
  return left - right;
}

function compareBooleanDescending(left, right) {
  return Number(right) - Number(left);
}

export function compareSlipstreamCandidates(left, right) {
  return (
    compareBooleanDescending(left.isSafeFromMovementThreat, right.isSafeFromMovementThreat) ||
    compareBooleanDescending(left.isSafeFromImmediateThreat, right.isSafeFromImmediateThreat) ||
    compareDescending(left.positionArmorBonus, right.positionArmorBonus) ||
    compareDescending(left.movementThreatMargin, right.movementThreatMargin) ||
    compareDescending(left.attackThreatMargin, right.attackThreatMargin) ||
    compareDescending(left.nearestPlayerDistance, right.nearestPlayerDistance) ||
    compareBooleanDescending(left.isCurrentTile, right.isCurrentTile) ||
    compareAscending(left.y, right.y) ||
    compareAscending(left.x, right.x)
  );
}
