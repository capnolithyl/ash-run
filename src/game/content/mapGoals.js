import { BUILDING_KEYS, TURN_SIDES } from "../core/constants.js";
import { getBuildingTypeMetadata } from "./buildings.js";

export const MAP_GOAL_TYPES = {
  ROUT: "rout",
  HQ_CAPTURE: "hq-capture",
  RESCUE: "rescue",
  DEFEND: "defend",
  SURVIVE: "survive"
};

export const MAP_GOAL_ORDER = [
  MAP_GOAL_TYPES.ROUT,
  MAP_GOAL_TYPES.HQ_CAPTURE,
  MAP_GOAL_TYPES.RESCUE,
  MAP_GOAL_TYPES.DEFEND,
  MAP_GOAL_TYPES.SURVIVE
];

export const DEFEND_OBJECTIVE_MAX_HP = 2;
export const HOSTAGE_MOVEMENT_PENALTY = 1;

function isInsideMap(mapData, x, y) {
  return Boolean(mapData) && x >= 0 && y >= 0 && x < mapData.width && y < mapData.height;
}

function clampTurnLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTargetCoordinate(target, mapData) {
  if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) {
    return null;
  }

  if (!isInsideMap(mapData, target.x, target.y)) {
    return null;
  }

  return {
    x: target.x,
    y: target.y
  };
}

export function formatGoalSectorLabel(target) {
  if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) {
    return "Unknown";
  }

  return `Sector ${String.fromCharCode(65 + target.y)}${target.x + 1}`;
}

export function getMapGoalLabel(goalOrType) {
  const type = typeof goalOrType === "string" ? goalOrType : goalOrType?.type;

  switch (type) {
    case MAP_GOAL_TYPES.HQ_CAPTURE:
      return "HQ Capture";
    case MAP_GOAL_TYPES.RESCUE:
      return "Rescue";
    case MAP_GOAL_TYPES.DEFEND:
      return "Defend";
    case MAP_GOAL_TYPES.SURVIVE:
      return "Survive";
    case MAP_GOAL_TYPES.ROUT:
    default:
      return "Rout";
  }
}

export function getCommandBuildingForSide(mapData, side) {
  return (
    mapData?.buildings?.find(
      (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === side
    ) ?? null
  );
}

export function getMapGoalTargetBuilding(mapData, goalOrType) {
  const goal = normalizeMapGoal(goalOrType, mapData);
  const target = normalizeTargetCoordinate(goal.target, mapData);

  if (!target) {
    return null;
  }

  return (
    mapData?.buildings?.find((building) => building.x === target.x && building.y === target.y) ?? null
  );
}

export function getDefaultMapGoal() {
  return {
    type: MAP_GOAL_TYPES.ROUT
  };
}

export function normalizeMapGoal(goalInput, mapData = null) {
  const requestedType = typeof goalInput?.type === "string" ? goalInput.type : MAP_GOAL_TYPES.ROUT;
  const type = MAP_GOAL_ORDER.includes(requestedType) ? requestedType : MAP_GOAL_TYPES.ROUT;
  const goal = {
    type
  };

  if (type === MAP_GOAL_TYPES.RESCUE || type === MAP_GOAL_TYPES.DEFEND) {
    const target = normalizeTargetCoordinate(goalInput?.target, mapData);
    const targetBuilding = target
      ? mapData?.buildings?.find((building) => building.x === target.x && building.y === target.y) ?? null
      : null;

    if (targetBuilding) {
      goal.target = target;
    }
  }

  if (type === MAP_GOAL_TYPES.DEFEND || type === MAP_GOAL_TYPES.SURVIVE) {
    const turnLimit = clampTurnLimit(goalInput?.turnLimit);

    if (turnLimit) {
      goal.turnLimit = turnLimit;
    }
  }

  return goal;
}

export function getMapGoalValidationErrors(mapData, goalInput) {
  const goal = normalizeMapGoal(goalInput, mapData);
  const errors = [];
  const playerHq = getCommandBuildingForSide(mapData, TURN_SIDES.PLAYER);
  const enemyHq = getCommandBuildingForSide(mapData, TURN_SIDES.ENEMY);
  const targetBuilding = getMapGoalTargetBuilding(mapData, goal);

  if (goal.type === MAP_GOAL_TYPES.HQ_CAPTURE) {
    if (!playerHq || !enemyHq) {
      errors.push("HQ Capture maps need both a player and enemy command post.");
    }
  }

  if (goal.type === MAP_GOAL_TYPES.RESCUE) {
    if (!targetBuilding) {
      errors.push("Rescue maps need a marked hostage building.");
    }

    if (!playerHq) {
      errors.push("Rescue maps need a player command post for hostage drop-off.");
    }
  }

  if (goal.type === MAP_GOAL_TYPES.DEFEND) {
    if (!targetBuilding) {
      errors.push("Defend maps need a marked building to defend.");
    }

    if (!goal.turnLimit) {
      errors.push("Defend maps need a turn limit greater than 0.");
    }
  }

  if (goal.type === MAP_GOAL_TYPES.SURVIVE && !goal.turnLimit) {
    errors.push("Survive maps need a turn limit greater than 0.");
  }

  return errors;
}

export function getMapGoalSummary(goalInput, mapData) {
  const goal = normalizeMapGoal(goalInput, mapData);
  const targetBuilding = getMapGoalTargetBuilding(mapData, goal);
  const targetLabel = targetBuilding
    ? `${getBuildingTypeMetadata(targetBuilding.type).name} at ${formatGoalSectorLabel(targetBuilding)}`
    : "target building";

  switch (goal.type) {
    case MAP_GOAL_TYPES.HQ_CAPTURE:
      return "Capture the enemy command post.";
    case MAP_GOAL_TYPES.RESCUE:
      return `Rescue the hostage at ${targetLabel} and deliver them to your command post.`;
    case MAP_GOAL_TYPES.DEFEND:
      return `Defend ${targetLabel} for ${goal.turnLimit ?? "?"} turn${goal.turnLimit === 1 ? "" : "s"}.`;
    case MAP_GOAL_TYPES.SURVIVE:
      return `Survive until the end of turn ${goal.turnLimit ?? "?"}.`;
    case MAP_GOAL_TYPES.ROUT:
    default:
      return "Defeat every enemy unit.";
  }
}

export function getStaticMapGoalMarkers(mapData, goalInput) {
  const goal = normalizeMapGoal(goalInput, mapData);
  const playerHq = getCommandBuildingForSide(mapData, TURN_SIDES.PLAYER);
  const enemyHq = getCommandBuildingForSide(mapData, TURN_SIDES.ENEMY);
  const markers = [];

  if (goal.type === MAP_GOAL_TYPES.HQ_CAPTURE) {
    if (playerHq) {
      markers.push({ x: playerHq.x, y: playerHq.y, label: "HQ", color: 0x66ffbf });
    }

    if (enemyHq) {
      markers.push({ x: enemyHq.x, y: enemyHq.y, label: "HQ", color: 0xff8a3d });
    }
  }

  if (goal.type === MAP_GOAL_TYPES.RESCUE) {
    if (goal.target) {
      markers.push({ x: goal.target.x, y: goal.target.y, label: "VIP", color: 0xfff18a });
    }

    if (playerHq) {
      markers.push({ x: playerHq.x, y: playerHq.y, label: "HQ", color: 0x66ffbf });
    }
  }

  if (goal.type === MAP_GOAL_TYPES.DEFEND && goal.target) {
    markers.push({
      x: goal.target.x,
      y: goal.target.y,
      label: `D${goal.turnLimit ?? ""}`,
      color: 0x7be3ff
    });
  }

  return markers;
}
