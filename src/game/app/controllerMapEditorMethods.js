import { BUILDING_KEYS, SCREEN_IDS, TERRAIN_KEYS, TURN_SIDES } from "../core/constants.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import {
  applyMapEditorTool,
  buildMapEditorBuildingId,
  buildMapEditorUnitId,
  createBlankMapDefinition,
  createDefaultMapEditorState,
  exportMapDefinition,
  getMapEditorValidation,
  MAP_EDITOR_MIRROR_MODES,
  MAP_EDITOR_TOOL_IDS,
  normalizeMapDefinition,
  resizeMapDefinition
} from "../content/mapEditor.js";
import { MAP_GOAL_ORDER, normalizeMapGoal } from "../content/mapGoals.js";
import { MAP_THEME_PALETTES } from "../content/terrain.js";

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

function deriveMapEditorIdFromName(name) {
  return normalizeMapEditorId(name) || "custom-map";
}

function synchronizeMapEditorIdentity(mapData) {
  if (!mapData) {
    return mapData;
  }

  const nextMapId = deriveMapEditorIdFromName(mapData.name);

  return {
    ...mapData,
    id: nextMapId,
    buildings: mapData.buildings.map((building) => ({
      ...building,
      id: buildMapEditorBuildingId(nextMapId, building.type, building.owner, building.x, building.y)
    })),
    units: mapData.units.map((unit) => ({
      ...unit,
      id: buildMapEditorUnitId(nextMapId, unit.unitTypeId, unit.owner, unit.x, unit.y)
    }))
  };
}

export const controllerMapEditorMethods = {
  openMapEditor() {
    this.state.mapEditor = createDefaultMapEditorState(
      synchronizeMapEditorIdentity(createBlankMapDefinition())
    );
    this.state.screen = SCREEN_IDS.MAP_EDITOR;
    this.state.banner = "Map editor active.";
    this.resetBattleUi();
    this.emit();
  },

  resetMapEditor() {
    this.state.mapEditor = createDefaultMapEditorState(
      synchronizeMapEditorIdentity(
        createBlankMapDefinition({
          theme: this.state.mapEditor?.mapData?.theme ?? "ash"
        })
      )
    );
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
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.TERRAIN;
    this.emit();
  },

  selectMapEditorBuildingType(buildingType) {
    if (!Object.values(BUILDING_KEYS).includes(buildingType)) {
      return;
    }

    this.state.mapEditor.selectedBuildingType = buildingType;
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.BUILDING;
    this.emit();
  },

  selectMapEditorBuildingOwner(owner) {
    if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY, "neutral"].includes(owner)) {
      return;
    }

    this.state.mapEditor.selectedBuildingOwner = owner;
    this.emit();
  },

  selectMapEditorUnitType(unitTypeId) {
    if (!Object.hasOwn(UNIT_CATALOG, unitTypeId)) {
      return;
    }

    this.state.mapEditor.selectedUnitTypeId = unitTypeId;
    this.state.mapEditor.selectedTool = MAP_EDITOR_TOOL_IDS.UNIT;
    this.emit();
  },

  selectMapEditorUnitOwner(owner) {
    if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(owner)) {
      return;
    }

    this.state.mapEditor.selectedUnitOwner = owner;
    this.emit();
  },

  setMapEditorMirrorMode(mirrorMode) {
    if (!Object.values(MAP_EDITOR_MIRROR_MODES).includes(mirrorMode)) {
      return;
    }

    this.state.mapEditor.mirrorMode = mirrorMode;
    this.emit();
  },

  updateMapEditorField(field, value, options = {}) {
    const { emit = true } = options;
    const mapData = this.state.mapEditor?.mapData;

    if (!mapData) {
      return;
    }

    if (field === "name") {
      mapData.name = String(value ?? "").trimStart();
      this.state.mapEditor.mapData = synchronizeMapEditorIdentity(mapData);
    } else if (field === "theme") {
      if (!Object.hasOwn(MAP_THEME_PALETTES, value)) {
        return;
      }

      mapData.theme = value;
    } else if (field === "width" || field === "height") {
      const nextWidth = field === "width" ? Number(value) : mapData.width;
      const nextHeight = field === "height" ? Number(value) : mapData.height;
      this.state.mapEditor.mapData = synchronizeMapEditorIdentity(
        resizeMapDefinition(mapData, nextWidth, nextHeight)
      );
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
    } else if (field === "goalTurnLimit") {
      mapData.goal = normalizeMapGoal(
        {
          ...mapData.goal,
          turnLimit: Number(value)
        },
        mapData
      );
    } else {
      return;
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

  applyMapEditorToolAt(x, y) {
    const mapData = this.state.mapEditor?.mapData;

    if (!mapData || !Number.isInteger(x) || !Number.isInteger(y)) {
      return false;
    }

    const result = applyMapEditorTool(mapData, this.state.mapEditor, x, y);
    const currentTile = this.state.mapEditor.selectedTile;
    const selectedChanged =
      currentTile?.x !== result.selectedTile?.x || currentTile?.y !== result.selectedTile?.y;

    if (!result.changed && !selectedChanged) {
      return false;
    }

    this.state.mapEditor.mapData = result.mapData;
    this.state.mapEditor.selectedTile = result.selectedTile;
    this.emit();
    return true;
  },

  importMapEditorMap(mapInput) {
    this.state.mapEditor.mapData = synchronizeMapEditorIdentity(normalizeMapDefinition(mapInput));
    this.state.mapEditor.selectedTile = null;
    this.state.mapEditor.hoveredTile = null;
    this.state.mapEditor.isPainting = false;
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
    this.emit();
  },

  clearMapEditorGoalTarget() {
    const mapData = this.state.mapEditor?.mapData;

    if (!mapData) {
      return;
    }

    mapData.goal = normalizeMapGoal(
      {
        ...mapData.goal,
        target: null
      },
      mapData
    );
    this.emit();
  },

  exportMapEditorMap() {
    const validation = getMapEditorValidation(this.state.mapEditor?.mapData);

    if (!validation.isValid) {
      return null;
    }

    const exportedMap = exportMapDefinition(validation.mapData);
    return {
      filename: `${exportedMap.id}.json`,
      text: JSON.stringify(exportedMap, null, 2)
    };
  }
};
