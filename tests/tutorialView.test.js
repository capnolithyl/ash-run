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
  assert.match(html, /data-action="open-map-editor"/);
  assert.match(html, /Tutorial/);
  assert.match(html, /data-action="open-progression"/);
  assert.match(html, /data-action="open-options"[\s\S]*aria-label="Options"/);
  assert.match(html, /title-button--has-image title-button--image-loaded/);
  assert.match(html, /src=".\/assets\/img\/ui\/buttons\/new-run\.png"[\s\S]*width="866"[\s\S]*height="288"/);
  assert.match(html, /src=".\/assets\/img\/ui\/buttons\/settings\.png"[\s\S]*width="500"[\s\S]*height="500"/);
  assert.match(html, /Quit Game/);
});

test("tutorial covers basics, economy, commanders, and advanced tools", () => {
  const html = renderTutorialView({
    tutorial: {
      phase: "epilogue"
    }
  });

  assert.match(html, /Training Complete/);
  assert.match(html, /Field Notes/);
  assert.match(html, /Run Mode/);
  assert.match(html, /Mission Goals/);
  assert.match(html, /Upgrades/);
  assert.match(html, /Intel &amp; Unlocks|Intel & Unlocks/);
  assert.match(html, /Commanders/);
  assert.match(html, /Skirmish/);
  assert.match(html, /data-action="open-new-run"/);
  assert.match(html, /data-action="back-to-title"/);
});

test("tutorial intro starts the guided match", () => {
  const html = renderTutorialView();

  assert.match(html, /Guided Match/);
  assert.match(html, /Pip the tactical gremlin/);
  assert.match(html, /Start Training/);
  assert.match(html, /data-action="start-tutorial"/);
  assert.match(html, /no save slots/i);
});
