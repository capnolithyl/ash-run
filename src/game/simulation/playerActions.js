import { BUILDING_KEYS, PROTOTYPE_ROSTER_CAP, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { BUILDING_RECRUITMENT, UNIT_CATALOG } from "../content/unitCatalog.js";
import { awardExperience } from "./progression.js";
import { appendLog, pushLevelUpEvents } from "./battleLog.js";
import { restoreUnitServiceResources } from "./battleServicing.js";
import { findUnitById, getReadyPlayerUnits } from "./battleUnits.js";
import { canCaptureBuilding, captureBuildingForUnit } from "./captureRules.js";
import {
  activateCommanderPower,
  applyChargeFromCombat,
  canSlipstreamAfterAttack,
  canResupplyUnit,
  getExperienceModifier,
  getMovementModifier,
  shouldDefenderPreemptCombat,
  shouldPreventCombatDamage
} from "./commanderEffects.js";
import {
  getAttackRangeCap,
  getAttackableUnitIds,
  getCombatExperience,
  getDamageResult,
  removeDeadUnits
} from "./combatResolver.js";
import {
  canUnitAttackTarget,
  getAttackProfileForTarget,
  getBuildingAt,
  getLivingUnits,
  getAntiAirGearAmmo,
  getReachableTiles,
  getMovementPathCost,
  getSelectedBuilding,
  getSelectedUnit,
  getTerrainAt,
  getUnitAt,
  getUnitAttackProfile,
  getValidUnloadTiles
} from "./selectors.js";
import { createUnitFromType } from "./unitFactory.js";

const INFANTRY_RECRUIT_TYPES = new Set(["grunt", "breaker", "longshot", "medic", "mechanic"]);
const FIELD_MEDPACK_HEAL_RATIO = 0.33;

export function getSupportTargetForUnit(system, unit, { requireNeed = false } = {}) {
  return getSupportTargetsForUnit(system, unit, { requireNeed })[0]?.target ?? null;
}

function getSupportNeedScore(state, target) {
  const missingHp = target.stats.maxHealth - target.current.hp;
  const canResupply = canResupplyUnit(state, target);
  const missingAmmo = canResupply ? target.stats.ammoMax - target.current.ammo : 0;
  const missingStamina = canResupply ? target.stats.staminaMax - target.current.stamina : 0;

  return missingHp * 2 + missingAmmo * 3 + missingStamina * 2;
}

function getSlipstreamTiles(state, unit) {
  return getReachableTiles(state, unit, 1).filter((tile) => tile.x !== unit.x || tile.y !== unit.y);
}

function prepareSlipstreamReposition(system, attacker) {
  if (!canSlipstreamAfterAttack(system.state, attacker) || attacker.transport?.carriedByUnitId) {
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

export function getSupportTargetsForUnit(system, unit, { requireNeed = true } = {}) {
  const targetFamily =
    unit?.unitTypeId === "medic"
      ? UNIT_TAGS.INFANTRY
      : unit?.unitTypeId === "mechanic"
        ? UNIT_TAGS.VEHICLE
        : null;

  if (!targetFamily || (unit.cooldowns?.support ?? 0) > 0 || unit.transport?.carriedByUnitId) {
    return [];
  }

  return getLivingUnits(system.state, unit.owner)
    .filter((candidate) => {
      if (
        candidate.id === unit.id ||
        candidate.family !== targetFamily ||
        candidate.transport?.carriedByUnitId
      ) {
        return false;
      }

      return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
    })
    .map((target) => {
      return {
        target,
        needScore: getSupportNeedScore(system.state, target)
      };
    })
    .filter((option) => !requireNeed || option.needScore > 0)
    .sort((left, right) => right.needScore - left.needScore || left.target.id.localeCompare(right.target.id));
}

export function applySupportAbility(system, unit, target) {
  if (!unit || !target) {
    return false;
  }

  const result = restoreUnitServiceResources(system.state, target, {
    healAmount: Math.ceil(target.stats.maxHealth * 0.5)
  });

  if (!result.changed) {
    return false;
  }

  unit.cooldowns.support = unit.unitTypeId === "medic" ? 2 : 3;
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(system.state, `${unit.name} serviced ${target.name}.`);
  return true;
}

export function getMedpackTargetsForUnit(system, unit, { requireNeed = true } = {}) {
  if (
    !unit ||
    unit.family !== UNIT_TAGS.INFANTRY ||
    unit.gear?.slot !== "gear-field-meds" ||
    unit.transport?.carriedByUnitId
  ) {
    return [];
  }

  return getLivingUnits(system.state, unit.owner)
    .filter((candidate) => {
      if (candidate.family !== UNIT_TAGS.INFANTRY || candidate.transport?.carriedByUnitId) {
        return false;
      }

      if (candidate.id === unit.id) {
        return true;
      }

      return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
    })
    .map((target) => ({
      target,
      needScore: Math.max(0, target.stats.maxHealth - target.current.hp)
    }))
    .filter((option) => !requireNeed || option.needScore > 0)
    .sort((left, right) => right.needScore - left.needScore || left.target.id.localeCompare(right.target.id));
}

export function applyMedpackAbility(system, unit, target) {
  if (!unit || !target || unit.gear?.slot !== "gear-field-meds") {
    return false;
  }

  const healAmount = Math.ceil(target.stats.maxHealth * FIELD_MEDPACK_HEAL_RATIO);
  const nextHp = Math.min(target.stats.maxHealth, target.current.hp + healAmount);
  const restoredHp = nextHp - target.current.hp;

  if (restoredHp <= 0) {
    return false;
  }

  target.current.hp = nextHp;
  unit.gear = { slot: null };
  unit.gearState = {};
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(system.state, `${unit.name} used a Field Medpack on ${target.id === unit.id ? "themself" : target.name}, restoring ${restoredHp} HP.`);
  return true;
}

export function getExtinguishTargetsForUnit(system, unit) {
  if (!unit || unit.family !== UNIT_TAGS.INFANTRY || unit.transport?.carriedByUnitId) {
    return [];
  }

  return getLivingUnits(system.state, unit.owner)
    .filter(
      (candidate) =>
        candidate.id !== unit.id &&
        (candidate.statuses ?? []).some((status) => status.type === "burn") &&
        Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1
    )
    .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
}

export function applyExtinguishAbility(system, unit, target) {
  if (!unit || !target) {
    return false;
  }

  const hadBurn = (target.statuses ?? []).some((status) => status.type === "burn");

  if (!hadBurn) {
    return false;
  }

  target.statuses = target.statuses.filter((status) => status.type !== "burn");
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(system.state, `${unit.name} extinguished ${target.name}.`);
  return true;
}

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

function consumeAttackResources(unit, attackProfile) {
  if (attackProfile.consumesAmmo) {
    unit.current.ammo = Math.max(0, unit.current.ammo - 1);
  }

  if (attackProfile.consumesGearAmmo) {
    unit.gearState.aaKitAmmo = Math.max(0, getAntiAirGearAmmo(unit) - 1);
  }
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

    attacker.current.hp = Math.max(0, attacker.current.hp - preemptiveStrike.damage);
    counterDamageDealt = attackerHpBefore - attacker.current.hp;
    consumeAttackResources(defender, defenderProfile);
    appendStrikeLog(system.state, defender, attacker, preemptiveStrike, counterDamageDealt, "countered");
    applyChargeFromCombat(system.state, defender.owner, attacker.owner, counterDamageDealt, counterDamageDealt);
  }

  if (attacker.current.hp > 0) {
    const defenderHpBefore = defender.current.hp;
    const primaryStrike = zeroDamageCombat
      ? { damage: 0, weaponType: attackProfile.type, isEffective: false, isCrit: false, isGlance: false }
      : getDamageResult(system.state, attacker, defender, attackProfile);

    defender.current.hp = Math.max(0, defender.current.hp - primaryStrike.damage);
    primaryDamageDealt = defenderHpBefore - defender.current.hp;
    consumeAttackResources(attacker, attackProfile);
    appendStrikeLog(system.state, attacker, defender, primaryStrike, primaryDamageDealt);
    applyChargeFromCombat(system.state, attacker.owner, defender.owner, primaryDamageDealt, primaryDamageDealt);
  }

  if (attacker.current.hp > 0 && defender.current.hp > 0 && canCounter && !usesPreemptiveCounter) {
    const attackerHpBefore = attacker.current.hp;
    const counterStrike = zeroDamageCombat
      ? { damage: 0, weaponType: defenderProfile.type, isEffective: false, isCrit: false, isGlance: false }
      : getDamageResult(system.state, defender, attacker, defenderProfile);

    attacker.current.hp = Math.max(0, attacker.current.hp - counterStrike.damage);
    counterDamageDealt = attackerHpBefore - attacker.current.hp;
    consumeAttackResources(defender, defenderProfile);
    appendStrikeLog(system.state, defender, attacker, counterStrike, counterDamageDealt, "countered");
    applyChargeFromCombat(system.state, defender.owner, attacker.owner, counterDamageDealt, counterDamageDealt);
  }

  awardCombatXpToUnit(system, attacker, defender, primaryDamageDealt, defender.current.hp <= 0);

  if (defender.current.hp > 0) {
    awardCombatXpToUnit(system, defender, attacker, counterDamageDealt, attacker.current.hp <= 0);
  }

  if (defender.current.hp <= 0) {
    appendLog(system.state, `${defender.name} was destroyed.`);
  }

  if (attacker.current.hp <= 0) {
    appendLog(system.state, `${attacker.name} was destroyed.`);
  }

  removeDeadUnits(system.state);
  const updatedAttacker = findUnitById(system.state, attacker.id);
  const preparedSlipstream =
    updatedAttacker &&
    updatedAttacker.owner === TURN_SIDES.PLAYER &&
    system.state.turn.activeSide === TURN_SIDES.PLAYER &&
    prepareSlipstreamReposition(system, updatedAttacker);

  if (!preparedSlipstream) {
    system.clearPendingAction();
    system.clearSelection();
  }

  system.updateVictoryState();
  return true;
}

export function canCaptureWithPendingUnit(system) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction) {
    return false;
  }

  const unit = findUnitById(system.state, pendingAction.unitId);
  const building = unit ? getBuildingAt(system.state, unit.x, unit.y) : null;

  return canCaptureBuilding(unit, building);
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
  const cooldownKey = "support";
  if ((unit.cooldowns?.[cooldownKey] ?? 0) > 0) {
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

export function redoPendingMove(system) {
  const pendingAction = system.state.pendingAction;

  if (!pendingAction) {
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

export function getPlayerUnitLimitStatus(system) {
  const count = getLivingUnits(system.state, TURN_SIDES.PLAYER).length;

  return {
    count,
    limit: PROTOTYPE_ROSTER_CAP,
    isAtLimit: count >= PROTOTYPE_ROSTER_CAP
  };
}

export function recruitUnit(system, unitTypeId) {
  const building = getSelectedBuilding(system.state);
  const turnKey = `${system.state.turn.activeSide}-${system.state.turn.number}`;

  if (
    !building ||
    system.state.turn.activeSide !== TURN_SIDES.PLAYER ||
    building.owner !== TURN_SIDES.PLAYER ||
    building.recruitLockedTurnKey === turnKey ||
    getUnitAt(system.state, building.x, building.y)
  ) {
    return false;
  }

  const canRecruitFromBuilding = (BUILDING_RECRUITMENT[building.type] ?? []).includes(unitTypeId);
  const unitType = canRecruitFromBuilding ? UNIT_CATALOG[unitTypeId] : null;

  if (!unitType) {
    return false;
  }

  const adjustedCost = Math.max(100, unitType.cost - system.state.player.recruitDiscount);

  if (
    system.state.player.funds < adjustedCost ||
    getLivingUnits(system.state, TURN_SIDES.PLAYER).length >= PROTOTYPE_ROSTER_CAP
  ) {
    return false;
  }

  const recruit = createUnitFromType(unitTypeId, TURN_SIDES.PLAYER);
  recruit.x = building.x;
  recruit.y = building.y;
  const isBarracksInfantry =
    building.type === BUILDING_KEYS.BARRACKS && INFANTRY_RECRUIT_TYPES.has(unitTypeId);
  recruit.hasMoved = !isBarracksInfantry;
  recruit.hasAttacked = !isBarracksInfantry;
  if (isBarracksInfantry) {
    building.recruitLockedTurnKey = turnKey;
  }

  system.state.player.units.push(recruit);
  system.state.player.funds -= adjustedCost;
  appendLog(system.state, `${recruit.name} deployed from ${building.type}.`);
  return true;
}

export function activatePower(system) {
  const result = activateCommanderPower(system.state, system.state.turn.activeSide, system.state.seed);

  system.state.lastPowerResult = structuredClone(result);
  system.state.seed = result.seed;
  result.notes.forEach((note) => appendLog(system.state, note));
  system.updateVictoryState();
  return result.changed;
}
