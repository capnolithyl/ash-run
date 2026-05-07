import { BUILDING_KEYS, TERRAIN_KEYS, TURN_SIDES } from "../core/constants.js";
import { getBuildingTypeMetadata } from "./buildings.js";
import { MAP_THEME_PALETTES, TERRAIN_LIBRARY } from "./terrain.js";

export const MAP_EDITOR_TOOL_IDS = {
  TERRAIN: "terrain",
  BUILDING: "building",
  PLAYER_SPAWN: "player-spawn",
  ENEMY_SPAWN: "enemy-spawn",
  ERASER: "eraser"
};

const LAND_BLOCKED_TERRAIN = new Set([TERRAIN_KEYS.WATER, TERRAIN_KEYS.RIDGE]);
const BUILDING_OWNERS = new Set([TURN_SIDES.PLAYER, TURN_SIDES.ENEMY, "neutral"]);
const DEFAULT_WIDTH = 18;
const DEFAULT_HEIGHT = 12;
const DEFAULT_THEME = "ash";

function clampDimension(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeMapText(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function sanitizeEditableText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function coerceCoordinate(point) {
  if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    return null;
  }

  return {
    x: point.x,
    y: point.y
  };
}

function isThemeKey(theme) {
  return Object.hasOwn(MAP_THEME_PALETTES, theme);
}

function isTerrainKey(terrainId) {
  return Object.hasOwn(TERRAIN_LIBRARY, terrainId);
}

function isLandTerrain(terrainId) {
  return !LAND_BLOCKED_TERRAIN.has(terrainId);
}

function createPlainTiles(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => TERRAIN_KEYS.PLAIN)
  );
}

function normalizeTileGrid(inputTiles, width, height) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const terrainId = inputTiles?.[y]?.[x];
      return isTerrainKey(terrainId) ? terrainId : TERRAIN_KEYS.PLAIN;
    })
  );
}

function isInsideMap(mapData, x, y) {
  return x >= 0 && y >= 0 && x < mapData.width && y < mapData.height;
}

function hasSpawnAt(spawns, x, y) {
  return spawns.some((spawn) => spawn.x === x && spawn.y === y);
}

function sanitizeBuilding(building, mapData, takenPositions) {
  if (!building || !Number.isInteger(building.x) || !Number.isInteger(building.y)) {
    return null;
  }

  if (!isInsideMap(mapData, building.x, building.y)) {
    return null;
  }

  if (!Object.hasOwn(BUILDING_KEYS, getBuildingKeyName(building.type))) {
    return null;
  }

  if (!BUILDING_OWNERS.has(building.owner)) {
    return null;
  }

  if (!isLandTerrain(mapData.tiles[building.y][building.x])) {
    return null;
  }

  const key = `${building.x},${building.y}`;

  if (takenPositions.has(key)) {
    return null;
  }

  takenPositions.add(key);

  return {
    id: sanitizeMapText(
      building.id,
      buildMapEditorBuildingId(mapData.id, building.type, building.owner, building.x, building.y)
    ),
    type: building.type,
    owner: building.owner,
    x: building.x,
    y: building.y
  };
}

function normalizeSpawns(spawns, mapData, blockedCoordinates = new Set()) {
  const unique = [];
  const seen = new Set();

  for (const spawn of spawns ?? []) {
    const point = coerceCoordinate(spawn);

    if (!point || !isInsideMap(mapData, point.x, point.y)) {
      continue;
    }

    if (!isLandTerrain(mapData.tiles[point.y][point.x])) {
      continue;
    }

    const key = `${point.x},${point.y}`;

    if (seen.has(key) || blockedCoordinates.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(point);
  }

  return unique;
}

function getBuildingKeyName(buildingType) {
  return Object.keys(BUILDING_KEYS).find((key) => BUILDING_KEYS[key] === buildingType) ?? "";
}

export function buildMapEditorBuildingId(mapId, buildingType, owner, x, y) {
  const safeMapId = sanitizeMapText(mapId, "custom-map").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeOwner = sanitizeMapText(owner, "neutral").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `${safeMapId}-${safeOwner}-${buildingType}-${x}-${y}`;
}

export function createBlankMapDefinition(overrides = {}) {
  const width = clampDimension(overrides.width, DEFAULT_WIDTH);
  const height = clampDimension(overrides.height, DEFAULT_HEIGHT);
  const mapData = {
    id: sanitizeMapText(overrides.id, "custom-map"),
    name: sanitizeMapText(overrides.name, "Custom Map"),
    theme: isThemeKey(overrides.theme) ? overrides.theme : DEFAULT_THEME,
    width,
    height,
    tiles: normalizeTileGrid(overrides.tiles ?? createPlainTiles(width, height), width, height),
    buildings: [],
    playerSpawns: [],
    enemySpawns: []
  };

  if (typeof overrides.layout === "string" && overrides.layout.trim()) {
    mapData.layout = overrides.layout.trim();
  }

  mapData.buildings = normalizeBuildings(overrides.buildings, mapData);
  mapData.playerSpawns = normalizeSpawns(overrides.playerSpawns, mapData);
  mapData.enemySpawns = normalizeSpawns(
    overrides.enemySpawns,
    mapData,
    new Set(mapData.playerSpawns.map((spawn) => `${spawn.x},${spawn.y}`))
  );

  return mapData;
}

export function normalizeMapDefinition(mapInput = {}) {
  const width = clampDimension(mapInput.width, mapInput.tiles?.[0]?.length ?? DEFAULT_WIDTH);
  const height = clampDimension(mapInput.height, mapInput.tiles?.length ?? DEFAULT_HEIGHT);
  const mapData = {
    id: sanitizeEditableText(mapInput.id, "custom-map"),
    name: sanitizeEditableText(mapInput.name, "Custom Map"),
    theme: isThemeKey(mapInput.theme) ? mapInput.theme : DEFAULT_THEME,
    width,
    height,
    tiles: normalizeTileGrid(mapInput.tiles, width, height),
    buildings: [],
    playerSpawns: [],
    enemySpawns: []
  };

  if (typeof mapInput.layout === "string" && mapInput.layout.trim()) {
    mapData.layout = mapInput.layout.trim();
  }

  mapData.buildings = normalizeBuildings(mapInput.buildings, mapData);
  mapData.playerSpawns = normalizeSpawns(mapInput.playerSpawns, mapData);
  mapData.enemySpawns = normalizeSpawns(
    mapInput.enemySpawns,
    mapData,
    new Set(mapData.playerSpawns.map((spawn) => `${spawn.x},${spawn.y}`))
  );

  return mapData;
}

export function normalizeBuildings(buildings, mapData) {
  const takenPositions = new Set();
  const unique = [];

  for (const building of buildings ?? []) {
    const sanitized = sanitizeBuilding(building, mapData, takenPositions);

    if (sanitized) {
      unique.push(sanitized);
    }
  }

  return unique;
}

export function createDefaultMapEditorState(mapData = createBlankMapDefinition()) {
  return {
    mapData,
    selectedTool: MAP_EDITOR_TOOL_IDS.TERRAIN,
    selectedTerrainId: TERRAIN_KEYS.PLAIN,
    selectedBuildingType: BUILDING_KEYS.COMMAND,
    selectedBuildingOwner: "neutral",
    selectedSpawnSide: TURN_SIDES.PLAYER,
    selectedTile: null,
    hoveredTile: null,
    isPainting: false
  };
}

export function getMapEditorThemeOptions() {
  return Object.keys(MAP_THEME_PALETTES);
}

export function getMapEditorTileDetails(mapData, tile) {
  if (!mapData || !tile || !isInsideMap(mapData, tile.x, tile.y)) {
    return null;
  }

  const terrainId = mapData.tiles[tile.y][tile.x];
  const building = mapData.buildings.find((candidate) => candidate.x === tile.x && candidate.y === tile.y) ?? null;
  const terrain = TERRAIN_LIBRARY[terrainId];

  return {
    x: tile.x,
    y: tile.y,
    terrainId,
    terrain,
    building,
    buildingMetadata: building ? getBuildingTypeMetadata(building.type) : null,
    hasPlayerSpawn: hasSpawnAt(mapData.playerSpawns, tile.x, tile.y),
    hasEnemySpawn: hasSpawnAt(mapData.enemySpawns, tile.x, tile.y)
  };
}

function removeBuildingAt(mapData, x, y) {
  mapData.buildings = mapData.buildings.filter((building) => building.x !== x || building.y !== y);
}

function removeSpawnsAt(mapData, x, y) {
  mapData.playerSpawns = mapData.playerSpawns.filter((spawn) => spawn.x !== x || spawn.y !== y);
  mapData.enemySpawns = mapData.enemySpawns.filter((spawn) => spawn.x !== x || spawn.y !== y);
}

function setSpawnAt(mapData, side, x, y) {
  if (!isLandTerrain(mapData.tiles[y][x])) {
    return false;
  }

  if (side === TURN_SIDES.PLAYER) {
    mapData.enemySpawns = mapData.enemySpawns.filter((spawn) => spawn.x !== x || spawn.y !== y);

    if (!hasSpawnAt(mapData.playerSpawns, x, y)) {
      mapData.playerSpawns.push({ x, y });
    }
  } else {
    mapData.playerSpawns = mapData.playerSpawns.filter((spawn) => spawn.x !== x || spawn.y !== y);

    if (!hasSpawnAt(mapData.enemySpawns, x, y)) {
      mapData.enemySpawns.push({ x, y });
    }
  }

  return true;
}

function setBuildingAt(mapData, buildingType, owner, x, y) {
  if (!isLandTerrain(mapData.tiles[y][x]) || !BUILDING_OWNERS.has(owner)) {
    return false;
  }

  removeBuildingAt(mapData, x, y);
  mapData.buildings.push({
    id: buildMapEditorBuildingId(mapData.id, buildingType, owner, x, y),
    type: buildingType,
    owner,
    x,
    y
  });
  return true;
}

export function applyMapEditorTool(mapInput, editorState, x, y) {
  const mapData = normalizeMapDefinition(mapInput);

  if (!isInsideMap(mapData, x, y)) {
    return {
      changed: false,
      mapData,
      selectedTile: editorState?.selectedTile ?? null
    };
  }

  const nextMap = structuredClone(mapData);
  const toolId = editorState?.selectedTool ?? MAP_EDITOR_TOOL_IDS.TERRAIN;
  let changed = false;

  if (toolId === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    const nextTerrain = isTerrainKey(editorState?.selectedTerrainId)
      ? editorState.selectedTerrainId
      : TERRAIN_KEYS.PLAIN;

    if (nextMap.tiles[y][x] !== nextTerrain) {
      nextMap.tiles[y][x] = nextTerrain;
      changed = true;
    }

    if (!isLandTerrain(nextMap.tiles[y][x])) {
      const hadBuilding = nextMap.buildings.some((building) => building.x === x && building.y === y);
      const hadSpawn =
        hasSpawnAt(nextMap.playerSpawns, x, y) || hasSpawnAt(nextMap.enemySpawns, x, y);

      removeBuildingAt(nextMap, x, y);
      removeSpawnsAt(nextMap, x, y);
      changed ||= hadBuilding || hadSpawn;
    }
  } else if (toolId === MAP_EDITOR_TOOL_IDS.BUILDING) {
    changed = setBuildingAt(
      nextMap,
      editorState?.selectedBuildingType ?? BUILDING_KEYS.COMMAND,
      editorState?.selectedBuildingOwner ?? "neutral",
      x,
      y
    );
  } else if (toolId === MAP_EDITOR_TOOL_IDS.PLAYER_SPAWN) {
    changed = setSpawnAt(nextMap, TURN_SIDES.PLAYER, x, y);
  } else if (toolId === MAP_EDITOR_TOOL_IDS.ENEMY_SPAWN) {
    changed = setSpawnAt(nextMap, TURN_SIDES.ENEMY, x, y);
  } else if (toolId === MAP_EDITOR_TOOL_IDS.ERASER) {
    const hadTerrain = nextMap.tiles[y][x] !== TERRAIN_KEYS.PLAIN;
    const hadBuilding = nextMap.buildings.some((building) => building.x === x && building.y === y);
    const hadSpawn =
      hasSpawnAt(nextMap.playerSpawns, x, y) || hasSpawnAt(nextMap.enemySpawns, x, y);

    nextMap.tiles[y][x] = TERRAIN_KEYS.PLAIN;
    removeBuildingAt(nextMap, x, y);
    removeSpawnsAt(nextMap, x, y);
    changed = hadTerrain || hadBuilding || hadSpawn;
  }

  nextMap.buildings = normalizeBuildings(nextMap.buildings, nextMap);
  nextMap.playerSpawns = normalizeSpawns(nextMap.playerSpawns, nextMap);
  nextMap.enemySpawns = normalizeSpawns(
    nextMap.enemySpawns,
    nextMap,
    new Set(nextMap.playerSpawns.map((spawn) => `${spawn.x},${spawn.y}`))
  );

  return {
    changed,
    mapData: nextMap,
    selectedTile: { x, y }
  };
}

export function getMapEditorValidation(mapInput) {
  const mapData = normalizeMapDefinition(mapInput);
  const errors = [];

  if (!mapData.id.trim()) {
    errors.push("Map ID is required.");
  }

  if (!mapData.name.trim()) {
    errors.push("Map name is required.");
  }

  if (!isThemeKey(mapData.theme)) {
    errors.push("Map theme must be a valid battlefield theme.");
  }

  if (mapData.playerSpawns.length === 0) {
    errors.push("Add at least one player spawn.");
  }

  if (mapData.enemySpawns.length === 0) {
    errors.push("Add at least one enemy spawn.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    mapData
  };
}

export function exportMapDefinition(mapInput) {
  const normalized = normalizeMapDefinition(mapInput);
  const exported = {
    id: normalized.id,
    name: normalized.name,
    theme: normalized.theme,
    width: normalized.width,
    height: normalized.height,
    tiles: normalized.tiles,
    buildings: [...normalized.buildings].sort((left, right) =>
      `${left.y}:${left.x}:${left.id}`.localeCompare(`${right.y}:${right.x}:${right.id}`)
    ),
    playerSpawns: [...normalized.playerSpawns].sort((left, right) =>
      `${left.y}:${left.x}`.localeCompare(`${right.y}:${right.x}`)
    ),
    enemySpawns: [...normalized.enemySpawns].sort((left, right) =>
      `${left.y}:${left.x}`.localeCompare(`${right.y}:${right.x}`)
    )
  };

  if (normalized.layout) {
    exported.layout = normalized.layout;
  }

  return exported;
}

export function createMapEditorSnapshot(mapInput, selectedTile = null) {
  const mapData = normalizeMapDefinition(mapInput);

  return {
    id: `editor-${mapData.id}`,
    mode: "editor",
    map: mapData,
    turn: {
      number: 1,
      activeSide: TURN_SIDES.PLAYER
    },
    player: {
      commanderId: null,
      funds: 0,
      charge: 0,
      units: []
    },
    enemy: {
      commanderId: null,
      funds: 0,
      charge: 0,
      units: []
    },
    log: [],
    victory: null,
    presentation: {
      selectedTile: selectedTile
        ? {
            x: selectedTile.x,
            y: selectedTile.y
          }
        : null
    }
  };
}
