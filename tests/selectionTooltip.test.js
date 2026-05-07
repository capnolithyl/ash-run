import test from "node:test";
import assert from "node:assert/strict";

import { buildForecastTooltipLabel } from "../src/game/phaser/view/selectionTooltip.js";

test("forecast tooltip label includes the hovered enemy name above the numbers", () => {
  const label = buildForecastTooltipLabel({
    targetName: "Runner",
    dealt: { min: 12, max: 18 },
    received: { min: 4, max: 6 }
  });

  assert.equal(label, "Runner\nDamage 12-18\nCounter 4-6");
});

test("forecast tooltip label falls back cleanly when no counter is possible", () => {
  const label = buildForecastTooltipLabel({
    targetName: "Bruiser",
    dealt: { min: 20, max: 20 },
    received: null
  });

  assert.equal(label, "Bruiser\nDamage 20-20\nCounter 0");
});
