import {
  ENEMY_AI_ARCHETYPES,
  TURN_SIDES
} from "../../core/constants.js";
import { findUnitById } from "../battleUnits.js";
import { captureBuildingForUnit } from "../captureRules.js";
import {
  getMovementModifier,
  shouldDefenderPreemptCombat,
  shouldPreventCombatDamage
} from "../commanderEffects.js";
import { consumeAttackResources } from "../combatResources.js";
import {
  getAttackForecast,
  removeDeadUnits
} from "../combatResolver.js";
import {
  canUnitSabotageDefendTarget,
  updateMissionVictory
} from "../missionRules.js";
import { isUnitZombified } from "../runCardEffects.js";
import {
  getAttackProfileForTarget,
  getMovementPathCost,
  getReachableTiles
} from "../selectors.js";
import {
  getBestSupportPlan,
  getCapturePlans,
  getRepairPlans,
  getScoredMoveAttackOptions,
  getStrategicObjectiveScore
} from "./movementScoring.js";
import { getEnemyAiArchetype, getEnemyAiProfile } from "./profiles.js";
import { getBestRunnerTransportPlan } from "./transportPlans.js";

export const ENEMY_TURN_PLANNER_BEAM_WIDTH = 10;
export const ENEMY_TURN_PLANNER_BRANCH_LIMIT = 24;
export const ENEMY_TURN_PLANNER_ACTIONS_PER_UNIT = 8;
export const ENEMY_TURN_PLANNER_TILES_PER_TARGET = 4;

const ACTION_TYPE_PRIORITY = {
  attack: 0,
  capture: 1,
  repair: 2
};

function getProjectedDamage(damageRange, archetype, direction) {
  if (!damageRange) {
    return 0;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE) {
    return direction === "outgoing" ? damageRange.max : damageRange.min;
  }

  if (archetype === ENEMY_AI_ARCHETYPES.TURTLE) {
    return direction === "outgoing" ? damageRange.min : damageRange.max;
  }

  return Math.round((damageRange.min + damageRange.max) / 2);
}

function compareActions(left, right) {
  return (
    right.estimate - left.estimate ||
    ACTION_TYPE_PRIORITY[left.type] - ACTION_TYPE_PRIORITY[right.type] ||
    left.unitId.localeCompare(right.unitId) ||
    (left.targetId ?? left.buildingId ?? "").localeCompare(
      right.targetId ?? right.buildingId ?? ""
    ) ||
    left.tile.y - right.tile.y ||
    left.tile.x - right.tile.x
  );
}

function getSequenceKey(sequence) {
  return sequence
    .map(
      (action) =>
        `${action.type}:${action.unitId}:${action.targetId ?? action.buildingId ?? ""}:${action.tile.x},${action.tile.y}`
    )
    .join("|");
}

function compareNodes(left, right) {
  return right.score - left.score || getSequenceKey(left.actions).localeCompare(getSequenceKey(right.actions));
}

function getMovementBudget(state, unit) {
  return unit.stats.movement + getMovementModifier(state, unit);
}

function shouldLeaveUnitToExistingBehavior(state, unit, reachableTiles) {
  if (
    isUnitZombified(unit) ||
    canUnitSabotageDefendTarget(state, unit) ||
    getBestSupportPlan(state, unit)
  ) {
    return true;
  }

  if (unit.unitTypeId !== "runner") {
    return false;
  }

  const transportPlan = getBestRunnerTransportPlan(state, unit, reachableTiles);

  if (!transportPlan) {
    return false;
  }

  const immediateAttack = getScoredMoveAttackOptions(
    state,
    unit,
    [{ x: unit.x, y: unit.y }],
    { maxTilesPerTarget: 1 }
  )[0];

  return !immediateAttack;
}

function buildAttackActions(state, unit, reachableTiles) {
  const archetype = getEnemyAiArchetype(state);

  return getScoredMoveAttackOptions(state, unit, reachableTiles, {
    allowRisky: true,
    maxTilesPerTarget: ENEMY_TURN_PLANNER_TILES_PER_TARGET
  }).map((option) => {
    const attacksFromCurrentTile =
      option.tile.x === unit.x && option.tile.y === unit.y;
    const projectedOutgoingDamage = getProjectedDamage(
      option.trade.forecast.dealt,
      archetype,
      "outgoing"
    );
    const projectedKill =
      projectedOutgoingDamage >= option.target.current.hp;
    const killScoreAdjustment =
      (projectedKill ? 55 : 0) -
      (option.trade.killsTarget ? 55 : 0);

    return {
      type: "attack",
      unitId: unit.id,
      targetId: option.target.id,
      tile: { x: option.tile.x, y: option.tile.y },
      isEffective: option.trade.isEffective,
      isFavorable: option.trade.isFavorable,
      projectedKill,
      estimate:
        option.score +
        killScoreAdjustment +
        (projectedKill ? 50 : 0) +
        (option.trade.isEffective ? 180 : 0) +
        (option.trade.isFavorable ? 80 : 0) +
        (attacksFromCurrentTile ? 100 : 0)
    };
  });
}

function buildCaptureActions(state, unit, reachableTiles) {
  const profile = getEnemyAiProfile(state);

  return getCapturePlans(state, unit, reachableTiles).map((plan) => ({
    type: "capture",
    unitId: unit.id,
    buildingId: plan.building.id,
    tile: { x: plan.tile.x, y: plan.tile.y },
    canCaptureAfterMove: plan.canCaptureAfterMove,
    estimate:
      plan.score * profile.objectiveWeight +
      (plan.canCaptureAfterMove ? 20 : 0) +
      (plan.tile.x === unit.x && plan.tile.y === unit.y ? 35 : 0) +
      (unit.unitTypeId === "grunt" && plan.canCaptureAfterMove ? 220 : 0)
  }));
}

function buildRepairActions(state, unit, reachableTiles) {
  const profile = getEnemyAiProfile(state);
  const missingHp = Math.max(0, unit.stats.maxHealth - unit.current.hp);

  return getRepairPlans(state, unit, reachableTiles).map((plan) => ({
    type: "repair",
    unitId: unit.id,
    buildingId: plan.building.id,
    tile: { x: plan.tile.x, y: plan.tile.y },
    canRepairAfterMove: plan.canRepairAfterMove,
    estimate:
      missingHp * 4 +
      profile.safetyWeight * 18 +
      (plan.canRepairAfterMove ? 24 : 8) +
      Math.min(24, plan.score * 0.12)
  }));
}

function getUnitActionCandidates(state, unit) {
  const movementBudget = getMovementBudget(state, unit);
  const reachableTiles = getReachableTiles(state, unit, movementBudget);

  if (shouldLeaveUnitToExistingBehavior(state, unit, reachableTiles)) {
    return [];
  }

  const captureActions = buildCaptureActions(state, unit, reachableTiles);
  const repairActions = buildRepairActions(state, unit, reachableTiles);
  const currentCapture = captureActions.find(
    (action) =>
      action.canCaptureAfterMove &&
      action.tile.x === unit.x &&
      action.tile.y === unit.y
  );

  if (currentCapture && unit.unitTypeId === "grunt") {
    return [currentCapture, ...repairActions]
      .sort(compareActions)
      .slice(0, ENEMY_TURN_PLANNER_ACTIONS_PER_UNIT);
  }

  if (
    currentCapture &&
    ["breaker", "longshot"].includes(unit.unitTypeId)
  ) {
    const immediateFavorableAttack = getScoredMoveAttackOptions(
      state,
      unit,
      [{ x: unit.x, y: unit.y }],
      { maxTilesPerTarget: 1 }
    )[0];

    if (!immediateFavorableAttack) {
      return [currentCapture, ...repairActions]
        .sort(compareActions)
        .slice(0, ENEMY_TURN_PLANNER_ACTIONS_PER_UNIT);
    }
  }

  return [
    ...buildAttackActions(state, unit, reachableTiles),
    ...captureActions,
    ...repairActions
  ]
    .sort(compareActions)
    .slice(0, ENEMY_TURN_PLANNER_ACTIONS_PER_UNIT);
}

function getReservedTransportUnitIds(state, pendingUnitIds) {
  const reservedUnitIds = new Set();

  for (const unitId of pendingUnitIds) {
    const runner = findUnitById(state, unitId);

    if (!runner || runner.unitTypeId !== "runner") {
      continue;
    }

    const movementBudget = getMovementBudget(state, runner);
    const reachableTiles = getReachableTiles(state, runner, movementBudget);
    const transportPlan = getBestRunnerTransportPlan(state, runner, reachableTiles);

    if (!transportPlan) {
      continue;
    }

    const immediateAttack = getScoredMoveAttackOptions(
      state,
      runner,
      [{ x: runner.x, y: runner.y }],
      { maxTilesPerTarget: 1 }
    )[0];

    if (!immediateAttack) {
      reservedUnitIds.add(runner.id);
      reservedUnitIds.add(transportPlan.passengerId);
    }
  }

  return reservedUnitIds;
}

function getActionCandidates(state, pendingUnitIds) {
  const reservedTransportUnitIds = getReservedTransportUnitIds(
    state,
    pendingUnitIds
  );

  return pendingUnitIds
    .flatMap((unitId) => {
      const unit = findUnitById(state, unitId);

      if (
        !unit ||
        reservedTransportUnitIds.has(unitId) ||
        unit.owner !== TURN_SIDES.ENEMY ||
        unit.current.hp <= 0 ||
        unit.transport?.carriedByUnitId ||
        (unit.hasMoved && unit.hasAttacked)
      ) {
        return [];
      }

      return getUnitActionCandidates(state, unit);
    })
    .sort(compareActions)
    .slice(0, ENEMY_TURN_PLANNER_BRANCH_LIMIT);
}

function projectMovement(state, unit, tile) {
  const movementBudget = getMovementBudget(state, unit);
  const movementCost =
    getMovementPathCost(state, unit, movementBudget, tile.x, tile.y) ?? 0;
  const moved = tile.x !== unit.x || tile.y !== unit.y;

  if (moved) {
    unit.x = tile.x;
    unit.y = tile.y;
    unit.movedThisTurn = true;
    unit.current.stamina = Math.max(0, unit.current.stamina - movementCost);
    unit.hasMoved = true;
  }

  return moved;
}

function scoreProjectedAttack({
  attacker,
  defender,
  outgoingDamage,
  incomingDamage,
  attackerHpBefore,
  defenderHpBefore,
  attackEstimate,
  isFavorable,
  moved
}) {
  const effectiveOutgoing = Math.min(defenderHpBefore, outgoingDamage);
  const effectiveIncoming = Math.min(attackerHpBefore, incomingDamage);
  const targetKilled = defender.current.hp <= 0;
  const attackerKilled = attacker.current.hp <= 0;
  const targetValue = Math.max(1, defender.cost / 100);
  const attackerValue = Math.max(1, attacker.cost / 100);

  return (
    effectiveOutgoing * 2.8 -
    effectiveIncoming * 2.35 +
    (targetKilled ? 72 + targetValue * 5 : 0) -
    (attackerKilled ? 66 + attackerValue * 5 : 0) +
    attackEstimate * 0.18 +
    (isFavorable ? 250 : 0) +
    (moved ? 0 : 150)
  );
}

function projectAttack(state, action) {
  const attacker = findUnitById(state, action.unitId);
  const defender = findUnitById(state, action.targetId);

  if (!attacker || !defender) {
    return null;
  }

  const moved = projectMovement(state, attacker, action.tile);
  const attackerProfile = getAttackProfileForTarget(attacker, defender);

  if (!attackerProfile) {
    return null;
  }

  const forecast = getAttackForecast(state, attacker, defender);
  const archetype = getEnemyAiArchetype(state);
  const zeroDamageCombat = shouldPreventCombatDamage(
    state,
    attacker.owner,
    defender.owner
  );
  const outgoingDamage = zeroDamageCombat
    ? 0
    : getProjectedDamage(forecast.dealt, archetype, "outgoing");
  const incomingDamage = zeroDamageCombat
    ? 0
    : getProjectedDamage(forecast.received, archetype, "incoming");
  const defenderProfile = forecast.received
    ? getAttackProfileForTarget(defender, attacker)
    : null;
  const defenderPreempts = shouldDefenderPreemptCombat(state, attacker, defender, {
    canCounter: Boolean(forecast.received)
  });
  const attackerHpBefore = attacker.current.hp;
  const defenderHpBefore = defender.current.hp;
  let appliedOutgoingDamage = 0;
  let appliedIncomingDamage = 0;

  attacker.hasAttacked = true;
  attacker.hasMoved = true;

  if (defenderPreempts && defenderProfile) {
    appliedIncomingDamage = Math.min(attacker.current.hp, incomingDamage);
    attacker.current.hp = Math.max(0, attacker.current.hp - appliedIncomingDamage);
    consumeAttackResources(state, defender, defenderProfile);
  }

  if (attacker.current.hp > 0) {
    appliedOutgoingDamage = Math.min(defender.current.hp, outgoingDamage);
    defender.current.hp = Math.max(0, defender.current.hp - appliedOutgoingDamage);
    consumeAttackResources(state, attacker, attackerProfile);
  }

  if (
    !defenderPreempts &&
    defender.current.hp > 0 &&
    attacker.current.hp > 0 &&
    defenderProfile
  ) {
    appliedIncomingDamage = Math.min(attacker.current.hp, incomingDamage);
    attacker.current.hp = Math.max(0, attacker.current.hp - appliedIncomingDamage);
    consumeAttackResources(state, defender, defenderProfile);
  }

  const score = scoreProjectedAttack({
    attacker,
    defender,
    outgoingDamage: appliedOutgoingDamage,
    incomingDamage: appliedIncomingDamage,
    attackerHpBefore,
    defenderHpBefore,
    attackEstimate: action.estimate,
    isFavorable: action.isFavorable,
    moved
  });

  removeDeadUnits(state);
  updateMissionVictory(state);
  return score;
}

function projectCapture(state, action) {
  const unit = findUnitById(state, action.unitId);
  const building = state.map.buildings.find(
    (candidate) => candidate.id === action.buildingId
  );

  if (!unit || !building) {
    return null;
  }

  const profile = getEnemyAiProfile(state);
  const moved = projectMovement(state, unit, action.tile);
  let score =
    action.estimate * 0.18 +
    getStrategicObjectiveScore(state, unit, action.tile) * 0.04;

  if (action.canCaptureAfterMove) {
    captureBuildingForUnit(state, unit, building);
    updateMissionVictory(state);
    score +=
      42 * profile.objectiveWeight;

    if (unit.unitTypeId === "grunt") {
      score += 300;
    }

    if (state.victory?.winner === TURN_SIDES.ENEMY) {
      score += 100000;
    }
  } else if (moved) {
    unit.hasAttacked = true;
    score += 8 * profile.objectiveWeight;
  }

  return score;
}

function projectRepair(state, action) {
  const unit = findUnitById(state, action.unitId);
  const building = state.map.buildings.find(
    (candidate) => candidate.id === action.buildingId
  );

  if (!unit || !building) {
    return null;
  }

  const profile = getEnemyAiProfile(state);
  const missingHp = Math.max(0, unit.stats.maxHealth - unit.current.hp);
  const moved = projectMovement(state, unit, action.tile);

  if (!moved) {
    unit.hasMoved = true;
  }

  unit.hasAttacked = true;
  unit.cooldowns.repairMode = Math.max(
    unit.cooldowns.repairMode ?? 0,
    action.canRepairAfterMove ? (moved ? 2 : 1) : 2
  );

  return (
    missingHp * (2.5 + profile.safetyWeight) +
    (action.canRepairAfterMove ? 22 : 8) +
    getStrategicObjectiveScore(state, unit, action.tile) * 0.025
  );
}

function projectAction(node, action, depth) {
  const state = structuredClone(node.state);
  let actionScore = null;

  if (action.type === "attack") {
    actionScore = projectAttack(state, action);
  } else if (action.type === "capture") {
    actionScore = projectCapture(state, action);
  } else if (action.type === "repair") {
    actionScore = projectRepair(state, action);
  }

  if (actionScore === null) {
    return null;
  }

  const pendingUnitIds = node.pendingUnitIds.filter(
    (unitId) =>
      unitId !== action.unitId &&
      Boolean(findUnitById(state, unitId))
  );
  const projectedAction = {
    ...action,
    projectedScore: actionScore
  };

  return {
    state,
    pendingUnitIds,
    actions: [...node.actions, projectedAction],
    score: node.score + actionScore * Math.pow(0.96, depth)
  };
}

export function planEnemyTurn(state, pendingUnitIds = []) {
  const initialState = structuredClone(state);
  const initialPendingUnitIds = [...new Set(pendingUnitIds)].filter((unitId) => {
    const unit = findUnitById(initialState, unitId);
    return Boolean(unit && unit.current.hp > 0);
  });

  if (initialPendingUnitIds.length === 0) {
    return null;
  }

  const firstPendingUnitId = initialPendingUnitIds[0];
  const initialCandidates = getActionCandidates(
    initialState,
    initialPendingUnitIds
  );

  if (
    !initialCandidates.some(
      (candidate) => candidate.unitId === firstPendingUnitId
    )
  ) {
    return null;
  }

  let beam = [
    {
      state: initialState,
      pendingUnitIds: initialPendingUnitIds,
      actions: [],
      score: 0
    }
  ];
  const completed = [];
  let expandedNodes = 0;

  for (let depth = 0; depth < initialPendingUnitIds.length; depth += 1) {
    const nextBeam = [];

    for (const node of beam) {
      if (node.state.victory || node.pendingUnitIds.length === 0) {
        completed.push(node);
        continue;
      }

      const candidates = getActionCandidates(node.state, node.pendingUnitIds);

      if (candidates.length === 0) {
        completed.push(node);
        continue;
      }

      for (const action of candidates) {
        const projected = projectAction(node, action, depth);

        if (projected) {
          nextBeam.push(projected);
          expandedNodes += 1;
        }
      }
    }

    if (nextBeam.length === 0) {
      break;
    }

    beam = nextBeam
      .sort(compareNodes)
      .slice(0, ENEMY_TURN_PLANNER_BEAM_WIDTH);
  }

  const bestNode = [...completed, ...beam]
    .filter((node) => node.actions.length > 0)
    .sort(compareNodes)[0];

  if (!bestNode) {
    return null;
  }

  return {
    action: bestNode.actions[0],
    sequence: bestNode.actions,
    score: bestNode.score,
    expandedNodes
  };
}
