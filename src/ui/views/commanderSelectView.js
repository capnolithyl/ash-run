import { COMMANDERS } from "../../game/content/commanders.js";
import { formatRelativeTimestamp, titleCaseSlot } from "../formatters.js";

export function renderCommanderSelectView(state) {
  const slotLookup = new Map(state.slots.map((slot) => [slot.slotId, slot]));

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
        <div class="commander-grid">
          ${COMMANDERS.map((commander) => {
            const unlocked = state.metaState.unlockedCommanderIds.includes(commander.id);
            const selected = state.selectedCommanderId === commander.id ? "commander-card--selected" : "";

            return `
              <button
                class="commander-card ${selected} ${unlocked ? "" : "commander-card--locked"}"
                style="--accent:${commander.accent}"
                data-action="select-commander"
                data-commander-id="${commander.id}"
                ${unlocked ? "" : "disabled"}
              >
                <div class="commander-card__header">
                  <span class="commander-name">${commander.name}</span>
                  <span class="commander-status">${unlocked ? "Ready" : "Locked"}</span>
                </div>
                <p class="commander-title">${commander.title}</p>
                <div class="commander-rule-group">
                  <span>Passive</span>
                  <p class="commander-rule">${commander.passive.summary}</p>
                </div>
                <div class="commander-rule-group commander-rule-group--active">
                  <span>Power</span>
                  <p class="commander-rule commander-rule--active">${commander.active.summary}</p>
                </div>
              </button>
            `;
          }).join("")}
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
