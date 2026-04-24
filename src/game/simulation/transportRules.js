import { TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { appendLog } from "./battleLog.js";
import { findUnitById } from "./battleUnits.js";
import { getLivingUnits, getValidUnloadTiles } from "./selectors.js";

export function canLoadUnit(unit, runner) {
  return Boolean(
    unit &&
    runner &&
    unit.owner === runner.owner &&
    unit.family === UNIT_TAGS.INFANTRY &&
    runner.unitTypeId === "runner" &&
    !unit.transport?.carriedByUnitId &&
    !runner.transport?.carryingUnitId
  );
}

export function getAdjacentFriendlyTransports(state, unit) {
  if (!unit || unit.family !== UNIT_TAGS.INFANTRY || unit.transport?.carriedByUnitId) {
    return [];
  }

  return getLivingUnits(state, unit.owner)
    .filter((candidate) => {
      if (!canLoadUnit(unit, candidate)) {
        return false;
      }

      const distance = Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y);
      return distance === 1;
    })
    .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
}

export function getAdjacentFriendlyTransport(state, unit) {
  return getAdjacentFriendlyTransports(state, unit)[0] ?? null;
}

export function syncTransportCargoPosition(state, runner) {
  const carriedUnitId = runner?.transport?.carryingUnitId;

  if (!carriedUnitId) {
    return;
  }

  const carried = findUnitById(state, carriedUnitId);

  if (carried?.transport?.carriedByUnitId === runner.id) {
    carried.x = runner.x;
    carried.y = runner.y;
  }
}

export function getAdjacentTransportPassenger(state, runner) {
  if (runner?.unitTypeId !== "runner" || runner.transport?.carryingUnitId) {
    return null;
  }

  return getLivingUnits(state, runner.owner)
    .filter((candidate) => {
      if (
        !canLoadUnit(candidate, runner) ||
        candidate.id === runner.id ||
        candidate.hasMoved ||
        candidate.hasAttacked
      ) {
        return false;
      }

      return Math.abs(candidate.x - runner.x) + Math.abs(candidate.y - runner.y) === 1;
    })
    .sort((left, right) => {
      const score = (unit) => {
        if (unit.unitTypeId === "grunt") {
          return 6;
        }
        if (unit.unitTypeId === "breaker" || unit.unitTypeId === "longshot") {
          return 5;
        }
        return 3;
      };

      return score(right) - score(left);
    })[0] ?? null;
}

export function boardUnitIntoRunner(state, unit, runner) {
  if (!canLoadUnit(unit, runner)) {
    return false;
  }

  unit.transport.carriedByUnitId = runner.id;
  unit.x = runner.x;
  unit.y = runner.y;
  unit.hasMoved = true;
  unit.hasAttacked = true;
  runner.transport.carryingUnitId = unit.id;
  syncTransportCargoPosition(state, runner);
  appendLog(state, `${unit.name} boarded ${runner.name}.`);
  return true;
}

export function getNearestOpponentDistance(state, unit, tile) {
  const opponentSide = unit.owner === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
  const opponents = getLivingUnits(state, opponentSide);

  if (opponents.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return opponents.reduce(
    (nearest, opponent) => Math.min(nearest, Math.abs(opponent.x - tile.x) + Math.abs(opponent.y - tile.y)),
    Number.POSITIVE_INFINITY
  );
}

export function unloadTransportForEnemy(state, runner) {
  const carried = runner?.transport?.carryingUnitId
    ? findUnitById(state, runner.transport.carryingUnitId)
    : null;

  if (!runner || !carried || runner.transport.hasLockedUnload) {
    return false;
  }

  const destination = getValidUnloadTiles(state, runner, carried)
    .sort(
      (left, right) =>
        getNearestOpponentDistance(state, carried, left) -
        getNearestOpponentDistance(state, carried, right)
    )[0];

  if (!destination) {
    return false;
  }

  carried.transport.carriedByUnitId = null;
  carried.x = destination.x;
  carried.y = destination.y;
  carried.hasMoved = true;
  carried.hasAttacked = true;
  runner.transport.carryingUnitId = null;
  runner.hasMoved = true;
  runner.hasAttacked = true;
  appendLog(state, `${carried.name} disembarked from ${runner.name}.`);
  return true;
}
