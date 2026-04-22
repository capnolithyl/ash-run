import { TURN_SIDES } from "../core/constants.js";
import { getLivingUnits } from "./selectors.js";

export function findUnitById(state, unitId) {
  return [...state.player.units, ...state.enemy.units].find((unit) => unit.id === unitId);
}

function compareUnitsForSelectionOrder(left, right) {
  if (left.y !== right.y) {
    return left.y - right.y;
  }

  if (left.x !== right.x) {
    return left.x - right.x;
  }

  return left.id.localeCompare(right.id);
}

export function getReadyPlayerUnits(state) {
  return getLivingUnits(state, TURN_SIDES.PLAYER)
    .filter((unit) => !unit.hasMoved && !unit.transport?.carriedByUnitId)
    .sort(compareUnitsForSelectionOrder);
}
