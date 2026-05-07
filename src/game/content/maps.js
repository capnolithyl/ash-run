import { BUILDING_KEYS } from "../core/constants.js";
import { exportMapDefinition, normalizeMapDefinition } from "./mapEditor.js";
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

function loadMapPool() {
  return Object.values(RAW_MAP_MODULES)
    .map((moduleValue) => exportMapDefinition(normalizeMapDefinition(moduleValue)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export const MAP_POOL = loadMapPool();

export const RUN_MAP_POOL = MAP_POOL.map((mapDefinition) => {
  const runMap = structuredClone(mapDefinition);
  runMap.id = `${mapDefinition.id}-run`;
  runMap.name = `${mapDefinition.name} (Run)`;
  runMap.buildings = runMap.buildings.filter(
    (building) => !(building.owner === "player" && PRODUCTION_BUILDINGS.has(building.type))
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
});

export function getMapById(mapId) {
  return MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId)
    ?? RUN_MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId);
}
