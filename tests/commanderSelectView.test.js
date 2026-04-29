import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_UNLOCKED_COMMANDER_IDS } from "../src/game/content/commanders.js";
import { renderCommanderSelectView } from "../src/ui/views/commanderSelectView.js";

function createCommanderSelectState() {
  return {
    selectedSlotId: "slot-1",
    selectedCommanderId: "atlas",
    slots: [
      { slotId: "slot-1", exists: false, updatedAt: null },
      { slotId: "slot-2", exists: false, updatedAt: null },
      { slotId: "slot-3", exists: false, updatedAt: null }
    ],
    metaState: {
      unlockedCommanderIds: DEFAULT_UNLOCKED_COMMANDER_IDS
    }
  };
}

test("commander select renders carousel controls and a reachable deployment action", () => {
  const html = renderCommanderSelectView(createCommanderSelectState());

  assert.match(html, /class="commander-slider"/);
  assert.match(html, /data-role="commander-slider"/);
  assert.match(html, /data-role="commander-slider-track"/);
  assert.match(html, /data-slider-copy-count="3"/);
  assert.match(html, /data-slider-home-copy-index="1"/);
  assert.match(html, /data-action="commander-slider-prev"/);
  assert.match(html, /data-action="commander-slider-next"/);
  assert.match(html, /data-role="start-run-button"/);
  assert.match(html, /Next: Starting Squad/);
  assert.match(html, /commander-card__info-image/);
  assert.match(html, /assets\/img\/commanders\/atlas\/Atlas%20-%20Info\.png/);
  assert.match(html, /assets\/img\/commanders\/sables\/Sables%20-%20Info\.png/);
  assert.match(html, /aria-label="Previous commander"/);
  assert.match(html, /aria-label="Next commander"/);
  assert.match(html, /class="commander-slider__icon" aria-hidden="true">&larr;<\/span>/);
  assert.match(html, /class="commander-slider__icon" aria-hidden="true">&rarr;<\/span>/);
  assert.match(html, /commander-card__hover-overlay/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /Starting Squad/);
  assert.match(html, /Field Repairs/);
  assert.match(html, /Blitz Surge/);
  assert.match(html, /"If it still rolls, it can still win\."/);
  assert.match(html, /2x Grunt/);
  assert.match(html, /Bruiser/);
});
