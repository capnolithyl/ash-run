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
  assert.match(html, /data-action="commander-slider-prev"/);
  assert.match(html, /data-action="commander-slider-next"/);
  assert.match(html, /data-role="start-run-button"/);
  assert.match(html, /Begin Deployment/);
});
