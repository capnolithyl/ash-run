import { BUILDING_KEYS, PROTOTYPE_RUN_GOAL, TERRAIN_KEYS, TURN_SIDES } from "../core/constants.js";
import { createUnitFromType } from "../simulation/unitFactory.js";
import { getBuildingTypeMetadata } from "./buildings.js";
import {
  getDefaultMapGoal,
  getMapGoalLabel,
  getMapGoalSummary,
  getMapGoalValidationErrors,
  getStaticMapGoalMarkers,
  normalizeMapGoal
} from "./mapGoals.js";
import { MAP_THEME_PALETTES, TERRAIN_LIBRARY } from "./terrain.js";
import { UNIT_CATALOG } from "./unitCatalog.js";
import {
  getReinforcementValidationErrors,
  isValidReinforcementUnitTile,
  normalizeMapReinforcements,
  REINFORCEMENT_TRIGGER_TYPES
} from "./reinforcements.js";

export const MAP_EDITOR_TOOL_IDS = {
  TERRAIN: "terrain",
  BUILDING: "building",
  UNIT: "unit",
  REINFORCEMENT_UNIT: "reinforcement-unit",
  REINFORCEMENT_TRIGGER: "reinforcement-trigger",
  TERRAIN_ERASER: "terrain-eraser",
  BUILDING_ERASER: "building-eraser",
  UNIT_ERASER: "unit-eraser",
  REINFORCEMENT_UNIT_ERASER: "reinforcement-unit-eraser",
  REINFORCEMENT_TRIGGER_ERASER: "reinforcement-trigger-eraser"
};

export const MAP_EDITOR_MIRROR_MODES = {
  OFF: "off",
  VERTICAL: "vertical",
  HORIZONTAL: "horizontal",
  DIAGONAL: "diagonal"
};

export const MAP_BUNDLE_FORMAT = "ash-run-map-bundle-v1";

const LAND_BLOCKED_TERRAIN = new Set([TERRAIN_KEYS.WATER, TERRAIN_KEYS.RIDGE]);
const BUILDING_OWNERS = new Set([TURN_SIDES.PLAYER, TURN_SIDES.ENEMY, "neutral"]);
const UNIT_OWNERS = new Set([TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]);
const DEFAULT_WIDTH = 18;
const DEFAULT_HEIGHT = 12;
const MIN_DIMENSION = 6;
const MAX_DIMENSION = 32;
const DEFAULT_THEME = "ash";
const DEFAULT_UNIT_TYPE_ID = "grunt";
export const MAP_EDITOR_DEFAULT_UNIT_LEVEL = 1;
export const MAP_EDITOR_MAX_UNIT_LEVEL = 99;
export const MAP_EDITOR_HISTORY_LIMIT = 60;

const MAP_EDITOR_CONTEXT_ERASER_IDS = {
  [MAP_EDITOR_TOOL_IDS.TERRAIN]: MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER,
  [MAP_EDITOR_TOOL_IDS.BUILDING]: MAP_EDITOR_TOOL_IDS.BUILDING_ERASER,
  [MAP_EDITOR_TOOL_IDS.UNIT]: MAP_EDITOR_TOOL_IDS.UNIT_ERASER,
  [MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT]: MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER,
  [MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER]: MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER,
  [MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER]: MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER,
  [MAP_EDITOR_TOOL_IDS.BUILDING_ERASER]: MAP_EDITOR_TOOL_IDS.BUILDING_ERASER,
  [MAP_EDITOR_TOOL_IDS.UNIT_ERASER]: MAP_EDITOR_TOOL_IDS.UNIT_ERASER,
  [MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER]: MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER,
  [MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER]: MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER,
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampDimension(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? clamp(parsed, MIN_DIMENSION, MAX_DIMENSION) : fallback;
}

export function normalizeMapEditorUnitLevel(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? clamp(parsed, MAP_EDITOR_DEFAULT_UNIT_LEVEL, MAP_EDITOR_MAX_UNIT_LEVEL)
    : MAP_EDITOR_DEFAULT_UNIT_LEVEL;
}

function normalizeRunStage(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? clamp(parsed, 1, PROTOTYPE_RUN_GOAL) : null;
}

export function normalizeMapRunStages(runStages) {
  const unique = new Set();

  for (const stage of runStages ?? []) {
    const normalizedStage = normalizeRunStage(stage);

    if (normalizedStage) {
      unique.add(normalizedStage);
    }
  }

  return [...unique].sort((left, right) => left - right);
}

export function normalizeMapVariantStage(value) {
  return normalizeRunStage(value);
}

export function getMapDefinitionStage(mapInput = {}) {
  return (
    normalizeMapVariantStage(mapInput.stage)
    ?? normalizeMapVariantStage(mapInput.variantStage)
    ?? normalizeMapRunStages(mapInput.runStages)[0]
    ?? null
  );
}

function normalizeMapBundleId(value, fallback = "custom-map") {
  return String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    || fallback;
}

export function getMapDefinitionFamilyId(mapInput = {}) {
  const preferred = mapInput.format === MAP_BUNDLE_FORMAT
    ? mapInput.id
    : String(mapInput.id ?? mapInput.name ?? "custom-map").replace(/-stage-\d+$/i, "");

  return normalizeMapBundleId(preferred);
}

export function isMapBundleDefinition(mapInput) {
  return Boolean(
    mapInput &&
    typeof mapInput === "object" &&
    mapInput.format === MAP_BUNDLE_FORMAT &&
    Array.isArray(mapInput.stages)
  );
}

export function getMapEditorRunStageOptions() {
  return Array.from({ length: PROTOTYPE_RUN_GOAL }, (_, index) => index + 1);
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

function isUnitTypeId(unitTypeId) {
  return Object.hasOwn(UNIT_CATALOG, unitTypeId);
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

function getBuildingKeyName(buildingType) {
  return Object.keys(BUILDING_KEYS).find((key) => BUILDING_KEYS[key] === buildingType) ?? "";
}

function getDefaultUnitTypeId() {
  return isUnitTypeId(DEFAULT_UNIT_TYPE_ID) ? DEFAULT_UNIT_TYPE_ID : Object.keys(UNIT_CATALOG)[0];
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

function sanitizeUnit(unit, mapData, takenPositions) {
  if (!unit || !Number.isInteger(unit.x) || !Number.isInteger(unit.y)) {
    return null;
  }

  if (!isInsideMap(mapData, unit.x, unit.y)) {
    return null;
  }

  if (!isUnitTypeId(unit.unitTypeId)) {
    return null;
  }

  if (!UNIT_OWNERS.has(unit.owner)) {
    return null;
  }

  if (!isLandTerrain(mapData.tiles[unit.y][unit.x])) {
    return null;
  }

  const key = `${unit.x},${unit.y}`;

  if (takenPositions.has(key)) {
    return null;
  }

  takenPositions.add(key);

  return {
    id: sanitizeMapText(
      unit.id,
      buildMapEditorUnitId(mapData.id, unit.unitTypeId, unit.owner, unit.x, unit.y)
    ),
    unitTypeId: unit.unitTypeId,
    owner: unit.owner,
    level: normalizeMapEditorUnitLevel(unit.level),
    x: unit.x,
    y: unit.y
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

function normalizePlacedUnits(units, mapData) {
  const takenPositions = new Set();
  const unique = [];

  for (const unit of units ?? []) {
    const sanitized = sanitizeUnit(unit, mapData, takenPositions);

    if (sanitized) {
      unique.push(sanitized);
    }
  }

  return unique;
}

function getImportedUnits(mapInput) {
  const explicitUnits = Array.isArray(mapInput.units) ? mapInput.units : [];
  const playerUnits = Array.isArray(mapInput.playerUnits)
    ? mapInput.playerUnits.map((unit) => ({ ...unit, owner: TURN_SIDES.PLAYER }))
    : [];
  const enemyUnits = Array.isArray(mapInput.enemyUnits)
    ? mapInput.enemyUnits.map((unit) => ({ ...unit, owner: TURN_SIDES.ENEMY }))
    : [];

  return [...explicitUnits, ...playerUnits, ...enemyUnits];
}

export function buildMapEditorBuildingId(mapId, buildingType, owner, x, y) {
  const safeMapId = sanitizeMapText(mapId, "custom-map").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeOwner = sanitizeMapText(owner, "neutral").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `${safeMapId}-${safeOwner}-${buildingType}-${x}-${y}`;
}

export function buildMapEditorUnitId(mapId, unitTypeId, owner, x, y) {
  const safeMapId = sanitizeMapText(mapId, "custom-map").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeOwner = sanitizeMapText(owner, TURN_SIDES.PLAYER).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `${safeMapId}-${safeOwner}-${unitTypeId}-${x}-${y}`;
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
    units: [],
    reinforcements: [],
    playerSpawns: [],
    enemySpawns: [],
    goal: getDefaultMapGoal()
  };
  const runStages = normalizeMapRunStages(overrides.runStages);
  const variantStage = getMapDefinitionStage(overrides);

  if (typeof overrides.layout === "string" && overrides.layout.trim()) {
    mapData.layout = overrides.layout.trim();
  }

  if (runStages.length > 0) {
    mapData.runStages = runStages;
  }

  if (variantStage) {
    mapData.stage = variantStage;
    mapData.variantStage = variantStage;
  }

  mapData.buildings = normalizeBuildings(overrides.buildings, mapData);
  mapData.units = normalizePlacedUnits(getImportedUnits(overrides), mapData);
  mapData.reinforcements = normalizeMapReinforcements(overrides.reinforcements, mapData);
  mapData.playerSpawns = normalizeSpawns(overrides.playerSpawns, mapData);
  mapData.enemySpawns = normalizeSpawns(
    overrides.enemySpawns,
    mapData,
    new Set(mapData.playerSpawns.map((spawn) => `${spawn.x},${spawn.y}`))
  );
  mapData.goal = normalizeMapGoal(overrides.goal ?? getDefaultMapGoal(), mapData);

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
    units: [],
    reinforcements: [],
    playerSpawns: [],
    enemySpawns: [],
    goal: getDefaultMapGoal()
  };
  const runStages = normalizeMapRunStages(mapInput.runStages);
  const variantStage = getMapDefinitionStage(mapInput);

  if (typeof mapInput.layout === "string" && mapInput.layout.trim()) {
    mapData.layout = mapInput.layout.trim();
  }

  if (runStages.length > 0) {
    mapData.runStages = runStages;
  }

  if (variantStage) {
    mapData.stage = variantStage;
    mapData.variantStage = variantStage;
  }

  mapData.buildings = normalizeBuildings(mapInput.buildings, mapData);
  mapData.units = normalizePlacedUnits(getImportedUnits(mapInput), mapData);
  mapData.reinforcements = normalizeMapReinforcements(mapInput.reinforcements, mapData);
  mapData.playerSpawns = normalizeSpawns(mapInput.playerSpawns, mapData);
  mapData.enemySpawns = normalizeSpawns(
    mapInput.enemySpawns,
    mapData,
    new Set(mapData.playerSpawns.map((spawn) => `${spawn.x},${spawn.y}`))
  );
  mapData.goal = normalizeMapGoal(mapInput.goal ?? getDefaultMapGoal(), mapData);

  return mapData;
}

function normalizeBuildings(buildings, mapData) {
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

export function resizeMapDefinition(mapInput, width, height) {
  const normalized = normalizeMapDefinition(mapInput);
  const nextWidth = clampDimension(width, normalized.width);
  const nextHeight = clampDimension(height, normalized.height);
  const resizedMap = {
    ...normalized,
    width: nextWidth,
    height: nextHeight,
    tiles: normalizeTileGrid(normalized.tiles, nextWidth, nextHeight)
  };

  resizedMap.buildings = normalizeBuildings(normalized.buildings, resizedMap);
  resizedMap.units = normalizePlacedUnits(normalized.units, resizedMap);
  resizedMap.reinforcements = normalizeMapReinforcements(normalized.reinforcements, resizedMap);
  resizedMap.playerSpawns = normalizeSpawns(normalized.playerSpawns, resizedMap);
  resizedMap.enemySpawns = normalizeSpawns(
    normalized.enemySpawns,
    resizedMap,
    new Set(resizedMap.playerSpawns.map((spawn) => `${spawn.x},${spawn.y}`))
  );
  resizedMap.goal = normalizeMapGoal(normalized.goal, resizedMap);

  return resizedMap;
}

export function createDefaultMapEditorState(mapData = createBlankMapDefinition()) {
  const activeMapStage = getMapDefinitionStage(mapData) ?? 1;

  return {
    mapData,
    activeMapStage,
    mapStages: {
      [activeMapStage]: structuredClone(mapData)
    },
    stageHistories: {},
    selectedTool: MAP_EDITOR_TOOL_IDS.TERRAIN,
    selectedTerrainId: TERRAIN_KEYS.PLAIN,
    selectedBuildingType: BUILDING_KEYS.COMMAND,
    selectedBuildingOwner: "neutral",
    selectedUnitTypeId: getDefaultUnitTypeId(),
    selectedUnitOwner: TURN_SIDES.PLAYER,
    selectedUnitLevel: MAP_EDITOR_DEFAULT_UNIT_LEVEL,
    selectedReinforcementWaveId: mapData.reinforcements[0]?.id ?? null,
    lastSelectedTerrainId: null,
    lastSelectedBuilding: null,
    lastSelectedUnit: null,
    loadDialogOpen: false,
    loadDialogEntries: [],
    loadDialogSelectedPath: null,
    loadDialogOpenGroupKey: null,
    loadDialogBusy: false,
    loadDialogError: "",
    mirrorMode: MAP_EDITOR_MIRROR_MODES.OFF,
    selectedTile: null,
    hoveredTile: null,
    isPainting: false,
    historyEntries: [],
    currentHistoryIndex: -1,
    pendingHistoryIndex: null,
    historySequence: 0
  };
}

export function getMapEditorContextEraserToolId(toolId) {
  return MAP_EDITOR_CONTEXT_ERASER_IDS[toolId] ?? MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER;
}

export function getMapEditorThemeOptions() {
  return Object.keys(MAP_THEME_PALETTES);
}

export function getMapEditorMirrorTile(mapData, tile, mirrorMode) {
  if (!mapData || !tile || mirrorMode === MAP_EDITOR_MIRROR_MODES.OFF) {
    return null;
  }

  let mirroredTile = null;

  if (mirrorMode === MAP_EDITOR_MIRROR_MODES.VERTICAL) {
    mirroredTile = { x: mapData.width - 1 - tile.x, y: tile.y };
  } else if (mirrorMode === MAP_EDITOR_MIRROR_MODES.HORIZONTAL) {
    mirroredTile = { x: tile.x, y: mapData.height - 1 - tile.y };
  } else if (mirrorMode === MAP_EDITOR_MIRROR_MODES.DIAGONAL) {
    mirroredTile = { x: tile.y, y: tile.x };
  }

  if (!mirroredTile || !isInsideMap(mapData, mirroredTile.x, mirroredTile.y)) {
    return null;
  }

  if (mirroredTile.x === tile.x && mirroredTile.y === tile.y) {
    return null;
  }

  return mirroredTile;
}

export function getMapEditorTileDetails(mapData, tile) {
  if (!mapData || !tile || !isInsideMap(mapData, tile.x, tile.y)) {
    return null;
  }

  const terrainId = mapData.tiles[tile.y][tile.x];
  const building = mapData.buildings.find((candidate) => candidate.x === tile.x && candidate.y === tile.y) ?? null;
  const unit = mapData.units.find((candidate) => candidate.x === tile.x && candidate.y === tile.y) ?? null;
  const reinforcementUnits = mapData.reinforcements.flatMap((wave) =>
    wave.units
      .filter((candidate) => candidate.x === tile.x && candidate.y === tile.y)
      .map((candidate) => ({
        ...candidate,
        waveId: wave.id,
        waveName: wave.name
      }))
  );
  const reinforcementTriggerWaveIds = mapData.reinforcements
    .filter(
      (wave) =>
        wave.trigger.type === REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED &&
        wave.trigger.tiles.some((candidate) => candidate.x === tile.x && candidate.y === tile.y)
    )
    .map((wave) => wave.id);
  const terrain = TERRAIN_LIBRARY[terrainId];

  return {
    x: tile.x,
    y: tile.y,
    terrainId,
    terrain,
    building,
    buildingMetadata: building ? getBuildingTypeMetadata(building.type) : null,
    unit,
    unitMetadata: unit ? UNIT_CATALOG[unit.unitTypeId] : null,
    reinforcementUnits,
    reinforcementTriggerWaveIds,
    hasPlayerSpawn: hasSpawnAt(mapData.playerSpawns, tile.x, tile.y),
    hasEnemySpawn: hasSpawnAt(mapData.enemySpawns, tile.x, tile.y)
  };
}

function removeBuildingAt(mapData, x, y) {
  mapData.buildings = mapData.buildings.filter((building) => building.x !== x || building.y !== y);
}

function removeUnitAt(mapData, x, y) {
  mapData.units = mapData.units.filter((unit) => unit.x !== x || unit.y !== y);
}

function removeSpawnsAt(mapData, x, y) {
  mapData.playerSpawns = mapData.playerSpawns.filter((spawn) => spawn.x !== x || spawn.y !== y);
  mapData.enemySpawns = mapData.enemySpawns.filter((spawn) => spawn.x !== x || spawn.y !== y);
}

function getSelectedReinforcementWave(mapData, editorState) {
  return (
    mapData.reinforcements.find(
      (wave) => wave.id === editorState?.selectedReinforcementWaveId
    ) ?? null
  );
}

function removeReinforcementUnitsAt(mapData, x, y, waveId = null) {
  let changed = false;

  for (const wave of mapData.reinforcements) {
    if (waveId && wave.id !== waveId) {
      continue;
    }

    const previousLength = wave.units.length;
    wave.units = wave.units.filter((unit) => unit.x !== x || unit.y !== y);
    changed ||= wave.units.length !== previousLength;
  }

  return changed;
}

function removeInvalidReinforcementUnitsAt(mapData, x, y) {
  let changed = false;

  for (const wave of mapData.reinforcements) {
    const previousLength = wave.units.length;
    wave.units = wave.units.filter(
      (unit) =>
        unit.x !== x ||
        unit.y !== y ||
        isValidReinforcementUnitTile(mapData, unit.unitTypeId, x, y)
    );
    changed ||= wave.units.length !== previousLength;
  }

  return changed;
}

function removeReinforcementTriggerAt(mapData, x, y, waveId) {
  const wave = mapData.reinforcements.find((candidate) => candidate.id === waveId);

  if (!wave || wave.trigger.type !== REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED) {
    return false;
  }

  const previousLength = wave.trigger.tiles.length;
  wave.trigger.tiles = wave.trigger.tiles.filter((tile) => tile.x !== x || tile.y !== y);
  return wave.trigger.tiles.length !== previousLength;
}

function setReinforcementUnitAt(mapData, editorState, x, y) {
  const wave = getSelectedReinforcementWave(mapData, editorState);
  const unitTypeId = editorState?.selectedUnitTypeId ?? getDefaultUnitTypeId();
  const level = normalizeMapEditorUnitLevel(editorState?.selectedUnitLevel);

  if (!wave || !isValidReinforcementUnitTile(mapData, unitTypeId, x, y)) {
    return false;
  }

  const existing = wave.units.find((unit) => unit.x === x && unit.y === y);
  if (existing?.unitTypeId === unitTypeId && existing.level === level) {
    return false;
  }

  removeReinforcementUnitsAt(mapData, x, y, wave.id);
  wave.units.push({
    id: `${wave.id}-${unitTypeId}-${x}-${y}`,
    unitTypeId,
    level,
    x,
    y
  });
  return true;
}

function setReinforcementTriggerAt(mapData, editorState, x, y) {
  const wave = getSelectedReinforcementWave(mapData, editorState);

  if (!wave || wave.trigger.type !== REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED) {
    return false;
  }

  if (wave.trigger.tiles.some((tile) => tile.x === x && tile.y === y)) {
    return false;
  }

  wave.trigger.tiles.push({ x, y });
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

function setUnitAt(mapData, unitTypeId, owner, x, y, level = MAP_EDITOR_DEFAULT_UNIT_LEVEL) {
  if (!isLandTerrain(mapData.tiles[y][x]) || !isUnitTypeId(unitTypeId) || !UNIT_OWNERS.has(owner)) {
    return false;
  }

  removeUnitAt(mapData, x, y);
  mapData.units.push({
    id: buildMapEditorUnitId(mapData.id, unitTypeId, owner, x, y),
    unitTypeId,
    owner,
    level: normalizeMapEditorUnitLevel(level),
    x,
    y
  });
  return true;
}

function resolveMapEditorToolId(editorState, overrideToolId) {
  return Object.values(MAP_EDITOR_TOOL_IDS).includes(overrideToolId)
    ? overrideToolId
    : (editorState?.selectedTool ?? MAP_EDITOR_TOOL_IDS.TERRAIN);
}

function applyToolToSingleTile(nextMap, editorState, x, y, overrideToolId = null) {
  const toolId = resolveMapEditorToolId(editorState, overrideToolId);

  if (toolId === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    const nextTerrain = isTerrainKey(editorState?.selectedTerrainId)
      ? editorState.selectedTerrainId
      : TERRAIN_KEYS.PLAIN;
    let changed = false;

    if (nextMap.tiles[y][x] !== nextTerrain) {
      nextMap.tiles[y][x] = nextTerrain;
      changed = true;
    }

    if (!isLandTerrain(nextMap.tiles[y][x])) {
      const hadBuilding = nextMap.buildings.some((building) => building.x === x && building.y === y);
      const hadUnit = nextMap.units.some((unit) => unit.x === x && unit.y === y);
      const hadSpawn =
        hasSpawnAt(nextMap.playerSpawns, x, y) || hasSpawnAt(nextMap.enemySpawns, x, y);

      removeBuildingAt(nextMap, x, y);
      removeUnitAt(nextMap, x, y);
      const removedReinforcementUnit = removeInvalidReinforcementUnitsAt(nextMap, x, y);
      removeSpawnsAt(nextMap, x, y);
      changed ||= hadBuilding || hadUnit || removedReinforcementUnit || hadSpawn;
    }

    return changed;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.BUILDING) {
    return setBuildingAt(
      nextMap,
      editorState?.selectedBuildingType ?? BUILDING_KEYS.COMMAND,
      editorState?.selectedBuildingOwner ?? "neutral",
      x,
      y
    );
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.UNIT) {
    return setUnitAt(
      nextMap,
      editorState?.selectedUnitTypeId ?? getDefaultUnitTypeId(),
      editorState?.selectedUnitOwner ?? TURN_SIDES.PLAYER,
      x,
      y,
      editorState?.selectedUnitLevel ?? MAP_EDITOR_DEFAULT_UNIT_LEVEL
    );
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT) {
    return setReinforcementUnitAt(nextMap, editorState, x, y);
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER) {
    return setReinforcementTriggerAt(nextMap, editorState, x, y);
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER) {
    const hadTerrain = nextMap.tiles[y][x] !== TERRAIN_KEYS.PLAIN;
    nextMap.tiles[y][x] = TERRAIN_KEYS.PLAIN;
    return hadTerrain;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.BUILDING_ERASER) {
    const hadBuilding = nextMap.buildings.some((building) => building.x === x && building.y === y);
    removeBuildingAt(nextMap, x, y);
    return hadBuilding;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.UNIT_ERASER) {
    const hadUnit = nextMap.units.some((unit) => unit.x === x && unit.y === y);
    removeUnitAt(nextMap, x, y);
    return hadUnit;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER) {
    return removeReinforcementUnitsAt(
      nextMap,
      x,
      y,
      editorState?.selectedReinforcementWaveId
    );
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER) {
    return removeReinforcementTriggerAt(
      nextMap,
      x,
      y,
      editorState?.selectedReinforcementWaveId
    );
  }

  return false;
}

export function applyMapEditorTool(mapInput, editorState, x, y, options = {}) {
  const mapData = normalizeMapDefinition(mapInput);
  const overrideToolId = options?.toolId ?? null;

  if (!isInsideMap(mapData, x, y)) {
    return {
      changed: false,
      mapData,
      selectedTile: editorState?.selectedTile ?? null
    };
  }

  const nextMap = structuredClone(mapData);
  const primaryTile = { x, y };
  const mirroredTile = getMapEditorMirrorTile(nextMap, primaryTile, editorState?.mirrorMode);
  const targetTiles = mirroredTile ? [primaryTile, mirroredTile] : [primaryTile];
  let changed = false;

  for (const tile of targetTiles) {
    changed = applyToolToSingleTile(nextMap, editorState, tile.x, tile.y, overrideToolId) || changed;
  }

  nextMap.buildings = normalizeBuildings(nextMap.buildings, nextMap);
  nextMap.units = normalizePlacedUnits(nextMap.units, nextMap);
  nextMap.reinforcements = normalizeMapReinforcements(nextMap.reinforcements, nextMap);
  nextMap.playerSpawns = normalizeSpawns(nextMap.playerSpawns, nextMap);
  nextMap.enemySpawns = normalizeSpawns(
    nextMap.enemySpawns,
    nextMap,
    new Set(nextMap.playerSpawns.map((spawn) => `${spawn.x},${spawn.y}`))
  );
  nextMap.goal = normalizeMapGoal(nextMap.goal, nextMap);

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

  if (mapData.width < MIN_DIMENSION || mapData.width > MAX_DIMENSION) {
    errors.push(`Map width must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}.`);
  }

  if (mapData.height < MIN_DIMENSION || mapData.height > MAX_DIMENSION) {
    errors.push(`Map height must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}.`);
  }

  errors.push(...getMapGoalValidationErrors(mapData, mapData.goal));
  errors.push(...getReinforcementValidationErrors(mapData, mapInput?.reinforcements));

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
    units: [...normalized.units].sort((left, right) =>
      `${left.y}:${left.x}:${left.id}`.localeCompare(`${right.y}:${right.x}:${right.id}`)
    ),
    reinforcements: normalized.reinforcements.map((wave) => ({
      ...wave,
      trigger: {
        ...wave.trigger,
        ...(wave.trigger.tiles
          ? {
              tiles: [...wave.trigger.tiles].sort((left, right) =>
                `${left.y}:${left.x}`.localeCompare(`${right.y}:${right.x}`)
              )
            }
          : {})
      },
      units: [...wave.units].sort((left, right) =>
        `${left.y}:${left.x}:${left.id}`.localeCompare(`${right.y}:${right.x}:${right.id}`)
      )
    })),
    goal: normalizeMapGoal(normalized.goal, normalized)
  };

  if (normalized.runStages?.length > 0) {
    exported.runStages = [...normalized.runStages];
  }

  if (normalized.stage) {
    exported.stage = normalized.stage;
  }

  if (normalized.variantStage) {
    exported.variantStage = normalized.variantStage;
  }

  if (normalized.playerSpawns.length > 0) {
    exported.playerSpawns = [...normalized.playerSpawns].sort((left, right) =>
      `${left.y}:${left.x}`.localeCompare(`${right.y}:${right.x}`)
    );
  }

  if (normalized.enemySpawns.length > 0) {
    exported.enemySpawns = [...normalized.enemySpawns].sort((left, right) =>
      `${left.y}:${left.x}`.localeCompare(`${right.y}:${right.x}`)
    );
  }

  if (normalized.layout) {
    exported.layout = normalized.layout;
  }

  if (exported.reinforcements.length === 0) {
    delete exported.reinforcements;
  }

  return exported;
}

function normalizeBundleStageMap(stageInput, bundleInput = {}, fallbackIndex = 0) {
  const stage =
    getMapDefinitionStage(stageInput)
    ?? normalizeMapVariantStage(fallbackIndex + 1)
    ?? 1;
  const familyId = getMapDefinitionFamilyId(bundleInput);
  const mapId = sanitizeEditableText(stageInput?.id, `${familyId}-stage-${stage}`);
  const mapName = sanitizeEditableText(stageInput?.name, sanitizeEditableText(bundleInput?.name, "Custom Map"));
  const mapTheme = isThemeKey(stageInput?.theme)
    ? stageInput.theme
    : (isThemeKey(bundleInput?.theme) ? bundleInput.theme : DEFAULT_THEME);

  return exportMapDefinition({
    ...stageInput,
    id: mapId,
    name: mapName,
    theme: mapTheme,
    stage,
    variantStage: stage,
    runStages: [stage]
  });
}

export function expandMapBundleDefinitions(mapInput) {
  if (!isMapBundleDefinition(mapInput)) {
    return [exportMapDefinition(mapInput)];
  }

  const stageMaps = mapInput.stages
    .map((stageInput, index) => normalizeBundleStageMap(stageInput, mapInput, index))
    .sort((left, right) => (left.stage ?? 0) - (right.stage ?? 0));
  const dedupedStageMaps = new Map();

  for (const stageMap of stageMaps) {
    dedupedStageMaps.set(stageMap.id, stageMap);
  }

  return [...dedupedStageMaps.values()];
}

export function exportMapBundleDefinition({ id, name, stages }) {
  const familyId = normalizeMapBundleId(id ?? name);
  const bundleName = sanitizeEditableText(name, "Custom Map");
  const exportedStages = (stages ?? [])
    .map((stageInput, index) => normalizeBundleStageMap(stageInput, { id: familyId, name: bundleName }, index))
    .sort((left, right) => (left.stage ?? 0) - (right.stage ?? 0));

  return {
    format: MAP_BUNDLE_FORMAT,
    id: familyId,
    name: bundleName,
    stages: exportedStages
  };
}

function createEditorUnit(unitDefinition) {
  const unit = createUnitFromType(
    unitDefinition.unitTypeId,
    unitDefinition.owner,
    normalizeMapEditorUnitLevel(unitDefinition.level)
  );

  return {
    ...unit,
    id: unitDefinition.id,
    x: unitDefinition.x,
    y: unitDefinition.y,
    current: {
      ...unit.current
    }
  };
}

export function createMapEditorSnapshot(
  mapInput,
  selectedTile = null,
  hoveredTile = null,
  mirrorMode = MAP_EDITOR_MIRROR_MODES.OFF,
  selectedReinforcementWaveId = null
) {
  const mapData = normalizeMapDefinition(mapInput);
  const mirroredTile = getMapEditorMirrorTile(mapData, hoveredTile, mirrorMode);
  const playerUnits = mapData.units
    .filter((unit) => unit.owner === TURN_SIDES.PLAYER)
    .map(createEditorUnit);
  const enemyUnits = mapData.units
    .filter((unit) => unit.owner === TURN_SIDES.ENEMY)
    .map(createEditorUnit);

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
      units: playerUnits
    },
    enemy: {
      commanderId: null,
      funds: 0,
      charge: 0,
      units: enemyUnits
    },
    log: [],
    victory: null,
    presentation: {
      selectedTile: selectedTile
        ? {
            x: selectedTile.x,
            y: selectedTile.y
          }
        : null,
      mirroredTile,
      reinforcements: {
        selectedWaveId: selectedReinforcementWaveId,
        units: mapData.reinforcements.flatMap((wave) =>
          wave.units.map((unit) => ({
            ...unit,
            waveId: wave.id,
            selected: wave.id === selectedReinforcementWaveId
          }))
        ),
        triggerTiles: mapData.reinforcements.flatMap((wave) =>
          (wave.trigger.tiles ?? []).map((tile) => ({
            ...tile,
            waveId: wave.id,
            selected: wave.id === selectedReinforcementWaveId
          }))
        )
      },
      mission: {
        label: getMapGoalLabel(mapData.goal),
        status: getMapGoalSummary(mapData.goal, mapData),
        markers: getStaticMapGoalMarkers(mapData, mapData.goal)
      }
    }
  };
}
