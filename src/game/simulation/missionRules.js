import { BUILDING_KEYS, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import {
  DEFEND_OBJECTIVE_MAX_HP,
  HOSTAGE_MOVEMENT_PENALTY,
  MAP_GOAL_TYPES,
  formatGoalSectorLabel,
  getCommandBuildingForSide,
  getMapGoalLabel,
  normalizeMapGoal
} from "../content/mapGoals.js";
import { appendLog } from "./battleLog.js";
import { findUnitById } from "./battleUnits.js";
import { getLivingUnits } from "./selectors.js";

function createRoutMissionState(state) {
  return {
    defeatArmed: {
      [TURN_SIDES.PLAYER]: getLivingUnits(state, TURN_SIDES.PLAYER).length > 0,
      [TURN_SIDES.ENEMY]: getLivingUnits(state, TURN_SIDES.ENEMY).length > 0
    }
  };
}

function createRescueMissionState(state, goal) {
  const targetBuilding = goal.target
    ? state.map.buildings.find(
        (building) => building.x === goal.target.x && building.y === goal.target.y
      ) ?? null
    : null;

  return {
    status: "waiting",
    carrierUnitId: null,
    targetBuildingId: targetBuilding?.id ?? null
  };
}

function createDefendMissionState() {
  return {
    targetHp: DEFEND_OBJECTIVE_MAX_HP,
    maxHp: DEFEND_OBJECTIVE_MAX_HP
  };
}

function setHostageCarrierFlag(unit, isCarrier) {
  unit.temporary ??= {};

  if (isCarrier) {
    unit.temporary.hostageCarrier = true;
    return;
  }

  delete unit.temporary.hostageCarrier;

  if (Object.keys(unit.temporary).length === 0) {
    unit.temporary = null;
  }
}

export function getMissionTargetBuilding(state, mission = state.mission) {
  if (!mission?.target) {
    return null;
  }

  return (
    state.map.buildings.find(
      (building) => building.x === mission.target.x && building.y === mission.target.y
    ) ?? null
  );
}

export function syncMissionUnitState(state) {
  const carrierUnitId = state.mission?.rescue?.carrierUnitId ?? null;

  for (const side of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
    for (const unit of state[side].units ?? []) {
      setHostageCarrierFlag(unit, unit.id === carrierUnitId);
    }
  }
}

export function createMissionState(state) {
  const goal = normalizeMapGoal(state.map?.goal, state.map);
  const playerHq = getCommandBuildingForSide(state.map, TURN_SIDES.PLAYER);
  const enemyHq = getCommandBuildingForSide(state.map, TURN_SIDES.ENEMY);

  return {
    type: goal.type,
    label: getMapGoalLabel(goal),
    target: goal.target ? { ...goal.target } : null,
    turnLimit: goal.turnLimit ?? null,
    turnsRemaining:
      goal.type === MAP_GOAL_TYPES.DEFEND || goal.type === MAP_GOAL_TYPES.SURVIVE
        ? goal.turnLimit ?? null
        : null,
    playerHq: playerHq
      ? {
          id: playerHq.id,
          x: playerHq.x,
          y: playerHq.y
        }
      : null,
    enemyHq: enemyHq
      ? {
          id: enemyHq.id,
          x: enemyHq.x,
          y: enemyHq.y
        }
      : null,
    rout: createRoutMissionState(state),
    rescue: createRescueMissionState(state, goal),
    defend: createDefendMissionState()
  };
}

function mergeExistingMissionState(baseMission, existingMission) {
  if (!existingMission || existingMission.type !== baseMission.type) {
    return baseMission;
  }

  const nextMission = {
    ...baseMission,
    turnsRemaining:
      Number.isInteger(existingMission.turnsRemaining) && existingMission.turnsRemaining >= 0
        ? existingMission.turnsRemaining
        : baseMission.turnsRemaining,
    rout: {
      ...baseMission.rout,
      ...(existingMission.rout ?? {}),
      defeatArmed: {
        ...(baseMission.rout?.defeatArmed ?? {}),
        ...(existingMission.rout?.defeatArmed ?? {})
      }
    },
    rescue: {
      ...baseMission.rescue,
      ...(existingMission.rescue ?? {})
    },
    defend: {
      ...baseMission.defend,
      ...(existingMission.defend ?? {})
    }
  };

  nextMission.defend.targetHp = Math.max(
    0,
    Math.min(
      nextMission.defend.maxHp ?? DEFEND_OBJECTIVE_MAX_HP,
      Number(nextMission.defend.targetHp ?? nextMission.defend.maxHp ?? DEFEND_OBJECTIVE_MAX_HP)
    )
  );

  return nextMission;
}

export function normalizeMissionState(state) {
  if (!state?.map) {
    return null;
  }

  state.map.goal = normalizeMapGoal(state.map.goal, state.map);
  state.mission = mergeExistingMissionState(createMissionState(state), state.mission);

  if (state.mission.type === MAP_GOAL_TYPES.RESCUE) {
    const carrier = state.mission.rescue?.carrierUnitId
      ? findUnitById(state, state.mission.rescue.carrierUnitId)
      : null;

    if (!carrier && state.mission.rescue.status === "carried") {
      state.mission.rescue.status = "dead";
      state.mission.rescue.carrierUnitId = null;
    }
  }

  syncMissionUnitState(state);
  return state.mission;
}

function createVictory(winner, message) {
  return {
    winner,
    message
  };
}

function getRescueCarrier(state) {
  const carrierUnitId = state.mission?.rescue?.carrierUnitId;
  return carrierUnitId ? findUnitById(state, carrierUnitId) : null;
}

function getPlayerUnitCount(state) {
  return getLivingUnits(state, TURN_SIDES.PLAYER).length;
}

function getEnemyUnitCount(state) {
  return getLivingUnits(state, TURN_SIDES.ENEMY).length;
}

export function canUnitRescueHostage(state, unit) {
  const mission = normalizeMissionState(state);

  if (
    !unit ||
    mission?.type !== MAP_GOAL_TYPES.RESCUE ||
    mission.rescue?.status !== "waiting" ||
    unit.owner !== TURN_SIDES.PLAYER ||
    unit.family === UNIT_TAGS.AIR ||
    unit.transport?.carriedByUnitId
  ) {
    return false;
  }

  return Boolean(mission.target && unit.x === mission.target.x && unit.y === mission.target.y);
}

export function canUnitDropOffHostage(state, unit) {
  const mission = normalizeMissionState(state);

  if (
    !unit ||
    mission?.type !== MAP_GOAL_TYPES.RESCUE ||
    mission.rescue?.status !== "carried" ||
    mission.rescue?.carrierUnitId !== unit.id ||
    !mission.playerHq
  ) {
    return false;
  }

  return unit.x === mission.playerHq.x && unit.y === mission.playerHq.y;
}

export function performRescue(state, unit) {
  if (!canUnitRescueHostage(state, unit)) {
    return false;
  }

  state.mission.rescue.status = "carried";
  state.mission.rescue.carrierUnitId = unit.id;
  unit.hasMoved = true;
  unit.hasAttacked = true;
  syncMissionUnitState(state);
  appendLog(state, `${unit.name} rescued the hostage.`);
  return true;
}

export function performDropOff(state, unit) {
  if (!canUnitDropOffHostage(state, unit)) {
    return false;
  }

  state.mission.rescue.status = "delivered";
  state.mission.rescue.carrierUnitId = null;
  unit.hasMoved = true;
  unit.hasAttacked = true;
  syncMissionUnitState(state);
  appendLog(state, `${unit.name} delivered the hostage to HQ.`);
  return true;
}

export function canUnitSabotageDefendTarget(state, unit) {
  const mission = normalizeMissionState(state);

  if (
    !unit ||
    mission?.type !== MAP_GOAL_TYPES.DEFEND ||
    unit.owner !== TURN_SIDES.ENEMY ||
    unit.transport?.carriedByUnitId ||
    !mission.target
  ) {
    return false;
  }

  return Math.abs(unit.x - mission.target.x) + Math.abs(unit.y - mission.target.y) === 1;
}

export function performSabotageDefendTarget(state, unit) {
  if (!canUnitSabotageDefendTarget(state, unit)) {
    return false;
  }

  state.mission.defend.targetHp = Math.max(0, (state.mission.defend.targetHp ?? 0) - 1);
  unit.hasMoved = true;
  unit.hasAttacked = true;
  appendLog(state, `${unit.name} damaged the defended objective.`);
  return true;
}

export function applyMissionTurnEnd(state, endedSide) {
  const mission = normalizeMissionState(state);

  if (!mission) {
    return null;
  }

  if (mission.type === MAP_GOAL_TYPES.ROUT) {
    mission.rout.defeatArmed[endedSide] = true;
  }

  if (
    endedSide === TURN_SIDES.ENEMY &&
    (mission.type === MAP_GOAL_TYPES.DEFEND || mission.type === MAP_GOAL_TYPES.SURVIVE) &&
    Number.isInteger(mission.turnsRemaining)
  ) {
    mission.turnsRemaining = Math.max(0, mission.turnsRemaining - 1);
  }

  return mission;
}

export function updateMissionVictory(state) {
  const mission = normalizeMissionState(state);
  state.victory = null;

  if (!mission) {
    return null;
  }

  const livingPlayerCount = getPlayerUnitCount(state);
  const livingEnemyCount = getEnemyUnitCount(state);

  if (mission.type === MAP_GOAL_TYPES.ROUT) {
    if (mission.rout.defeatArmed[TURN_SIDES.ENEMY] && livingEnemyCount === 0) {
      state.victory = createVictory(TURN_SIDES.PLAYER, "Battle won. Enemy forces routed.");
      return state.victory;
    }

    if (mission.rout.defeatArmed[TURN_SIDES.PLAYER] && livingPlayerCount === 0) {
      state.victory = createVictory(TURN_SIDES.ENEMY, "Your column was overrun.");
      return state.victory;
    }

    return null;
  }

  if (mission.type === MAP_GOAL_TYPES.HQ_CAPTURE) {
    const enemyCommand = state.map.buildings.find(
      (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.ENEMY
    );
    const playerCommand = state.map.buildings.find(
      (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.PLAYER
    );

    if (!enemyCommand) {
      state.victory = createVictory(TURN_SIDES.PLAYER, "Enemy HQ captured.");
      return state.victory;
    }

    if (!playerCommand) {
      state.victory = createVictory(TURN_SIDES.ENEMY, "Your HQ was captured.");
      return state.victory;
    }

    return null;
  }

  if (mission.type === MAP_GOAL_TYPES.RESCUE) {
    const carrier = getRescueCarrier(state);

    if (mission.rescue.status === "carried" && !carrier) {
      mission.rescue.status = "dead";
      mission.rescue.carrierUnitId = null;
      syncMissionUnitState(state);
      appendLog(state, "The hostage was lost.");
    }

    if (mission.rescue.status === "delivered") {
      state.victory = createVictory(TURN_SIDES.PLAYER, "Hostage rescued.");
      return state.victory;
    }

    if (mission.rescue.status === "dead") {
      state.victory = createVictory(TURN_SIDES.ENEMY, "The hostage was killed.");
      return state.victory;
    }

    if (livingPlayerCount === 0) {
      state.victory = createVictory(TURN_SIDES.ENEMY, "No rescue team remains.");
      return state.victory;
    }

    return null;
  }

  if (mission.type === MAP_GOAL_TYPES.DEFEND) {
    if ((mission.defend?.targetHp ?? 0) <= 0) {
      state.victory = createVictory(TURN_SIDES.ENEMY, "The defended objective was destroyed.");
      return state.victory;
    }

    if (Number.isInteger(mission.turnsRemaining) && mission.turnsRemaining <= 0) {
      state.victory = createVictory(TURN_SIDES.PLAYER, "The objective held.");
      return state.victory;
    }

    return null;
  }

  if (mission.type === MAP_GOAL_TYPES.SURVIVE) {
    if (livingPlayerCount === 0) {
      state.victory = createVictory(TURN_SIDES.ENEMY, "Your force was wiped out.");
      return state.victory;
    }

    if (Number.isInteger(mission.turnsRemaining) && mission.turnsRemaining <= 0) {
      state.victory = createVictory(TURN_SIDES.PLAYER, "You survived the assault.");
      return state.victory;
    }

    return null;
  }

  return null;
}

export function getMissionProgressText(state) {
  const mission = normalizeMissionState(state);

  if (!mission) {
    return "";
  }

  const targetBuilding = getMissionTargetBuilding(state, mission);
  const targetLabel = targetBuilding ? formatGoalSectorLabel(targetBuilding) : "";
  const livingEnemyCount = getEnemyUnitCount(state);

  switch (mission.type) {
    case MAP_GOAL_TYPES.HQ_CAPTURE:
      return "Capture the enemy HQ.";
    case MAP_GOAL_TYPES.RESCUE:
      if (mission.rescue.status === "carried") {
        return "Bring the hostage to your HQ.";
      }

      if (mission.rescue.status === "delivered") {
        return "Hostage delivered.";
      }

      if (mission.rescue.status === "dead") {
        return "Hostage lost.";
      }

      return targetLabel ? `Rescue the hostage at ${targetLabel}.` : "Rescue the hostage.";
    case MAP_GOAL_TYPES.DEFEND:
      return `Objective HP ${mission.defend?.targetHp ?? 0}/${mission.defend?.maxHp ?? DEFEND_OBJECTIVE_MAX_HP} | ${mission.turnsRemaining ?? 0} turns left`;
    case MAP_GOAL_TYPES.SURVIVE:
      return `${mission.turnsRemaining ?? 0} turns left`;
    case MAP_GOAL_TYPES.ROUT:
    default:
      return `${livingEnemyCount} enemy unit${livingEnemyCount === 1 ? "" : "s"} remaining`;
  }
}

export function getMissionMarkers(state) {
  const mission = normalizeMissionState(state);

  if (!mission) {
    return [];
  }

  const markers = [];

  if (mission.type === MAP_GOAL_TYPES.HQ_CAPTURE) {
    if (mission.playerHq) {
      markers.push({
        kind: "friendly-hq",
        x: mission.playerHq.x,
        y: mission.playerHq.y,
        label: "HQ",
        color: 0x66ffbf
      });
    }

    if (mission.enemyHq) {
      markers.push({
        kind: "enemy-hq",
        x: mission.enemyHq.x,
        y: mission.enemyHq.y,
        label: "HQ",
        color: 0xff8a3d
      });
    }
  }

  if (mission.type === MAP_GOAL_TYPES.RESCUE) {
    if (mission.target) {
      markers.push({
        kind: "hostage",
        x: mission.target.x,
        y: mission.target.y,
        label: mission.rescue?.status === "waiting" ? "VIP" : "OBJ",
        color: 0xfff18a
      });
    }

    if (mission.playerHq) {
      markers.push({
        kind: "dropoff",
        x: mission.playerHq.x,
        y: mission.playerHq.y,
        label: "HQ",
        color: 0x66ffbf
      });
    }
  }

  if (mission.type === MAP_GOAL_TYPES.DEFEND && mission.target) {
    markers.push({
      kind: "defend",
      x: mission.target.x,
      y: mission.target.y,
      label: `D${mission.defend?.targetHp ?? DEFEND_OBJECTIVE_MAX_HP}`,
      color: 0x7be3ff
    });
  }

  return markers;
}

export function getHostageMovementPenalty(unit) {
  return unit?.temporary?.hostageCarrier ? HOSTAGE_MOVEMENT_PENALTY : 0;
}

