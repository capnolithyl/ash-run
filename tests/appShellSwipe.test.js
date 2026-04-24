import test from "node:test";
import assert from "node:assert/strict";
import { shouldTriggerCommanderSwipe } from "../src/ui/AppShell.js";

test("commander swipe requires a mostly horizontal drag above threshold", () => {
  assert.equal(shouldTriggerCommanderSwipe(20, 1), false);
  assert.equal(shouldTriggerCommanderSwipe(44, 30), true);
  assert.equal(shouldTriggerCommanderSwipe(-60, 10), true);
  assert.equal(shouldTriggerCommanderSwipe(60, 60), false);
});
