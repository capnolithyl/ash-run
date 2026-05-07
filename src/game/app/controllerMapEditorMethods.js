import { BUILDING_KEYS, SCREEN_IDS, TERRAIN_KEYS, TURN_SIDES } from "../core/constants.js";
import {
  applyMapEditorTool,
  createBlankMapDefinition,
  createDefaultMapEditorState,
  exportMapDefinition,
  getMapEditorValidation,
  MAP_EDITOR_TOOL_IDS,
  normalizeMapDefinition
} from "../content/mapEditor.js";
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

export const controllerMapEditorMethods = {
  openMapEditor() {
    this.state.mapEditor = createDefaultMapEditorState(createBlankMapDefinition());
    this.state.screen = SCREEN_IDS.MAP_EDITOR;
    this.state.banner = "Map editor active.";
    this.resetBattleUi();
    this.emit();
  },

  resetMapEditor() {
    this.state.mapEditor = createDefaultMapEditorState(createBlankMapDefinition({
      theme: this.state.mapEditor?.mapData?.theme ?? "ash"
    }));
    this.emit();
  },

  setMapEditorTool(toolId) {
    if (!Object.values(MAP_EDITOR_TOOL_IDS).includes(toolId)) {
      return;
    }

    this.state.mapEditor.selectedTool = toolId;

    if (toolId === MAP_EDITOR_TOOL_IDS.PLAYER_SPAWN) {
      this.state.mapEditor.selectedSpawnSide = TURN_SIDES.PLAYER;
    } else if (toolId === MAP_EDITOR_TOOL_IDS.ENEMY_SPAWN) {
      this.state.mapEditor.selectedSpawnSide = TURN_SIDES.ENEMY;
    }

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

  selectMapEditorSpawnSide(side) {
    if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(side)) {
      return;
    }

    this.state.mapEditor.selectedSpawnSide = side;
    this.state.mapEditor.selectedTool =
      side === TURN_SIDES.PLAYER
        ? MAP_EDITOR_TOOL_IDS.PLAYER_SPAWN
        : MAP_EDITOR_TOOL_IDS.ENEMY_SPAWN;
    this.emit();
  },

  updateMapEditorField(field, value) {
    const mapData = this.state.mapEditor?.mapData;

    if (!mapData) {
      return;
    }

    if (field === "id") {
      mapData.id = normalizeMapEditorId(value);
    } else if (field === "name") {
      mapData.name = String(value ?? "").trimStart();
    } else if (field === "theme") {
      if (!Object.hasOwn(MAP_THEME_PALETTES, value)) {
        return;
      }

      mapData.theme = value;
    } else {
      return;
    }

    this.emit();
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
    this.state.mapEditor.mapData = normalizeMapDefinition(mapInput);
    this.state.mapEditor.selectedTile = null;
    this.state.mapEditor.hoveredTile = null;
    this.state.mapEditor.isPainting = false;
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
