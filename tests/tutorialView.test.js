import test from "node:test";
import assert from "node:assert/strict";
import { renderTitleView } from "../src/ui/views/titleView.js";
import { renderTutorialView } from "../src/ui/views/tutorialView.js";
import { createDefaultMetaState } from "../src/game/state/defaults.js";

function createTitleState() {
  return {
    slots: [
      { slotId: "slot-1", exists: false },
      { slotId: "slot-2", exists: false },
      { slotId: "slot-3", exists: false }
    ],
    tutorial: { phase: "hub" },
    metaState: createDefaultMetaState()
  };
}

test("title screen links to the production tutorial", () => {
  const html = renderTitleView(createTitleState());
  assert.match(html, /data-action="open-tutorial"/);
  assert.match(html, /Tutorial/);
  assert.match(html, /data-action="open-new-run"/);
});

test("fresh profile New Run prompt offers play and skip choices", () => {
  const state = createTitleState();
  state.tutorial.phase = "new-run-prompt";
  const html = renderTitleView(state);
  assert.match(html, /Play Tutorial/);
  assert.match(html, /Skip Tutorial/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /data-tutorial-choice="play"/);
  assert.match(html, /data-tutorial-choice="skip"/);
});

test("tutorial hub shows six sequential lessons", () => {
  const html = renderTutorialView({
    tutorial: { phase: "hub", activeTab: "guided" },
    metaState: createDefaultMetaState()
  });
  assert.match(html, /Tutorial Hub/);
  assert.match(html, /Guided Training/);
  assert.match(html, /Field Manual/);
  assert.match(html, /Basic Orders/);
  assert.match(html, /Mission Objectives/);
  assert.match(html, /Commanders, Status Effects, and Run Progression/);
  assert.equal((html.match(/data-action="start-tutorial-lesson"/g) ?? []).length, 6);
  assert.match(html, /data-lesson-id="basic-orders"[\s\S]*?>Start<\/button>/);
});

test("field manual tab renders searchable current-data sections", () => {
  const html = renderTutorialView({
    tutorial: { phase: "hub", activeTab: "manual" },
    metaState: createDefaultMetaState()
  });
  assert.match(html, /type="search" data-manual-query/);
  assert.match(html, /Quick Start/);
  assert.match(html, /Weapons and Matchups/);
  assert.match(html, /Carrier/);
  assert.match(html, /scenario\/enemy-only/i);
  assert.match(html, /Run Cards, Gear, and Reinforcements/);
});
