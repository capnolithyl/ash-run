import { MAP_POOL } from "../../game/content/maps.js";
import { COMMANDERS } from "../../game/content/commanders.js";
import { renderCommanderCardBody } from "./commanderSelectView.js";

const TERRAIN_PREVIEW_KEYS = {
  plain: "·",
  road: "═",
  forest: "▦",
  mountain: "▲",
  water: "~",
  ridge: "▮"
};

function renderMapPreview(mapDefinition) {
  if (!mapDefinition) {
    return "";
  }

  const buildingLookup = new Map(
    mapDefinition.buildings.map((building) => [`${building.x},${building.y}`, building])
  );

  return mapDefinition.tiles
    .map((row, y) =>
      row
        .map((tileKey, x) => {
          const building = buildingLookup.get(`${x},${y}`);

          if (building?.owner === "player") {
            return "P";
          }

          if (building?.owner === "enemy") {
            return "E";
          }

          if (building?.owner === "neutral") {
            return "N";
          }

          return TERRAIN_PREVIEW_KEYS[tileKey] ?? "·";
        })
        .join("")
    )
    .join("\n");
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
              const selected = mapDefinition.id === state.skirmishSetup.mapId ? "slot-card--active" : "";
              return `
                <button class="slot-card ${selected}" data-action="select-skirmish-map" data-map-id="${mapDefinition.id}">
                  <span>${mapDefinition.name}</span>
                  <small>${mapDefinition.width}×${mapDefinition.height}</small>
                </button>
              `;
            }).join("")}
          </div>
          <div class="skirmish-map-preview">
            <p class="eyebrow">Map Preview</p>
            <h3>${selectedMap.name}</h3>
            <pre>${renderMapPreview(selectedMap)}</pre>
            <p class="skirmish-map-legend">P/E/N = player/enemy/neutral buildings.</p>
          </div>
        </div>

        <div class="skirmish-economy-row">
          <label>
            <span>Starting Funds</span>
            <input
              type="number"
              min="0"
              step="100"
              data-skirmish-field="startingFunds"
              value="${state.skirmishSetup.startingFunds}"
            />
          </label>
          <label>
            <span>Funds Per Building</span>
            <input
              type="number"
              min="0"
              step="50"
              data-skirmish-field="fundsPerBuilding"
              value="${state.skirmishSetup.fundsPerBuilding}"
            />
          </label>
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
