import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_KEYS, TURN_SIDES } from "../src/game/core/constants.js";
import { createBlankMapDefinition, createDefaultMapEditorState } from "../src/game/content/mapEditor.js";
import { REINFORCEMENT_TRIGGER_TYPES } from "../src/game/content/reinforcements.js";
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
  assert.match(html, /battle-commanders map-editor-commanders/);
  assert.match(html, /data-map-editor-live-name="true">Editor Preview<\/h2>/);
  assert.match(html, /Map Editor/);
  assert.match(html, /Editor Status/);
  assert.equal((html.match(/map-editor-topcard map-editor-topcard--/g) ?? []).length, 2);
  assert.doesNotMatch(html, /map-editor-topcard__stats/);
  assert.doesNotMatch(html, /map-editor-topcard__stat/);
  assert.doesNotMatch(html, /<dt>Theme<\/dt>/);
  assert.doesNotMatch(html, /<dt>Size<\/dt>/);
  assert.doesNotMatch(html, /<dt>Goal<\/dt>/);
  assert.doesNotMatch(html, /<dt>Run<\/dt>/);
  assert.match(html, /data-action="map-editor-select-terrain"/);
  assert.match(html, /data-action="map-editor-select-building"/);
  assert.match(html, /data-action="map-editor-select-tool"/);
  assert.match(html, /data-map-editor-field="name"/);
  assert.match(html, /data-map-editor-field="theme"/);
  assert.match(html, /Run Stages/);
  assert.match(html, /Quick Select/);
  assert.match(html, /data-action="map-editor-restore-last-terrain"/);
  assert.match(html, /data-action="map-editor-restore-last-building"/);
  assert.match(html, /data-action="map-editor-restore-last-unit"/);
  assert.match(html, /data-action="map-editor-set-variant-stage"/);
  assert.match(html, /History/);
  assert.match(html, /data-action="map-editor-undo"/);
  assert.doesNotMatch(html, /data-map-editor-field="variantStage"/);
  assert.doesNotMatch(html, /data-action="map-editor-toggle-run-stage"/);
  assert.match(html, /Map Details/);
  assert.match(html, /battle-footer-meta map-editor-footer-meta/);
  assert.equal((html.match(/battle-footer-meta__item/g) ?? []).length, 4);
  assert.match(html, /<strong>Map<\/strong>[\s\S]*?<em>Editor Preview<\/em>/);
  assert.match(html, /<strong>Goal<\/strong>[\s\S]*?<em>Rout<\/em>/);
  assert.match(html, /<strong>Tool<\/strong>[\s\S]*?<em>Plain<\/em>/);
  assert.match(html, /<strong>Mirror<\/strong>[\s\S]*?<em>Off<\/em>/);
  assert.match(html, /Load Map/);
  assert.match(html, /Save Map/);
  assert.match(html, /New Map/);
  assert.match(html, /Back/);
  assert.match(html, /data-action="map-editor-export"/);
  assert.match(html, /data-action="map-editor-import"/);
  assert.match(html, /Tile 1, 1/);
  assert.match(html, /Command Post/);
  assert.match(html, /data-tooltip="/);
  assert.match(html, /assets\/sprites\/terrain\/plain\.png/);
  assert.match(html, /assets\/sprites\/buildings\/neutral\/command\.(png|svg)/);
  assert.match(html, /assets\/sprites\/units\/purple\/grunt/);
  assert.match(html, /data-map-editor-preview-styles="true"/);
  assert.equal((html.match(/Ready To Save/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<dt>Tool<\/dt>/);
  assert.doesNotMatch(html, /<dt>Mirror<\/dt>/);
  assert.doesNotMatch(html, /class="map-editor-meta"/);
  assert.doesNotMatch(html, /Import \/ Save/);
  assert.doesNotMatch(html, /Import JSON/);
  assert.doesNotMatch(html, /Save JSON/);
  assert.doesNotMatch(html, /The map has a valid name, theme, size, terrain, buildings, and placed-unit data/);
  assert.doesNotMatch(html, /Clears terrain, buildings, and units/);
  assert.doesNotMatch(html, /map-editor-header/);
  assert.match(html, /data-action="map-editor-undo"/);
});

test("map editor view exposes reinforcement palette, inspector, and selected tile details", () => {
  const mapData = createBlankMapDefinition({
    id: "reinforcement-view",
    name: "Reinforcement View",
    reinforcements: [
      {
        id: "pursuit-wave",
        name: "Pursuit Wave",
        maxActivations: 3,
        trigger: {
          type: REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED,
          tiles: [{ x: 2, y: 2 }]
        },
        units: [
          {
            id: "pursuit-grunt",
            unitTypeId: "grunt",
            level: 4,
            x: 2,
            y: 2
          }
        ]
      }
    ]
  });
  const state = {
    mapEditor: {
      ...createDefaultMapEditorState(mapData),
      selectedTile: { x: 2, y: 2 }
    }
  };

  const html = renderMapEditorView(state, { openAccordion: "reinforcements" });

  assert.match(html, /data-map-editor-accordion="reinforcements"[\s\S]*?open/);
  assert.match(html, /data-action="map-editor-add-reinforcement-wave"/);
  assert.match(html, /data-action="map-editor-select-reinforcement-wave"/);
  assert.match(html, /data-action="map-editor-select-reinforcement-unit"/);
  assert.match(html, /data-map-editor-field="reinforcementTriggerType"/);
  assert.match(html, /data-map-editor-field="reinforcementMaxActivations"/);
  assert.match(html, /data-map-editor-tool="reinforcement-trigger"/);
  assert.match(html, /Pursuit Wave: Grunt L4/);
  assert.match(html, /Trigger tile for pursuit-wave/);
});

test("map editor view renders history confirmation controls for a pending restore", () => {
  const state = {
    mapEditor: {
      ...createDefaultMapEditorState(createBlankMapDefinition({ id: "history-view", name: "History View" })),
      historyEntries: [
        {
          id: "history-1",
          label: "Map created",
          mapData: createBlankMapDefinition({ id: "history-view", name: "History View" }),
          selectedTile: null
        },
        {
          id: "history-2",
          label: "Paint forest at 2, 2",
          mapData: createBlankMapDefinition({ id: "history-view", name: "History View" }),
          selectedTile: { x: 2, y: 2 }
        }
      ],
      currentHistoryIndex: 1,
      pendingHistoryIndex: 0
    }
  };

  const html = renderMapEditorView(state);

  assert.match(html, /data-action="map-editor-request-history-revert"/);
  assert.match(html, /data-action="map-editor-confirm-history-revert"/);
  assert.match(html, /data-action="map-editor-cancel-history-revert"/);
  assert.match(html, /Go back to this state\?/);
  assert.match(html, /Current state/);
});

test("map editor unit previews follow the configured side colors", () => {
  const mapData = createBlankMapDefinition({
    id: "editor-colors",
    name: "Editor Colors"
  });
  const state = {
    metaState: {
      options: {
        playerColor: "blue",
        enemyColor: "purple"
      }
    },
    mapEditor: {
      ...createDefaultMapEditorState(mapData),
      selectedUnitOwner: TURN_SIDES.ENEMY
    }
  };

  const html = renderMapEditorView(state);

  assert.match(html, /assets\/sprites\/units\/purple\/grunt/);
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

test("map editor view renders the in-game load dialog with list and preview details", () => {
  const state = {
    mapEditor: {
      ...createDefaultMapEditorState(createBlankMapDefinition({ id: "factory-lane-stage-2", name: "Factory Lane" })),
      loadDialogOpen: true,
      loadDialogEntries: [
        {
          relativePath: "crossfire-creek/crossfire-creek-stage-1.json",
          id: "crossfire-creek-stage-1",
          name: "Crossfire Creek",
          variantStage: 1,
          width: 10,
          height: 10,
          goal: { type: "rout" },
          previewMap: {
            width: 10,
            height: 10,
            tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "plain")),
            buildings: []
          }
        },
        {
          relativePath: "crossfire-creek/crossfire-creek-stage-3.json",
          id: "crossfire-creek-stage-3",
          name: "Crossfire Creek",
          variantStage: 3,
          width: 10,
          height: 10,
          goal: { type: "rout" },
          previewMap: {
            width: 10,
            height: 10,
            tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "plain")),
            buildings: []
          }
        }
      ],
      loadDialogSelectedPath: "crossfire-creek/crossfire-creek-stage-1.json"
    }
  };

  const html = renderMapEditorView(state);

  assert.match(html, /map-editor-load-dialog/);
  assert.match(html, /data-map-editor-load-list="true"/);
  assert.match(html, /data-map-editor-load-group="Crossfire Creek"/);
  assert.match(html, /map-editor-load-group__summary/);
  assert.match(html, /2 variants/);
  assert.match(html, /data-action="map-editor-select-load-entry"/);
  assert.match(html, /data-action="map-editor-confirm-load"/);
  assert.match(html, /data-action="map-editor-close-load-dialog"/);
  assert.match(html, /Crossfire Creek/);
  assert.match(html, /crossfire-creek\/crossfire-creek-stage-1\.json/);
  assert.match(html, /crossfire-creek\/crossfire-creek-stage-3\.json/);
  assert.match(html, /Stage 1/);
  assert.match(html, /Stage 3/);
  assert.match(html, /Map layout preview/);
});
