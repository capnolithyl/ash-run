import { UNIT_TAGS } from "../core/constants.js";
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

  return roster.map((persistentUnit, index) => {
    const draftUnit = {
      ...persistentUnit,
      owner
    };
    const origin = spawnPoints[index % spawnPoints.length];
    const spawnPoint = findOpenDeploymentPoint(mapDefinition, draftUnit, origin, occupiedTiles);
    const deployedUnit = deployPersistentUnit(persistentUnit, owner, spawnPoint);

    occupiedTiles.add(tileKey(deployedUnit.x, deployedUnit.y));
    return deployedUnit;
  });
}

export function placeFreshUnits(units, mapDefinition, spawnPoints) {
  const occupiedTiles = new Set();

  return units.map((unit, index) => {
    const origin = spawnPoints[index % spawnPoints.length];
    const spawnPoint = findOpenDeploymentPoint(mapDefinition, unit, origin, occupiedTiles);

    occupiedTiles.add(tileKey(spawnPoint.x, spawnPoint.y));
    return {
      ...unit,
      x: spawnPoint.x,
      y: spawnPoint.y
    };
  });
}
