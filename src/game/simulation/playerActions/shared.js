import { canSlipstreamAfterAttack } from "../commanderEffects.js";
import { canRunCardRepositionAfterAttack } from "../runCardEffects.js";
import { getReachableTiles } from "../selectors.js";

export function getSlipstreamTiles(state, unit) {
  return getReachableTiles(state, unit, 1).filter((tile) => tile.x !== unit.x || tile.y !== unit.y);
}

// Slipstream is a post-attack reposition choice, so we preserve the normal
// pending-action flow and only swap it into this dedicated follow-up state.
export function prepareSlipstreamReposition(system, attacker, options = {}) {
  const canReposition =
    canSlipstreamAfterAttack(system.state, attacker) ||
    canRunCardRepositionAfterAttack(system.state, attacker, options);

  if (!canReposition || attacker.transport?.carriedByUnitId) {
    return false;
  }

  const slipstreamTiles = getSlipstreamTiles(system.state, attacker);

  if (slipstreamTiles.length === 0) {
    return false;
  }

  system.state.pendingAction = {
    type: "slipstream",
    unitId: attacker.id,
    mode: "slipstream",
    fromX: attacker.x,
    fromY: attacker.y,
    fromStamina: attacker.current.stamina,
    toX: attacker.x,
    toY: attacker.y
  };
  system.state.selection = {
    type: "unit",
    id: attacker.id,
    x: attacker.x,
    y: attacker.y
  };
  return true;
}
