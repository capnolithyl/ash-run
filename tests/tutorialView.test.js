import test from "node:test";
import assert from "node:assert/strict";
import { renderTitleView } from "../src/ui/views/titleView.js";
import { renderTutorialView } from "../src/ui/views/tutorialView.js";

function createTitleState() {
  return {
    slots: [
      { slotId: "slot-1", exists: false },
      { slotId: "slot-2", exists: false },
      { slotId: "slot-3", exists: false }
    ],
    metaState: {
      latestClearTurnCount: null,
      bestClearTurnCount: null
    }
  };
}

test("title screen links to the tutorial", () => {
  const html = renderTitleView(createTitleState());

  assert.match(html, /data-action="open-tutorial"/);
  assert.match(html, /Tutorial/);
  assert.match(html, /data-action="open-progression"/);
  assert.match(html, /data-action="open-options"[\s\S]*aria-label="Options"/);
  assert.match(html, /Quit Game/);
});

test("tutorial covers basics, economy, commanders, and advanced tools", () => {
  const html = renderTutorialView();

  assert.match(html, /Training Sim/);
  assert.match(html, /Clear ten maps/);
  assert.match(html, /Select, move, act/);
  assert.match(html, /Ranges, armor, ammo/);
  assert.match(html, /Capture intel/);
  assert.match(html, /Passives are constant/);
  assert.match(html, /Transport, support, terrain/);
  assert.match(html, /data-action="open-new-run"/);
  assert.match(html, /data-action="back-to-title"/);
});

test("tutorial exposes interactive step controls", () => {
  const html = renderTutorialView();

  assert.match(html, /id="tutorial-step-run"[\s\S]*checked/);
  assert.match(html, /for="tutorial-step-combat"/);
  assert.match(html, /for="tutorial-step-advanced"/);
  assert.match(html, /class="tutorial-checklist"/);
});
