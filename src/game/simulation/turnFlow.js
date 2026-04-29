import {
  BATTLE_MODES,
  BUILDING_KEYS,
  ENEMY_RECRUITMENT_UNIT_LEAD_LIMIT,
  TURN_SIDES
} from "../core/constants.js";
import { getBuildingIncomeForSide } from "../core/economy.js";
import { describeBuilding } from "../content/buildings.js";
import { appendLog } from "./battleLog.js";
import { serviceUnitsOnSectors } from "./battleServicing.js";
import { findUnitById } from "./battleUnits.js";
import { captureBuildingForUnit } from "./captureRules.js";
import {
  canSlipstreamAfterAttack,
  expireCurrentTurnStatuses,
  getIncomeBonus,
  getMovementModifier,
  tickSideStatuses
} from "./commanderEffects.js";
import {
  getBestCapturePlan,
  getBestMoveAttackOption,
  getBestRepairPlan,
  getBestSupportPlan,
  getEnemyRecruitmentLimit,
  getEnemyRecruitmentMapCap,
  pickBestFavorableAttack,
  pickEnemyRecruitmentCandidate,
  pickFallbackMovementTile
} from "./enemyAi.js";
import {
  getLivingUnits,
  getMovementPath,
  getReachableTiles,
  getUnitAt
} from "./selectors.js";
import { createUnitFromType } from "./unitFactory.js";

const PRODUCTION_BUILDING_TYPES = ["barracks", "motor-pool", "airfield"];
const FIELD_MEDS_HEAL = 3;

export function tickUnitDurations(system, side) {
  for (const unit of getLivingUnits(system.state, side)) {
    for (const [key, turns] of Object.entries(unit.cooldowns ?? {})) {
      if (turns > 0) {
        unit.cooldowns[key] = turns - 1;
      }
    }
    if (unit.unitTypeId === "runner" && unit.transport) {
      unit.transport.canUnloadAfterMove = false;
      unit.transport.hasLockedUnload = false;
    }
  }
}

export function endTurn(system) {
  if (system.state.victory) {
    return false;
  }

  if (system.state.pendingAction) {
    appendLog(system.state, "Resolve the selected unit action before ending the turn.");
    return false;
  }

  if (system.state.turn.activeSide === TURN_SIDES.PLAYER) {
    expireCurrentTurnStatuses(system.state, TURN_SIDES.PLAYER);
    system.state.turn.activeSide = TURN_SIDES.ENEMY;
    system.state.turn.number += 1;
    system.clearSelection();
    system.state.enemyTurn = {
      started: false,
      pendingAttack: null,
      pendingSlipstream: null,
      pendingUnitIds: []
    };
    system.updateVictoryState();
    return true;
  }

  return false;
}

export function isEnemyTurnActive(system) {
  return system.state.turn.activeSide === TURN_SIDES.ENEMY && !system.state.victory;
}

export function startEnemyTurnActions(system) {
  if (!system.state.enemyTurn || !isEnemyTurnActive(system) || system.state.enemyTurn.started) {
    return false;
  }

  system.state.enemyTurn.started = true;
  tickSideStatuses(system.state, TURN_SIDES.ENEMY);
  tickUnitDurations(system, TURN_SIDES.ENEMY);
  const incomeGain = collectIncome(system, TURN_SIDES.ENEMY);
  resetActions(system, TURN_SIDES.ENEMY);
  serviceUnitsOnSectors(system.state, TURN_SIDES.ENEMY);
  system.state.enemyTurn.pendingUnitIds = getLivingUnits(system.state, TURN_SIDES.ENEMY)
    .filter((unit) => !unit.hasMoved && !unit.hasAttacked && !unit.transport?.carriedByUnitId)
    .map((unit) => unit.id);
  system.updateVictoryState();
  return {
    changed: true,
    incomeGain
  };
}

export function hasPendingEnemyTurn(system) {
  return Boolean(
    system.state.enemyTurn?.pendingAttack ||
      system.state.enemyTurn?.pendingSlipstream ||
      system.state.enemyTurn?.pendingUnitIds?.length
  );
}

function moveEnemyUnit(system, unit, tile, movementBudget) {
  const moved = tile && (tile.x !== unit.x || tile.y !== unit.y);
  const movePath = moved
    ? getMovementPath(system.state, unit, movementBudget, tile.x, tile.y)
    : [];
  const moveSegments = Math.max(0, movePath.length - 1);

  if (moved) {
    unit.x = tile.x;
    unit.y = tile.y;
    if (unit.unitTypeId === "runner" && unit.transport?.carryingUnitId) {
      unit.transport.canUnloadAfterMove = true;
    }
    system.syncTransportCargoPosition(unit);
    unit.hasMoved = true;
    system.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };
  }

  return {
    moved,
    moveSegments
  };
}

function queueEnemySlipstreamMove(system, unitId) {
  const unit = findUnitById(system.state, unitId);

  if (!unit || !canSlipstreamAfterAttack(system.state, unit) || unit.transport?.carriedByUnitId) {
    return null;
  }

  const reachableTiles = getReachableTiles(system.state, unit, 1)
    .filter((tile) => tile.x !== unit.x || tile.y !== unit.y);

  if (reachableTiles.length === 0) {
    return null;
  }

  const fallbackTile = pickFallbackMovementTile(system.state, unit, reachableTiles);

  if (!fallbackTile || (fallbackTile.x === unit.x && fallbackTile.y === unit.y)) {
    return null;
  }

  const movePath = getMovementPath(system.state, unit, 1, fallbackTile.x, fallbackTile.y);
  const moveSegments = Math.max(0, movePath.length - 1);

  system.state.enemyTurn.pendingSlipstream = {
    unitId,
    x: fallbackTile.x,
    y: fallbackTile.y,
    moveSegments
  };

  return system.state.enemyTurn.pendingSlipstream;
}

function performQueuedEnemySlipstreamMove(system) {
  const queuedSlipstream = system.state.enemyTurn?.pendingSlipstream;

  if (!queuedSlipstream) {
    return null;
  }

  system.state.enemyTurn.pendingSlipstream = null;
  const unit = findUnitById(system.state, queuedSlipstream.unitId);

  if (!unit || !canSlipstreamAfterAttack(system.state, unit) || unit.transport?.carriedByUnitId) {
    return null;
  }

  if (unit.x === queuedSlipstream.x && unit.y === queuedSlipstream.y) {
    return null;
  }

  unit.x = queuedSlipstream.x;
  unit.y = queuedSlipstream.y;
  unit.hasMoved = true;
  if (unit.unitTypeId === "runner" && unit.transport?.carryingUnitId) {
    system.syncTransportCargoPosition(unit);
  }
  appendLog(system.state, `${unit.name} slipped into a new position after attacking.`);

  return {
    changed: true,
    done: system.state.victory || !hasPendingEnemyTurn(system),
    type: "move",
    unitId: queuedSlipstream.unitId,
    moveSegments: queuedSlipstream.moveSegments
  };
}

function resolveEnemyCapturePlan(system, unit, capturePlan, movementBudget) {
  const movement = moveEnemyUnit(system, unit, capturePlan.tile, movementBudget);

  if (capturePlan.canCaptureAfterMove) {
    captureBuildingForUnit(system.state, unit, capturePlan.building);
    system.updateVictoryState();
  } else if (movement.moved) {
    unit.hasAttacked = true;
  }

  if (movement.moved || capturePlan.canCaptureAfterMove) {
    return {
      changed: true,
      done: system.state.victory || system.state.enemyTurn.pendingUnitIds.length === 0,
      type: movement.moved ? "move" : "capture",
      unitId: unit.id,
      moveSegments: movement.moveSegments
    };
  }

  return null;
}

export function processEnemyTurnStep(system) {
  if (!system.state.enemyTurn || system.state.turn.activeSide !== TURN_SIDES.ENEMY || system.state.victory) {
    return { changed: false, done: true };
  }

  // Enemy turns are resolved as move and attack phases so the renderer can
  // let movement finish before combat begins.
  if (system.state.enemyTurn.pendingAttack) {
    const queuedAttack = system.state.enemyTurn.pendingAttack;
    system.state.enemyTurn.pendingAttack = null;
    const changed = system.attackTarget(queuedAttack.attackerId, queuedAttack.targetId);

    if (changed) {
      queueEnemySlipstreamMove(system, queuedAttack.attackerId);
      return {
        changed: true,
        done: system.state.victory || !hasPendingEnemyTurn(system),
        type: "attack",
        unitId: queuedAttack.attackerId
      };
    }
  }

  if (system.state.enemyTurn.pendingSlipstream) {
    const slipstreamStep = performQueuedEnemySlipstreamMove(system);

    if (slipstreamStep) {
      return slipstreamStep;
    }
  }

  while (system.state.enemyTurn.pendingUnitIds.length > 0) {
    const unitId = system.state.enemyTurn.pendingUnitIds.shift();
    const unit = findUnitById(system.state, unitId);

    if (
      !unit ||
      unit.current.hp <= 0 ||
      unit.transport?.carriedByUnitId ||
      (unit.hasMoved && unit.hasAttacked)
    ) {
      continue;
    }

    system.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

    if (unit.unitTypeId === "runner" && !unit.transport?.carryingUnitId) {
      const passenger = system.getAdjacentTransportPassenger(unit);
      if (passenger) {
        system.boardUnitIntoRunner(passenger, unit);
      }
    }

    const supportPlan = getBestSupportPlan(system.state, unit);

    if (supportPlan && system.applySupportAbility(unit, supportPlan.target)) {
      return {
        changed: true,
        done: system.state.victory || system.state.enemyTurn.pendingUnitIds.length === 0,
        type: "support",
        unitId
      };
    }

    const movementBudget = unit.stats.movement + getMovementModifier(system.state, unit);
    const reachableTiles = getReachableTiles(system.state, unit, movementBudget);
    const repairPlan = getBestRepairPlan(system.state, unit, reachableTiles);
    const capturePlan = getBestCapturePlan(system.state, unit, reachableTiles);
    const isGrunt = unit.unitTypeId === "grunt";
    const isSecondaryCapturer = ["breaker", "longshot"].includes(unit.unitTypeId);

    if (repairPlan) {
      const movement = moveEnemyUnit(system, unit, repairPlan.tile, movementBudget);

      if (!movement.moved) {
        unit.hasMoved = true;
      }

      unit.hasAttacked = true;
      unit.cooldowns.repairMode = Math.max(
        unit.cooldowns.repairMode ?? 0,
        repairPlan.canRepairAfterMove ? (movement.moved ? 2 : 1) : 2
      );
      appendLog(
        system.state,
        `${unit.name} entered repair mode near ${describeBuilding(repairPlan.building).name}.`
      );

      return {
        changed: true,
        done: system.state.victory || system.state.enemyTurn.pendingUnitIds.length === 0,
        type: movement.moved ? "move" : "repair",
        unitId,
        moveSegments: movement.moveSegments
      };
    }

    if (isGrunt && capturePlan) {
      const result = resolveEnemyCapturePlan(system, unit, capturePlan, movementBudget);

      if (result) {
        return result;
      }
    }

    const immediateAttack = pickBestFavorableAttack(system.state, unit);

    if (immediateAttack) {
      system.attackTarget(unit.id, immediateAttack.target.id);
      queueEnemySlipstreamMove(system, unit.id);
      return {
        changed: true,
        done: system.state.victory || !hasPendingEnemyTurn(system),
        type: "attack",
        unitId
      };
    }

    if (isSecondaryCapturer && capturePlan) {
      const result = resolveEnemyCapturePlan(system, unit, capturePlan, movementBudget);

      if (result) {
        return result;
      }
    }

    const moveAttackOption = getBestMoveAttackOption(system.state, unit, reachableTiles);
    const fallbackTile = moveAttackOption?.tile ?? pickFallbackMovementTile(system.state, unit, reachableTiles);
    const movement = moveEnemyUnit(system, unit, fallbackTile, movementBudget);

    if (moveAttackOption && movement.moved) {
      system.state.enemyTurn.pendingAttack = {
        attackerId: unit.id,
        targetId: moveAttackOption.target.id
      };
      return {
        changed: true,
        done: system.state.victory || !hasPendingEnemyTurn(system),
        type: "move",
        unitId,
        moveSegments: movement.moveSegments
      };
    }

    if (movement.moved) {
      const unloaded = system.unloadTransportForEnemy(unit);
      if (!unloaded) {
        unit.hasAttacked = true;
      }
      appendLog(
        system.state,
        `${unit.name} ${fallbackTile.intent === "fallback" ? "fell back from danger" : "advanced into position"}.`
      );
      return {
        changed: true,
        done: system.state.victory || system.state.enemyTurn.pendingUnitIds.length === 0,
        type: "move",
        unitId,
        moveSegments: movement.moveSegments
      };
    }
  }

  system.updateVictoryState();
  return { changed: false, done: true };
}

export function performEnemyEndTurnRecruitment(system) {
  if (!system.state.enemyTurn || !isEnemyTurnActive(system) || system.state.victory) {
    return {
      changed: false,
      deployments: []
    };
  }

  const deployments = performEnemyRecruitment(system);

  return {
    changed: deployments.length > 0,
    deployments
  };
}

export function finalizeEnemyTurn(system) {
  if (system.state.turn.activeSide !== TURN_SIDES.ENEMY) {
    return {
      changed: false,
      incomeGain: null
    };
  }

  system.state.enemyTurn = null;
  expireCurrentTurnStatuses(system.state, TURN_SIDES.ENEMY);

  if (system.state.victory) {
    system.clearSelection();
    return {
      changed: true,
      incomeGain: null
    };
  }

  system.state.turn.activeSide = TURN_SIDES.PLAYER;
  tickSideStatuses(system.state, TURN_SIDES.PLAYER);
  tickUnitDurations(system, TURN_SIDES.PLAYER);
  applyStartTurnGearEffects(system.state, TURN_SIDES.PLAYER);
  const incomeGain = collectIncome(system, TURN_SIDES.PLAYER);
  resetActions(system, TURN_SIDES.PLAYER);
  serviceUnitsOnSectors(system.state, TURN_SIDES.PLAYER);
  system.clearSelection();
  return {
    changed: true,
    incomeGain
  };
}

function applyStartTurnGearEffects(state, side) {
  for (const unit of getLivingUnits(state, side)) {
    if (unit.gear?.slot !== "gear-field-meds") {
      continue;
    }

    const previousHp = unit.current.hp;
    unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + FIELD_MEDS_HEAL);

    if (unit.current.hp > previousHp) {
      appendLog(state, `${unit.name} recovered ${unit.current.hp - previousHp} HP from Field Medpack.`);
    }
  }
}

export function collectIncome(system, side) {
  if (system.state.mode === BATTLE_MODES.RUN && side === TURN_SIDES.PLAYER) {
    return {
      side,
      amount: 0,
      buildingIncome: 0,
      commanderBonus: 0,
      previousFunds: system.state[side].funds,
      nextFunds: system.state[side].funds
    };
  }

  const commanderBonus = getIncomeBonus(system.state, side);
  const incomeByType = system.state.economy?.incomeByType;
  const buildingIncome = getBuildingIncomeForSide(system.state.map.buildings, side, incomeByType);
  const previousFunds = system.state[side].funds;
  const amount = buildingIncome + commanderBonus;

  system.state[side].funds += amount;

  return {
    side,
    amount,
    buildingIncome,
    commanderBonus,
    previousFunds,
    nextFunds: system.state[side].funds
  };
}

export function resetActions(system, side) {
  for (const unit of getLivingUnits(system.state, side)) {
    unit.hasMoved = false;
    unit.hasAttacked = false;
    unit.current.stamina = unit.stats.staminaMax;
  }
}

export function performEnemyRecruitment(system) {
  const deployments = [];
  const maxDeployments = getEnemyRecruitmentLimit(system.state);
  const mapRecruitCap = getEnemyRecruitmentMapCap(system.state);
  const playerUnitCount = getLivingUnits(system.state, TURN_SIDES.PLAYER).length;
  const productionSites = system.state.map.buildings.filter(
    (building) =>
      building.owner === TURN_SIDES.ENEMY &&
      PRODUCTION_BUILDING_TYPES.includes(building.type) &&
      !getUnitAt(system.state, building.x, building.y)
  );

  const usedBuildingIds = new Set();

  while (
    deployments.length < maxDeployments &&
    system.state.enemy.recruitsBuiltThisMap < mapRecruitCap
  ) {
    const enemyUnitLead = getLivingUnits(system.state, TURN_SIDES.ENEMY).length - playerUnitCount;

    if (enemyUnitLead >= ENEMY_RECRUITMENT_UNIT_LEAD_LIMIT) {
      break;
    }

    const candidate = pickEnemyRecruitmentCandidate(system.state, productionSites, usedBuildingIds);

    if (!candidate) {
      break;
    }

    const recruit = createUnitFromType(candidate.option.id, TURN_SIDES.ENEMY);
    recruit.x = candidate.building.x;
    recruit.y = candidate.building.y;
    recruit.hasMoved = true;
    recruit.hasAttacked = true;
    system.state.enemy.units.push(recruit);
    system.state.enemy.funds -= candidate.option.adjustedCost;
    system.state.enemy.recruitsBuiltThisMap += 1;
    usedBuildingIds.add(candidate.building.id);
    appendLog(system.state, `Enemy deployed ${recruit.name}.`);
    deployments.push({
      unitId: recruit.id,
      unitTypeId: recruit.unitTypeId,
      buildingId: candidate.building.id,
      x: recruit.x,
      y: recruit.y
    });
  }

  return deployments;
}

export function updateVictoryState(system) {
  system.state.victory = null;
  const livingPlayer = getLivingUnits(system.state, TURN_SIDES.PLAYER);
  const livingEnemy = getLivingUnits(system.state, TURN_SIDES.ENEMY);

  if (livingEnemy.length === 0) {
    system.state.victory = {
      winner: TURN_SIDES.PLAYER,
      message: "Battle won. The route is clear."
    };
    return;
  }

  if (livingPlayer.length === 0) {
    system.state.victory = {
      winner: TURN_SIDES.ENEMY,
      message: "Your column was overrun."
    };
    return;
  }

  const enemyCommand = system.state.map.buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.ENEMY
  );
  const playerCommand = system.state.map.buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.PLAYER
  );

  if (!enemyCommand) {
    system.state.victory = {
      winner: TURN_SIDES.PLAYER,
      message: "Enemy command fell. The route is clear."
    };
    return;
  }

  if (!playerCommand) {
    system.state.victory = {
      winner: TURN_SIDES.ENEMY,
      message: "Your command post was captured."
    };
  }
}
