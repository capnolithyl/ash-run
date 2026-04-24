import { MAP_POOL } from "../../game/content/maps.js";
import { COMMANDERS } from "../../game/content/commanders.js";
import { renderCommanderCardBody } from "./commanderSelectView.js";

const TERRAIN_PREVIEW_KEYS = {
  plain: ".",
  road: "=",
  forest: "F",
  mountain: "^",
  water: "~",
  ridge: "#"
};

const ECONOMY_CONTROLS = {
  startingFunds: {
    label: "Starting Funds",
    min: 0,
    max: 5000,
    step: 100
  },
  fundsPerBuilding: {
    label: "Funds Per Building",
    min: 0,
    max: 500,
    step: 50
  }
};

function getBuildingPreviewOwner(building) {
  if (building?.owner === "player") {
    return "player";
  }

  if (building?.owner === "enemy") {
    return "enemy";
  }

  if (building?.owner === "neutral") {
    return "neutral";
  }

  return null;
}

function renderMapPreview(mapDefinition) {
  if (!mapDefinition) {
    return "";
  }

  const buildingLookup = new Map(
    mapDefinition.buildings.map((building) => [`${building.x},${building.y}`, building])
  );

  const tiles = mapDefinition.tiles
    .map((row, y) =>
      row
        .map((tileKey, x) => {
          const building = buildingLookup.get(`${x},${y}`);
          const owner = getBuildingPreviewOwner(building);
          const terrainKey = TERRAIN_PREVIEW_KEYS[tileKey] ? tileKey : "plain";
          const marker = owner ? owner[0].toUpperCase() : TERRAIN_PREVIEW_KEYS[tileKey] ?? ".";

          return `
            <span
              class="skirmish-map-tile skirmish-map-tile--${terrainKey} ${owner ? `skirmish-map-tile--${owner}` : ""}"
              aria-label="${owner ? `${owner} building` : tileKey}"
            >${marker}</span>
          `;
        })
        .join("")
    )
    .join("");

  return `
    <div
      class="skirmish-map-grid"
      style="--map-columns:${mapDefinition.width}; --map-rows:${mapDefinition.height};"
      role="img"
      aria-label="${mapDefinition.name} layout preview"
    >
      ${tiles}
    </div>
  `;
}

function renderEconomyControl(field, value) {
  const control = ECONOMY_CONTROLS[field];

  return `
    <label class="skirmish-economy-control">
      <span class="skirmish-economy-control__header">
        <span>${control.label}</span>
        <strong data-skirmish-output="${field}">${value}</strong>
      </span>
      <input
        type="range"
        min="${control.min}"
        max="${control.max}"
        step="${control.step}"
        data-skirmish-field="${field}"
        value="${value}"
      />
    </label>
  `;
}

function renderCommanderPicker(state, side, title, commanders, selectedId) {
  const action = side === "player" ? "select-skirmish-player-commander" : "select-skirmish-enemy-commander";

  return `
    <section class="skirmish-commander-group">
      <h3>${title}</h3>
      <div class="skirmish-commander-grid">
        ${commanders
          .map((commander) => {
            const selected = selectedId === commander.id ? "commander-card--selected" : "";
            const unlocked =
              side === "enemy" || state.metaState.unlockedCommanderIds.includes(commander.id);

            return `
              <button
                class="commander-card ${selected} ${unlocked ? "" : "commander-card--locked"}"
                style="--accent:${commander.accent}"
                data-action="${action}"
                data-commander-id="${commander.id}"
                ${unlocked ? "" : "disabled"}
              >
                ${renderCommanderCardBody(commander, unlocked)}
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

export function renderSkirmishSetupView(state) {
  const selectedMap = MAP_POOL.find((mapDefinition) => mapDefinition.id === state.skirmishSetup.mapId) ?? MAP_POOL[0];

  return `
    <div class="screen screen--commander" data-screen-id="skirmish-setup">
      <div class="title-scene commander-scene" aria-hidden="true">
        <div class="title-scene__stars"></div>
        <div class="title-scene__sun"></div>
        <div class="title-scene__orb title-scene__orb--one"></div>
        <div class="title-scene__orb title-scene__orb--two"></div>
        <div class="title-scene__haze"></div>
        <div class="title-scene__mountains title-scene__mountains--far"></div>
        <div class="title-scene__mountains title-scene__mountains--near"></div>
        <div class="title-scene__grid"></div>
      </div>
      <section class="panel panel--wide panel--static commander-select-panel skirmish-panel">
        <div class="panel-header panel-header--commander">
          <div class="commander-select-heading">
            <p class="eyebrow">Skirmish</p>
            <h2>Build A One-Off Battle</h2>
            <p>Pick commanders, map, and economy settings.</p>
          </div>
          <button class="ghost-button" data-action="back-to-title">Back</button>
        </div>

        <div class="skirmish-commander-pickers">
          ${renderCommanderPicker(state, "player", "Your Commander", COMMANDERS, state.skirmishSetup.playerCommanderId)}
          ${renderCommanderPicker(state, "enemy", "Enemy Commander", COMMANDERS, state.skirmishSetup.enemyCommanderId)}
        </div>

        <div class="skirmish-map-layout">
          <div class="skirmish-map-list" role="listbox" aria-label="Skirmish map list">
            ${MAP_POOL.map((mapDefinition) => {
              const isSelected = mapDefinition.id === state.skirmishSetup.mapId;
              const selected = isSelected ? "skirmish-map-option--active" : "";
              return `
                <button
                  class="skirmish-map-option ${selected}"
                  data-action="select-skirmish-map"
                  data-map-id="${mapDefinition.id}"
                  role="option"
                  aria-selected="${isSelected ? "true" : "false"}"
                >
                  <span>${mapDefinition.name}</span>
                  <small>${mapDefinition.width}x${mapDefinition.height}</small>
                </button>
              `;
            }).join("")}
          </div>
          <div class="skirmish-map-preview">
            <p class="eyebrow">Map Preview</p>
            <h3>${selectedMap.name}</h3>
            ${renderMapPreview(selectedMap)}
            <p class="skirmish-map-legend">P/E/N = player/enemy/neutral buildings.</p>
          </div>
        </div>

        <div class="skirmish-economy-row">
          ${renderEconomyControl("startingFunds", state.skirmishSetup.startingFunds)}
          ${renderEconomyControl("fundsPerBuilding", state.skirmishSetup.fundsPerBuilding)}
        </div>

        <div class="panel-footer">
          <div class="footer-meta">
            <span>Skirmish battles do not affect run progression.</span>
          </div>
          <button class="menu-button" data-action="start-skirmish">
            Launch Skirmish
          </button>
        </div>
      </section>
    </div>
  `;
}
