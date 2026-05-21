import { TURN_SIDES } from "../../core/constants.js";
import { appendLog } from "../battleLog.js";
import { findUnitById, getReadyPlayerUnits } from "../battleUnits.js";
import { getMovementModifier } from "../commanderEffects.js";
import {
  getBuildingAt,
  getMovementPathCost,
  getReachableTiles,
  getSelectedUnit,
  getTerrainAt,
  getUnitAt
} from "../selectors.js";
import { attackTarget } from "./combatAction.js";
import {
  cancelPendingAttack,
  enterTransportWithPendingUnit,
  redoPendingMove,
  unloadTransportWithPendingUnit,
  useExtinguishAbilityWithPendingUnit,
  useMedpackWithPendingUnit,
  useSupportAbilityWithPendingUnit
} from "./pendingActionFlow.js";
import { getSlipstreamTiles } from "./shared.js";

export function handleTileSelection(system, x, y) {
  if (system.state.victory) {
    return false;
  }

  const isPlayerTurn = system.state.turn.activeSide === TURN_SIDES.PLAYER;
  const unitAtTile = getUnitAt(system.state, x, y);
  const buildingAtTile = getBuildingAt(system.state, x, y);
  const selectedUnit = getSelectedUnit(system.state);
  const pendingAction = system.state.pendingAction;
  const pendingUnit = pendingAction ? findUnitById(system.state, pendingAction.unitId) : null;

  if (!isPlayerTurn) {
    if (unitAtTile) {
      system.setSelection({
        type: "unit",
        id: unitAtTile.id,
        x: unitAtTile.x,
        y: unitAtTile.y
      });
      return true;
    }

    if (buildingAtTile) {
      system.setSelection({
        type: "building",
        id: buildingAtTile.id,
        x: buildingAtTile.x,
        y: buildingAtTile.y
      });
      return true;
    }

    if (getTerrainAt(system.state, x, y)) {
      system.state.selection = {
        type: "tile",
        id: null,
        x,
        y
      };
      return true;
    }

    system.clearSelection();
    return true;
  }

  if (pendingAction && pendingUnit?.owner === TURN_SIDES.PLAYER) {
    if ((pendingAction.mode ?? "menu") === "slipstream") {
      const canMoveToTile = getSlipstreamTiles(system.state, pendingUnit)
        .some((tile) => tile.x === x && tile.y === y);

      if (!canMoveToTile) {
        return false;
      }

      pendingUnit.x = x;
      pendingUnit.y = y;
      pendingUnit.movedThisTurn = true;
      if (pendingUnit.unitTypeId === "runner" && pendingUnit.transport?.carryingUnitId) {
        system.syncTransportCargoPosition(pendingUnit);
      }
      appendLog(system.state, `${pendingUnit.name} slipped into a new position.`);
      system.clearPendingAction();
      system.clearSelection();
      return true;
    }

    if ((pendingAction.mode ?? "menu") === "fire" && unitAtTile?.owner === TURN_SIDES.ENEMY) {
      const changed = attackTarget(system, pendingUnit.id, unitAtTile.id);

      if (!changed) {
        appendLog(system.state, "Attack is not available from the current position.");
      }

      return changed;
    }

    if ((pendingAction.mode ?? "menu") === "unload") {
      const changed = unloadTransportWithPendingUnit(system, x, y);
      if (!changed) {
        appendLog(system.state, "Unload destination is not valid.");
      }
      return changed;
    }

    if ((pendingAction.mode ?? "menu") === "transport") {
      const changed = unitAtTile?.owner === TURN_SIDES.PLAYER
        ? enterTransportWithPendingUnit(system, unitAtTile.id)
        : false;
      if (!changed) {
        appendLog(system.state, "Choose a highlighted runner.");
      }
      return changed;
    }

    if ((pendingAction.mode ?? "menu") === "support") {
      const changed = unitAtTile?.owner === TURN_SIDES.PLAYER
        ? useSupportAbilityWithPendingUnit(system, unitAtTile.id)
        : false;
      if (!changed) {
        appendLog(system.state, "Choose a highlighted unit.");
      }
      return changed;
    }

    if ((pendingAction.mode ?? "menu") === "medpack") {
      const changed = unitAtTile?.owner === TURN_SIDES.PLAYER
        ? useMedpackWithPendingUnit(system, unitAtTile.id)
        : false;
      if (!changed) {
        appendLog(system.state, "Choose a highlighted infantry unit.");
      }
      return changed;
    }

    if ((pendingAction.mode ?? "menu") === "extinguish") {
      const changed = unitAtTile?.owner === TURN_SIDES.PLAYER
        ? useExtinguishAbilityWithPendingUnit(system, unitAtTile.id)
        : false;
      if (!changed) {
        appendLog(system.state, "Choose a highlighted burned ally.");
      }
      return changed;
    }

    return false;
  }

  if (selectedUnit?.owner === TURN_SIDES.PLAYER && !selectedUnit.hasMoved) {
    const movementBudget =
      selectedUnit.stats.movement + getMovementModifier(system.state, selectedUnit);
    const reachableTiles = getReachableTiles(
      system.state,
      selectedUnit,
      movementBudget
    );

    const canMoveToTile = reachableTiles.some((tile) => tile.x === x && tile.y === y);
    const isCurrentTile = selectedUnit.x === x && selectedUnit.y === y;

    if (canMoveToTile) {
      system.state.pendingAction = {
        type: "move",
        unitId: selectedUnit.id,
        mode: "menu",
        fromX: selectedUnit.x,
        fromY: selectedUnit.y,
        fromStamina: selectedUnit.current.stamina,
        toX: x,
        toY: y
      };

      if (!isCurrentTile) {
        const spentStamina = getMovementPathCost(
          system.state,
          selectedUnit,
          movementBudget,
          x,
          y
        ) ?? 0;
        selectedUnit.x = x;
        selectedUnit.y = y;
        selectedUnit.movedThisTurn = true;
        selectedUnit.current.stamina = Math.max(0, selectedUnit.current.stamina - spentStamina);
        if (selectedUnit.unitTypeId === "runner" && selectedUnit.transport?.carryingUnitId) {
          selectedUnit.transport.canUnloadAfterMove = true;
          system.syncTransportCargoPosition(selectedUnit);
        }
        appendLog(system.state, `${selectedUnit.name} repositioned.`);
      }

      system.state.selection = { type: "unit", id: selectedUnit.id, x, y };
      return true;
    }
  }

  if (unitAtTile) {
    system.setSelection({
      type: "unit",
      id: unitAtTile.id,
      x: unitAtTile.x,
      y: unitAtTile.y
    });
    return true;
  }

  if (buildingAtTile) {
    system.setSelection({
      type: "building",
      id: buildingAtTile.id,
      x: buildingAtTile.x,
      y: buildingAtTile.y
    });
    return true;
  }

  if (getTerrainAt(system.state, x, y)) {
    system.setSelection({
      type: "tile",
      id: null,
      x,
      y
    });
    return true;
  }

  system.clearSelection();
  return true;
}

export function handleContextAction(system) {
  if (system.state.victory || system.state.turn.activeSide !== TURN_SIDES.PLAYER) {
    return false;
  }

  const pendingAction = system.state.pendingAction;
  const pendingUnit = pendingAction ? findUnitById(system.state, pendingAction.unitId) : null;

  if (pendingAction && pendingUnit?.owner === TURN_SIDES.PLAYER) {
    if ((pendingAction.mode ?? "menu") === "slipstream") {
      system.clearPendingAction();
      system.clearSelection();
      return true;
    }

    if ((pendingAction.mode ?? "menu") === "fire") {
      return cancelPendingAttack(system);
    }
    if ((pendingAction.mode ?? "menu") === "unload") {
      pendingAction.mode = "menu";
      return true;
    }
    if ((pendingAction.mode ?? "menu") === "transport") {
      pendingAction.mode = "menu";
      return true;
    }
    if ((pendingAction.mode ?? "menu") === "support") {
      pendingAction.mode = "menu";
      return true;
    }
    if ((pendingAction.mode ?? "menu") === "medpack") {
      pendingAction.mode = "menu";
      return true;
    }
    if ((pendingAction.mode ?? "menu") === "extinguish") {
      pendingAction.mode = "menu";
      return true;
    }

    return redoPendingMove(system);
  }

  if (system.state.selection?.type) {
    system.clearSelection();
    return true;
  }

  return false;
}

export function selectNextReadyUnit(system) {
  if (
    system.state.victory ||
    system.state.turn.activeSide !== TURN_SIDES.PLAYER ||
    system.state.pendingAction
  ) {
    return false;
  }

  const readyUnits = getReadyPlayerUnits(system.state);

  if (readyUnits.length === 0) {
    return false;
  }

  const selectedUnit = getSelectedUnit(system.state);
  const currentIndex = selectedUnit
    ? readyUnits.findIndex((unit) => unit.id === selectedUnit.id)
    : -1;
  const nextUnit = readyUnits[(currentIndex + 1 + readyUnits.length) % readyUnits.length];

  if (!nextUnit) {
    return false;
  }

  system.state.selection = {
    type: "unit",
    id: nextUnit.id,
    x: nextUnit.x,
    y: nextUnit.y
  };

  return true;
}
