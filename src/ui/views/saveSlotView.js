import { formatCommanderName, formatRelativeTimestamp, titleCaseSlot } from "../formatters.js";

export function renderSaveSlotView(state) {
  return `
    <div class="screen screen--slots">
      <section class="panel panel--medium">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Continue</p>
            <h2>Choose A Save Slot</h2>
          </div>
          <button class="ghost-button" data-action="back-to-title">Back</button>
        </div>
        <div class="slot-list">
          ${state.slots
            .map((slot) => {
              const hasData = slot.exists;
              const summary = slot.summary;

              return `
                <article class="save-slot">
                  <div>
                    <h3>${titleCaseSlot(slot.slotId)}</h3>
                    <p>${hasData ? `${formatCommanderName(summary.commanderId)} | Map ${summary.mapIndex}/${summary.targetMapCount}` : "No run stored here yet."}</p>
                    <small>${hasData ? `${summary.mapName} | ${formatRelativeTimestamp(slot.updatedAt)}` : "Empty"}</small>
                  </div>
                  <div class="save-slot__actions">
                    <button
                      class="menu-button menu-button--small"
                      data-action="load-slot"
                      data-slot-id="${slot.slotId}"
                      ${hasData ? "" : "disabled"}
                    >
                      Continue
                    </button>
                    <button
                      class="ghost-button ghost-button--small"
                      data-action="delete-slot"
                      data-slot-id="${slot.slotId}"
                      ${hasData ? "" : "disabled"}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              `;
            })
            .join("")}
        </div>
      </section>
    </div>
  `;
}

