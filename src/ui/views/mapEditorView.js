import { getBuildingTypeMetadata } from "../../game/content/buildings.js";
import {
  getMapEditorThemeOptions,
  getMapEditorTileDetails,
  getMapEditorValidation,
  MAP_EDITOR_TOOL_IDS
} from "../../game/content/mapEditor.js";
import { MAP_THEME_PALETTES, TERRAIN_LIBRARY } from "../../game/content/terrain.js";

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
  const buildingTypes = [
    "command",
    "barracks",
    "motor-pool",
    "airfield",
    "sector",
    "hospital",
    "repair-station"
  ];

  return buildingTypes
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

function renderMarkerTools(state) {
  const markerTools = [
    {
      toolId: MAP_EDITOR_TOOL_IDS.PLAYER_SPAWN,
      label: "Player Spawn",
      summary: "Adds a player deployment point.",
      badge: "P"
    },
    {
      toolId: MAP_EDITOR_TOOL_IDS.ENEMY_SPAWN,
      label: "Enemy Spawn",
      summary: "Adds an enemy deployment point.",
      badge: "E"
    },
    {
      toolId: MAP_EDITOR_TOOL_IDS.ERASER,
      label: "Eraser",
      summary: "Clears the tile to plain terrain.",
      badge: "X"
    }
  ];

  return markerTools
    .map((tool) => {
      const isActive = state.mapEditor.selectedTool === tool.toolId;

      return `
        <button
          class="ghost-button ghost-button--small map-editor-tool ${isActive ? "map-editor-tool--active" : ""}"
          data-action="map-editor-select-tool"
          data-map-editor-tool="${tool.toolId}"
          type="button"
        >
          <span class="map-editor-tool__swatch map-editor-tool__swatch--marker">${tool.badge}</span>
          <span class="map-editor-tool__copy">
            <strong>${tool.label}</strong>
            <small>${tool.summary}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderOwnerButtons(selectedOwner) {
  return ["player", "enemy", "neutral"]
    .map((owner) => `
      <button
        class="ghost-button ghost-button--small map-editor-chip ${selectedOwner === owner ? "map-editor-chip--active" : ""}"
        data-action="map-editor-select-building-owner"
        data-building-owner="${owner}"
        type="button"
      >
        ${owner}
      </button>
    `)
    .join("");
}

function renderActiveTool(state) {
  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING) {
    const metadata = getBuildingTypeMetadata(state.mapEditor.selectedBuildingType);
    return `${metadata.name} (${state.mapEditor.selectedBuildingOwner})`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    return TERRAIN_LIBRARY[state.mapEditor.selectedTerrainId]?.label ?? "Terrain";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.PLAYER_SPAWN) {
    return "Player Spawn";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.ENEMY_SPAWN) {
    return "Enemy Spawn";
  }

  return "Eraser";
}

function renderTileSummary(tileDetails) {
  if (!tileDetails) {
    return `
      <div class="card-block">
        <p>Select a tile on the battlefield to inspect its terrain, building, and spawn markers.</p>
      </div>
    `;
  }

  const spawnBadges = [
    tileDetails.hasPlayerSpawn ? "Player Spawn" : null,
    tileDetails.hasEnemySpawn ? "Enemy Spawn" : null
  ].filter(Boolean);

  return `
    <div class="card-block">
      <p class="eyebrow">Tile ${tileDetails.x}, ${tileDetails.y}</p>
      <h3>${tileDetails.terrain?.label ?? "Unknown Terrain"}</h3>
      <p>${tileDetails.buildingMetadata ? `${tileDetails.buildingMetadata.name} (${tileDetails.building.owner})` : "No building"}</p>
      <p>${spawnBadges.length > 0 ? spawnBadges.join(" / ") : "No spawn markers"}</p>
    </div>
  `;
}

function renderValidationCard(validation) {
  if (validation.isValid) {
    return `
      <div class="card-block map-editor-validation map-editor-validation--valid">
        <strong>Ready To Save</strong>
        <p>The map has a valid ID, name, theme, and deployment points for both sides.</p>
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

export function renderMapEditorView(state) {
  const map = state.mapEditor?.mapData;

  if (!map) {
    return `<div class="screen"><section class="panel"><p>No map loaded.</p></section></div>`;
  }

  const validation = getMapEditorValidation(map);
  const tileDetails = getMapEditorTileDetails(map, state.mapEditor.selectedTile);

  return `
    <div class="battle-shell map-editor-shell">
      <input class="battle-drawer-toggle" id="battle-intel-drawer" type="checkbox" aria-hidden="true" />
      <input class="battle-drawer-toggle" id="battle-command-drawer" type="checkbox" aria-hidden="true" />

      <section class="map-editor-header card-block">
        <div class="map-editor-header__copy">
          <p class="eyebrow">Map Editor</p>
          <h2>${map.name || "Untitled Map"}</h2>
          <p>Paint terrain, place structures, add spawn points, and download the result as a repo-ready JSON map.</p>
        </div>
        <div class="map-editor-header__meta">
          <span><strong>Theme</strong> ${map.theme}</span>
          <span><strong>Size</strong> ${map.width} x ${map.height}</span>
          <span><strong>Tool</strong> ${renderActiveTool(state)}</span>
        </div>
        <div class="map-editor-header__actions">
          <button class="ghost-button ghost-button--small" data-action="map-editor-new" type="button">New Map</button>
          <button class="ghost-button ghost-button--small" data-action="back-to-title" type="button">Back</button>
        </div>
      </section>

      <aside class="battle-rail battle-rail--left map-editor-rail">
        <div class="battle-drawer-header">
          <span>Palette</span>
          <label class="ghost-button ghost-button--small" for="battle-intel-drawer">Close</label>
        </div>

        <details class="debug-section" open>
          <summary>
            <span>
              <strong>Terrain</strong>
              <small>Choose a terrain tile, then click or drag across the map.</small>
            </span>
          </summary>
          <div class="map-editor-tool-grid">
            ${renderTerrainTools(state)}
          </div>
        </details>

        <details class="debug-section" open>
          <summary>
            <span>
              <strong>Buildings</strong>
              <small>Pick an owner and place one structure per tile.</small>
            </span>
          </summary>
          <div class="map-editor-owner-row">
            ${renderOwnerButtons(state.mapEditor.selectedBuildingOwner)}
          </div>
          <div class="map-editor-tool-grid">
            ${renderBuildingTools(state)}
          </div>
        </details>

        <details class="debug-section" open>
          <summary>
            <span>
              <strong>Markers</strong>
              <small>Add deployment points or erase a tile back to plain.</small>
            </span>
          </summary>
          <div class="map-editor-tool-grid">
            ${renderMarkerTools(state)}
          </div>
        </details>
      </aside>

      <aside class="battle-rail battle-rail--right map-editor-rail">
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
              <span>ID</span>
              <input
                type="text"
                data-map-editor-field="id"
                value="${map.id}"
                maxlength="60"
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
