import { COMMANDERS } from "../../game/content/commanders.js";
import { getCommanderInfoImageUrl } from "../../game/content/commanderArt.js";
import { UNIT_CATALOG } from "../../game/content/unitCatalog.js";
import { getCommanderStarterUnitIds } from "../../game/state/rosters.js";
import { formatRelativeTimestamp, titleCaseSlot } from "../formatters.js";

const COMMANDER_SLIDER_COPY_COUNT = 3;
const COMMANDER_SLIDER_HOME_COPY_INDEX = Math.floor(COMMANDER_SLIDER_COPY_COUNT / 2);

function getCommanderSliderEntries() {
  return Array.from({ length: COMMANDER_SLIDER_COPY_COUNT }, (_, copyIndex) =>
    COMMANDERS.map((commander, realIndex) => ({
      commander,
      realIndex,
      copyIndex
    }))
  ).flat();
}

function getCommanderStarterSquad(commanderId) {
  const countsByUnitId = new Map();

  for (const unitTypeId of getCommanderStarterUnitIds(commanderId)) {
    countsByUnitId.set(unitTypeId, (countsByUnitId.get(unitTypeId) ?? 0) + 1);
  }

  return Array.from(countsByUnitId.entries()).map(([unitTypeId, count]) => ({
    unitTypeId,
    count,
    name: UNIT_CATALOG[unitTypeId]?.name ?? unitTypeId
  }));
}

export function renderCommanderCardBody(commander, unlocked) {
  const infoImageUrl = getCommanderInfoImageUrl(commander.id);
  const starterSquad = getCommanderStarterSquad(commander.id);
  const passiveName = commander.passive.name ?? "Passive";
  const activeName = commander.active.name ?? "Power";

  if (!infoImageUrl) {
    return `
      <div class="commander-card__header">
        <span class="commander-name">${commander.name}</span>
        <span class="commander-status">${unlocked ? "Ready" : "Locked"}</span>
      </div>
      <p class="commander-title">${commander.title}</p>
      <div class="commander-rule-group">
        <span>${passiveName}</span>
        <p class="commander-rule">${commander.passive.summary}</p>
      </div>
      <div class="commander-rule-group commander-rule-group--active">
        <span>${activeName}</span>
        <p class="commander-rule commander-rule--active">${commander.active.summary}</p>
      </div>
      <p class="commander-card__quote">${commander.quote}</p>
    `;
  }

  return `
    <div class="commander-card__chrome">
      <span class="commander-name">${commander.name}</span>
      <span class="commander-status">${unlocked ? "Ready" : "Locked"}</span>
    </div>
    <div class="commander-card__art">
      <img
        class="commander-card__info-image"
        src="${infoImageUrl}"
        alt="${commander.name} commander info card"
        loading="lazy"
        decoding="async"
      />
      <div class="commander-card__hover-overlay">
        <div class="commander-card__hover-header">
          <strong>${commander.name}</strong>
          <span>${commander.title}</span>
        </div>
        <div class="commander-card__overlay-section">
          <span>Passive</span>
          <strong class="commander-card__ability-name">${passiveName}</strong>
          <p>${commander.passive.summary}</p>
        </div>
        <div class="commander-card__overlay-section">
          <span>Active Power</span>
          <strong class="commander-card__ability-name">${activeName}</strong>
          <p>${commander.active.summary}</p>
        </div>
        <div class="commander-card__overlay-section commander-card__overlay-section--squad">
          <span>Starting Squad</span>
          <ul class="commander-card__squad-list">
            ${starterSquad
              .map(
                (unit) => `
                  <li class="commander-card__squad-chip">
                    ${unit.count > 1 ? `${unit.count}x ` : ""}${unit.name}
                  </li>
                `
              )
              .join("")}
          </ul>
        </div>
        <p class="commander-card__quote">${commander.quote}</p>
      </div>
    </div>
    <p class="commander-card__subtitle">${commander.title}</p>
  `;
}

export function renderCommanderSelectView(state) {
  const slotLookup = new Map(state.slots.map((slot) => [slot.slotId, slot]));
  const commanderSliderEntries = getCommanderSliderEntries();

  return `
    <div class="screen screen--commander" data-screen-id="commander-select">
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
      <section class="panel panel--wide panel--static commander-select-panel">
        <div class="panel-header panel-header--commander">
          <div class="commander-select-heading">
            <p class="eyebrow">New Run</p>
            <h2>Select Your Commander</h2>
            <p>Choose a doctrine, assign a save slot, and roll out.</p>
          </div>
          <button class="ghost-button" data-action="back-to-title">Back</button>
        </div>
        <div class="slot-picker">
          ${state.slots
            .map((slot) => {
              const active = state.selectedSlotId === slot.slotId ? "slot-card--active" : "";
              const occupiedText = slot.exists
                ? `Overwrite ${formatRelativeTimestamp(slot.updatedAt)}`
                : "Empty slot";

              return `
                <button class="slot-card ${active}" data-action="select-slot" data-slot-id="${slot.slotId}">
                  <span>${titleCaseSlot(slot.slotId)}</span>
                  <small data-role="slot-label">${occupiedText}</small>
                </button>
              `;
            })
            .join("")}
        </div>
        <div class="commander-slider">
          <button
            class="ghost-button ghost-button--small commander-slider__control commander-slider__control--prev"
            data-action="commander-slider-prev"
            aria-label="Previous commander"
          >
            <span class="commander-slider__icon" aria-hidden="true">&larr;</span>
          </button>
          <div
            class="commander-grid"
            data-role="commander-slider"
          >
            <div
              class="commander-slider__track"
              data-role="commander-slider-track"
              data-slider-copy-count="${COMMANDER_SLIDER_COPY_COUNT}"
              data-slider-home-copy-index="${COMMANDER_SLIDER_HOME_COPY_INDEX}"
            >
              ${commanderSliderEntries.map(({ commander, realIndex, copyIndex }) => {
                const unlocked = state.metaState.unlockedCommanderIds.includes(commander.id);
                const selected = state.selectedCommanderId === commander.id ? "commander-card--selected" : "";

                return `
                  <button
                    class="commander-card ${selected} ${unlocked ? "" : "commander-card--locked"}"
                    style="--accent:${commander.accent}"
                    data-action="select-commander"
                    data-commander-id="${commander.id}"
                    data-slide-index="${realIndex}"
                    data-copy-index="${copyIndex}"
                    aria-label="${commander.name}, ${commander.title}, ${unlocked ? "ready" : "locked"}"
                    ${unlocked ? "" : "disabled"}
                  >
                    ${renderCommanderCardBody(commander, unlocked)}
                  </button>
                `;
              }).join("")}
            </div>
          </div>
          <button
            class="ghost-button ghost-button--small commander-slider__control commander-slider__control--next"
            data-action="commander-slider-next"
            aria-label="Next commander"
          >
            <span class="commander-slider__icon" aria-hidden="true">&rarr;</span>
          </button>
        </div>
        <div class="panel-footer">
          <div class="footer-meta">
            <span data-role="selected-slot-text">Selected slot: ${titleCaseSlot(state.selectedSlotId)}</span>
            <span data-role="selected-slot-note">${slotLookup.get(state.selectedSlotId)?.exists ? "Existing save will be replaced." : "Fresh save slot."}</span>
          </div>
          <button
            class="menu-button"
            data-role="start-run-button"
            data-action="start-run"
            ${state.selectedCommanderId ? "" : "disabled"}
          >
            Begin Deployment
          </button>
        </div>
      </section>
    </div>
  `;
}
