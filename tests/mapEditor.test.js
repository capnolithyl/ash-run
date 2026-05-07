import test from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/game/app/GameController.js";
import { BUILDING_KEYS, SCREEN_IDS, TERRAIN_KEYS, TURN_SIDES } from "../src/game/core/constants.js";
import {
  applyMapEditorTool,
  createBlankMapDefinition,
  createDefaultMapEditorState,
  exportMapDefinition,
  getMapEditorValidation,
  MAP_EDITOR_TOOL_IDS
} from "../src/game/content/mapEditor.js";

test("terrain painting to blocked tiles removes buildings and spawns on that tile", () => {
  const mapData = createBlankMapDefinition({
    id: "terrain-cleanup",
    playerSpawns: [{ x: 2, y: 2 }],
    enemySpawns: [{ x: 4, y: 4 }],
    buildings: [
      {
        id: "terrain-cleanup-neutral-sector",
        type: BUILDING_KEYS.SECTOR,
        owner: "neutral",
        x: 2,
        y: 2
      }
    ]
  });
  const editorState = createDefaultMapEditorState(mapData);
  editorState.selectedTool = MAP_EDITOR_TOOL_IDS.TERRAIN;
  editorState.selectedTerrainId = TERRAIN_KEYS.WATER;

  const result = applyMapEditorTool(mapData, editorState, 2, 2);

  assert.equal(result.mapData.tiles[2][2], TERRAIN_KEYS.WATER);
  assert.equal(result.mapData.buildings.some((building) => building.x === 2 && building.y === 2), false);
  assert.equal(result.mapData.playerSpawns.some((spawn) => spawn.x === 2 && spawn.y === 2), false);
});

test("spawn painting replaces an opposite-side spawn on the same tile", () => {
  const mapData = createBlankMapDefinition({
    id: "spawn-replace",
    enemySpawns: [{ x: 3, y: 3 }]
  });
  const editorState = createDefaultMapEditorState(mapData);
  editorState.selectedTool = MAP_EDITOR_TOOL_IDS.PLAYER_SPAWN;

  const result = applyMapEditorTool(mapData, editorState, 3, 3);

  assert.equal(result.mapData.playerSpawns.some((spawn) => spawn.x === 3 && spawn.y === 3), true);
  assert.equal(result.mapData.enemySpawns.some((spawn) => spawn.x === 3 && spawn.y === 3), false);
});

test("map editor controller can paint a map and export repo-ready JSON", () => {
  const controller = new GameController();

  controller.openMapEditor();
  controller.updateMapEditorField("name", "Factory Lane");
  controller.updateMapEditorField("id", "Factory Lane!");
  controller.selectMapEditorTerrain(TERRAIN_KEYS.FOREST);
  controller.applyMapEditorToolAt(2, 2);
  controller.selectMapEditorBuildingType(BUILDING_KEYS.COMMAND);
  controller.selectMapEditorBuildingOwner(TURN_SIDES.PLAYER);
  controller.applyMapEditorToolAt(1, 1);
  controller.selectMapEditorSpawnSide(TURN_SIDES.PLAYER);
  controller.applyMapEditorToolAt(0, 0);
  controller.selectMapEditorSpawnSide(TURN_SIDES.ENEMY);
  controller.applyMapEditorToolAt(5, 5);

  const exported = controller.exportMapEditorMap();
  const parsed = JSON.parse(exported.text);

  assert.equal(controller.getState().screen, SCREEN_IDS.MAP_EDITOR);
  assert.ok(exported);
  assert.equal(exported.filename, "factory-lane.json");
  assert.equal(parsed.id, "factory-lane");
  assert.equal(parsed.name, "Factory Lane");
  assert.equal(parsed.tiles[2][2], TERRAIN_KEYS.FOREST);
  assert.equal(parsed.buildings.some((building) => building.x === 1 && building.y === 1), true);
  assert.equal(parsed.playerSpawns.some((spawn) => spawn.x === 0 && spawn.y === 0), true);
  assert.equal(parsed.enemySpawns.some((spawn) => spawn.x === 5 && spawn.y === 5), true);
});

test("map editor export stays disabled until both sides have spawn points", () => {
  const validation = getMapEditorValidation(
    createBlankMapDefinition({
      id: "invalid-map",
      name: "Invalid Map"
    })
  );

  assert.equal(validation.isValid, false);
  assert.match(validation.errors.join(" "), /player spawn/i);
  assert.match(validation.errors.join(" "), /enemy spawn/i);
});

test("exported maps exclude editor-only controller state", () => {
  const exported = exportMapDefinition(
    createBlankMapDefinition({
      id: "clean-export",
      name: "Clean Export",
      playerSpawns: [{ x: 1, y: 1 }],
      enemySpawns: [{ x: 4, y: 4 }]
    })
  );

  assert.equal(Object.hasOwn(exported, "selectedTool"), false);
  assert.equal(Object.hasOwn(exported, "selectedTile"), false);
  assert.deepEqual(Object.keys(exported).sort(), [
    "buildings",
    "enemySpawns",
    "height",
    "id",
    "name",
    "playerSpawns",
    "theme",
    "tiles",
    "width"
  ]);
});
