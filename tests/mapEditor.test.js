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
import { MAP_GOAL_TYPES } from "../src/game/content/mapGoals.js";
import { appShellEventMethods } from "../src/ui/appShell/eventMethods.js";
import { renderMapEditorView } from "../src/ui/views/mapEditorView.js";

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
      x: 3,
      y: 3
    }
  ]);
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
  assert.equal(state.mapEditor.mapData.id, "factory-lane");
  assert.equal(exported.filename, "factory-lane.json");
  assert.equal(parsed.id, "factory-lane");
  assert.equal(parsed.name, "Factory Lane");
  assert.equal(parsed.width, 20);
  assert.equal(parsed.height, 14);
  assert.equal(parsed.tiles[2][2], TERRAIN_KEYS.FOREST);
  assert.deepEqual(parsed.buildings, [
    {
      id: "factory-lane-player-command-1-1",
      type: BUILDING_KEYS.COMMAND,
      owner: TURN_SIDES.PLAYER,
      x: 1,
      y: 1
    }
  ]);
  assert.equal(parsed.units.some((unit) => unit.id === "factory-lane-player-grunt-0-0"), true);
  assert.equal(parsed.units.some((unit) => unit.id === "factory-lane-enemy-breaker-5-5"), true);
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

  assert.equal(controller.getState().mapEditor.mapData.id, "spiral-ridge");
  assert.equal(parsed.id, "spiral-ridge");
  assert.equal(parsed.buildings[0].id, "spiral-ridge-neutral-sector-2-2");
  assert.equal(parsed.units[0].id, "spiral-ridge-player-grunt-1-1");
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

test("map editor export uses the desktop save dialog when available", async () => {
  const exportCalls = [];
  const shell = {
    latestState: {},
    getDesktopApi() {
      return {
        async exportMapFile(filename, text) {
          exportCalls.push({ filename, text });
        }
      };
    },
    controller: {
      exportMapEditorMap() {
        return {
          filename: "factory-lane.json",
          text: "{\n  \"id\": \"factory-lane\"\n}"
        };
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

  assert.deepEqual(exportCalls, [
    {
      filename: "factory-lane.json",
      text: "{\n  \"id\": \"factory-lane\"\n}"
    }
  ]);
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

test("map editor export falls back to browser download when the desktop handler is missing", async () => {
  const downloads = [];
  const shell = {
    latestState: {},
    getDesktopApi() {
      return {
        async exportMapFile() {
          throw new Error("No handler registered for 'map-files:export'");
        }
      };
    },
    logDesktopDialogFallback() {},
    downloadMapEditorJson(exportedMap) {
      downloads.push(exportedMap);
    },
    controller: {
      exportMapEditorMap() {
        return {
          filename: "fallback-map.json",
          text: "{\n  \"id\": \"fallback-map\"\n}"
        };
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

  assert.deepEqual(downloads, [
    {
      filename: "fallback-map.json",
      text: "{\n  \"id\": \"fallback-map\"\n}"
    }
  ]);
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
  assert.match(html, /data-mirror-mode="vertical"/);
  assert.doesNotMatch(html, /Player Spawn|Enemy Spawn/);
});
