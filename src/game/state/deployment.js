import { BUILDING_KEYS, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { TERRAIN_LIBRARY } from "../content/terrain.js";
import { deployPersistentUnit } from "../simulation/unitFactory.js";

function tileKey(x, y) {
  return `${x},${y}`;
}

function isTileInsideMap(mapDefinition, x, y) {
  return Boolean(mapDefinition.tiles[y]?.[x]);
}

function isTilePassableForUnit(mapDefinition, unit, x, y) {
  const terrain = TERRAIN_LIBRARY[mapDefinition.tiles[y]?.[x]];

  if (!terrain) {
    return false;
  }

  if (unit.family === UNIT_TAGS.AIR) {
    return true;
  }

  if (terrain.blocksGround) {
    return false;
  }

  return !(terrain.blockedFamilies ?? []).includes(unit.family);
}

function normalizeDeploymentPoints(points, mapDefinition) {
  const unique = [];
  const seen = new Set();

  for (const point of points ?? []) {
    if (!Number.isInteger(point?.x) || !Number.isInteger(point?.y)) {
      continue;
    }

    if (!isTileInsideMap(mapDefinition, point.x, point.y)) {
      continue;
    }

    const key = tileKey(point.x, point.y);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push({ x: point.x, y: point.y });
  }

  return unique;
}

function getBuildingDeploymentPriority(type) {
  const priorities = {
    [BUILDING_KEYS.COMMAND]: 0,
    [BUILDING_KEYS.BARRACKS]: 1,
    [BUILDING_KEYS.MOTOR_POOL]: 2,
    [BUILDING_KEYS.AIRFIELD]: 3,
    [BUILDING_KEYS.HOSPITAL]: 4,
    [BUILDING_KEYS.REPAIR_STATION]: 5,
    [BUILDING_KEYS.SECTOR]: 6
  };

  return priorities[type] ?? 99;
}

function getFallbackDeploymentPoints(mapDefinition, owner) {
  const ownedUnits = normalizeDeploymentPoints(
    (mapDefinition.units ?? [])
      .filter((unit) => unit.owner === owner)
      .map((unit) => ({ x: unit.x, y: unit.y })),
    mapDefinition
  );

  if (ownedUnits.length > 0) {
    return ownedUnits;
  }

  const ownedBuildings = normalizeDeploymentPoints(
    [...(mapDefinition.buildings ?? [])]
      .filter((building) => building.owner === owner)
      .sort((left, right) => {
        const priorityDelta =
          getBuildingDeploymentPriority(left.type) - getBuildingDeploymentPriority(right.type);

        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        if (owner === TURN_SIDES.ENEMY && left.x !== right.x) {
          return right.x - left.x;
        }

        if (owner === TURN_SIDES.PLAYER && left.x !== right.x) {
          return left.x - right.x;
        }

        return left.y - right.y;
      })
      .map((building) => ({ x: building.x, y: building.y })),
    mapDefinition
  );

  if (ownedBuildings.length > 0) {
    return ownedBuildings;
  }

  const xStep = owner === TURN_SIDES.ENEMY ? -1 : 1;
  const xStart = owner === TURN_SIDES.ENEMY ? mapDefinition.width - 1 : 0;
  const xEnd = owner === TURN_SIDES.ENEMY ? -1 : mapDefinition.width;

  for (let x = xStart; x !== xEnd; x += xStep) {
    for (let y = 0; y < mapDefinition.height; y += 1) {
      if (isTileInsideMap(mapDefinition, x, y)) {
        return [{ x, y }];
      }
    }
  }

  return [{ x: 0, y: 0 }];
}

function resolveDeploymentPoints(mapDefinition, owner, spawnPoints) {
  const explicitPoints = normalizeDeploymentPoints(spawnPoints, mapDefinition);

  if (explicitPoints.length > 0) {
    return explicitPoints;
  }

  return getFallbackDeploymentPoints(mapDefinition, owner);
}

/**
 * Deployment starts from the authored spawn list, then fans out to the nearest
 * valid tile so carried rosters and scaled enemy openers never overlap.
 */
export function findOpenDeploymentPoint(mapDefinition, unit, origin, occupiedTiles) {
  const queue = [{ x: origin.x, y: origin.y }];
  const visited = new Set([tileKey(origin.x, origin.y)]);
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = tileKey(current.x, current.y);

    if (
      isTilePassableForUnit(mapDefinition, unit, current.x, current.y) &&
      !occupiedTiles.has(currentKey)
    ) {
      return current;
    }

    for (const direction of directions) {
      const nextX = current.x + direction.x;
      const nextY = current.y + direction.y;
      const nextKey = tileKey(nextX, nextY);

      if (visited.has(nextKey) || !isTileInsideMap(mapDefinition, nextX, nextY)) {
        continue;
      }

      visited.add(nextKey);
      queue.push({ x: nextX, y: nextY });
    }
  }

  for (let y = 0; y < mapDefinition.height; y += 1) {
    for (let x = 0; x < mapDefinition.width; x += 1) {
      const key = tileKey(x, y);

      if (isTilePassableForUnit(mapDefinition, unit, x, y) && !occupiedTiles.has(key)) {
        return { x, y };
      }
    }
  }

  return origin;
}

export function getOccupiedTiles(units) {
  return new Set(units.map((unit) => tileKey(unit.x, unit.y)));
}

export function deployPersistentRoster(roster, owner, mapDefinition, spawnPoints) {
  const occupiedTiles = new Set();
  const deploymentPoints = resolveDeploymentPoints(mapDefinition, owner, spawnPoints);

  return roster.map((persistentUnit, index) => {
    const draftUnit = {
      ...persistentUnit,
      owner
    };
    const origin = deploymentPoints[index % deploymentPoints.length];
    const spawnPoint = findOpenDeploymentPoint(mapDefinition, draftUnit, origin, occupiedTiles);
    const deployedUnit = deployPersistentUnit(persistentUnit, owner, spawnPoint);

    occupiedTiles.add(tileKey(deployedUnit.x, deployedUnit.y));
    return deployedUnit;
  });
}

export function placeFreshUnits(units, mapDefinition, spawnPoints) {
  const occupiedTiles = new Set();
  const owner = units[0]?.owner ?? TURN_SIDES.ENEMY;
  const deploymentPoints = resolveDeploymentPoints(mapDefinition, owner, spawnPoints);

  return units.map((unit, index) => {
    const origin = deploymentPoints[index % deploymentPoints.length];
    const spawnPoint = findOpenDeploymentPoint(mapDefinition, unit, origin, occupiedTiles);

    occupiedTiles.add(tileKey(spawnPoint.x, spawnPoint.y));
    return {
      ...unit,
      x: spawnPoint.x,
      y: spawnPoint.y
    };
  });
}
