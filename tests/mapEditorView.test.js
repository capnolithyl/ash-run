import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_KEYS, TURN_SIDES } from "../src/game/core/constants.js";
import { createBlankMapDefinition, createDefaultMapEditorState } from "../src/game/content/mapEditor.js";
import { renderMapEditorView } from "../src/ui/views/mapEditorView.js";

test("map editor view renders the battle-style editor shell and controls", () => {
  const mapData = createBlankMapDefinition({
    id: "editor-preview",
    name: "Editor Preview",
    playerSpawns: [{ x: 1, y: 1 }],
    enemySpawns: [{ x: 4, y: 4 }],
    buildings: [
      {
        id: "editor-preview-player-command",
        type: BUILDING_KEYS.COMMAND,
        owner: TURN_SIDES.PLAYER,
        x: 1,
        y: 1
      }
    ]
  });
  const state = {
    mapEditor: {
      ...createDefaultMapEditorState(mapData),
      selectedTile: { x: 1, y: 1 }
    }
  };

  const html = renderMapEditorView(state);

  assert.match(html, /battle-shell map-editor-shell/);
  assert.match(html, /data-action="map-editor-select-terrain"/);
  assert.match(html, /data-action="map-editor-select-building"/);
  assert.match(html, /data-action="map-editor-select-tool"/);
  assert.match(html, /data-map-editor-field="name"/);
  assert.match(html, /data-map-editor-field="id"/);
  assert.match(html, /data-map-editor-field="theme"/);
  assert.match(html, /data-action="map-editor-export"/);
  assert.match(html, /Tile 1, 1/);
  assert.match(html, /Command Post/);
  assert.doesNotMatch(html, /disabled/);
});
