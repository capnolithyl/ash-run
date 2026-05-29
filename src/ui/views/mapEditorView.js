import { BUILDING_KEYS, TURN_SIDES } from "../../game/core/constants.js";
import { getBuildingTypeMetadata } from "../../game/content/buildings.js";
import {
  getMapEditorRunStageOptions,
  getMapEditorThemeOptions,
  getMapEditorTileDetails,
  getMapEditorValidation,
  MAP_EDITOR_MAX_UNIT_LEVEL,
  MAP_EDITOR_MIRROR_MODES,
  MAP_EDITOR_TOOL_IDS
} from "../../game/content/mapEditor.js";
import {
  getMapGoalLabel,
  getMapGoalSummary,
  getMapGoalTargetBuilding,
  MAP_GOAL_ORDER,
  MAP_GOAL_TYPES
} from "../../game/content/mapGoals.js";
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
        <small>Clears terrain, buildings, and units. Right click does this without changing tools.</small>
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
    return `${unit?.name ?? "Unit"} L${state.mapEditor.selectedUnitLevel ?? 1} (${state.mapEditor.selectedUnitOwner})`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    return TERRAIN_LIBRARY[state.mapEditor.selectedTerrainId]?.label ?? "Terrain";
  }

  return "Eraser";
}

function renderCompactTool(state) {
  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING) {
    return getBuildingTypeMetadata(state.mapEditor.selectedBuildingType).name;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT) {
    const unitName = UNIT_CATALOG[state.mapEditor.selectedUnitTypeId]?.name ?? "Unit";
    return `${unitName} L${state.mapEditor.selectedUnitLevel ?? 1}`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    return TERRAIN_LIBRARY[state.mapEditor.selectedTerrainId]?.label ?? "Terrain";
  }

  return "Eraser";
}

function renderMirrorLabel(mirrorMode) {
  if (!mirrorMode) {
    return "Off";
  }

  return mirrorMode.charAt(0).toUpperCase() + mirrorMode.slice(1);
}

function renderTopCardStat(label, value) {
  return `
    <div class="map-editor-topcard__stat">
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function renderTopCard({
  side,
  eyebrow,
  title,
  summary,
  stats,
  actions = ""
}) {
  return `
    <section class="commander-panel-shell commander-panel-shell--${side} map-editor-topcard-shell">
      <div class="commander-panel commander-panel--${side} map-editor-topcard map-editor-topcard--${side}">
        <div class="map-editor-topcard__body">
          <div class="map-editor-topcard__headline">
            <p class="map-editor-topcard__eyebrow">${eyebrow}</p>
            <h2 class="map-editor-topcard__title" ${side === "player" ? 'data-map-editor-live-name="true"' : ""}>${title}</h2>
            <p class="map-editor-topcard__summary">${summary}</p>
          </div>
          ${
            stats.length
              ? `
                <dl class="map-editor-topcard__stats">
                  ${stats.map(({ label, value }) => renderTopCardStat(label, value)).join("")}
                </dl>
              `
              : ""
          }
          ${actions}
        </div>
      </div>
    </section>
  `;
}

function renderTopPanels(map, validation) {
  const validationHeadline = validation.isValid ? "Ready To Save" : "Needs Attention";
  const validationSummary = validation.isValid
    ? "The map passes validation and can be saved right now."
    : validation.errors[0] ?? "Resolve the remaining validation issues before saving.";

  return `
    <div class="battle-commanders map-editor-commanders" aria-label="Map editor overview">
      ${renderTopCard({
        side: "player",
        eyebrow: "Map Editor",
        title: map.name || "Untitled Map",
        summary: getMapGoalSummary(map.goal, map),
        stats: []
      })}
      ${renderTopCard({
        side: "enemy",
        eyebrow: "Editor Status",
        title: validationHeadline,
        summary: validationSummary,
        stats: [],
        actions: `
          <div class="map-editor-topcard__actions">
            <button
              class="ghost-button ghost-button--small"
              data-action="map-editor-import"
              type="button"
            >
              Load Map
            </button>
            <button
              class="menu-button menu-button--small"
              data-action="map-editor-export"
              type="button"
              ${validation.isValid ? "" : "disabled"}
            >
              Save Map
            </button>
          </div>
        `
      })}
    </div>
  `;
}

function renderTileSummary(tileDetails) {
  if (!tileDetails) {
    return `
      <div class="card-block">
        <p class="eyebrow">Selected Tile</p>
        <p>Select a tile on the battlefield to inspect its terrain, building, and placed unit.</p>
      </div>
    `;
  }

  return `
    <div class="card-block map-editor-tile-card">
      <p class="eyebrow">Selected Tile</p>
      <h3>Tile ${tileDetails.x}, ${tileDetails.y}</h3>
      <p>${tileDetails.terrain?.label ?? "Unknown Terrain"}</p>
      <p>${tileDetails.buildingMetadata ? `${tileDetails.buildingMetadata.name} (${tileDetails.building.owner})` : "No building"}</p>
      <p>${tileDetails.unitMetadata ? `${tileDetails.unitMetadata.name} (${tileDetails.unit.owner}) L${tileDetails.unit.level ?? 1}` : "No unit"}</p>
      ${
        tileDetails.unit
          ? `
            <div class="debug-grid">
              <label>
                <span>Unit Level</span>
                <input
                  type="number"
                  data-map-editor-field="selectedTileUnitLevel"
                  value="${tileDetails.unit.level ?? 1}"
                  min="1"
                  max="${MAP_EDITOR_MAX_UNIT_LEVEL}"
                />
              </label>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderRunSetupSection(map) {
  const variantStage = Number(map.variantStage) || 1;

  return `
    <div class="card-block">
      <p class="eyebrow">Run Variant</p>
      <p>Each map save now belongs to exactly one run stage.</p>
      <div class="map-editor-owner-row" aria-label="Run stage">
        ${getMapEditorRunStageOptions().map((stage) => `
          <button
            class="ghost-button ghost-button--small map-editor-chip ${variantStage === stage ? "map-editor-chip--active" : ""}"
            data-action="map-editor-set-variant-stage"
            data-variant-stage="${stage}"
            type="button"
          >
            Stage ${stage}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderHistorySection(state) {
  const historyEntries = state.mapEditor.historyEntries ?? [];
  const currentHistoryIndex = Number(state.mapEditor.currentHistoryIndex ?? -1);
  const pendingHistoryIndex = Number.isInteger(state.mapEditor.pendingHistoryIndex)
    ? state.mapEditor.pendingHistoryIndex
    : null;
  const canUndo = currentHistoryIndex > 0;

  return `
    <div class="card-block">
      <div class="map-editor-history__header">
        <div>
          <p class="eyebrow">History</p>
          <p class="map-editor-history__copy">Undo the latest edit or jump back to an earlier state.</p>
        </div>
        <button
          class="ghost-button ghost-button--small"
          data-action="map-editor-undo"
          type="button"
          ${canUndo ? "" : "disabled"}
        >
          Undo
        </button>
      </div>
      <div class="map-editor-history__list" aria-label="Map edit history">
        ${historyEntries
          .map((entry, index) => {
            const isCurrent = index === currentHistoryIndex;
            const isPending = index === pendingHistoryIndex;

            return `
              <div class="map-editor-history__item${isCurrent ? " map-editor-history__item--current" : ""}${isPending ? " map-editor-history__item--pending" : ""}">
                <button
                  class="ghost-button ghost-button--small map-editor-history__button"
                  data-action="map-editor-request-history-revert"
                  data-history-index="${index}"
                  type="button"
                  ${isCurrent ? "disabled" : ""}
                >
                  <strong>${entry.label}</strong>
                  <small>${isCurrent ? "Current state" : `Step ${index + 1}`}</small>
                </button>
                ${
                  isPending && !isCurrent
                    ? `
                      <div class="map-editor-history__confirm">
                        <p>Go back to this state?</p>
                        <div class="map-editor-inline-actions">
                          <button
                            class="menu-button menu-button--small"
                            data-action="map-editor-confirm-history-revert"
                            type="button"
                          >
                            Confirm
                          </button>
                          <button
                            class="ghost-button ghost-button--small"
                            data-action="map-editor-cancel-history-revert"
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    `
                    : ""
                }
              </div>
            `;
          })
          .reverse()
          .join("")}
      </div>
    </div>
  `;
}

function renderGoalSection(map, tileDetails) {
  const goal = map.goal;
  const targetBuilding = getMapGoalTargetBuilding(map, goal);
  const selectedBuilding = tileDetails?.building ?? null;
  const canUseSelectedBuilding =
    Boolean(selectedBuilding) &&
    (goal.type === MAP_GOAL_TYPES.RESCUE || goal.type === MAP_GOAL_TYPES.DEFEND);

  return `
    <div class="card-block">
      <p class="eyebrow">Goal</p>
      <div class="debug-grid">
        <label>
          <span>Type</span>
          <select data-map-editor-field="goalType">
            ${MAP_GOAL_ORDER.map(
              (goalType) => `
                <option value="${goalType}" ${goal.type === goalType ? "selected" : ""}>
                  ${getMapGoalLabel(goalType)}
                </option>
              `
            ).join("")}
          </select>
        </label>
        ${
          goal.type === MAP_GOAL_TYPES.DEFEND || goal.type === MAP_GOAL_TYPES.SURVIVE
            ? `
              <label>
                <span>Turns</span>
                <input
                  type="number"
                  data-map-editor-field="goalTurnLimit"
                  value="${goal.turnLimit ?? ""}"
                  min="1"
                  max="99"
                />
              </label>
            `
            : ""
        }
      </div>
      <p>${getMapGoalSummary(goal, map)}</p>
      ${
        goal.type === MAP_GOAL_TYPES.RESCUE || goal.type === MAP_GOAL_TYPES.DEFEND
          ? `
            <p><strong>Target</strong> ${targetBuilding ? `${targetBuilding.id} (${targetBuilding.x}, ${targetBuilding.y})` : "No building selected"}</p>
            <div class="map-editor-inline-actions">
              <button
                class="ghost-button ghost-button--small"
                data-action="map-editor-goal-use-selected-building"
                type="button"
                ${canUseSelectedBuilding ? "" : "disabled"}
              >
                Use Selected Building
              </button>
              <button
                class="ghost-button ghost-button--small"
                data-action="map-editor-goal-clear-target"
                type="button"
                ${targetBuilding ? "" : "disabled"}
              >
                Clear Target
              </button>
            </div>
            <p>${selectedBuilding ? `Selected building: ${selectedBuilding.id}` : "Select a building tile, then click Use Selected Building."}</p>
          `
          : ""
      }
    </div>
  `;
}

function renderFooterMeta(map, goalLabel, toolLabel, mirrorLabel) {
  return `
    <div class="battle-footer-meta map-editor-footer-meta" aria-label="Map editor summary">
      <div class="battle-footer-meta__item">
        <strong>Map</strong>
        <em>${map.name || "Untitled Map"}</em>
      </div>
      <div class="battle-footer-meta__item">
        <strong>Goal</strong>
        <em>${goalLabel}</em>
      </div>
      <div class="battle-footer-meta__item">
        <strong>Tool</strong>
        <em>${toolLabel}</em>
      </div>
      <div class="battle-footer-meta__item">
        <strong>Mirror</strong>
        <em>${mirrorLabel}</em>
      </div>
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
  const goalLabel = getMapGoalLabel(map.goal);
  const footerTool = renderCompactTool(state);
  const mirrorLabel = renderMirrorLabel(state.mapEditor.mirrorMode);

  return `
    <div class="battle-shell map-editor-shell" data-screen-id="map-editor">
      <input class="battle-drawer-toggle" id="battle-intel-drawer" type="checkbox" aria-hidden="true" />
      <input class="battle-drawer-toggle" id="battle-command-drawer" type="checkbox" aria-hidden="true" />

      ${renderTopPanels(map, validation)}

      <aside class="battle-rail battle-rail--left map-editor-rail" data-map-editor-rail="left">
        <div class="battle-drawer-header">
          <span>Palette</span>
          <label class="ghost-button ghost-button--small" for="battle-intel-drawer">Close</label>
        </div>

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.TERRAIN,
          "Terrain",
          "Click or drag to paint. Right click erases to plains.",
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
            <div class="debug-grid">
              <label>
                <span>Level</span>
                <input
                  type="number"
                  data-map-editor-field="selectedUnitLevel"
                  value="${state.mapEditor.selectedUnitLevel ?? 1}"
                  min="1"
                  max="${MAP_EDITOR_MAX_UNIT_LEVEL}"
                />
              </label>
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

        ${renderRunSetupSection(map)}
        ${renderHistorySection(state)}
        ${renderGoalSection(map, tileDetails)}
        ${renderTileSummary(tileDetails)}
      </aside>

      ${renderFooterMeta(map, goalLabel, footerTool, mirrorLabel)}

      <div class="map-editor-footer-controls" aria-label="Map editor controls">
        <label
          class="ghost-button ghost-button--small map-editor-footer-controls__drawer"
          for="battle-intel-drawer"
        >
          Palette
        </label>
        <button
          class="ghost-button ghost-button--small map-editor-footer-controls__button map-editor-footer-controls__button--secondary"
          data-action="map-editor-new"
          type="button"
        >
          New Map
        </button>
        <button
          class="ghost-button ghost-button--small map-editor-footer-controls__button map-editor-footer-controls__button--secondary"
          data-action="back-to-title"
          type="button"
        >
          Back
        </button>
        <label
          class="ghost-button ghost-button--small map-editor-footer-controls__drawer"
          for="battle-command-drawer"
        >
          Inspector
        </label>
      </div>

      <input id="map-editor-import" type="file" data-action="map-editor-import" accept="application/json" />
    </div>
  `;
}
