import { MAP_POOL } from "../../game/content/maps.js";
import { getCommanderSliderEntries, renderCommanderCardBody } from "./commanderSelectView.js";

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

function renderCommanderPicker(state, side, title, selectedId) {
  const action = side === "player" ? "select-skirmish-player-commander" : "select-skirmish-enemy-commander";
  const commanderSliderEntries = getCommanderSliderEntries();

  return `
    <section class="skirmish-commander-group">
      <h3>${title}</h3>
      <div class="commander-slider commander-slider--skirmish">
        <button
          class="ghost-button ghost-button--small commander-slider__control commander-slider__control--prev"
          data-action="scroll-skirmish-commanders"
          data-skirmish-side="${side}"
          data-skirmish-direction="-1"
          aria-label="Previous ${title.toLowerCase()} choices"
        >
          <span class="commander-slider__icon" aria-hidden="true">&larr;</span>
        </button>
        <div
          class="commander-grid"
          data-role="skirmish-commander-slider"
          data-skirmish-side="${side}"
        >
          <div class="commander-slider__track">
            ${commanderSliderEntries
              .map(({ commander, realIndex, copyIndex }) => {
              const selected = selectedId === commander.id ? "commander-card--selected" : "";
              const unlocked =
                side === "enemy" || state.metaState.unlockedCommanderIds.includes(commander.id);

              return `
                <button
                  class="commander-card ${selected} ${unlocked ? "" : "commander-card--locked"}"
                  style="--accent:${commander.accent}"
                  data-action="${action}"
                  data-commander-id="${commander.id}"
                  data-slide-index="${realIndex}"
                  data-copy-index="${copyIndex}"
                  aria-disabled="${unlocked ? "false" : "true"}"
                  ${unlocked ? "" : 'tabindex="-1"'}
                >
                  ${renderCommanderCardBody(commander, unlocked)}
                </button>
              `;
            })
            .join("")}
          </div>
        </div>
        <button
          class="ghost-button ghost-button--small commander-slider__control commander-slider__control--next"
          data-action="scroll-skirmish-commanders"
          data-skirmish-side="${side}"
          data-skirmish-direction="1"
          aria-label="Next ${title.toLowerCase()} choices"
        >
          <span class="commander-slider__icon" aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </section>
  `;
}

function renderMapLegend() {
  return `
    <div class="skirmish-map-legend" aria-label="Map preview legend">
      <span class="skirmish-map-legend-item">
        <span class="skirmish-map-tile skirmish-map-tile--player" aria-hidden="true">P</span>
        <span>Player building</span>
      </span>
      <span class="skirmish-map-legend-item">
        <span class="skirmish-map-tile skirmish-map-tile--enemy" aria-hidden="true">E</span>
        <span>Enemy building</span>
      </span>
      <span class="skirmish-map-legend-item">
        <span class="skirmish-map-tile skirmish-map-tile--neutral" aria-hidden="true">N</span>
        <span>Neutral building</span>
      </span>
    </div>
  `;
}

function renderSkirmishCommandersStep(state) {
  return `
    <div class="skirmish-commander-pickers">
      ${renderCommanderPicker(state, "player", "Your Commander", state.skirmishSetup.playerCommanderId)}
      ${renderCommanderPicker(state, "enemy", "Enemy Commander", state.skirmishSetup.enemyCommanderId)}
    </div>

    <div class="panel-footer">
      <div class="footer-meta">
        <span>Choose both commanders before setting the battlefield.</span>
      </div>
      <button class="menu-button" data-action="skirmish-next-step">
        Choose Map
      </button>
    </div>
  `;
}

function renderSkirmishMapStep(state, selectedMap) {
  return `
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
        ${renderMapLegend()}
      </div>
    </div>

    <div class="skirmish-economy-row">
      ${renderEconomyControl("startingFunds", state.skirmishSetup.startingFunds)}
      ${renderEconomyControl("fundsPerBuilding", state.skirmishSetup.fundsPerBuilding)}
    </div>

    <div class="panel-footer">
      <button class="ghost-button" data-action="skirmish-previous-step">Back To Commanders</button>
      <button class="menu-button" data-action="start-skirmish">
        Launch Skirmish
      </button>
    </div>
  `;
}

export function renderSkirmishSetupView(state) {
  const selectedMap = MAP_POOL.find((mapDefinition) => mapDefinition.id === state.skirmishSetup.mapId) ?? MAP_POOL[0];
  const step = state.skirmishSetup.step === "map" ? "map" : "commanders";

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
            <h2>${step === "map" ? "Choose The Battlefield" : "Choose Commanders"}</h2>
            <p>${step === "map" ? "Pick a map and tune the economy." : "Pick your commander and the AI opponent."}</p>
          </div>
          <button class="ghost-button" data-action="back-to-title">Back</button>
        </div>

        ${step === "map" ? renderSkirmishMapStep(state, selectedMap) : renderSkirmishCommandersStep(state)}
      </section>
    </div>
  `;
}
