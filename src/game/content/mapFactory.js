import { BUILDING_KEYS, TERRAIN_KEYS } from "../core/constants.js";

const MAP_LAYOUTS = {
  EAST_WEST: "east-west",
  NORTH_SOUTH: "north-south",
  CORNER: "corner",
  CENTER_RING: "center-ring"
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampCoordinate(x, y, width, height) {
  return {
    x: clamp(x, 1, Math.max(1, width - 2)),
    y: clamp(y, 1, Math.max(1, height - 2))
  };
}

function createBuilding(id, type, owner, x, y, width, height) {
  return {
    id,
    type,
    owner,
    ...clampCoordinate(x, y, width, height)
  };
}

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

function shuffleWithRandom(items, random) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function addTerrainVariation(grid, spec) {
  const random = createSeededRandom(spec.id);
  const totalTiles = grid.length * grid[0].length;
  const extraForestPatches = Math.max(4, Math.floor(totalTiles / 60));
  const extraMountainPatches = Math.max(3, Math.floor(totalTiles / 90));
  const extraRidgePatches = Math.max(1, Math.floor(totalTiles / 180));
  const patchPlan = shuffleWithRandom(
    [
      ...Array.from({ length: extraForestPatches }, () => ({
        terrain: TERRAIN_KEYS.FOREST,
        maxWidth: 3,
        maxHeight: 3
      })),
      ...Array.from({ length: extraMountainPatches }, () => ({
        terrain: TERRAIN_KEYS.MOUNTAIN,
        maxWidth: 3,
        maxHeight: 2
      })),
      ...Array.from({ length: extraRidgePatches }, () => ({
        terrain: TERRAIN_KEYS.RIDGE,
        maxWidth: 2,
        maxHeight: 2
      }))
    ],
    random
  );

  for (const patch of patchPlan) {
    const width = 1 + Math.floor(random() * patch.maxWidth);
    const height = 1 + Math.floor(random() * patch.maxHeight);
    const x = 1 + Math.floor(random() * Math.max(1, grid[0].length - width - 2));
    const y = Math.floor(random() * Math.max(1, grid.length - height));

    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        if (
          grid[row][column] !== TERRAIN_KEYS.PLAIN ||
          column <= 1 ||
          column >= grid[0].length - 2
        ) {
          continue;
        }

        grid[row][column] = patch.terrain;
      }
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

function getDefaultRouteRows(height, middleRow) {
  return [middleRow - 1, middleRow, middleRow + 1].filter(
    (row) => row > 0 && row < height - 1
  );
}

function getDefaultRouteRowsForLayout(layout, height, middleRow) {
  if (layout === MAP_LAYOUTS.CORNER) {
    return [1, middleRow, height - 2].filter((row) => row > 0 && row < height - 1);
  }

  if (layout === MAP_LAYOUTS.NORTH_SOUTH || layout === MAP_LAYOUTS.CENTER_RING) {
    return [middleRow].filter((row) => row > 0 && row < height - 1);
  }

  return getDefaultRouteRows(height, middleRow);
}

function getDefaultRouteColumnsForLayout(layout, width, middleColumn) {
  if (layout === MAP_LAYOUTS.NORTH_SOUTH) {
    return [middleColumn - 1, middleColumn, middleColumn + 1].filter(
      (column) => column > 0 && column < width - 1
    );
  }

  if (layout === MAP_LAYOUTS.CORNER) {
    return [2, middleColumn, width - 3].filter((column) => column > 0 && column < width - 1);
  }

  if (layout === MAP_LAYOUTS.CENTER_RING) {
    return [middleColumn - 2, middleColumn + 2].filter(
      (column) => column > 0 && column < width - 1
    );
  }

  return [];
}

function createDefaultNeutralBuildings(spec, width, height, middleRow, layout) {
  const centerX = Math.floor(width / 2);
  const positions = {
    [MAP_LAYOUTS.NORTH_SOUTH]: [
      { suffix: "neutral-sector-west", type: BUILDING_KEYS.SECTOR, x: centerX - 5, y: middleRow },
      { suffix: "neutral-sector-east", type: BUILDING_KEYS.SECTOR, x: centerX + 5, y: middleRow },
      { suffix: "hospital", type: BUILDING_KEYS.HOSPITAL, x: centerX - 2, y: middleRow },
      { suffix: "repair-station", type: BUILDING_KEYS.REPAIR_STATION, x: centerX + 2, y: middleRow }
    ],
    [MAP_LAYOUTS.CORNER]: [
      { suffix: "neutral-sector-low", type: BUILDING_KEYS.SECTOR, x: centerX - 3, y: middleRow + 2 },
      { suffix: "neutral-sector-high", type: BUILDING_KEYS.SECTOR, x: centerX + 3, y: middleRow - 2 },
      { suffix: "hospital", type: BUILDING_KEYS.HOSPITAL, x: 4, y: 4 },
      { suffix: "repair-station", type: BUILDING_KEYS.REPAIR_STATION, x: width - 5, y: height - 5 }
    ],
    [MAP_LAYOUTS.CENTER_RING]: [
      { suffix: "neutral-sector-northwest", type: BUILDING_KEYS.SECTOR, x: centerX - 5, y: middleRow - 3 },
      { suffix: "neutral-sector-southeast", type: BUILDING_KEYS.SECTOR, x: centerX + 5, y: middleRow + 3 },
      { suffix: "hospital", type: BUILDING_KEYS.HOSPITAL, x: centerX - 4, y: middleRow + 2 },
      { suffix: "repair-station", type: BUILDING_KEYS.REPAIR_STATION, x: centerX + 4, y: middleRow - 2 }
    ],
    [MAP_LAYOUTS.EAST_WEST]: [
      { suffix: "neutral-sector-west", type: BUILDING_KEYS.SECTOR, x: centerX - 3, y: middleRow - 3 },
      { suffix: "neutral-sector-east", type: BUILDING_KEYS.SECTOR, x: centerX + 2, y: middleRow + 3 },
      { suffix: "hospital", type: BUILDING_KEYS.HOSPITAL, x: centerX - 1, y: middleRow - 1 },
      { suffix: "repair-station", type: BUILDING_KEYS.REPAIR_STATION, x: centerX + 1, y: middleRow + 1 }
    ]
  };

  return (positions[layout] ?? positions[MAP_LAYOUTS.EAST_WEST]).map((building) =>
    createBuilding(
      `${spec.id}-${building.suffix}`,
      building.type,
      "neutral",
      building.x,
      building.y,
      width,
      height
    )
  );
}

function mergeUniqueBuildings(buildings) {
  const seen = new Set();
  const unique = [];

  for (const building of buildings) {
    const key = `${building.x},${building.y}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(building);
  }

  return unique;
}

function getLayoutSites(spec, width, height, middleRow, middleColumn, layout) {
  const playerProduction = spec.playerProduction ?? BUILDING_KEYS.BARRACKS;
  const playerProductionSecondary = spec.playerProductionSecondary ?? BUILDING_KEYS.MOTOR_POOL;
  const enemyProduction = spec.enemyProduction ?? BUILDING_KEYS.BARRACKS;
  const enemyProductionSecondary = spec.enemyProductionSecondary ?? BUILDING_KEYS.MOTOR_POOL;

  if (layout === MAP_LAYOUTS.NORTH_SOUTH) {
    return {
      playerBuildings: [
        createBuilding(`${spec.id}-command`, BUILDING_KEYS.COMMAND, "player", middleColumn, height - 2, width, height),
        createBuilding(`${spec.id}-production-a`, playerProduction, "player", middleColumn - 3, height - 3, width, height),
        createBuilding(`${spec.id}-production-b`, playerProductionSecondary, "player", middleColumn + 3, height - 3, width, height),
        createBuilding(`${spec.id}-sector-home`, BUILDING_KEYS.SECTOR, "player", middleColumn, height - 5, width, height)
      ],
      enemyBuildings: [
        createBuilding(`${spec.id}-enemy-command`, BUILDING_KEYS.COMMAND, "enemy", middleColumn, 1, width, height),
        createBuilding(`${spec.id}-enemy-production-a`, enemyProduction, "enemy", middleColumn + 3, 2, width, height),
        createBuilding(`${spec.id}-enemy-production-b`, enemyProductionSecondary, "enemy", middleColumn - 3, 2, width, height),
        createBuilding(`${spec.id}-enemy-sector-forward`, BUILDING_KEYS.SECTOR, "enemy", middleColumn, 4, width, height)
      ],
      playerSpawns: [
        { x: middleColumn, y: height - 2 },
        { x: middleColumn - 1, y: height - 3 },
        { x: middleColumn + 1, y: height - 3 },
        { x: middleColumn - 3, y: height - 4 },
        { x: middleColumn + 3, y: height - 4 },
        { x: middleColumn - 2, y: height - 5 },
        { x: middleColumn + 2, y: height - 5 }
      ],
      enemySpawns: [
        { x: middleColumn, y: 1 },
        { x: middleColumn - 1, y: 2 },
        { x: middleColumn + 1, y: 2 },
        { x: middleColumn - 3, y: 3 },
        { x: middleColumn + 3, y: 3 },
        { x: middleColumn - 2, y: 4 },
        { x: middleColumn + 2, y: 4 }
      ]
    };
  }

  if (layout === MAP_LAYOUTS.CORNER) {
    return {
      playerBuildings: [
        createBuilding(`${spec.id}-command`, BUILDING_KEYS.COMMAND, "player", 2, height - 2, width, height),
        createBuilding(`${spec.id}-production-a`, playerProduction, "player", 2, height - 4, width, height),
        createBuilding(`${spec.id}-production-b`, playerProductionSecondary, "player", 5, height - 3, width, height),
        createBuilding(`${spec.id}-sector-home`, BUILDING_KEYS.SECTOR, "player", 5, height - 2, width, height)
      ],
      enemyBuildings: [
        createBuilding(`${spec.id}-enemy-command`, BUILDING_KEYS.COMMAND, "enemy", width - 3, 1, width, height),
        createBuilding(`${spec.id}-enemy-production-a`, enemyProduction, "enemy", width - 3, 3, width, height),
        createBuilding(`${spec.id}-enemy-production-b`, enemyProductionSecondary, "enemy", width - 6, 2, width, height),
        createBuilding(`${spec.id}-enemy-sector-forward`, BUILDING_KEYS.SECTOR, "enemy", width - 6, 1, width, height)
      ],
      playerSpawns: [
        { x: 1, y: height - 2 },
        { x: 2, y: height - 2 },
        { x: 1, y: height - 3 },
        { x: 3, y: height - 4 },
        { x: 4, y: height - 2 },
        { x: 5, y: height - 3 },
        { x: 2, y: height - 5 }
      ],
      enemySpawns: [
        { x: width - 2, y: 1 },
        { x: width - 3, y: 1 },
        { x: width - 2, y: 2 },
        { x: width - 4, y: 3 },
        { x: width - 5, y: 1 },
        { x: width - 6, y: 2 },
        { x: width - 3, y: 4 }
      ]
    };
  }

  if (layout === MAP_LAYOUTS.CENTER_RING) {
    return {
      playerBuildings: [
        createBuilding(`${spec.id}-command`, BUILDING_KEYS.COMMAND, "player", middleColumn, middleRow, width, height),
        createBuilding(`${spec.id}-production-a`, playerProduction, "player", middleColumn - 2, middleRow, width, height),
        createBuilding(`${spec.id}-production-b`, playerProductionSecondary, "player", middleColumn + 2, middleRow, width, height),
        createBuilding(`${spec.id}-sector-home`, BUILDING_KEYS.SECTOR, "player", middleColumn, middleRow + 2, width, height)
      ],
      enemyBuildings: [
        createBuilding(`${spec.id}-enemy-command`, BUILDING_KEYS.COMMAND, "enemy", width - 3, 2, width, height),
        createBuilding(`${spec.id}-enemy-production-a`, enemyProduction, "enemy", 2, 1, width, height),
        createBuilding(`${spec.id}-enemy-production-b`, enemyProductionSecondary, "enemy", width - 3, height - 3, width, height),
        createBuilding(`${spec.id}-enemy-sector-forward`, BUILDING_KEYS.SECTOR, "enemy", 2, height - 2, width, height)
      ],
      playerSpawns: [
        { x: middleColumn, y: middleRow },
        { x: middleColumn - 1, y: middleRow },
        { x: middleColumn + 1, y: middleRow },
        { x: middleColumn, y: middleRow - 1 },
        { x: middleColumn, y: middleRow + 1 },
        { x: middleColumn - 2, y: middleRow + 1 },
        { x: middleColumn + 2, y: middleRow - 1 }
      ],
      enemySpawns: [
        { x: width - 2, y: 1 },
        { x: width - 3, y: 2 },
        { x: 1, y: 1 },
        { x: 2, y: height - 2 },
        { x: width - 2, y: height - 3 },
        { x: 1, y: height - 4 },
        { x: width - 4, y: 4 }
      ]
    };
  }

  return {
    playerBuildings: [
      createBuilding(`${spec.id}-command`, BUILDING_KEYS.COMMAND, "player", 1, middleRow, width, height),
      createBuilding(`${spec.id}-production-a`, playerProduction, "player", 2, middleRow - 2, width, height),
      createBuilding(`${spec.id}-production-b`, playerProductionSecondary, "player", 3, middleRow + 2, width, height),
      createBuilding(`${spec.id}-sector-home`, BUILDING_KEYS.SECTOR, "player", 4, middleRow, width, height)
    ],
    enemyBuildings: [
      createBuilding(`${spec.id}-enemy-command`, BUILDING_KEYS.COMMAND, "enemy", width - 2, middleRow, width, height),
      createBuilding(`${spec.id}-enemy-production-a`, enemyProduction, "enemy", width - 3, middleRow + 1, width, height),
      createBuilding(`${spec.id}-enemy-production-b`, enemyProductionSecondary, "enemy", width - 4, middleRow - 2, width, height),
      createBuilding(`${spec.id}-enemy-sector-forward`, BUILDING_KEYS.SECTOR, "enemy", width - 6, middleRow, width, height)
    ],
    playerSpawns: [
      { x: 1, y: 2 },
      { x: 1, y: 4 },
      { x: 1, y: 6 },
      { x: 2, y: 8 },
      { x: 2, y: 7 },
      { x: 3, y: 3 },
      { x: 4, y: 9 }
    ],
    enemySpawns: [
      { x: width - 2, y: 2 },
      { x: width - 2, y: 4 },
      { x: width - 2, y: 6 },
      { x: width - 2, y: 8 },
      { x: width - 3, y: 7 },
      { x: width - 4, y: 3 },
      { x: width - 5, y: 9 }
    ]
  };
}

function clampSpawnPoints(spawnPoints, width, height) {
  return spawnPoints.map((point) => clampCoordinate(point.x, point.y, width, height));
}

export function createBattlefield(spec) {
  const width = spec.width ?? 20;
  const height = spec.height ?? 14;
  const layout = spec.layout ?? MAP_LAYOUTS.EAST_WEST;
  const grid = createGrid(width, height);
  const middleRow = Math.floor(height / 2);
  const middleColumn = Math.floor(width / 2);
  const routeRows = spec.routeRows ?? getDefaultRouteRowsForLayout(layout, height, middleRow);
  const routeColumns = spec.routeColumns ?? getDefaultRouteColumnsForLayout(layout, width, middleColumn);

  for (const routeRow of routeRows) {
    addRoadSpine(grid, routeRow, spec.roadGaps ?? []);
  }
  for (const routeColumn of routeColumns) {
    carveLine(grid, "column", [routeColumn], TERRAIN_KEYS.ROAD);
  }
  carveLine(grid, "column", spec.riverColumns ?? [], TERRAIN_KEYS.WATER);
  carvePatch(grid, spec.forests ?? [], TERRAIN_KEYS.FOREST);
  carvePatch(grid, spec.mountains ?? [], TERRAIN_KEYS.MOUNTAIN);
  carvePatch(grid, spec.ridges ?? [], TERRAIN_KEYS.RIDGE);

  for (const spur of spec.roadSpurs ?? []) {
    carveLine(grid, "column", [spur], TERRAIN_KEYS.ROAD);
  }

  addRiverCrossings(grid, spec.riverColumns ?? [], spec.bridgeRows ?? routeRows);
  addTerrainVariation(grid, spec);

  const layoutSites = getLayoutSites(spec, width, height, middleRow, middleColumn, layout);
  const playerBuildings = [...layoutSites.playerBuildings, ...(spec.playerBuildings ?? [])];
  const enemyBuildings = [...layoutSites.enemyBuildings, ...(spec.enemyBuildings ?? [])];

  const neutralBuildings = mergeUniqueBuildings([
    ...(spec.neutralBuildings ?? []),
    ...createDefaultNeutralBuildings(spec, width, height, middleRow, layout)
  ]);

  const buildings = mergeUniqueBuildings([
    ...playerBuildings,
    ...enemyBuildings,
    ...neutralBuildings
  ]);
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
    layout,
    width,
    height,
    tiles: grid,
    playerSpawns: clampSpawnPoints(spec.playerSpawns ?? layoutSites.playerSpawns, width, height),
    enemySpawns: clampSpawnPoints(spec.enemySpawns ?? layoutSites.enemySpawns, width, height),
    buildings
  };
}
