import { BUILDING_KEYS } from "../core/constants.js";
import { exportMapDefinition, normalizeMapDefinition } from "./mapEditor.js";
import { MAP_GOAL_TYPES } from "./mapGoals.js";
import { GENERATED_MAP_MODULES } from "./maps.generated.js";

const VITE_MAP_MODULES =
  typeof import.meta.glob === "function"
    ? import.meta.glob("./maps/*.json", {
        eager: true,
        import: "default"
      })
    : null;

const RAW_MAP_MODULES = VITE_MAP_MODULES ?? GENERATED_MAP_MODULES;

const PRODUCTION_BUILDINGS = new Set([
  BUILDING_KEYS.BARRACKS,
  BUILDING_KEYS.MOTOR_POOL,
  BUILDING_KEYS.AIRFIELD
]);

function toExportedMapDefinition(mapDefinition) {
  return exportMapDefinition(normalizeMapDefinition(mapDefinition));
}

function createRunMapVariant(mapDefinition) {
  const runMap = structuredClone(mapDefinition);
  const goalTarget =
    runMap.goal &&
    [MAP_GOAL_TYPES.RESCUE, MAP_GOAL_TYPES.DEFEND].includes(runMap.goal.type) &&
    runMap.goal.target
      ? runMap.goal.target
      : null;
  runMap.id = `${mapDefinition.id}-run`;
  runMap.name = `${mapDefinition.name} (Run)`;
  runMap.buildings = runMap.buildings.filter(
    (building) =>
      !(
        building.owner === "player" &&
        PRODUCTION_BUILDINGS.has(building.type) &&
        (!goalTarget || goalTarget.x !== building.x || goalTarget.y !== building.y)
      )
  );
  runMap.buildings = runMap.buildings.map((building) =>
    PRODUCTION_BUILDINGS.has(building.type)
      ? {
          ...building,
          canCapture: false
        }
      : building
  );
  return runMap;
}

function loadBundledMapPool() {
  return Object.values(RAW_MAP_MODULES)
    .map(toExportedMapDefinition)
    .sort((left, right) => left.id.localeCompare(right.id));
}

const BUNDLED_MAP_POOL = loadBundledMapPool();
const customMapPool = [];

export const MAP_POOL = [...BUNDLED_MAP_POOL];
export const RUN_MAP_POOL = [];

function rebuildMapPools() {
  const mergedMaps = new Map(
    BUNDLED_MAP_POOL.map((mapDefinition) => [mapDefinition.id, mapDefinition])
  );

  for (const mapDefinition of customMapPool) {
    mergedMaps.set(mapDefinition.id, mapDefinition);
  }

  const nextMapPool = [...mergedMaps.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  MAP_POOL.splice(0, MAP_POOL.length, ...nextMapPool);
  RUN_MAP_POOL.splice(
    0,
    RUN_MAP_POOL.length,
    ...nextMapPool.map((mapDefinition) => createRunMapVariant(mapDefinition))
  );
}

export function replaceCustomMaps(customMaps = []) {
  customMapPool.splice(
    0,
    customMapPool.length,
    ...customMaps.map((mapDefinition) => toExportedMapDefinition(mapDefinition))
  );
  rebuildMapPools();
}

export function upsertCustomMap(mapDefinition) {
  const exportedMap = toExportedMapDefinition(mapDefinition);
  const existingIndex = customMapPool.findIndex(
    (candidate) => candidate.id === exportedMap.id
  );

  if (existingIndex === -1) {
    customMapPool.push(exportedMap);
  } else {
    customMapPool.splice(existingIndex, 1, exportedMap);
  }

  rebuildMapPools();
  return exportedMap;
}

export function getMapById(mapId) {
  return MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId)
    ?? RUN_MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId);
}

rebuildMapPools();
