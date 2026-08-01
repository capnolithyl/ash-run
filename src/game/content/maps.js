import { BUILDING_KEYS, PROTOTYPE_RUN_GOAL, TURN_SIDES } from "../core/constants.js";
import {
  expandMapBundleDefinitions,
  exportMapDefinition,
  getMapDefinitionFamilyId,
  getMapDefinitionStage,
  isMapBundleDefinition,
  normalizeMapDefinition
} from "./mapEditor.js";
import { GENERATED_MAP_MODULES } from "./maps.generated.js";

const VITE_MAP_MODULES =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./maps/*.json", "./maps/**/*.json"], {
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

function expandMapDefinitions(mapDefinition) {
  return expandMapBundleDefinitions(mapDefinition).map(toExportedMapDefinition);
}

function expandMapDefinitionEntries(mapDefinition) {
  return expandMapDefinitions(mapDefinition).map((expandedMap) => ({
    mapDefinition: expandedMap,
    isBundle: isMapBundleDefinition(mapDefinition)
  }));
}

function dedupeExpandedMapEntries(entries) {
  const dedupedMaps = new Map();

  for (const entry of entries.sort((left, right) => Number(left.isBundle) - Number(right.isBundle))) {
    dedupedMaps.set(entry.mapDefinition.id, entry.mapDefinition);
  }

  return [...dedupedMaps.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function createRunMapVariant(mapDefinition) {
  const runMap = structuredClone(mapDefinition);
  runMap.id = `${mapDefinition.id}-run`;
  runMap.name = `${mapDefinition.name} (Run)`;
  runMap.buildings = runMap.buildings.filter(
    (building) =>
      !(building.owner !== "neutral" && PRODUCTION_BUILDINGS.has(building.type))
  );
  runMap.units = (runMap.units ?? []).filter((unit) => unit.owner !== TURN_SIDES.PLAYER);
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

function normalizeRunStage(value) {
  const stage = Number(value);
  return Number.isInteger(stage) && stage >= 1 && stage <= PROTOTYPE_RUN_GOAL
    ? stage
    : null;
}

function getNormalizedRunStages(mapDefinition) {
  const unique = new Set();

  for (const stage of mapDefinition?.runStages ?? []) {
    const normalizedStage = normalizeRunStage(stage);

    if (normalizedStage) {
      unique.add(normalizedStage);
    }
  }

  return [...unique].sort((left, right) => left - right);
}

export function isRunMapEligibleForStage(mapDefinition, stage) {
  const normalizedStage = normalizeRunStage(stage);
  const runStages = getNormalizedRunStages(mapDefinition);
  const variantStage = normalizeRunStage(getMapDefinitionStage(mapDefinition));

  if (!normalizedStage) {
    return false;
  }

  if (runStages.length > 0) {
    return runStages.includes(normalizedStage);
  }

  if (variantStage) {
    return variantStage === normalizedStage;
  }

  return true;
}

export function getRunMapPoolForStage(stage) {
  const exactMatches = RUN_MAP_POOL.filter((mapDefinition) =>
    isRunMapEligibleForStage(mapDefinition, stage)
  );

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const unstagedMaps = RUN_MAP_POOL.filter(
    (mapDefinition) =>
      getNormalizedRunStages(mapDefinition).length === 0 &&
      !normalizeRunStage(getMapDefinitionStage(mapDefinition))
  );

  return unstagedMaps.length > 0 ? unstagedMaps : RUN_MAP_POOL;
}

function loadBundledMapPool() {
  return dedupeExpandedMapEntries(
    Object.values(RAW_MAP_MODULES).flatMap(expandMapDefinitionEntries)
  );
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
  const expandedCustomMaps = dedupeExpandedMapEntries(
    customMaps.flatMap(expandMapDefinitionEntries)
  );

  customMapPool.splice(
    0,
    customMapPool.length,
    ...expandedCustomMaps
  );
  rebuildMapPools();
}

export function upsertCustomMap(mapDefinition) {
  const exportedMaps = expandMapDefinitions(mapDefinition);
  const replacementIds = new Set(exportedMaps.map((candidate) => candidate.id));
  const replacementFamilyIds = new Set(
    exportedMaps.map((candidate) => getMapDefinitionFamilyId(candidate))
  );
  const retainedMaps = customMapPool.filter(
    (candidate) =>
      !replacementIds.has(candidate.id) &&
      !replacementFamilyIds.has(getMapDefinitionFamilyId(candidate))
  );

  customMapPool.splice(0, customMapPool.length, ...retainedMaps, ...exportedMaps);
  rebuildMapPools();
  return exportedMaps;
}

export function getMapById(mapId) {
  return MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId)
    ?? RUN_MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId);
}

function getSandboxStagesForMap(mapDefinition) {
  const runStages = getNormalizedRunStages(mapDefinition);

  if (runStages.length > 0) {
    return runStages;
  }

  const variantStage = normalizeRunStage(getMapDefinitionStage(mapDefinition));
  return [variantStage ?? 1];
}

export function getSandboxMapFamilies(mapPool = MAP_POOL) {
  const families = new Map();

  for (const mapDefinition of mapPool ?? []) {
    if (!mapDefinition?.id) {
      continue;
    }

    const familyId = getMapDefinitionFamilyId(mapDefinition);
    const family = families.get(familyId) ?? {
      id: familyId,
      name: mapDefinition.name ?? familyId,
      stages: new Map()
    };

    for (const stage of getSandboxStagesForMap(mapDefinition)) {
      if (!family.stages.has(stage)) {
        family.stages.set(stage, {
          stage,
          mapId: mapDefinition.id,
          width: mapDefinition.width,
          height: mapDefinition.height
        });
      }
    }

    families.set(familyId, family);
  }

  return [...families.values()]
    .map((family) => ({
      ...family,
      stages: [...family.stages.values()].sort((left, right) => left.stage - right.stage)
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function resolveSandboxMapId(familyId, stage, mapPool = MAP_POOL) {
  const normalizedStage = Number(stage);

  if (!Number.isInteger(normalizedStage)) {
    return null;
  }

  const family = getSandboxMapFamilies(mapPool).find((candidate) => candidate.id === familyId);
  return family?.stages.find((candidate) => candidate.stage === normalizedStage)?.mapId ?? null;
}

export function getSandboxMapSelection(mapId, mapPool = MAP_POOL) {
  const availableMaps = Array.isArray(mapPool) ? mapPool : [];
  const families = getSandboxMapFamilies(availableMaps);
  const fallbackFamily = families[0] ?? null;
  const baseMapId = String(mapId ?? "").replace(/-run$/, "");
  const mapDefinition = availableMaps.find((candidate) => candidate.id === baseMapId) ?? null;
  const familyId = mapDefinition ? getMapDefinitionFamilyId(mapDefinition) : fallbackFamily?.id ?? null;
  const family = families.find((candidate) => candidate.id === familyId)
    ?? fallbackFamily;
  const preferredStages = mapDefinition ? getSandboxStagesForMap(mapDefinition) : [];
  const stage = preferredStages.find((candidate) =>
    family?.stages.some((familyStage) => familyStage.stage === candidate)
  ) ?? family?.stages[0]?.stage ?? null;

  return {
    familyId: family?.id ?? null,
    stage,
    mapId: family?.stages.find((candidate) => candidate.stage === stage)?.mapId ?? null
  };
}

rebuildMapPools();
