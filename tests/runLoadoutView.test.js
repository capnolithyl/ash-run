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
  assert.match(html, /Selected Commander/);
  assert.match(html, /Selected Squad/);
  assert.match(html, /Funds/);
  assert.match(html, /350\/1000/);
  assert.match(html, /<table class="run-loadout-table">/);
  assert.doesNotMatch(html, /Purchase Units/);
  assert.doesNotMatch(html, /Selected slot:/);
  assert.doesNotMatch(html, /Commander:/);
  assert.match(html, /<th scope="col">Unit<\/th>/);
  assert.match(html, /<th scope="col">Battle Stats<\/th>/);
  assert.match(html, /<th scope="col">Purchase<\/th>/);
  assert.match(html, /data-role="run-loadout-table-shell"/);
  assert.match(html, /Selected Squad/);
  assert.match(html, /2x Grunt/);
  assert.match(html, /1x Longshot/);
  assert.match(html, /data-action="run-loadout-add"/);
  assert.match(html, /data-action="run-loadout-remove"/);
  assert.match(html, /data-action="back-to-commander-select"/);
  assert.match(html, /assets\/sprites\/units\/player\/grunt\.svg/);
  assert.match(html, /assets\/sprites\/units\/player\/bruiser\/bruiser-idle\.png/);
  assert.match(html, /run-unit-card__preview-image--sheet/);
  assert.match(html, /selection-icon selection-icon--stat/);
  assert.match(html, /Count/);
  assert.match(html, /run-loadout-start-button/);
  assert.match(html, /title-button__icon/);
});
