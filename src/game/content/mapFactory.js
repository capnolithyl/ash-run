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

function createSeededRandom(seedText) {
  let seed = 2166136261;

  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function addTerrainVariation(grid, spec) {
  const random = createSeededRandom(spec.id);
  const totalTiles = grid.length * grid[0].length;
  const extraForestPatches = Math.max(2, Math.floor(totalTiles / 72));
  const extraRidgePatches = Math.max(2, Math.floor(totalTiles / 104));
  const extraMountainPatches = Math.max(1, Math.floor(totalTiles / 130));
  const attempts = extraForestPatches + extraRidgePatches + extraMountainPatches + 12;

  let forestsPlaced = 0;
  let ridgesPlaced = 0;
  let mountainsPlaced = 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const width = 1 + Math.floor(random() * 3);
    const height = 1 + Math.floor(random() * 2);
    const x = 1 + Math.floor(random() * Math.max(1, grid[0].length - width - 2));
    const y = Math.floor(random() * Math.max(1, grid.length - height));
    const terrain =
      forestsPlaced < extraForestPatches
        ? TERRAIN_KEYS.FOREST
        : mountainsPlaced < extraMountainPatches
          ? TERRAIN_KEYS.MOUNTAIN
          : TERRAIN_KEYS.RIDGE;

    if (terrain === TERRAIN_KEYS.RIDGE && ridgesPlaced >= extraRidgePatches) {
      continue;
    }

    if (terrain === TERRAIN_KEYS.MOUNTAIN && mountainsPlaced >= extraMountainPatches) {
      continue;
    }

    if (terrain === TERRAIN_KEYS.FOREST && forestsPlaced >= extraForestPatches) {
      continue;
    }

    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        if (grid[row][column] === TERRAIN_KEYS.ROAD || column <= 1 || column >= grid[0].length - 2) {
          continue;
        }

        grid[row][column] = terrain;
      }
    }

    if (terrain === TERRAIN_KEYS.FOREST) {
      forestsPlaced += 1;
    } else if (terrain === TERRAIN_KEYS.MOUNTAIN) {
      mountainsPlaced += 1;
    } else {
      ridgesPlaced += 1;
    }
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

export function createBattlefield(spec) {
  const width = spec.width ?? 18;
  const height = spec.height ?? 12;
  const grid = createGrid(width, height);
  const middleRow = Math.floor(height / 2);

  addRoadSpine(grid, middleRow, spec.roadGaps ?? []);
  carveLine(grid, "column", spec.riverColumns ?? [], TERRAIN_KEYS.WATER);
  carvePatch(grid, spec.forests ?? [], TERRAIN_KEYS.FOREST);
  carvePatch(grid, spec.mountains ?? [], TERRAIN_KEYS.MOUNTAIN);
  carvePatch(grid, spec.ridges ?? [], TERRAIN_KEYS.RIDGE);

  for (const spur of spec.roadSpurs ?? []) {
    carveLine(grid, "column", [spur], TERRAIN_KEYS.ROAD);
  }

  addRiverCrossings(grid, spec.riverColumns ?? [], spec.bridgeRows ?? [middleRow]);
  addTerrainVariation(grid, spec);

  const playerBuildings = [
    {
      id: `${spec.id}-command`,
      type: BUILDING_KEYS.COMMAND,
      owner: "player",
      x: 1,
      y: middleRow
    },
    {
      id: `${spec.id}-production-a`,
      type: spec.playerProduction ?? BUILDING_KEYS.BARRACKS,
      owner: "player",
      x: 2,
      y: Math.max(1, middleRow - 2)
    },
    {
      id: `${spec.id}-production-b`,
      type: spec.playerProductionSecondary ?? BUILDING_KEYS.MOTOR_POOL,
      owner: "player",
      x: 3,
      y: Math.min(height - 2, middleRow + 2)
    },
    {
      id: `${spec.id}-sector-home`,
      type: BUILDING_KEYS.SECTOR,
      owner: "player",
      x: 4,
      y: middleRow
    },
    ...(spec.playerBuildings ?? [])
  ];

  const enemyBuildings = [
    {
      id: `${spec.id}-enemy-command`,
      type: BUILDING_KEYS.COMMAND,
      owner: "enemy",
      x: width - 2,
      y: middleRow
    },
    {
      id: `${spec.id}-enemy-production-a`,
      type: spec.enemyProduction ?? BUILDING_KEYS.BARRACKS,
      owner: "enemy",
      x: width - 3,
      y: Math.max(1, middleRow + 1)
    },
    {
      id: `${spec.id}-enemy-production-b`,
      type: spec.enemyProductionSecondary ?? BUILDING_KEYS.MOTOR_POOL,
      owner: "enemy",
      x: width - 4,
      y: Math.max(1, middleRow - 2)
    },
    {
      id: `${spec.id}-enemy-sector-forward`,
      type: BUILDING_KEYS.SECTOR,
      owner: "enemy",
      x: width - 6,
      y: middleRow
    },
    ...(spec.enemyBuildings ?? [])
  ];

  const buildings = [
    ...playerBuildings,
    ...enemyBuildings,
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
      { x: 2, y: 8 },
      { x: 2, y: 7 },
      { x: 3, y: 3 },
      { x: 4, y: 9 }
    ],
    enemySpawns: spec.enemySpawns ?? [
      { x: width - 2, y: 2 },
      { x: width - 2, y: 4 },
      { x: width - 2, y: 6 },
      { x: width - 2, y: 8 },
      { x: width - 3, y: 7 },
      { x: width - 4, y: 3 },
      { x: width - 5, y: 9 }
    ],
    buildings
  };
}
