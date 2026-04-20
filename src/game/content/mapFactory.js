import { BUILDING_KEYS, TERRAIN_KEYS } from "../core/constants.js";

function createGrid(width, height, terrainKey = TERRAIN_KEYS.PLAIN) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => terrainKey)
  );
}

function carveLine(grid, axis, coordinates, terrainKey) {
  for (const coordinate of coordinates) {
    if (axis === "row" && grid[coordinate]) {
      for (let column = 0; column < grid[coordinate].length; column += 1) {
        grid[coordinate][column] = terrainKey;
      }
    }

    if (axis === "column") {
      for (let row = 0; row < grid.length; row += 1) {
        if (grid[row][coordinate] !== undefined) {
          grid[row][coordinate] = terrainKey;
        }
      }
    }
  }
}

function carvePatch(grid, rectangles, terrainKey) {
  for (const patch of rectangles) {
    for (let row = patch.y; row < patch.y + patch.height; row += 1) {
      for (let column = patch.x; column < patch.x + patch.width; column += 1) {
        if (grid[row]?.[column] !== undefined) {
          grid[row][column] = terrainKey;
        }
      }
    }
  }
}

function stampTile(grid, x, y, terrainKey) {
  if (grid[y]?.[x] !== undefined) {
    grid[y][x] = terrainKey;
  }
}

function addRoadSpine(grid, row, skipColumns = []) {
  for (let column = 0; column < grid[row].length; column += 1) {
    if (!skipColumns.includes(column)) {
      grid[row][column] = TERRAIN_KEYS.ROAD;
    }
  }
}

function addRiverCrossings(grid, columns, rows) {
  for (const row of rows) {
    for (const column of columns) {
      stampTile(grid, column, row, TERRAIN_KEYS.ROAD);
    }
  }
}

function stampBuildings(grid, buildings) {
  for (const building of buildings) {
    stampTile(grid, building.x, building.y, TERRAIN_KEYS.ROAD);
  }
}

function isGroundPassable(grid, x, y) {
  const terrain = grid[y]?.[x];
  return terrain !== TERRAIN_KEYS.WATER && terrain !== TERRAIN_KEYS.RIDGE && terrain !== undefined;
}

function hasGroundRoute(grid, start, goal) {
  const queue = [{ x: start.x, y: start.y }];
  const visited = new Set([`${start.x},${start.y}`]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.x === goal.x && current.y === goal.y) {
      return true;
    }

    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    for (const direction of directions) {
      const nextX = current.x + direction.x;
      const nextY = current.y + direction.y;
      const key = `${nextX},${nextY}`;

      if (visited.has(key) || !isGroundPassable(grid, nextX, nextY)) {
        continue;
      }

      visited.add(key);
      queue.push({ x: nextX, y: nextY });
    }
  }

  return false;
}

function mirrorBuildings(width, leftSideBuildings) {
  const mirrored = [];

  for (const building of leftSideBuildings) {
    mirrored.push(building);
    mirrored.push({
      ...building,
      id: `${building.id}-mirror`,
      x: width - 1 - building.x,
      owner: building.owner === "player" ? "enemy" : "player"
    });
  }

  return mirrored;
}

export function createBattlefield(spec) {
  const width = spec.width ?? 14;
  const height = spec.height ?? 10;
  const grid = createGrid(width, height);
  const middleRow = Math.floor(height / 2);

  addRoadSpine(grid, middleRow, spec.roadGaps ?? []);
  carveLine(grid, "column", spec.riverColumns ?? [], TERRAIN_KEYS.WATER);
  carvePatch(grid, spec.forests ?? [], TERRAIN_KEYS.FOREST);
  carvePatch(grid, spec.ridges ?? [], TERRAIN_KEYS.RIDGE);

  for (const spur of spec.roadSpurs ?? []) {
    carveLine(grid, "column", [spur], TERRAIN_KEYS.ROAD);
  }

  addRiverCrossings(grid, spec.riverColumns ?? [], spec.bridgeRows ?? [middleRow]);

  const leftBuildings = [
    {
      id: `${spec.id}-command`,
      type: BUILDING_KEYS.COMMAND,
      owner: "player",
      x: 1,
      y: middleRow
    },
    {
      id: `${spec.id}-production`,
      type: spec.playerProduction ?? BUILDING_KEYS.BARRACKS,
      owner: "player",
      x: 2,
      y: Math.max(1, middleRow - 2)
    },
    {
      id: `${spec.id}-sector-home`,
      type: BUILDING_KEYS.SECTOR,
      owner: "player",
      x: 3,
      y: Math.min(height - 2, middleRow + 2)
    },
    ...(spec.leftBuildings ?? [])
  ];

  const buildings = [
    ...mirrorBuildings(width, leftBuildings),
    ...(spec.neutralBuildings ?? [])
  ];
  stampBuildings(grid, buildings);

  const playerCommand = buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === "player"
  );
  const enemyCommand = buildings.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === "enemy"
  );

  if (playerCommand && enemyCommand && !hasGroundRoute(grid, playerCommand, enemyCommand)) {
    throw new Error(`Map ${spec.id} does not have a valid ground route between command posts.`);
  }

  return {
    id: spec.id,
    name: spec.name,
    theme: spec.theme,
    width,
    height,
    tiles: grid,
    playerSpawns: spec.playerSpawns ?? [
      { x: 1, y: 2 },
      { x: 1, y: 4 },
      { x: 1, y: 6 },
      { x: 2, y: 5 },
      { x: 2, y: 7 },
      { x: 3, y: 3 }
    ],
    enemySpawns: spec.enemySpawns ?? [
      { x: width - 2, y: 2 },
      { x: width - 2, y: 4 },
      { x: width - 2, y: 6 },
      { x: width - 3, y: 5 },
      { x: width - 3, y: 7 },
      { x: width - 4, y: 3 }
    ],
    buildings
  };
}
