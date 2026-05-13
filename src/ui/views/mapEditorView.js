import { BUILDING_KEYS, TURN_SIDES } from "../../game/core/constants.js";
import { getBuildingTypeMetadata } from "../../game/content/buildings.js";
import {
  getMapEditorThemeOptions,
  getMapEditorTileDetails,
  getMapEditorValidation,
  MAP_EDITOR_MIRROR_MODES,
  MAP_EDITOR_TOOL_IDS
} from "../../game/content/mapEditor.js";
import { MAP_THEME_PALETTES, TERRAIN_LIBRARY } from "../../game/content/terrain.js";
import { UNIT_CATALOG } from "../../game/content/unitCatalog.js";

const MAP_EDITOR_ACCORDION_IDS = {
  TERRAIN: "terrain",
  BUILDINGS: "buildings",
  UNITS: "units",
  MIRROR: "mirror"
};

function renderAccordion(sectionId, title, subtitle, content, openAccordion) {
  const isOpen = openAccordion === sectionId;

  return `
    <details
      class="debug-section"
      data-map-editor-accordion="${sectionId}"
      name="map-editor-accordion"
      ${isOpen ? "open" : ""}
    >
      <summary data-map-editor-accordion-summary="${sectionId}">
        <span>
          <strong>${title}</strong>
          <small>${subtitle}</small>
        </span>
      </summary>
      <div class="map-editor-accordion__content">
        <div class="map-editor-accordion__inner">
          ${content}
        </div>
      </div>
    </details>
  `;
}

function renderTerrainTools(state) {
  return Object.entries(TERRAIN_LIBRARY)
    .map(([terrainId, terrain]) => {
      const isActive =
        state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN &&
        state.mapEditor.selectedTerrainId === terrainId;

      return `
        <button
          class="ghost-button ghost-button--small map-editor-tool ${isActive ? "map-editor-tool--active" : ""}"
          data-action="map-editor-select-terrain"
          data-terrain-id="${terrainId}"
          type="button"
        >
          <span class="map-editor-tool__swatch map-editor-tool__swatch--terrain" style="--swatch:${terrain.color};"></span>
          <span class="map-editor-tool__copy">
            <strong>${terrain.label}</strong>
            <small>${terrainId}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderBuildingTools(state) {
  return Object.values(BUILDING_KEYS)
    .map((buildingType) => {
      const metadata = getBuildingTypeMetadata(buildingType);
      const isActive =
        state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING &&
        state.mapEditor.selectedBuildingType === buildingType;

      return `
        <button
          class="ghost-button ghost-button--small map-editor-tool ${isActive ? "map-editor-tool--active" : ""}"
          data-action="map-editor-select-building"
          data-building-type="${buildingType}"
          type="button"
        >
          <span class="map-editor-tool__swatch map-editor-tool__swatch--building">${metadata.shortLabel}</span>
          <span class="map-editor-tool__copy">
            <strong>${metadata.name}</strong>
            <small>${metadata.summary}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderUnitTools(state) {
  return Object.values(UNIT_CATALOG)
    .map((unit) => {
      const isActive =
        state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT &&
        state.mapEditor.selectedUnitTypeId === unit.id;

      return `
        <button
          class="ghost-button ghost-button--small map-editor-tool map-editor-tool--unit ${isActive ? "map-editor-tool--active" : ""}"
          data-action="map-editor-select-unit"
          data-unit-type-id="${unit.id}"
          type="button"
        >
          <span class="map-editor-tool__swatch map-editor-tool__swatch--unit">${unit.name.slice(0, 3).toUpperCase()}</span>
          <span class="map-editor-tool__copy">
            <strong>${unit.name}</strong>
            <small>${unit.family} - ${unit.minRange}-${unit.maxRange} rng - ${unit.movement} move</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderEraserTool(state) {
  const isActive = state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.ERASER;

  return `
    <button
      class="ghost-button ghost-button--small map-editor-tool ${isActive ? "map-editor-tool--active" : ""}"
      data-action="map-editor-select-tool"
      data-map-editor-tool="${MAP_EDITOR_TOOL_IDS.ERASER}"
      type="button"
    >
      <span class="map-editor-tool__swatch map-editor-tool__swatch--marker">X</span>
      <span class="map-editor-tool__copy">
        <strong>Eraser</strong>
        <small>Clears terrain, buildings, and units from mirrored tiles too.</small>
      </span>
    </button>
  `;
}

function renderOwnerButtons(selectedOwner, action, dataAttribute, owners) {
  return owners
    .map((owner) => `
      <button
        class="ghost-button ghost-button--small map-editor-chip map-editor-chip--${owner} ${selectedOwner === owner ? "map-editor-chip--active" : ""}"
        data-action="${action}"
        ${dataAttribute}="${owner}"
        type="button"
      >
        ${owner}
      </button>
    `)
    .join("");
}

function renderMirrorButtons(state) {
  const descriptions = {
    [MAP_EDITOR_MIRROR_MODES.OFF]: "Single cursor",
    [MAP_EDITOR_MIRROR_MODES.VERTICAL]: "Left <-> right",
    [MAP_EDITOR_MIRROR_MODES.HORIZONTAL]: "Top <-> bottom",
    [MAP_EDITOR_MIRROR_MODES.DIAGONAL]: "Top-left diagonal"
  };

  return Object.values(MAP_EDITOR_MIRROR_MODES)
    .map((mirrorMode) => {
      const isActive = state.mapEditor.mirrorMode === mirrorMode;
      return `
        <button
          class="ghost-button ghost-button--small map-editor-mirror ${isActive ? "map-editor-mirror--active" : ""}"
          data-action="map-editor-set-mirror-mode"
          data-mirror-mode="${mirrorMode}"
          type="button"
        >
          <strong>${mirrorMode}</strong>
          <small>${descriptions[mirrorMode]}</small>
        </button>
      `;
    })
    .join("");
}

function renderActiveTool(state) {
  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING) {
    const metadata = getBuildingTypeMetadata(state.mapEditor.selectedBuildingType);
    return `${metadata.name} (${state.mapEditor.selectedBuildingOwner})`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT) {
    const unit = UNIT_CATALOG[state.mapEditor.selectedUnitTypeId];
    return `${unit?.name ?? "Unit"} (${state.mapEditor.selectedUnitOwner})`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    return TERRAIN_LIBRARY[state.mapEditor.selectedTerrainId]?.label ?? "Terrain";
  }

  return "Eraser";
}

function renderTileSummary(tileDetails) {
  if (!tileDetails) {
    return `
      <div class="card-block">
        <p>Select a tile on the battlefield to inspect its terrain, building, and placed unit.</p>
      </div>
    `;
  }

  return `
    <div class="card-block map-editor-tile-card">
      <p class="eyebrow">Tile ${tileDetails.x}, ${tileDetails.y}</p>
      <h3>${tileDetails.terrain?.label ?? "Unknown Terrain"}</h3>
      <p>${tileDetails.buildingMetadata ? `${tileDetails.buildingMetadata.name} (${tileDetails.building.owner})` : "No building"}</p>
      <p>${tileDetails.unitMetadata ? `${tileDetails.unitMetadata.name} (${tileDetails.unit.owner})` : "No unit"}</p>
    </div>
  `;
}

function renderValidationCard(validation) {
  if (validation.isValid) {
    return `
      <div class="card-block map-editor-validation map-editor-validation--valid">
        <strong>Ready To Save</strong>
        <p>The map has a valid name, derived ID, theme, size, terrain, buildings, and placed-unit data.</p>
      </div>
    `;
  }

  return `
    <div class="card-block map-editor-validation map-editor-validation--invalid">
      <strong>Needs Attention</strong>
      <ul class="map-editor-validation__list">
        ${validation.errors.map((error) => `<li>${error}</li>`).join("")}
      </ul>
    </div>
  `;
}

export function renderMapEditorView(state, uiState = {}) {
  const map = state.mapEditor?.mapData;

  if (!map) {
    return `<div class="screen"><section class="panel"><p>No map loaded.</p></section></div>`;
  }

  const openAccordion = uiState.openAccordion ?? null;
  const validation = getMapEditorValidation(map);
  const tileDetails = getMapEditorTileDetails(map, state.mapEditor.selectedTile);

  return `
    <div class="battle-shell map-editor-shell" data-screen-id="map-editor">
      <input class="battle-drawer-toggle" id="battle-intel-drawer" type="checkbox" aria-hidden="true" />
      <input class="battle-drawer-toggle" id="battle-command-drawer" type="checkbox" aria-hidden="true" />

      <section class="map-editor-header card-block">
        <div class="map-editor-header__copy">
          <p class="eyebrow">Map Editor</p>
          <h2>${map.name || "Untitled Map"}</h2>
          <p>Paint terrain, place structures and armies, mirror your work, and download a repo-ready JSON map.</p>
        </div>
        <div class="map-editor-header__meta">
          <span><strong>Theme</strong> ${map.theme}</span>
          <span><strong>Size</strong> ${map.width} x ${map.height}</span>
          <span><strong>Tool</strong> ${renderActiveTool(state)}</span>
          <span><strong>Mirror</strong> ${state.mapEditor.mirrorMode}</span>
        </div>
        <div class="map-editor-header__actions">
          <button class="ghost-button ghost-button--small" data-action="map-editor-new" type="button">New Map</button>
          <button class="ghost-button ghost-button--small" data-action="back-to-title" type="button">Back</button>
        </div>
      </section>

      <aside class="battle-rail battle-rail--left map-editor-rail" data-map-editor-rail="left">
        <div class="battle-drawer-header">
          <span>Palette</span>
          <label class="ghost-button ghost-button--small" for="battle-intel-drawer">Close</label>
        </div>

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.TERRAIN,
          "Terrain",
          "Choose a tile, then click or drag to paint.",
          `
            <div class="map-editor-tool-grid">
              ${renderTerrainTools(state)}
            </div>
          `,
          openAccordion
        )}

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.BUILDINGS,
          "Buildings",
          "Player, enemy, and neutral versions of every building.",
          `
            <div class="map-editor-owner-row">
              ${renderOwnerButtons(
                state.mapEditor.selectedBuildingOwner,
                "map-editor-select-building-owner",
                "data-building-owner",
                [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY, "neutral"]
              )}
            </div>
            <div class="map-editor-tool-grid">
              ${renderBuildingTools(state)}
            </div>
          `,
          openAccordion
        )}

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.UNITS,
          "Units",
          "Place starting armies directly for either side.",
          `
            <div class="map-editor-owner-row">
              ${renderOwnerButtons(
                state.mapEditor.selectedUnitOwner,
                "map-editor-select-unit-owner",
                "data-unit-owner",
                [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]
              )}
            </div>
            <div class="map-editor-tool-grid map-editor-tool-grid--units" data-map-editor-scroll="units">
              ${renderUnitTools(state)}
            </div>
          `,
          openAccordion
        )}

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.MIRROR,
          "Mirror + Cleanup",
          "The cyan cursor shows where mirrored edits will land.",
          `
            <div class="map-editor-mirror-grid">
              ${renderMirrorButtons(state)}
            </div>
            <div class="map-editor-tool-grid">
              ${renderEraserTool(state)}
            </div>
          `,
          openAccordion
        )}
      </aside>

      <aside class="battle-rail battle-rail--right map-editor-rail" data-map-editor-rail="right">
        <div class="battle-drawer-header">
          <span>Inspector</span>
          <label class="ghost-button ghost-button--small" for="battle-command-drawer">Close</label>
        </div>

        <div class="card-block">
          <p class="eyebrow">Map Details</p>
          <div class="debug-grid">
            <label>
              <span>Name</span>
              <input
                type="text"
                data-map-editor-field="name"
                value="${map.name}"
                maxlength="60"
              />
            </label>
            <label>
              <span>Derived ID</span>
              <input
                type="text"
                data-map-editor-derived-id
                value="${map.id}"
                readonly
                aria-readonly="true"
                tabindex="-1"
              />
            </label>
            <label>
              <span>Width</span>
              <input
                type="number"
                data-map-editor-field="width"
                value="${map.width}"
                min="6"
                max="32"
              />
            </label>
            <label>
              <span>Height</span>
              <input
                type="number"
                data-map-editor-field="height"
                value="${map.height}"
                min="6"
                max="32"
              />
            </label>
            <label>
              <span>Theme</span>
              <select data-map-editor-field="theme">
                ${getMapEditorThemeOptions()
                  .map(
                    (theme) => `
                      <option value="${theme}" ${map.theme === theme ? "selected" : ""}>
                        ${theme} (${MAP_THEME_PALETTES[theme].accent})
                      </option>
                    `
                  )
                  .join("")}
              </select>
            </label>
          </div>
        </div>

        ${renderTileSummary(tileDetails)}
        ${renderValidationCard(validation)}

        <div class="card-block">
          <p class="eyebrow">Import / Save</p>
          <p>Import an existing JSON map, or save the current one when validation passes.</p>
          <div class="map-editor-import-row">
            <label class="ghost-button ghost-button--small" for="map-editor-import">Import JSON</label>
            <input id="map-editor-import" type="file" data-action="map-editor-import" accept="application/json" />
          </div>
        </div>
      </aside>

      <div class="battle-footer-actions map-editor-footer-actions" aria-label="Map editor controls">
        <label
          class="ghost-button ghost-button--small battle-footer-button battle-footer-button--intel battle-drawer-button"
          for="battle-intel-drawer"
        >
          Palette
        </label>
        <button
          class="menu-button menu-button--small battle-footer-button battle-footer-button--next"
          data-action="map-editor-export"
          type="button"
          ${validation.isValid ? "" : "disabled"}
        >
          Save JSON
        </button>
        <label
          class="ghost-button ghost-button--small battle-footer-button battle-footer-button--feed battle-drawer-button"
          for="battle-command-drawer"
        >
          Inspector
        </label>
      </div>
    </div>
  `;
}
