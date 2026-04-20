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

function addRoadSpine(grid, row, skipColumns = []) {
  for (let column = 0; column < grid[row].length; column += 1) {
    if (!skipColumns.includes(column)) {
      grid[row][column] = TERRAIN_KEYS.ROAD;
    }
  }
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

  addRoadSpine(grid, Math.floor(height / 2), spec.roadGaps ?? []);
  carveLine(grid, "column", spec.riverColumns ?? [], TERRAIN_KEYS.WATER);
  carvePatch(grid, spec.forests ?? [], TERRAIN_KEYS.FOREST);
  carvePatch(grid, spec.ridges ?? [], TERRAIN_KEYS.RIDGE);

  for (const spur of spec.roadSpurs ?? []) {
    carveLine(grid, "column", [spur], TERRAIN_KEYS.ROAD);
  }

  const leftBuildings = [
    {
      id: `${spec.id}-command`,
      type: BUILDING_KEYS.COMMAND,
      owner: "player",
      x: 1,
      y: Math.floor(height / 2)
    },
    {
      id: `${spec.id}-production`,
      type: spec.playerProduction ?? BUILDING_KEYS.BARRACKS,
      owner: "player",
      x: 2,
      y: Math.max(1, Math.floor(height / 2) - 2)
    },
    {
      id: `${spec.id}-sector-home`,
      type: BUILDING_KEYS.SECTOR,
      owner: "player",
      x: 3,
      y: Math.min(height - 2, Math.floor(height / 2) + 2)
    },
    ...(spec.leftBuildings ?? [])
  ];

  const buildings = [
    ...mirrorBuildings(width, leftBuildings),
    ...(spec.neutralBuildings ?? [])
  ];

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

