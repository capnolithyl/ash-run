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
  assert.match(html, /data-map-editor-field="theme"/);
  assert.match(html, /data-action="map-editor-export"/);
  assert.match(html, /Tile 1, 1/);
  assert.match(html, /Command Post/);
  assert.doesNotMatch(html, /disabled/);
});

test("map editor accordions render closed by default and only open the requested section", () => {
  const state = {
    mapEditor: createDefaultMapEditorState(createBlankMapDefinition({ id: "accordion-map" }))
  };

  const closedHtml = renderMapEditorView(state);
  assert.doesNotMatch(closedHtml, /<details[^>]*data-map-editor-accordion="terrain"[^>]*\sopen/);
  assert.doesNotMatch(closedHtml, /<details[^>]*data-map-editor-accordion="buildings"[^>]*\sopen/);
  assert.doesNotMatch(closedHtml, /<details[^>]*data-map-editor-accordion="units"[^>]*\sopen/);
  assert.doesNotMatch(closedHtml, /<details[^>]*data-map-editor-accordion="mirror"[^>]*\sopen/);

  const openHtml = renderMapEditorView(state, { openAccordion: "units" });
  assert.match(openHtml, /<details[^>]*data-map-editor-accordion="units"[^>]*\sopen/);
  assert.match(openHtml, /map-editor-accordion__content/);
  assert.doesNotMatch(openHtml, /<details[^>]*data-map-editor-accordion="terrain"[^>]*\sopen/);
  assert.doesNotMatch(openHtml, /<details[^>]*data-map-editor-accordion="buildings"[^>]*\sopen/);
  assert.doesNotMatch(openHtml, /<details[^>]*data-map-editor-accordion="mirror"[^>]*\sopen/);
});

test("map editor view shows the id as derived read-only metadata instead of an editable field", () => {
  const state = {
    mapEditor: createDefaultMapEditorState(
      createBlankMapDefinition({ id: "ignored-id", name: "Spiral Ridge" })
    )
  };

  const html = renderMapEditorView(state);

  assert.doesNotMatch(html, /Derived ID/);
  assert.doesNotMatch(html, /data-map-editor-derived-id/);
  assert.doesNotMatch(html, /data-map-editor-field="id"/);
});
