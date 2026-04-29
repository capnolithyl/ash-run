import test from "node:test";
import assert from "node:assert/strict";
import { renderRunLoadoutView } from "../src/ui/views/runLoadoutView.js";

function createRunLoadoutState() {
  return {
    selectedSlotId: "slot-2",
    selectedCommanderId: "atlas",
    runLoadout: {
      budget: 1000,
      fundsRemaining: 350,
      units: ["grunt", "grunt", "longshot"]
    },
    metaState: {
      unlockedUnitIds: ["grunt", "longshot", "runner", "bruiser"]
    }
  };
}

test("run loadout view renders budget feedback, purchased counts, and unit art", () => {
  const html = renderRunLoadoutView(createRunLoadoutState());

  assert.match(html, /data-screen-id="run-loadout"/);
  assert.match(html, /Build Your Opening Force/);
  assert.match(html, /Starting Funds/);
  assert.match(html, /Funds Remaining/);
  assert.match(html, /Funds Committed/);
  assert.match(html, /Units Purchased/);
  assert.match(html, /650/);
  assert.match(html, /2x Grunt/);
  assert.match(html, /1x Longshot/);
  assert.match(html, /data-action="run-loadout-add"/);
  assert.match(html, /data-action="run-loadout-remove"/);
  assert.match(html, /data-action="back-to-commander-select"/);
  assert.match(html, /assets\/sprites\/units\/player\/grunt\.svg/);
  assert.match(html, /assets\/sprites\/units\/player\/bruiser\/bruiser\.png/);
  assert.match(html, /run-unit-card__preview-image--sheet/);
});
