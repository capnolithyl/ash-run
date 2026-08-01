import { BUILDING_KEYS, SCREEN_IDS, TERRAIN_KEYS, TURN_SIDES } from "../core/constants.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import {
  applyMapEditorTool,
  buildMapEditorBuildingId,
  buildMapEditorUnitId,
  createBlankMapDefinition,
  createDefaultMapEditorState,
  expandMapBundleDefinitions,
  exportMapDefinition,
  exportMapBundleDefinition,
  getMapDefinitionFamilyId,
  getMapDefinitionStage,
  getMapEditorValidation,
  isMapBundleDefinition,
  MAP_EDITOR_HISTORY_LIMIT,
  MAP_EDITOR_MIRROR_MODES,
  MAP_EDITOR_TOOL_IDS,
  normalizeMapEditorUnitLevel,
  normalizeMapRunStages,
  normalizeMapVariantStage,
  normalizeMapDefinition,
  resizeMapDefinition
} from "../content/mapEditor.js";
import { BUILD_FEATURES } from "../core/buildProfiles.js";
import {
  createDefaultReinforcementWave,
  getReinforcementValidationErrors,
  isIntervalReinforcementTrigger,
  isOneShotReinforcementTrigger,
  normalizeMapReinforcements,
  REINFORCEMENT_TRIGGER_ORDER,
  REINFORCEMENT_TRIGGER_TYPES
} from "../content/reinforcements.js";
import { getMapGoalLabel, MAP_GOAL_ORDER, normalizeMapGoal } from "../content/mapGoals.js";
import { MAP_THEME_PALETTES } from "../content/terrain.js";
import { upsertCustomMap } from "../content/maps.js";
import { getBuildingTypeMetadata } from "../content/buildings.js";

function normalizeEditorTile(tile) {
  return tile && Number.isInteger(tile.x) && Number.isInteger(tile.y)
    ? { x: tile.x, y: tile.y }
    : null;
}

function normalizeMapEditorId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function deriveMapEditorIdFromName(name, variantStage = null) {
  const baseId = (normalizeMapEditorId(name) || "custom-map").replace(/-stage-\d+$/i, "");
  const normalizedVariantStage = normalizeMapVariantStage(variantStage);

  return normalizedVariantStage ? `${baseId}-stage-${normalizedVariantStage}` : baseId;
}

function getMapEditorBaseId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-stage-\d+$/i, "");
}

function ensureEditableMapVariant(mapInput) {
  const mapData = normalizeMapDefinition(mapInput);
  const resolvedVariantStage =
    normalizeMapVariantStage(mapData.stage)
    ??
    normalizeMapVariantStage(mapData.variantStage)
    ?? normalizeMapRunStages(mapData.runStages)[0]
    ?? 1;

  mapData.stage = resolvedVariantStage;
  mapData.variantStage = resolvedVariantStage;
  mapData.runStages = [resolvedVariantStage];

  return mapData;
}

function createLastSelectedBuildingSnapshot(editorState, overrides = {}) {
  const buildingType = overrides.type ?? editorState?.selectedBuildingType ?? BUILDING_KEYS.COMMAND;
  const owner = overrides.owner ?? editorState?.selectedBuildingOwner ?? "neutral";

  if (!Object.values(BUILDING_KEYS).includes(buildingType)) {
    return null;
  }

  if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY, "neutral"].includes(owner)) {
    return null;
  }

  return { type: buildingType, owner };
}

function createLastSelectedUnitSnapshot(editorState, overrides = {}) {
  const unitTypeId = overrides.unitTypeId ?? editorState?.selectedUnitTypeId ?? "grunt";
  const owner = overrides.owner ?? editorState?.selectedUnitOwner ?? TURN_SIDES.PLAYER;
  const level = normalizeMapEditorUnitLevel(
    overrides.level ?? editorState?.selectedUnitLevel ?? 1
  );

  if (!Object.hasOwn(UNIT_CATALOG, unitTypeId)) {
    return null;
  }

  if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(owner)) {
    return null;
  }

  return { unitTypeId, owner, level };
}

function buildMapEditorSuggestedRelativePath(mapBundle) {
  const baseMapId = getMapEditorBaseId(mapBundle?.id || mapBundle?.name || "custom-map");

  return `${baseMapId}/${baseMapId}.json`;
}

function resetMapEditorLoadDialogState(editorState, overrides = {}) {
  editorState.loadDialogOpen = overrides.open ?? false;
  editorState.loadDialogEntries = overrides.entries ?? [];
  editorState.loadDialogSelectedPath = overrides.selectedPath ?? null;
  editorState.loadDialogOpenGroupKey = overrides.openGroupKey ?? null;
  editorState.loadDialogBusy = overrides.busy ?? false;
  editorState.loadDialogError = overrides.error ?? "";
}

function applyLoadedMapToEditorState(editorState, mapInput, metadata = null) {
  const selectedStage = getLoadedSelectedStage(mapInput, metadata);
  const stageMaps = isMapBundleDefinition(mapInput)
    ? expandMapBundleDefinitions(mapInput)
    : [mapInput];

  applyStageMapsToEditorState(editorState, stageMaps, selectedStage, "Map loaded");
}

function getMapLoadGroupKey(entry) {
  return String(entry?.name ?? entry?.id ?? entry?.fileName ?? "Untitled Map");
}

function cloneMapData(mapData) {
  return structuredClone(mapData);
}

function cloneSelectedTile(tile) {
  return tile && Number.isInteger(tile.x) && Number.isInteger(tile.y)
    ? { x: tile.x, y: tile.y }
    : null;
}

function getEditorStageNumber(mapData) {
  return getMapDefinitionStage(mapData) ?? 1;
}

function getStageKey(stage) {
  return String(normalizeMapVariantStage(stage) ?? 1);
}

function createStageHistorySnapshot(editorState) {
  return {
    historyEntries: structuredClone(editorState.historyEntries ?? []),
    currentHistoryIndex: Number(editorState.currentHistoryIndex ?? -1),
    pendingHistoryIndex: Number.isInteger(editorState.pendingHistoryIndex)
      ? editorState.pendingHistoryIndex
      : null,
    historySequence: Number(editorState.historySequence ?? 0),
    selectedTile: cloneSelectedTile(editorState.selectedTile),
    selectedReinforcementWaveId: editorState.selectedReinforcementWaveId ?? null
  };
}

function restoreStageHistorySnapshot(editorState, stage, label) {
  const snapshot = editorState.stageHistories?.[getStageKey(stage)] ?? null;

  if (!snapshot) {
    initializeMapEditorHistory(editorState, label);
    return;
  }

  editorState.historyEntries = structuredClone(snapshot.historyEntries ?? []);
  editorState.currentHistoryIndex = Number(snapshot.currentHistoryIndex ?? -1);
  editorState.pendingHistoryIndex = Number.isInteger(snapshot.pendingHistoryIndex)
    ? snapshot.pendingHistoryIndex
    : null;
  editorState.historySequence = Number(snapshot.historySequence ?? 0);
  editorState.selectedTile = cloneSelectedTile(snapshot.selectedTile);
  editorState.selectedReinforcementWaveId =
    editorState.mapData.reinforcements.some(
      (wave) => wave.id === snapshot.selectedReinforcementWaveId
    )
      ? snapshot.selectedReinforcementWaveId
      : editorState.mapData.reinforcements[0]?.id ?? null;
}

function syncActiveMapEditorStage(editorState) {
  if (!editorState?.mapData) {
    return null;
  }

  const stage = getEditorStageNumber(editorState.mapData);
  editorState.activeMapStage = stage;
  editorState.mapStages ??= {};
  editorState.mapStages[getStageKey(stage)] = cloneMapData(editorState.mapData);
  return stage;
}

function saveMapEditorStageSession(editorState) {
  const stage = syncActiveMapEditorStage(editorState);

  if (!stage) {
    return;
  }

  editorState.stageHistories ??= {};
  editorState.stageHistories[getStageKey(stage)] = createStageHistorySnapshot(editorState);
}

function getMapEditorStageMaps(editorState) {
  syncActiveMapEditorStage(editorState);

  return Object.values(editorState.mapStages ?? {})
    .map((mapData) => synchronizeMapEditorIdentity(ensureEditableMapVariant(mapData)))
    .sort((left, right) => getEditorStageNumber(left) - getEditorStageNumber(right));
}

function getNearestStageTemplate(stageMaps, targetStage) {
  const previousStages = stageMaps.filter((mapData) => getEditorStageNumber(mapData) < targetStage);

  if (previousStages.length > 0) {
    return previousStages.at(-1);
  }

  return stageMaps[0] ?? null;
}

function cloneMapEditorStage(stageMaps, targetStage, activeMap) {
  const template = getNearestStageTemplate(stageMaps, targetStage) ?? activeMap;
  const familyName = activeMap?.name ?? template?.name ?? "Custom Map";
  const familyTheme = activeMap?.theme ?? template?.theme ?? "ash";

  return buildEditorStageMap(
    {
      ...cloneMapData(template ?? createBlankMapDefinition()),
      name: familyName,
      theme: familyTheme,
      stage: targetStage,
      variantStage: targetStage,
      runStages: [targetStage]
    },
    targetStage
  );
}

function updateMapEditorFamilyName(editorState, name) {
  const nextName = String(name ?? "").trimStart();
  const stageMaps = getMapEditorStageMaps(editorState).map((mapData) =>
    synchronizeMapEditorIdentity({
      ...mapData,
      name: nextName
    })
  );

  editorState.mapStages = Object.fromEntries(
    stageMaps.map((mapData) => [getStageKey(getEditorStageNumber(mapData)), cloneMapData(mapData)])
  );
  editorState.mapData = cloneMapData(
    stageMaps.find((mapData) => getEditorStageNumber(mapData) === editorState.activeMapStage)
      ?? stageMaps[0]
  );
  editorState.stageHistories = {};
}

function updateMapEditorFamilyTheme(editorState, theme) {
  const stageMaps = getMapEditorStageMaps(editorState).map((mapData) => ({
    ...mapData,
    theme
  }));

  editorState.mapStages = Object.fromEntries(
    stageMaps.map((mapData) => [getStageKey(getEditorStageNumber(mapData)), cloneMapData(mapData)])
  );
  editorState.mapData = cloneMapData(
    stageMaps.find((mapData) => getEditorStageNumber(mapData) === editorState.activeMapStage)
      ?? stageMaps[0]
  );
  editorState.stageHistories = {};
}

function validateEditableMap(mapInput) {
  const normalizedInput = normalizeMapDefinition(mapInput);
  const reinforcementErrors = getReinforcementValidationErrors(
    normalizedInput,
    mapInput?.reinforcements
  );

  if (reinforcementErrors.length > 0) {
    throw new Error(reinforcementErrors[0]);
  }

  return normalizedInput;
}

function buildEditorStageMap(mapInput, stage = null) {
  const stageNumber = normalizeMapVariantStage(stage) ?? getEditorStageNumber(mapInput);
  return synchronizeMapEditorIdentity(
    ensureEditableMapVariant({
      ...validateEditableMap(mapInput),
      stage: stageNumber,
      variantStage: stageNumber,
      runStages: [stageNumber]
    })
  );
}

function getLoadedSelectedStage(mapInput, metadata = null) {
  return (
    normalizeMapVariantStage(metadata?.variantStage)
    ?? normalizeMapVariantStage(metadata?.stage)
    ?? normalizeMapVariantStage(metadata?.bundleStage)
    ?? getMapDefinitionStage(mapInput)
    ?? 1
  );
}

function applyStageMapsToEditorState(editorState, stageMaps, activeStage, historyLabel) {
  const stageEntries = stageMaps
    .map((mapData) => buildEditorStageMap(mapData))
    .sort((left, right) => getEditorStageNumber(left) - getEditorStageNumber(right));
  const selectedStage = normalizeMapVariantStage(activeStage) ?? getEditorStageNumber(stageEntries[0]);
  const selectedMap =
    stageEntries.find((mapData) => getEditorStageNumber(mapData) === selectedStage)
    ?? stageEntries[0];

  editorState.mapStages = Object.fromEntries(
    stageEntries.map((mapData) => [getStageKey(getEditorStageNumber(mapData)), cloneMapData(mapData)])
  );
  editorState.stageHistories = {};
  editorState.mapData = cloneMapData(selectedMap);
  editorState.activeMapStage = getEditorStageNumber(selectedMap);
  editorState.selectedReinforcementWaveId =
    editorState.mapData.reinforcements[0]?.id ?? null;
  editorState.selectedTile = null;
  editorState.hoveredTile = null;
  editorState.isPainting = false;
  initializeMapEditorHistory(editorState, historyLabel);
  saveMapEditorStageSession(editorState);
}

function createMapEditorHistoryEntry(editorState, label, mapData, selectedTile = null) {
  const nextSequence = Number(editorState.historySequence ?? 0) + 1;

  editorState.historySequence = nextSequence;
  return {
    id: `history-${nextSequence}`,
    label,
    mapData: cloneMapData(mapData),
    selectedTile: cloneSelectedTile(selectedTile)
  };
}

function initializeMapEditorHistory(editorState, label, selectedTile = null) {
  const entry = createMapEditorHistoryEntry(editorState, label, editorState.mapData, selectedTile);
  editorState.historyEntries = [entry];
  editorState.currentHistoryIndex = 0;
  editorState.pendingHistoryIndex = null;
}

function pushMapEditorHistory(editorState, label, selectedTile = null) {
  const currentIndex = Number(editorState.currentHistoryIndex ?? -1);
  const currentEntries = Array.isArray(editorState.historyEntries)
    ? editorState.historyEntries.slice(0, Math.max(0, currentIndex + 1))
    : [];
  const nextEntry = createMapEditorHistoryEntry(
    editorState,
    label,
    editorState.mapData,
    selectedTile
  );
  const nextEntries = [...currentEntries, nextEntry];
  const trimmedEntries =
    nextEntries.length > MAP_EDITOR_HISTORY_LIMIT
      ? nextEntries.slice(nextEntries.length - MAP_EDITOR_HISTORY_LIMIT)
      : nextEntries;

  editorState.historyEntries = trimmedEntries;
  editorState.currentHistoryIndex = trimmedEntries.length - 1;
  editorState.pendingHistoryIndex = null;
}

function restoreMapEditorHistoryEntry(editorState, historyIndex) {
  const entry = editorState.historyEntries?.[historyIndex];

  if (!entry) {
    return false;
  }

  editorState.mapData = cloneMapData(entry.mapData);
  if (
    !editorState.mapData.reinforcements.some(
      (wave) => wave.id === editorState.selectedReinforcementWaveId
    )
  ) {
    editorState.selectedReinforcementWaveId =
      editorState.mapData.reinforcements[0]?.id ?? null;
  }
  editorState.selectedTile = cloneSelectedTile(entry.selectedTile);
  editorState.hoveredTile = null;
  editorState.isPainting = false;
  editorState.currentHistoryIndex = historyIndex;
  editorState.pendingHistoryIndex = null;
  return true;
}

function mapsEqual(left, right) {
  return JSON.stringify(exportMapDefinition(left)) === JSON.stringify(exportMapDefinition(right));
}

function getMapEditorBundleValidation(editorState) {
  const stageMaps = getMapEditorStageMaps(editorState);

  for (const mapData of stageMaps) {
    const validation = getMapEditorValidation(mapData);

    if (!validation.isValid) {
      return {
        isValid: false,
        errors: validation.errors.map((error) => `Stage ${getEditorStageNumber(mapData)}: ${error}`),
        stageMaps
      };
    }
  }

  return {
    isValid: true,
    errors: [],
    stageMaps
  };
}

function exportMapEditorBundle(editorState) {
  saveMapEditorStageSession(editorState);
  const validation = getMapEditorBundleValidation(editorState);

  if (!validation.isValid) {
    return {
      validation,
      exportedBundle: null
    };
  }

  const activeMap = editorState.mapData;
  const exportedBundle = exportMapBundleDefinition({
    id: getMapDefinitionFamilyId(activeMap),
    name: activeMap.name,
    stages: validation.stageMaps
  });

  return {
    validation,
    exportedBundle
  };
}

function getSelectedReinforcementWave(editorState) {
  return (
    editorState?.mapData?.reinforcements?.find(
      (wave) => wave.id === editorState.selectedReinforcementWaveId
    ) ?? null
  );
}

function buildMapEditorToolHistoryLabel(editorState, x, y, overrideToolId = null) {
  const toolId = overrideToolId ?? editorState?.selectedTool ?? MAP_EDITOR_TOOL_IDS.TERRAIN;

  if (toolId === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    const terrainId = editorState?.selectedTerrainId ?? "plain";
    return `Paint ${terrainId} at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.BUILDING) {
    const metadata = getBuildingTypeMetadata(editorState?.selectedBuildingType ?? BUILDING_KEYS.COMMAND);
    return `Place ${metadata.name} at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.UNIT) {
    const unit = UNIT_CATALOG[editorState?.selectedUnitTypeId];
    const unitName = unit?.name ?? "Unit";
    const level = editorState?.selectedUnitLevel ?? 1;
    return `Place ${unitName} L${level} at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT) {
    const unit = UNIT_CATALOG[editorState?.selectedUnitTypeId];
    return `Place ${unit?.name ?? "reinforcement"} at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER) {
    return `Mark reinforcement trigger at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER) {
    return `Clear terrain at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.BUILDING_ERASER) {
    return `Remove building at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.UNIT_ERASER) {
    return `Remove unit at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER) {
    return `Remove reinforcement at ${x}, ${y}`;
  }

  if (toolId === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER) {
    return `Remove reinforcement trigger at ${x}, ${y}`;
  }

  return `Edit ${x}, ${y}`;
}

function synchronizeMapEditorIdentity(mapData) {
  if (!mapData) {
    return mapData;
  }

  const stage = getEditorStageNumber(mapData);
  const nextMapId = deriveMapEditorIdFromName(mapData.name, stage);

  const units = mapData.units.map((unit) => ({
    ...unit,
    id: buildMapEditorUnitId(nextMapId, unit.unitTypeId, unit.owner, unit.x, unit.y)
  }));
  const remappedUnitIds = new Map(
    mapData.units.map((unit, index) => [unit.id, units[index].id])
  );

  return {
    ...mapData,
    id: nextMapId,
    stage,
    variantStage: stage,
    runStages: [stage],
    buildings: mapData.buildings.map((building) => ({
      ...building,
      id: buildMapEditorBuildingId(nextMapId, building.type, building.owner, building.x, building.y)
    })),
    units,
    reinforcements: mapData.reinforcements.map((wave) => ({
      ...wave,
      trigger:
        wave.trigger.type === REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED &&
        remappedUnitIds.has(wave.trigger.targetUnitId)
          ? {
              ...wave.trigger,
              targetUnitId: remappedUnitIds.get(wave.trigger.targetUnitId)
            }
          : wave.trigger
    }))
  };
}

export const controllerMapEditorMethods = {
  openMapEditor() {
    if (!this.isFeatureEnabled(BUILD_FEATURES.MAP_EDITOR)) {
      return false;
    }

    const editorState = createDefaultMapEditorState(
      synchronizeMapEditorIdentity(ensureEditableMapVariant(createBlankMapDefinition()))
    );
    initializeMapEditorHistory(editorState, "Map created");
    saveMapEditorStageSession(editorState);
    this.state.mapEditor = editorState;
    this.state.screen = SCREEN_IDS.MAP_EDITOR;
    this.state.banner = "Map editor active.";
    this.resetBattleUi();
    this.emit();
  },

  resetMapEditor() {
    const editorState = createDefaultMapEditorState(
      synchronizeMapEditorIdentity(
        ensureEditableMapVariant(createBlankMapDefinition({
          theme: this.state.mapEditor?.mapData?.theme ?? "ash"
        }))
      )
    );
    initializeMapEditorHistory(editorState, "Map created");
    saveMapEditorStageSession(editorState);
    this.state.mapEditor = editorState;
    this.emit();
  },

  setMapEditorTool(toolId) {
    if (!Object.values(MAP_EDITOR_TOOL_IDS).includes(toolId)) {
      return;
    }

    this.state.mapEditor.selectedTool = toolId;

    this.emit();
  },

  selectMapEditorTerrain(terrainId) {
    if (!Object.values(TERRAIN_KEYS).includes(terrainId)) {
      return;
    }

    this.state.mapEditor.selectedTerrainId = terrainId;
    this.state.mapEditor.lastSelectedTerrainId = terrainId;
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.TERRAIN;
    this.emit();
  },

  selectMapEditorBuildingType(buildingType) {
    if (!Object.values(BUILDING_KEYS).includes(buildingType)) {
      return;
    }

    this.state.mapEditor.selectedBuildingType = buildingType;
    this.state.mapEditor.lastSelectedBuilding = createLastSelectedBuildingSnapshot(
      this.state.mapEditor,
      { type: buildingType }
    );
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.BUILDING;
    this.emit();
  },

  selectMapEditorBuildingOwner(owner) {
    if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY, "neutral"].includes(owner)) {
      return;
    }

    this.state.mapEditor.selectedBuildingOwner = owner;
    this.state.mapEditor.lastSelectedBuilding = createLastSelectedBuildingSnapshot(
      this.state.mapEditor,
      { owner }
    );
    this.emit();
  },

  selectMapEditorUnitType(unitTypeId) {
    if (!Object.hasOwn(UNIT_CATALOG, unitTypeId)) {
      return;
    }

    this.state.mapEditor.selectedUnitTypeId = unitTypeId;
    this.state.mapEditor.lastSelectedUnit = createLastSelectedUnitSnapshot(
      this.state.mapEditor,
      { unitTypeId }
    );
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.UNIT;
    this.emit();
  },

  selectMapEditorReinforcementUnitType(unitTypeId) {
    if (!Object.hasOwn(UNIT_CATALOG, unitTypeId) || !getSelectedReinforcementWave(this.state.mapEditor)) {
      return;
    }

    this.state.mapEditor.selectedUnitTypeId = unitTypeId;
    this.state.mapEditor.lastSelectedUnit = createLastSelectedUnitSnapshot(
      this.state.mapEditor,
      { unitTypeId, owner: TURN_SIDES.ENEMY }
    );
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT;
    this.emit();
  },

  selectMapEditorUnitOwner(owner) {
    if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(owner)) {
      return;
    }

    this.state.mapEditor.selectedUnitOwner = owner;
    this.state.mapEditor.lastSelectedUnit = createLastSelectedUnitSnapshot(
      this.state.mapEditor,
      { owner }
    );
    this.emit();
  },

  restoreLastMapEditorTerrain() {
    const terrainId = this.state.mapEditor?.lastSelectedTerrainId;

    if (!terrainId) {
      return;
    }

    this.selectMapEditorTerrain(terrainId);
  },

  restoreLastMapEditorBuilding() {
    const snapshot = this.state.mapEditor?.lastSelectedBuilding;

    if (!snapshot) {
      return;
    }

    this.state.mapEditor.selectedBuildingType = snapshot.type;
    this.state.mapEditor.selectedBuildingOwner = snapshot.owner;
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.BUILDING;
    this.emit();
  },

  restoreLastMapEditorUnit() {
    const snapshot = this.state.mapEditor?.lastSelectedUnit;

    if (!snapshot) {
      return;
    }

    this.state.mapEditor.selectedUnitTypeId = snapshot.unitTypeId;
    this.state.mapEditor.selectedUnitOwner = snapshot.owner;
    this.state.mapEditor.selectedUnitLevel = normalizeMapEditorUnitLevel(snapshot.level);
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.UNIT;
    this.emit();
  },

  setMapEditorMirrorMode(mirrorMode) {
    if (!Object.values(MAP_EDITOR_MIRROR_MODES).includes(mirrorMode)) {
      return;
    }

    this.state.mapEditor.mirrorMode = mirrorMode;
    this.emit();
  },

  selectMapEditorReinforcementWave(waveId) {
    if (!this.state.mapEditor?.mapData?.reinforcements.some((wave) => wave.id === waveId)) {
      return;
    }

    this.state.mapEditor.selectedReinforcementWaveId = waveId;
    this.emit();
  },

  addMapEditorReinforcementWave() {
    const editorState = this.state.mapEditor;
    if (!editorState?.mapData) {
      return;
    }

    const wave = createDefaultReinforcementWave(editorState.mapData.reinforcements);
    editorState.mapData.reinforcements.push(wave);
    editorState.selectedReinforcementWaveId = wave.id;
    editorState.selectedTool = MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT;
    pushMapEditorHistory(editorState, `Add ${wave.name}`, editorState.selectedTile);
    this.emit();
  },

  deleteSelectedMapEditorReinforcementWave() {
    const editorState = this.state.mapEditor;
    const wave = getSelectedReinforcementWave(editorState);
    if (!wave) {
      return;
    }

    editorState.mapData.reinforcements = editorState.mapData.reinforcements.filter(
      (candidate) => candidate.id !== wave.id
    );
    editorState.selectedReinforcementWaveId =
      editorState.mapData.reinforcements[0]?.id ?? null;
    if (!editorState.selectedReinforcementWaveId) {
      editorState.selectedTool = MAP_EDITOR_TOOL_IDS.TERRAIN;
    }
    pushMapEditorHistory(editorState, `Delete ${wave.name}`, editorState.selectedTile);
    this.emit();
  },

  setMapEditorReinforcementTargetFromSelectedUnit() {
    const editorState = this.state.mapEditor;
    const wave = getSelectedReinforcementWave(editorState);
    const selectedTile = editorState?.selectedTile;
    const unit = selectedTile
      ? editorState.mapData.units.find(
          (candidate) =>
            candidate.owner === TURN_SIDES.ENEMY &&
            candidate.x === selectedTile.x &&
            candidate.y === selectedTile.y
        )
      : null;

    if (
      !wave ||
      wave.trigger.type !== REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED ||
      !unit
    ) {
      return;
    }

    wave.trigger.targetUnitId = unit.id;
    pushMapEditorHistory(
      editorState,
      `Set ${wave.name} target to ${unit.unitTypeId}`,
      selectedTile
    );
    this.emit();
  },

  switchMapEditorStage(stage) {
    const editorState = this.state.mapEditor;
    const normalizedStage = normalizeMapVariantStage(stage);

    if (!editorState?.mapData || !normalizedStage) {
      return false;
    }

    if (getEditorStageNumber(editorState.mapData) === normalizedStage) {
      return false;
    }

    saveMapEditorStageSession(editorState);
    const stageMaps = getMapEditorStageMaps(editorState);
    const targetMap =
      stageMaps.find((mapData) => getEditorStageNumber(mapData) === normalizedStage)
      ?? cloneMapEditorStage(stageMaps, normalizedStage, editorState.mapData);

    editorState.mapData = cloneMapData(targetMap);
    editorState.activeMapStage = normalizedStage;
    editorState.mapStages[getStageKey(normalizedStage)] = cloneMapData(targetMap);
    editorState.hoveredTile = null;
    editorState.isPainting = false;
    restoreStageHistorySnapshot(
      editorState,
      normalizedStage,
      stageMaps.some((mapData) => getEditorStageNumber(mapData) === normalizedStage)
        ? `Stage ${normalizedStage} loaded`
        : `Stage ${normalizedStage} created`
    );
    saveMapEditorStageSession(editorState);
    this.emit();
    return true;
  },

  setMapEditorVariantStage(stage) {
    return this.switchMapEditorStage(stage);
  },

  undoMapEditorHistory() {
    const editorState = this.state.mapEditor;

    if (!editorState || editorState.currentHistoryIndex <= 0) {
      return false;
    }

    const restored = restoreMapEditorHistoryEntry(
      editorState,
      editorState.currentHistoryIndex - 1
    );

    if (!restored) {
      return false;
    }

    this.emit();
    return true;
  },

  requestMapEditorHistoryRevert(historyIndex) {
    const editorState = this.state.mapEditor;

    if (
      !editorState ||
      !Number.isInteger(historyIndex) ||
      historyIndex < 0 ||
      historyIndex >= (editorState.historyEntries?.length ?? 0) ||
      historyIndex === editorState.currentHistoryIndex
    ) {
      return;
    }

    editorState.pendingHistoryIndex = historyIndex;
    this.emit();
  },

  cancelMapEditorHistoryRevert() {
    const editorState = this.state.mapEditor;

    if (!editorState || editorState.pendingHistoryIndex == null) {
      return;
    }

    editorState.pendingHistoryIndex = null;
    this.emit();
  },

  confirmMapEditorHistoryRevert() {
    const editorState = this.state.mapEditor;
    const targetIndex = editorState?.pendingHistoryIndex;

    if (!editorState || !Number.isInteger(targetIndex)) {
      return false;
    }

    const restored = restoreMapEditorHistoryEntry(editorState, targetIndex);

    if (!restored) {
      return false;
    }

    this.emit();
    return true;
  },

  updateMapEditorField(field, value, options = {}) {
    const { emit = true } = options;
    const mapData = this.state.mapEditor?.mapData;

    if (!mapData) {
      return;
    }

    const previousMapData = cloneMapData(mapData);
    const previousSelectedTile = cloneSelectedTile(this.state.mapEditor.selectedTile);
    let historyLabel = null;

    if (field === "name") {
      updateMapEditorFamilyName(this.state.mapEditor, value);
      historyLabel = `Rename map to ${this.state.mapEditor.mapData.name || "Untitled Map"}`;
    } else if (field === "variantStage") {
      const variantStage = normalizeMapVariantStage(value);
      this.switchMapEditorStage(variantStage ?? 1);
      return;
    } else if (field === "theme") {
      if (!Object.hasOwn(MAP_THEME_PALETTES, value)) {
        return;
      }

      updateMapEditorFamilyTheme(this.state.mapEditor, value);
      historyLabel = `Theme ${value}`;
    } else if (field === "selectedUnitLevel") {
      this.state.mapEditor.selectedUnitLevel = normalizeMapEditorUnitLevel(Number(value));
      this.state.mapEditor.lastSelectedUnit = createLastSelectedUnitSnapshot(this.state.mapEditor);
    } else if (field === "selectedTileUnitLevel") {
      const selectedTile = this.state.mapEditor.selectedTile;

      if (!selectedTile) {
        return;
      }

      const unit = mapData.units.find(
        (candidate) => candidate.x === selectedTile.x && candidate.y === selectedTile.y
      );

      if (!unit) {
        return;
      }

      unit.level = normalizeMapEditorUnitLevel(Number(value));
      historyLabel = `Set unit level to ${unit.level} at ${selectedTile.x}, ${selectedTile.y}`;
    } else if (field === "reinforcementName") {
      const wave = getSelectedReinforcementWave(this.state.mapEditor);
      if (!wave) {
        return;
      }

      wave.name = String(value ?? "").trimStart() || wave.name;
      historyLabel = `Rename reinforcement wave to ${wave.name}`;
    } else if (field === "reinforcementTriggerType") {
      const wave = getSelectedReinforcementWave(this.state.mapEditor);
      if (!wave || !REINFORCEMENT_TRIGGER_ORDER.includes(value)) {
        return;
      }

      wave.trigger = {
        type: value,
        ...(value === REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED ? { tiles: [] } : {}),
        ...(value === REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED ? { targetUnitId: "" } : {}),
        ...(isIntervalReinforcementTrigger(value) ? { every: 1 } : {})
      };
      wave.maxActivations = isOneShotReinforcementTrigger(value)
        ? 1
        : Math.max(1, wave.maxActivations ?? 1);
      historyLabel = `Set ${wave.name} trigger to ${value}`;
    } else if (field === "reinforcementEvery") {
      const wave = getSelectedReinforcementWave(this.state.mapEditor);
      if (!wave || !isIntervalReinforcementTrigger(wave.trigger.type)) {
        return;
      }

      wave.trigger.every = Math.max(1, Math.min(99, Math.floor(Number(value) || 1)));
      historyLabel = `Set ${wave.name} interval to ${wave.trigger.every}`;
    } else if (field === "reinforcementMaxActivations") {
      const wave = getSelectedReinforcementWave(this.state.mapEditor);
      if (!wave || isOneShotReinforcementTrigger(wave.trigger.type)) {
        return;
      }

      wave.maxActivations = Math.max(1, Math.min(99, Math.floor(Number(value) || 1)));
      historyLabel = `Set ${wave.name} activations to ${wave.maxActivations}`;
    } else if (field === "width" || field === "height") {
      const nextWidth = field === "width" ? Number(value) : mapData.width;
      const nextHeight = field === "height" ? Number(value) : mapData.height;
      this.state.mapEditor.mapData = synchronizeMapEditorIdentity(
        resizeMapDefinition(mapData, nextWidth, nextHeight)
      );
      historyLabel = `Resize map to ${this.state.mapEditor.mapData.width}x${this.state.mapEditor.mapData.height}`;
    } else if (field === "goalType") {
      if (!MAP_GOAL_ORDER.includes(value)) {
        return;
      }

      mapData.goal = normalizeMapGoal(
        {
          ...mapData.goal,
          type: value
        },
        mapData
      );
      historyLabel = `Goal ${getMapGoalLabel(mapData.goal.type)}`;
    } else if (field === "goalTurnLimit") {
      mapData.goal = normalizeMapGoal(
        {
          ...mapData.goal,
          turnLimit: Number(value)
        },
        mapData
      );
      historyLabel = `Set goal turn limit to ${mapData.goal.turnLimit ?? Number(value)}`;
    } else {
      return;
    }

    if (field.startsWith("reinforcement")) {
      this.state.mapEditor.mapData.reinforcements = normalizeMapReinforcements(
        this.state.mapEditor.mapData.reinforcements,
        this.state.mapEditor.mapData
      );
    }

    if (
      emit &&
      historyLabel &&
      !mapsEqual(previousMapData, this.state.mapEditor.mapData)
    ) {
      pushMapEditorHistory(
        this.state.mapEditor,
        historyLabel,
        previousSelectedTile
      );
    }

    if (emit) {
      this.emit();
    }
  },

  setMapEditorSelectedTile(tile) {
    const nextTile = normalizeEditorTile(tile);
    const currentTile = this.state.mapEditor.selectedTile;

    if (currentTile?.x === nextTile?.x && currentTile?.y === nextTile?.y) {
      return;
    }

    this.state.mapEditor.selectedTile = nextTile;
    this.emit();
  },

  setMapEditorHoverTile(tile) {
    const nextTile = normalizeEditorTile(tile);
    const currentTile = this.state.mapEditor.hoveredTile;

    if (currentTile?.x === nextTile?.x && currentTile?.y === nextTile?.y) {
      return;
    }

    this.state.mapEditor.hoveredTile = nextTile;
    this.emit();
  },

  startMapEditorPaint() {
    if (this.state.mapEditor.isPainting) {
      return;
    }

    this.state.mapEditor.isPainting = true;
    this.emit();
  },

  stopMapEditorPaint() {
    if (!this.state.mapEditor.isPainting) {
      return;
    }

    this.state.mapEditor.isPainting = false;
    this.emit();
  },

  async openMapEditorLoadDialog() {
    const editorState = this.state.mapEditor;

    if (!editorState || editorState.loadDialogBusy) {
      return null;
    }

    resetMapEditorLoadDialogState(editorState, {
      open: true,
      entries: editorState.loadDialogEntries ?? [],
      selectedPath: editorState.loadDialogSelectedPath ?? null,
      busy: true,
      error: ""
    });
    this.emit();

    try {
      const result = this.storage.listMapFiles
        ? await this.storage.listMapFiles()
        : { unsupported: true, entries: [] };

      if (result?.unsupported) {
        resetMapEditorLoadDialogState(editorState, {
          open: false,
          entries: [],
          selectedPath: null,
          busy: false,
          error: ""
        });
        this.showToast({
          title: "Map loader unavailable",
          message: "The in-game map loader needs the desktop build to access the game map folder.",
          tone: "error"
        });
        return { mode: "unsupported" };
      }

      const entries = Array.isArray(result?.entries) ? result.entries : [];
      const preferredEntry =
        entries.find((entry) => entry.id === editorState.mapData?.id) ??
        entries[0] ??
        null;

      resetMapEditorLoadDialogState(editorState, {
        open: true,
        entries,
        selectedPath: preferredEntry?.relativePath ?? null,
        openGroupKey: preferredEntry ? getMapLoadGroupKey(preferredEntry) : null,
        busy: false,
        error: entries.length === 0 ? "No map files were found in the game map folder." : ""
      });
      this.emit();
      return {
        mode: "opened",
        entries
      };
    } catch (error) {
      resetMapEditorLoadDialogState(editorState, {
        open: false,
        entries: [],
        selectedPath: null,
        busy: false,
        error: ""
      });
      this.showToast({
        title: "Map loader unavailable",
        message: error?.message ?? "Unable to read the game map folder.",
        tone: "error"
      });
      return {
        mode: "error",
        error
      };
    }
  },

  closeMapEditorLoadDialog() {
    const editorState = this.state.mapEditor;

    if (!editorState?.loadDialogOpen && !editorState?.loadDialogBusy) {
      return;
    }

    resetMapEditorLoadDialogState(editorState);
    this.emit();
  },

  selectMapEditorLoadDialogEntry(relativePath) {
    const editorState = this.state.mapEditor;

    if (!editorState?.loadDialogOpen || editorState.loadDialogBusy) {
      return;
    }

    const nextEntry = editorState.loadDialogEntries.find(
      (entry) => entry.relativePath === relativePath
    );

    if (!nextEntry || editorState.loadDialogSelectedPath === nextEntry.relativePath) {
      return;
    }

    editorState.loadDialogSelectedPath = nextEntry.relativePath;
    editorState.loadDialogOpenGroupKey = getMapLoadGroupKey(nextEntry);
    this.emit();
  },

  async confirmMapEditorLoadDialog() {
    const editorState = this.state.mapEditor;
    const relativePath = editorState?.loadDialogSelectedPath;

    if (!editorState?.loadDialogOpen || editorState.loadDialogBusy || !relativePath) {
      return null;
    }

    editorState.loadDialogBusy = true;
    editorState.loadDialogError = "";
    this.emit();

    try {
      const result = this.storage.loadMapFile
        ? await this.storage.loadMapFile(relativePath)
        : { unsupported: true };

      if (result?.unsupported) {
        resetMapEditorLoadDialogState(editorState);
        this.showToast({
          title: "Map loader unavailable",
          message: "The in-game map loader needs the desktop build to access the game map folder.",
          tone: "error"
        });
        return { mode: "unsupported" };
      }

      if (!result?.text) {
        throw new Error("The selected map file could not be loaded.");
      }

      applyLoadedMapToEditorState(editorState, JSON.parse(result.text), result.metadata);
      resetMapEditorLoadDialogState(editorState);
      this.showToast({
        title: "Map loaded",
        message: editorState.mapData.name,
        tone: "success"
      });
      this.emit();
      return {
        mode: "loaded",
        relativePath
      };
    } catch (error) {
      editorState.loadDialogBusy = false;
      editorState.loadDialogError = error?.message ?? "Unable to load the selected map.";
      this.emit();
      return {
        mode: "error",
        error
      };
    }
  },

  applyMapEditorToolAt(x, y, options = {}) {
    const mapData = this.state.mapEditor?.mapData;

    if (!mapData || !Number.isInteger(x) || !Number.isInteger(y)) {
      return false;
    }

    const result = applyMapEditorTool(mapData, this.state.mapEditor, x, y, options);
    const currentTile = this.state.mapEditor.selectedTile;
    const selectedChanged =
      currentTile?.x !== result.selectedTile?.x || currentTile?.y !== result.selectedTile?.y;

    if (!result.changed && !selectedChanged) {
      return false;
    }

    this.state.mapEditor.mapData = result.mapData;
    this.state.mapEditor.selectedTile = result.selectedTile;

    if (result.changed) {
      pushMapEditorHistory(
        this.state.mapEditor,
        buildMapEditorToolHistoryLabel(this.state.mapEditor, x, y, options?.toolId ?? null),
        result.selectedTile
      );
    }
    this.emit();
    return true;
  },

  importMapEditorMap(mapInput) {
    applyLoadedMapToEditorState(this.state.mapEditor, mapInput);
    resetMapEditorLoadDialogState(this.state.mapEditor);
    this.emit();
  },

  setMapEditorGoalTargetFromSelectedBuilding() {
    const mapData = this.state.mapEditor?.mapData;
    const selectedTile = this.state.mapEditor?.selectedTile;

    if (!mapData || !selectedTile) {
      return;
    }

    const building = mapData.buildings.find(
      (candidate) => candidate.x === selectedTile.x && candidate.y === selectedTile.y
    );

    if (!building) {
      return;
    }

    if (mapData.goal?.target?.x === building.x && mapData.goal?.target?.y === building.y) {
      return;
    }

    mapData.goal = normalizeMapGoal(
      {
        ...mapData.goal,
        target: {
          x: building.x,
          y: building.y
        }
      },
      mapData
    );
    pushMapEditorHistory(
      this.state.mapEditor,
      `Set goal target to ${building.x}, ${building.y}`,
      this.state.mapEditor.selectedTile
    );
    this.emit();
  },

  clearMapEditorGoalTarget() {
    const mapData = this.state.mapEditor?.mapData;

    if (!mapData || !mapData.goal?.target) {
      return;
    }

    mapData.goal = normalizeMapGoal(
      {
        ...mapData.goal,
        target: null
      },
      mapData
    );
    pushMapEditorHistory(
      this.state.mapEditor,
      "Clear goal target",
      this.state.mapEditor.selectedTile
    );
    this.emit();
  },

  exportMapEditorMap() {
    const { exportedBundle } = exportMapEditorBundle(this.state.mapEditor);

    if (!exportedBundle) {
      return null;
    }

    return {
      filename: `${exportedBundle.id}.json`,
      text: JSON.stringify(exportedBundle, null, 2)
    };
  },

  async saveMapEditorMap() {
    const exportedMap = this.exportMapEditorMap();

    if (!exportedMap) {
      const validation = getMapEditorBundleValidation(this.state.mapEditor);
      this.showToast({
        title: "Map not saved",
        message: validation.errors[0] ?? "Resolve the remaining validation issues and try again.",
        tone: "error"
      });
      return null;
    }

    const suggestedPath = buildMapEditorSuggestedRelativePath(JSON.parse(exportedMap.text));

    try {
      const saveResult = this.storage.saveMapFile
        ? await this.storage.saveMapFile(suggestedPath, exportedMap.text)
        : { unsupported: true };

      if (saveResult?.unsupported) {
        return {
          mode: "download",
          exportedMap
        };
      }

      if (saveResult == null) {
        return {
          mode: "canceled",
          exportedMap
        };
      }

      const savedMap = JSON.parse(exportedMap.text);
      const registeredMaps = upsertCustomMap(savedMap);
      const stageCount = registeredMaps.length;
      this.showToast({
        title: "Map saved",
        message: `${savedMap.name} (${stageCount} stage${stageCount === 1 ? "" : "s"})`,
        tone: "success"
      });

      return {
        mode: "saved",
        filename: exportedMap.filename,
        filePath: saveResult.filePath ?? null,
        mapData: registeredMaps[0] ?? null,
        mapBundle: savedMap,
        mapStages: registeredMaps
      };
    } catch (error) {
      if (/No handler registered for 'map-files:(save|export)'/i.test(String(error?.message ?? ""))) {
        return {
          mode: "download",
          exportedMap,
          warning: error
        };
      }

      this.showToast({
        title: "Map not saved",
        message: error?.message ?? "An unexpected error blocked the save.",
        tone: "error"
      });
      return {
        mode: "error",
        error
      };
    }
  }
};
