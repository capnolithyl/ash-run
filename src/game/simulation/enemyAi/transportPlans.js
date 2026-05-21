import { getMovementModifier } from "../commanderEffects.js";
import {
  getLivingUnits,
  getReachableTiles,
  getUnitMovementAllowance,
  getValidUnloadTiles
} from "../selectors.js";
import { canLoadUnit } from "../transportRules.js";
import { getStrategicObjectiveScore } from "./movementScoring.js";
import { getPlayerMovementThreatMargin } from "./shared.js";

function getAdjacentTransportPassengers(state, runner) {
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
    });
}

function getBestFootObjectiveScore(state, passenger) {
  const movementBudget = getUnitMovementAllowance(
    passenger,
    passenger.stats.movement + getMovementModifier(state, passenger)
  );
  const reachableTiles = getReachableTiles(state, passenger, movementBudget);
  const currentTile = { x: passenger.x, y: passenger.y };

  return [currentTile, ...reachableTiles].reduce(
    (bestScore, tile) => Math.max(bestScore, getStrategicObjectiveScore(state, passenger, tile)),
    Number.NEGATIVE_INFINITY
  );
}

function scoreLoadedPassengerPosition(state, passenger, tile) {
  const positionedPassenger = {
    ...passenger,
    x: tile.x,
    y: tile.y
  };
  const currentThreatMargin = getPlayerMovementThreatMargin(state, passenger, { x: passenger.x, y: passenger.y });
  const nextThreatMargin = getPlayerMovementThreatMargin(state, positionedPassenger, tile);

  return (
    getStrategicObjectiveScore(state, positionedPassenger, tile) -
    10 +
    (currentThreatMargin <= 0 && nextThreatMargin > 0 ? 26 : 0)
  );
}

// Runner plans weigh whether cargo should stay loaded, board first, or unload
// immediately so the transport logic stays aligned with the same objective map
// scoring the rest of the AI uses.
export function getBestRunnerTransportPlan(state, runner, reachableTiles) {
  if (runner.unitTypeId !== "runner") {
    return null;
  }

  const carriedPassenger = runner.transport?.carryingUnitId
    ? getLivingUnits(state, runner.owner).find((unit) => unit.id === runner.transport.carryingUnitId) ?? null
    : null;
  const passengers = carriedPassenger ? [carriedPassenger] : getAdjacentTransportPassengers(state, runner);

  if (passengers.length === 0) {
    return null;
  }

  const originalRunnerPosition = { x: runner.x, y: runner.y };
  let bestPlan = null;

  for (const passenger of passengers) {
    const footObjectiveScore = carriedPassenger ? Number.NEGATIVE_INFINITY : getBestFootObjectiveScore(state, passenger);
    const originalPassengerPosition = { x: passenger.x, y: passenger.y };
    const currentPassengerThreatMargin = getPlayerMovementThreatMargin(state, passenger, originalPassengerPosition);

    for (const moveTile of reachableTiles) {
      const isMovedTile =
        moveTile.x !== originalRunnerPosition.x || moveTile.y !== originalRunnerPosition.y;
      runner.x = moveTile.x;
      runner.y = moveTile.y;
      passenger.x = moveTile.x;
      passenger.y = moveTile.y;

      const carryScore = scoreLoadedPassengerPosition(state, passenger, moveTile);
      const carryType = currentPassengerThreatMargin <= 0 && getPlayerMovementThreatMargin(state, passenger, moveTile) > 0
        ? "extract-and-retreat"
        : carriedPassenger
          ? "carry-forward"
          : "board-and-carry";
      const carryPlan = {
        type: carryType,
        passengerId: passenger.id,
        moveTile,
        unloadTile: null,
        score: carryScore
      };

      if (
        isMovedTile &&
        (
          carriedPassenger ||
          carryScore >= footObjectiveScore + 10 ||
          carryType === "extract-and-retreat"
        )
      ) {
        if (!bestPlan || carryPlan.score > bestPlan.score) {
          bestPlan = carryPlan;
        }
      }

      const unloadTiles = getValidUnloadTiles(state, runner, passenger);

      for (const unloadTile of unloadTiles) {
        const unloadedPassenger = {
          ...passenger,
          x: unloadTile.x,
          y: unloadTile.y,
          transport: {
            ...passenger.transport,
            carriedByUnitId: null
          }
        };
        const unloadScore =
          getStrategicObjectiveScore(state, unloadedPassenger, unloadTile) +
          6 +
          (currentPassengerThreatMargin <= 0 &&
          getPlayerMovementThreatMargin(state, unloadedPassenger, unloadTile) > 0
            ? 18
            : 0);
        const unloadType =
          moveTile.x === originalRunnerPosition.x && moveTile.y === originalRunnerPosition.y
            ? "unload-now"
            : currentPassengerThreatMargin <= 0 &&
                getPlayerMovementThreatMargin(state, unloadedPassenger, unloadTile) > 0
              ? "extract-and-retreat"
              : "move-then-unload";
        const unloadPlan = {
          type: unloadType,
          passengerId: passenger.id,
          moveTile,
          unloadTile,
          score: unloadScore
        };

        if (
          carriedPassenger ||
          unloadScore >= footObjectiveScore + 6 ||
          unloadType === "extract-and-retreat"
        ) {
          if (!bestPlan || unloadPlan.score > bestPlan.score) {
            bestPlan = unloadPlan;
          }
        }
      }
    }

    passenger.x = originalPassengerPosition.x;
    passenger.y = originalPassengerPosition.y;
  }

  runner.x = originalRunnerPosition.x;
  runner.y = originalRunnerPosition.y;
  return bestPlan;
}
