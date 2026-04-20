import { TERRAIN_LIBRARY } from "../content/terrain.js";
import { BUILDING_RECRUITMENT, UNIT_CATALOG } from "../content/unitCatalog.js";
import { TURN_SIDES, UNIT_TAGS } from "../core/constants.js";

function tileKey(x, y) {
  return `${x},${y}`;
}

export function getLivingUnits(state, side) {
  return state[side].units.filter((unit) => unit.current.hp > 0);
}

export function getAllUnits(state) {
  return [...state.player.units, ...state.enemy.units];
}

export function getUnitAt(state, x, y) {
  return getAllUnits(state).find(
    (unit) => unit.current.hp > 0 && unit.x === x && unit.y === y
  );
}

export function getBuildingAt(state, x, y) {
  return state.map.buildings.find((building) => building.x === x && building.y === y);
}

export function isTileOccupied(state, x, y) {
  return Boolean(getUnitAt(state, x, y));
}

export function getSelectedUnit(state) {
  if (state.selection.type !== "unit") {
    return null;
  }

  return getAllUnits(state).find((unit) => unit.id === state.selection.id) ?? null;
}

export function getSelectedBuilding(state) {
  if (state.selection.type !== "building") {
    return null;
  }

  return state.map.buildings.find((building) => building.id === state.selection.id) ?? null;
}

export function getSelectionCoordinates(state) {
  if (state.selection.type === "tile") {
    if (Number.isInteger(state.selection.x) && Number.isInteger(state.selection.y)) {
      return { x: state.selection.x, y: state.selection.y };
    }

    return null;
  }

  const selectedUnit = getSelectedUnit(state);

  if (selectedUnit) {
    return { x: selectedUnit.x, y: selectedUnit.y };
  }

  const selectedBuilding = getSelectedBuilding(state);

  if (selectedBuilding) {
    return { x: selectedBuilding.x, y: selectedBuilding.y };
  }

  return null;
}

export function getTerrainAt(state, x, y) {
  const terrainKey = state.map.tiles[y]?.[x];
  return TERRAIN_LIBRARY[terrainKey];
}

function getMovementCost(unit, terrain) {
  if (!terrain) {
    return 99;
  }

  if (unit.family === UNIT_TAGS.AIR) {
    return 1;
  }

  return unit.family === UNIT_TAGS.VEHICLE ? terrain.vehicleMoveCost : terrain.moveCost;
}

/**
 * Breadth-first flood fill is enough for the current board sizes and keeps
 * the movement rules readable while we are prototyping.
 */
export function getReachableTiles(state, unit, movementBudget) {
  const openSet = [{ x: unit.x, y: unit.y, cost: 0 }];
  const visited = new Map([[tileKey(unit.x, unit.y), 0]]);
  const reachable = [];

  while (openSet.length > 0) {
    const current = openSet.shift();
    reachable.push({ x: current.x, y: current.y });

    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    for (const direction of directions) {
      const nextX = current.x + direction.x;
      const nextY = current.y + direction.y;
      const terrain = getTerrainAt(state, nextX, nextY);

      if (!terrain) {
        continue;
      }

      const nextCost = current.cost + getMovementCost(unit, terrain);
      const key = tileKey(nextX, nextY);
      const occupied = isTileOccupied(state, nextX, nextY);

      if (
        nextCost > movementBudget ||
        terrain.blocksGround && unit.family !== UNIT_TAGS.AIR ||
        (occupied && !(nextX === unit.x && nextY === unit.y)) ||
        visited.has(key)
      ) {
        continue;
      }

      visited.set(key, nextCost);
      openSet.push({ x: nextX, y: nextY, cost: nextCost });
    }
  }

  return reachable;
}

export function getTargetsInRange(state, unit, minimumRange, maximumRange) {
  const enemySide = unit.owner === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
  const targets = [];

  for (const target of getLivingUnits(state, enemySide)) {
    const distance = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);

    if (distance >= minimumRange && distance <= maximumRange) {
      targets.push(target);
    }
  }

  return targets;
}

export function getTilesInRange(state, originX, originY, minimumRange, maximumRange) {
  const tiles = [];

  for (let row = 0; row < state.map.height; row += 1) {
    for (let column = 0; column < state.map.width; column += 1) {
      const distance = Math.abs(originX - column) + Math.abs(originY - row);

      if (distance >= minimumRange && distance <= maximumRange) {
        tiles.push({ x: column, y: row });
      }
    }
  }

  return tiles;
}

export function getRecruitmentOptions(state, building, side) {
  const unitIds = BUILDING_RECRUITMENT[building.type] ?? [];

  return unitIds.map((unitId) => {
    const baseUnit = UNIT_CATALOG[unitId];
    return {
      ...baseUnit,
      adjustedCost: Math.max(100, baseUnit.cost - side.recruitDiscount)
    };
  });
}
