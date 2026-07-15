import { TURN_SIDES, UNIT_TAGS } from "../../core/constants.js";
import { appendLog } from "../battleLog.js";
import { findUnitById } from "../battleUnits.js";
import { canCaptureBuilding, captureBuildingForUnit } from "../captureRules.js";
import { getAttackableUnitIds } from "../combatResolver.js";
import {
  applyBuildingSupply,
  getBuildingSupplyPreview
} from "../battleServicing.js";
import {
  canUnitDropOffHostage,
  canUnitRescueHostage,
  performDropOff,
  performRescue
} from "../missionRules.js";
import {
  getBuildingAt,
  getValidUnloadTiles
} from "../selectors.js";
import { resolveReinforcementTileCrossing } from "../reinforcementRules.js";
import {
  applyExtinguishAbility,
  getExtinguishTargetsForUnit,
  getMedpackTargetsForUnit
} from "./supportActions.js";

export function canCaptureWithPendingUnit(system) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);
  const building = unit ? getBuildingAt(system.state, unit.x, unit.y) : null;

  return canCaptureBuilding(unit, building);
}

export function canSupplyWithPendingUnit(system) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction || (pendingAction.mode ?? "menu") !== "menu") {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);
  const building = unit ? getBuildingAt(system.state, unit.x, unit.y) : null;

  return getBuildingSupplyPreview(system.state, unit, building).changed;
}

export function beginPendingAttack(system) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);

  if (!unit || getAttackableUnitIds(system.state, unit).length === 0) {
    return false;
  }

  pendingAction.mode = "fire";
  return true;
}

export function cancelPendingAttack(system) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction || (pendingAction.mode ?? "menu") !== "fire") {
    return false;
  }

  pendingAction.mode = "menu";
  return true;
}

export function beginPendingUnload(system) {
  const pendingAction = system.state.pendingAction;
  if (!pendingAction) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);
  if (!unit?.transport?.carryingUnitId || unit.transport.hasLockedUnload) {
    return false;
  }

  const carried = findUnitById(system.state, unit.transport.carryingUnitId);
  if (getValidUnloadTiles(system.state, unit, carried).length === 0) {
    return false;
  }

  pendingAction.mode = "unload";
  return true;
}

export function unloadTransportWithPendingUnit(system, x, y) {
  const pendingAction = system.state.pendingAction;
  if (!pendingAction || (pendingAction.mode ?? "menu") !== "unload") {
    return false;
  }

  const runner = findUnitById(system.state, pendingAction.unitId);
  const carried = runner?.transport?.carryingUnitId
    ? findUnitById(system.state, runner.transport.carryingUnitId)
    : null;
  if (!runner || !carried) {
    return false;
  }

  const canUnloadToTile = getValidUnloadTiles(system.state, runner, carried)
    .some((tile) => tile.x === x && tile.y === y);
  if (!canUnloadToTile) {
    return false;
  }

  carried.transport.carriedByUnitId = null;
  carried.x = x;
  carried.y = y;
  carried.movedThisTurn = true;
  carried.hasMoved = true;
  carried.hasAttacked = true;
  runner.transport.carryingUnitId = null;
  runner.hasMoved = true;
  runner.hasAttacked = true;
  appendLog(system.state, `${carried.name} disembarked from ${runner.name}.`);
  system.recordPresentationEvent("transport", {
    action: "unload",
    carrierId: runner.id,
    carrierUnitTypeId: runner.unitTypeId,
    passengerId: carried.id,
    passengerUnitTypeId: carried.unitTypeId,
    owner: runner.owner,
    x,
    y
  });
  resolveReinforcementTileCrossing(system.state, [{ x, y }]);
  system.clearPendingAction();
  system.clearSelection();
  return true;
}

export function enterTransportWithPendingUnit(system, runnerId = null) {
  const pendingAction = system.state.pendingAction;
  const unit = pendingAction ? findUnitById(system.state, pendingAction.unitId) : null;
  const validRunners = unit ? system.getAdjacentFriendlyTransports(unit) : [];
  const runner = runnerId
    ? validRunners.find((candidate) => candidate.id === runnerId)
    : validRunners[0] ?? null;
  if (!unit || !runner) {
    return false;
  }

  if (!runnerId && validRunners.length > 1) {
    pendingAction.mode = "transport";
    return true;
  }

  system.boardUnitIntoRunner(unit, runner);
  system.clearPendingAction();
  system.state.selection = { type: "unit", id: runner.id, x: runner.x, y: runner.y };
  return true;
}

export function useSupportAbilityWithPendingUnit(system, targetId = null) {
  const pendingAction = system.state.pendingAction;
  if (!pendingAction) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);
  if (!unit || !["medic", "mechanic"].includes(unit.unitTypeId)) {
    return false;
  }

  if ((unit.cooldowns?.support ?? 0) > 0) {
    return false;
  }

  const validTargets = system.getSupportTargetsForUnit(unit);
  const target = targetId
    ? validTargets.find((option) => option.target.id === targetId)?.target
    : validTargets[0]?.target ?? null;

  if (!target) {
    return false;
  }

  if (!targetId && validTargets.length > 1) {
    pendingAction.mode = "support";
    return true;
  }

  system.applySupportAbility(unit, target);
  system.clearPendingAction();
  system.clearSelection();
  return true;
}

export function useMedpackWithPendingUnit(system, targetId = null) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);

  if (!unit || unit.gear?.slot !== "gear-field-meds") {
    return false;
  }

  const validTargets = getMedpackTargetsForUnit(system, unit);
  const target = targetId
    ? validTargets.find((option) => option.target.id === targetId)?.target
    : validTargets[0]?.target ?? null;

  if (!target) {
    return false;
  }

  if (!targetId && validTargets.length > 1) {
    pendingAction.mode = "medpack";
    return true;
  }

  system.applyMedpackAbility(unit, target);
  system.clearPendingAction();
  system.clearSelection();
  return true;
}

export function useExtinguishAbilityWithPendingUnit(system, targetId = null) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);

  if (!unit || unit.family !== UNIT_TAGS.INFANTRY) {
    return false;
  }

  const validTargets = getExtinguishTargetsForUnit(system, unit);
  const target = targetId
    ? validTargets.find((candidate) => candidate.id === targetId)
    : validTargets[0] ?? null;

  if (!target) {
    return false;
  }

  if (!targetId && validTargets.length > 1) {
    pendingAction.mode = "extinguish";
    return true;
  }

  const changed = applyExtinguishAbility(system, unit, target);

  if (!changed) {
    return false;
  }

  system.clearPendingAction();
  system.clearSelection();
  return true;
}

export function waitWithPendingUnit(system) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);

  if (!unit) {
    system.clearPendingAction();
    return false;
  }

  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(system.state, `${unit.name} holds position.`);
  system.clearPendingAction();
  system.clearSelection();
  return true;
}

export function captureWithPendingUnit(system) {
  if (!canCaptureWithPendingUnit(system)) {
    return false;
  }

  const unit = findUnitById(system.state, system.state.pendingAction.unitId);
  const building = getBuildingAt(system.state, unit.x, unit.y);

  captureBuildingForUnit(system.state, unit, building);
  system.recordPresentationEvent("mission", {
    action: "capture",
    actorId: unit.id,
    actorUnitTypeId: unit.unitTypeId,
    owner: unit.owner,
    buildingId: building.id,
    buildingType: building.type,
    x: building.x,
    y: building.y
  });
  system.clearPendingAction();
  system.state.selection = {
    type: "building",
    id: building.id,
    x: building.x,
    y: building.y
  };
  system.updateVictoryState();
  return true;
}

export function useSupplyWithPendingUnit(system) {
  if (!canSupplyWithPendingUnit(system)) {
    return false;
  }

  const unit = findUnitById(system.state, system.state.pendingAction.unitId);
  const building = getBuildingAt(system.state, unit.x, unit.y);
  const result = applyBuildingSupply(system.state, unit, building);

  if (!result.changed) {
    return false;
  }

  system.recordPresentationEvent("service", {
    actorId: unit.id,
    actorUnitTypeId: unit.unitTypeId,
    targetId: unit.id,
    targetUnitTypeId: unit.unitTypeId,
    owner: unit.owner,
    sourceKind: "building",
    sourceId: building.id,
    buildingType: building.type,
    hpRecovered: result.hpRecovered,
    ammoRecovered: result.ammoRecovered,
    staminaRecovered: result.staminaRecovered,
    x: unit.x,
    y: unit.y
  });

  system.clearPendingAction();
  system.clearSelection();
  return true;
}

export function rescueHostageWithPendingUnit(system) {
  const pendingAction = system.state.pendingAction;
  const unit = pendingAction ? findUnitById(system.state, pendingAction.unitId) : null;

  if (!unit || !canUnitRescueHostage(system.state, unit)) {
    return false;
  }

  const changed = performRescue(system.state, unit);

  if (!changed) {
    return false;
  }

  system.recordPresentationEvent("mission", {
    action: "rescue",
    actorId: unit.id,
    actorUnitTypeId: unit.unitTypeId,
    owner: unit.owner,
    x: unit.x,
    y: unit.y
  });

  system.clearPendingAction();
  system.state.selection = {
    type: "unit",
    id: unit.id,
    x: unit.x,
    y: unit.y
  };
  system.updateVictoryState();
  return true;
}

export function dropOffHostageWithPendingUnit(system) {
  const pendingAction = system.state.pendingAction;
  const unit = pendingAction ? findUnitById(system.state, pendingAction.unitId) : null;

  if (!unit || !canUnitDropOffHostage(system.state, unit)) {
    return false;
  }

  const changed = performDropOff(system.state, unit);

  if (!changed) {
    return false;
  }

  system.recordPresentationEvent("mission", {
    action: "drop-off",
    actorId: unit.id,
    actorUnitTypeId: unit.unitTypeId,
    owner: unit.owner,
    x: unit.x,
    y: unit.y
  });

  system.clearPendingAction();
  system.state.selection = {
    type: "unit",
    id: unit.id,
    x: unit.x,
    y: unit.y
  };
  system.updateVictoryState();
  return true;
}

// Pending actions are the menu-driven transition layer between movement,
// follow-up abilities, and mission-specific interactions.
export function redoPendingMove(system) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction || pendingAction.reinforcementLocked) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);

  if (!unit) {
    system.clearPendingAction();
    return false;
  }

  unit.x = pendingAction.fromX;
  unit.y = pendingAction.fromY;
  unit.movedThisTurn = false;
  system.syncTransportCargoPosition(unit);
  unit.current.stamina = pendingAction.fromStamina;
  system.clearPendingAction();
  system.state.selection = {
    type: "unit",
    id: unit.id,
    x: unit.x,
    y: unit.y
  };
  return true;
}
