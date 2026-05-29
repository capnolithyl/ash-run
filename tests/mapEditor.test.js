import test from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/game/app/GameController.js";
import { BUILDING_KEYS, SCREEN_IDS, TERRAIN_KEYS, TURN_SIDES } from "../src/game/core/constants.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import {
  applyMapEditorTool,
  createBlankMapDefinition,
  createDefaultMapEditorState,
  createMapEditorSnapshot,
  exportMapDefinition,
  getMapEditorMirrorTile,
  getMapEditorValidation,
  MAP_EDITOR_MIRROR_MODES,
  MAP_EDITOR_TOOL_IDS,
  resizeMapDefinition
} from "../src/game/content/mapEditor.js";
import { getMapById, replaceCustomMaps } from "../src/game/content/maps.js";
import { MAP_GOAL_TYPES } from "../src/game/content/mapGoals.js";
import { appShellEventMethods } from "../src/ui/appShell/eventMethods.js";
import { renderMapEditorView } from "../src/ui/views/mapEditorView.js";

test.afterEach(() => {
  replaceCustomMaps([]);
});

test("terrain painting to blocked tiles removes buildings, units, and legacy spawns on that tile", () => {
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
    ],
    units: [
      {
        id: "terrain-cleanup-player-grunt",
        unitTypeId: "grunt",
        owner: TURN_SIDES.PLAYER,
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
  assert.equal(result.mapData.units.some((unit) => unit.x === 2 && unit.y === 2), false);
  assert.equal(result.mapData.playerSpawns.some((spawn) => spawn.x === 2 && spawn.y === 2), false);
});

test("unit painting places player and enemy units directly on the map", () => {
  const mapData = createBlankMapDefinition({ id: "unit-place" });
  const editorState = createDefaultMapEditorState(mapData);
  editorState.selectedTool = MAP_EDITOR_TOOL_IDS.UNIT;
  editorState.selectedUnitTypeId = "bruiser";
  editorState.selectedUnitOwner = TURN_SIDES.ENEMY;

  const result = applyMapEditorTool(mapData, editorState, 3, 3);

  assert.deepEqual(result.mapData.units, [
    {
      id: "unit-place-enemy-bruiser-3-3",
      unitTypeId: "bruiser",
      owner: TURN_SIDES.ENEMY,
      level: 1,
      x: 3,
      y: 3
    }
  ]);
});

test("map editor exports run stages, variant stage, and authored unit levels", () => {
  const controller = new GameController();

  controller.openMapEditor();
  controller.updateMapEditorField("name", "Factory Lane");
  controller.updateMapEditorField("variantStage", "2");
  controller.selectMapEditorUnitType("bruiser");
  controller.selectMapEditorUnitOwner(TURN_SIDES.ENEMY);
  controller.updateMapEditorField("selectedUnitLevel", "4");
  controller.applyMapEditorToolAt(3, 3);
  controller.setMapEditorSelectedTile({ x: 3, y: 3 });
  controller.updateMapEditorField("selectedTileUnitLevel", "5");

  const exported = controller.exportMapEditorMap();
  const parsed = JSON.parse(exported.text);

  assert.equal(parsed.id, "factory-lane-stage-2");
  assert.equal(parsed.variantStage, 2);
  assert.deepEqual(parsed.runStages, [2]);
  assert.equal(parsed.units[0].level, 5);
});

test("map editor tracks edit history, supports undo, and restores confirmed history states", () => {
  const controller = new GameController();

  controller.openMapEditor();
  controller.updateMapEditorField("name", "History Map");
  controller.selectMapEditorTerrain(TERRAIN_KEYS.FOREST);
  controller.applyMapEditorToolAt(2, 2);
  controller.updateMapEditorField("width", "20");

  let state = controller.getState();
  assert.equal(state.mapEditor.historyEntries.length, 4);
  assert.equal(state.mapEditor.currentHistoryIndex, 3);
  assert.equal(state.mapEditor.mapData.width, 20);
  assert.equal(state.mapEditor.mapData.tiles[2][2], TERRAIN_KEYS.FOREST);

  controller.undoMapEditorHistory();

  state = controller.getState();
  assert.equal(state.mapEditor.currentHistoryIndex, 2);
  assert.equal(state.mapEditor.mapData.width, 18);
  assert.equal(state.mapEditor.mapData.tiles[2][2], TERRAIN_KEYS.FOREST);

  controller.requestMapEditorHistoryRevert(1);
  state = controller.getState();
  assert.equal(state.mapEditor.pendingHistoryIndex, 1);

  controller.confirmMapEditorHistoryRevert();
  state = controller.getState();
  assert.equal(state.mapEditor.currentHistoryIndex, 1);
  assert.equal(state.mapEditor.pendingHistoryIndex, null);
  assert.equal(state.mapEditor.mapData.tiles[2][2], TERRAIN_KEYS.PLAIN);
  assert.equal(state.mapEditor.mapData.name, "History Map");
});

test("new edits after stepping back truncate future history states", () => {
  const controller = new GameController();

  controller.openMapEditor();
  controller.selectMapEditorTerrain(TERRAIN_KEYS.FOREST);
  controller.applyMapEditorToolAt(1, 1);
  controller.updateMapEditorField("width", "20");
  controller.undoMapEditorHistory();
  controller.selectMapEditorTerrain(TERRAIN_KEYS.MOUNTAIN);
  controller.applyMapEditorToolAt(3, 3);

  const state = controller.getState();

  assert.equal(state.mapEditor.historyEntries.length, 3);
  assert.equal(state.mapEditor.currentHistoryIndex, 2);
  assert.equal(state.mapEditor.mapData.width, 18);
  assert.equal(state.mapEditor.mapData.tiles[3][3], TERRAIN_KEYS.MOUNTAIN);
  assert.equal(state.mapEditor.historyEntries.some((entry) => /Resize map to 20x12/.test(entry.label)), false);
});

test("temporary eraser override clears a tile without changing the selected tool", () => {
  const mapData = createBlankMapDefinition({
    id: "override-eraser",
    buildings: [
      {
        id: "override-eraser-neutral-sector",
        type: BUILDING_KEYS.SECTOR,
        owner: "neutral",
        x: 2,
        y: 2
      }
    ],
    units: [
      {
        id: "override-eraser-player-grunt",
        unitTypeId: "grunt",
        owner: TURN_SIDES.PLAYER,
        x: 2,
        y: 2
      }
    ]
  });
  mapData.tiles[2][2] = TERRAIN_KEYS.FOREST;

  const editorState = createDefaultMapEditorState(mapData);
  editorState.selectedTool = MAP_EDITOR_TOOL_IDS.BUILDING;

  const result = applyMapEditorTool(mapData, editorState, 2, 2, {
    toolId: MAP_EDITOR_TOOL_IDS.ERASER
  });

  assert.equal(editorState.selectedTool, MAP_EDITOR_TOOL_IDS.BUILDING);
  assert.equal(result.mapData.tiles[2][2], TERRAIN_KEYS.PLAIN);
  assert.equal(result.mapData.buildings.some((building) => building.x === 2 && building.y === 2), false);
  assert.equal(result.mapData.units.some((unit) => unit.x === 2 && unit.y === 2), false);
});

test("map editor controller can paint a map, resize it, place units, and export repo-ready JSON", () => {
  const controller = new GameController();

  controller.openMapEditor();
  controller.updateMapEditorField("width", "20");
  controller.updateMapEditorField("height", "14");
  controller.selectMapEditorTerrain(TERRAIN_KEYS.FOREST);
  controller.applyMapEditorToolAt(2, 2);
  controller.selectMapEditorBuildingType(BUILDING_KEYS.COMMAND);
  controller.selectMapEditorBuildingOwner(TURN_SIDES.PLAYER);
  controller.applyMapEditorToolAt(1, 1);
  controller.selectMapEditorUnitType("grunt");
  controller.selectMapEditorUnitOwner(TURN_SIDES.PLAYER);
  controller.applyMapEditorToolAt(0, 0);
  controller.selectMapEditorUnitType("breaker");
  controller.selectMapEditorUnitOwner(TURN_SIDES.ENEMY);
  controller.applyMapEditorToolAt(5, 5);
  controller.updateMapEditorField("name", "Factory Lane");

  const exported = controller.exportMapEditorMap();
  const parsed = JSON.parse(exported.text);
  const state = controller.getState();

  assert.equal(state.screen, SCREEN_IDS.MAP_EDITOR);
  assert.ok(exported);
  assert.equal(state.mapEditor.mapData.id, "factory-lane-stage-1");
  assert.equal(exported.filename, "factory-lane-stage-1.json");
  assert.equal(parsed.id, "factory-lane-stage-1");
  assert.equal(parsed.name, "Factory Lane");
  assert.equal(parsed.variantStage, 1);
  assert.deepEqual(parsed.runStages, [1]);
  assert.equal(parsed.width, 20);
  assert.equal(parsed.height, 14);
  assert.equal(parsed.tiles[2][2], TERRAIN_KEYS.FOREST);
  assert.deepEqual(parsed.buildings, [
    {
      id: "factory-lane-stage-1-player-command-1-1",
      type: BUILDING_KEYS.COMMAND,
      owner: TURN_SIDES.PLAYER,
      x: 1,
      y: 1
    }
  ]);
  assert.equal(parsed.units.some((unit) => unit.id === "factory-lane-stage-1-player-grunt-0-0"), true);
  assert.equal(parsed.units.some((unit) => unit.id === "factory-lane-stage-1-enemy-breaker-5-5"), true);
});

test("saving a map editor map opens a file save flow, shows a toast, and registers it immediately", async () => {
  const saveCalls = [];
  const controller = new GameController({
    async saveMapFile(filePath, text) {
      saveCalls.push({ filePath, text });
      return { filePath: `D:/ash-run/ash-run/src/game/content/maps/${filePath}` };
    }
  });

  controller.openMapEditor();
  controller.updateMapEditorField("name", "Runtime Save");
  controller.setMapEditorVariantStage(2);

  const saved = await controller.saveMapEditorMap();

  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].filePath, "runtime-save/runtime-save-stage-2.json");
  assert.equal(saved?.mode, "saved");
  assert.equal(saved?.mapData?.id, "runtime-save-stage-2");
  assert.equal(getMapById("runtime-save-stage-2")?.name, "Runtime Save");
  assert.equal(controller.getState().toast?.title, "Map saved");
  assert.match(controller.getState().toast?.message ?? "", /Runtime Save \(Stage 2\)/);
});

test("imported maps also re-derive their map id from the map name", () => {
  const controller = new GameController();

  controller.openMapEditor();
  controller.importMapEditorMap({
    id: "legacy-import-id",
    name: "Spiral Ridge",
    theme: "ash",
    width: 12,
    height: 12,
    tiles: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => TERRAIN_KEYS.PLAIN)),
    buildings: [
      {
        id: "legacy-building-id",
        type: BUILDING_KEYS.SECTOR,
        owner: "neutral",
        x: 2,
        y: 2
      }
    ],
    units: [
      {
        id: "legacy-unit-id",
        unitTypeId: "grunt",
        owner: TURN_SIDES.PLAYER,
        x: 1,
        y: 1
      }
    ]
  });

  const exported = controller.exportMapEditorMap();
  const parsed = JSON.parse(exported.text);

  assert.equal(controller.getState().mapEditor.mapData.id, "spiral-ridge-stage-1");
  assert.equal(parsed.id, "spiral-ridge-stage-1");
  assert.equal(parsed.variantStage, 1);
  assert.deepEqual(parsed.runStages, [1]);
  assert.equal(parsed.buildings[0].id, "spiral-ridge-stage-1-neutral-sector-2-2");
  assert.equal(parsed.units[0].id, "spiral-ridge-stage-1-player-grunt-1-1");
});

test("loading a map resets history to the imported state", () => {
  const controller = new GameController();

  controller.openMapEditor();
  controller.updateMapEditorField("name", "Before Import");
  controller.importMapEditorMap({
    id: "import-reset",
    name: "Import Reset",
    theme: "ash",
    width: 12,
    height: 12,
    tiles: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => TERRAIN_KEYS.PLAIN))
  });

  const state = controller.getState();

  assert.equal(state.mapEditor.historyEntries.length, 1);
  assert.equal(state.mapEditor.historyEntries[0].label, "Map loaded");
  assert.equal(state.mapEditor.currentHistoryIndex, 0);
});

test("imported legacy multi-stage maps collapse to the first available stage when re-saved", () => {
  const controller = new GameController();

  controller.openMapEditor();
  controller.importMapEditorMap({
    id: "legacy-variant",
    name: "Legacy Variant",
    theme: "ash",
    width: 12,
    height: 12,
    runStages: [3, 2, 5],
    tiles: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => TERRAIN_KEYS.PLAIN))
  });

  const exported = controller.exportMapEditorMap();
  const parsed = JSON.parse(exported.text);

  assert.equal(parsed.variantStage, 2);
  assert.deepEqual(parsed.runStages, [2]);
  assert.equal(parsed.id, "legacy-variant-stage-2");
});

test("map editor typing exits controller mode before applying the field update", () => {
  const callOrder = [];
  const shell = {
    syncMapEditorNameDraft(value) {
      callOrder.push(`draft:${value}`);
    },
    setInputMode(mode) {
      callOrder.push(`mode:${mode}`);
    },
    controller: {
      updateMapEditorField(field, value, options) {
        callOrder.push(`field:${field}=${value}:${options?.emit}`);
      }
    }
  };

  appShellEventMethods.handleInput.call(shell, {
    target: {
      dataset: {
        mapEditorField: "name"
      },
      value: "Factory Lane"
    }
  });

  assert.deepEqual(callOrder, [
    "mode:mouse",
    "field:name=Factory Lane:false",
    "draft:Factory Lane"
  ]);
});

test("map editor change events still commit inspector fields through the controller", async () => {
  const callOrder = [];
  const shell = {
    setInputMode(mode) {
      callOrder.push(`mode:${mode}`);
    },
    controller: {
      updateMapEditorField(field, value) {
        callOrder.push(`field:${field}=${value}`);
      }
    }
  };

  await appShellEventMethods.handleChange.call(shell, {
    target: {
      dataset: {
        mapEditorField: "width"
      },
      value: "20"
    }
  });

  assert.deepEqual(callOrder, [
    "mode:mouse",
    "field:width=20"
  ]);
});

test("map editor import button uses the desktop file dialog when available", async () => {
  let importedMap = null;
  const shell = {
    latestState: {},
    getDesktopApi() {
      return {
        async importMapFile() {
          return {
            text: JSON.stringify({
              name: "Desktop Import",
              width: 12,
              height: 12
            })
          };
        }
      };
    },
    controller: {
      importMapEditorMap(mapInput) {
        importedMap = mapInput;
      }
    }
  };

  await appShellEventMethods.handleClick.call(shell, {
    target: {
      closest() {
        return {
          dataset: {
            action: "map-editor-import"
          }
        };
      }
    }
  });

  assert.equal(importedMap?.name, "Desktop Import");
  assert.equal(importedMap?.width, 12);
});

test("map editor import button falls back to the browser file input", async () => {
  let clicked = false;
  const shell = {
    latestState: {},
    getDesktopApi() {
      return null;
    },
    openMapEditorImportFallback() {
      this.root.querySelector("#map-editor-import")?.click();
    },
    root: {
      querySelector(selector) {
        assert.equal(selector, "#map-editor-import");
        return {
          click() {
            clicked = true;
          }
        };
      }
    },
    controller: {}
  };

  await appShellEventMethods.handleClick.call(shell, {
    target: {
      closest() {
        return {
          dataset: {
            action: "map-editor-import"
          }
        };
      }
    }
  });

  assert.equal(clicked, true);
});

test("map editor save action routes through the controller save flow", async () => {
  const saveCalls = [];
  const shell = {
    latestState: {},
    controller: {
      async saveMapEditorMap() {
        saveCalls.push("saved");
      }
    }
  };

  await appShellEventMethods.handleClick.call(shell, {
    target: {
      closest() {
        return {
          dataset: {
            action: "map-editor-export"
          }
        };
      }
    }
  });

  assert.deepEqual(saveCalls, ["saved"]);
});

test("map editor import falls back to the browser file input when the desktop handler is missing", async () => {
  let clicked = false;
  const shell = {
    latestState: {},
    getDesktopApi() {
      return {
        async importMapFile() {
          throw new Error("No handler registered for 'map-files:import'");
        }
      };
    },
    openMapEditorImportFallback() {
      clicked = true;
    },
    logDesktopDialogFallback() {},
    controller: {}
  };

  await appShellEventMethods.handleClick.call(shell, {
    target: {
      closest() {
        return {
          dataset: {
            action: "map-editor-import"
          }
        };
      }
    }
  });

  assert.equal(clicked, true);
});

test("map editor save action still uses the controller flow without desktop export handlers", async () => {
  const saveCalls = [];
  const shell = {
    latestState: {},
    controller: {
      async saveMapEditorMap() {
        saveCalls.push("saved");
      }
    }
  };

  await appShellEventMethods.handleClick.call(shell, {
    target: {
      closest() {
        return {
          dataset: {
            action: "map-editor-export"
          }
        };
      }
    }
  });

  assert.deepEqual(saveCalls, ["saved"]);
});

test("map editor history actions route through the controller", async () => {
  const calls = [];
  const shell = {
    latestState: {},
    controller: {
      undoMapEditorHistory() {
        calls.push("undo");
      },
      requestMapEditorHistoryRevert(index) {
        calls.push(`request:${index}`);
      },
      confirmMapEditorHistoryRevert() {
        calls.push("confirm");
      },
      cancelMapEditorHistoryRevert() {
        calls.push("cancel");
      }
    }
  };

  for (const dataset of [
    { action: "map-editor-undo" },
    { action: "map-editor-request-history-revert", historyIndex: "2" },
    { action: "map-editor-confirm-history-revert" },
    { action: "map-editor-cancel-history-revert" }
  ]) {
    await appShellEventMethods.handleClick.call(shell, {
      target: {
        closest() {
          return { dataset };
        }
      }
    });
  }

  assert.deepEqual(calls, ["undo", "request:2", "confirm", "cancel"]);
});

test("new maps no longer require spawn points to export", () => {
  const validation = getMapEditorValidation(
    createBlankMapDefinition({
      id: "valid-map",
      name: "Valid Map"
    })
  );

  assert.equal(validation.isValid, true);
  assert.equal(validation.errors.length, 0);
});

test("exported maps exclude editor-only controller state and keep units", () => {
  const exported = exportMapDefinition(
    createBlankMapDefinition({
      id: "clean-export",
      name: "Clean Export",
      units: [
        {
          id: "clean-export-player-grunt",
          unitTypeId: "grunt",
          owner: TURN_SIDES.PLAYER,
          x: 1,
          y: 1
        }
      ]
    })
  );

  assert.equal(Object.hasOwn(exported, "selectedTool"), false);
  assert.equal(Object.hasOwn(exported, "selectedTile"), false);
  assert.deepEqual(Object.keys(exported).sort(), [
    "buildings",
    "goal",
    "height",
    "id",
    "name",
    "theme",
    "tiles",
    "units",
    "width"
  ]);
});

test("goal exports default to rout and goal validation requires mission-specific data", () => {
  const routExport = exportMapDefinition(
    createBlankMapDefinition({
      id: "goal-rout",
      name: "Goal Rout"
    })
  );

  assert.equal(routExport.goal.type, MAP_GOAL_TYPES.ROUT);

  const defendValidation = getMapEditorValidation(
    createBlankMapDefinition({
      id: "goal-defend",
      name: "Goal Defend",
      goal: {
        type: MAP_GOAL_TYPES.DEFEND
      }
    })
  );

  assert.equal(defendValidation.isValid, false);
  assert.match(defendValidation.errors.join(" "), /Defend maps need a marked building/i);
  assert.match(defendValidation.errors.join(" "), /turn limit/i);
});

test("goal targets clear automatically when the marked building is removed", () => {
  const mapData = createBlankMapDefinition({
    id: "goal-clear",
    name: "Goal Clear",
    buildings: [
      {
        id: "goal-clear-player-command",
        type: BUILDING_KEYS.COMMAND,
        owner: TURN_SIDES.PLAYER,
        x: 1,
        y: 1
      },
      {
        id: "goal-clear-neutral-sector",
        type: BUILDING_KEYS.SECTOR,
        owner: "neutral",
        x: 3,
        y: 3
      }
    ],
    goal: {
      type: MAP_GOAL_TYPES.RESCUE,
      target: {
        x: 3,
        y: 3
      }
    }
  });
  const editorState = createDefaultMapEditorState(mapData);
  editorState.selectedTool = MAP_EDITOR_TOOL_IDS.ERASER;

  const result = applyMapEditorTool(mapData, editorState, 3, 3);

  assert.equal(result.mapData.buildings.some((building) => building.x === 3 && building.y === 3), false);
  assert.equal(result.mapData.goal.target, undefined);
});

test("mirror mode applies terrain edits vertically, horizontally, and diagonally", () => {
  const mapData = createBlankMapDefinition({ id: "mirror-map", width: 8, height: 8 });

  for (const [mirrorMode, expectedTile] of [
    [MAP_EDITOR_MIRROR_MODES.VERTICAL, { x: 6, y: 2 }],
    [MAP_EDITOR_MIRROR_MODES.HORIZONTAL, { x: 1, y: 5 }],
    [MAP_EDITOR_MIRROR_MODES.DIAGONAL, { x: 2, y: 1 }]
  ]) {
    const editorState = createDefaultMapEditorState(mapData);
    editorState.selectedTool = MAP_EDITOR_TOOL_IDS.TERRAIN;
    editorState.selectedTerrainId = TERRAIN_KEYS.FOREST;
    editorState.mirrorMode = mirrorMode;

    const result = applyMapEditorTool(mapData, editorState, 1, 2);

    assert.equal(result.mapData.tiles[2][1], TERRAIN_KEYS.FOREST);
    assert.equal(result.mapData.tiles[expectedTile.y][expectedTile.x], TERRAIN_KEYS.FOREST);
    assert.deepEqual(getMapEditorMirrorTile(mapData, { x: 1, y: 2 }, mirrorMode), expectedTile);
  }
});

test("resize preserves in-bounds content and removes out-of-bounds content", () => {
  const mapData = createBlankMapDefinition({
    id: "resize-map",
    width: 10,
    height: 10,
    tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => TERRAIN_KEYS.PLAIN)),
    buildings: [
      { id: "keep-building", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 2, y: 2 },
      { id: "drop-building", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 8, y: 8 }
    ],
    units: [
      { id: "keep-unit", unitTypeId: "grunt", owner: TURN_SIDES.PLAYER, x: 3, y: 3 },
      { id: "drop-unit", unitTypeId: "grunt", owner: TURN_SIDES.PLAYER, x: 9, y: 9 }
    ]
  });

  mapData.tiles[2][2] = TERRAIN_KEYS.FOREST;
  const resized = resizeMapDefinition(mapData, 6, 6);

  assert.equal(resized.width, 6);
  assert.equal(resized.height, 6);
  assert.equal(resized.tiles[2][2], TERRAIN_KEYS.FOREST);
  assert.equal(resized.buildings.some((building) => building.id === "keep-building"), true);
  assert.equal(resized.buildings.some((building) => building.id === "drop-building"), false);
  assert.equal(resized.units.some((unit) => unit.id === "keep-unit"), true);
  assert.equal(resized.units.some((unit) => unit.id === "drop-unit"), false);
});

test("map editor snapshot renders placed units and mirrored cursor presentation", () => {
  const mapData = createBlankMapDefinition({
    id: "snapshot-map",
    units: [
      { id: "snapshot-player-grunt", unitTypeId: "grunt", owner: TURN_SIDES.PLAYER, x: 1, y: 1 },
      { id: "snapshot-enemy-breaker", unitTypeId: "breaker", owner: TURN_SIDES.ENEMY, x: 5, y: 1 }
    ]
  });

  const snapshot = createMapEditorSnapshot(
    mapData,
    { x: 1, y: 1 },
    { x: 2, y: 3 },
    MAP_EDITOR_MIRROR_MODES.VERTICAL
  );

  assert.equal(snapshot.player.units[0].id, "snapshot-player-grunt");
  assert.equal(snapshot.enemy.units[0].id, "snapshot-enemy-breaker");
  assert.deepEqual(snapshot.presentation.mirroredTile, { x: mapData.width - 3, y: 3 });
});

test("map editor view exposes every building, every unit, size fields, and mirror controls", () => {
  const state = {
    mapEditor: createDefaultMapEditorState(createBlankMapDefinition({ id: "view-map", name: "View Map" }))
  };
  const html = renderMapEditorView(state);

  for (const buildingType of Object.values(BUILDING_KEYS)) {
    assert.match(html, new RegExp(`data-building-type="${buildingType}"`));
  }

  for (const unitTypeId of Object.keys(UNIT_CATALOG)) {
    assert.match(html, new RegExp(`data-unit-type-id="${unitTypeId}"`));
  }

  assert.match(html, /data-map-editor-field="width"/);
  assert.match(html, /data-map-editor-field="height"/);
  assert.match(html, /data-map-editor-field="goalType"/);
  assert.match(html, /data-map-editor-field="selectedUnitLevel"/);
  assert.match(html, /data-action="map-editor-set-variant-stage"/);
  assert.doesNotMatch(html, /data-map-editor-field="variantStage"/);
  assert.doesNotMatch(html, /data-action="map-editor-toggle-run-stage"/);
  assert.match(html, /data-mirror-mode="vertical"/);
  assert.doesNotMatch(html, /Player Spawn|Enemy Spawn/);
});
