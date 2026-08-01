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
      namingReviewOpen: false,
      units: [
        { id: "grunt-one", unitTypeId: "grunt", name: "Mara", nameRoll: 0 },
        { id: "grunt-two", unitTypeId: "grunt", name: "Rook", nameRoll: 0 },
        { id: "longshot-one", unitTypeId: "longshot", name: "Hush", nameRoll: 0 }
      ]
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
  assert.match(html, /class="run-loadout-unit-grid"/);
  assert.doesNotMatch(html, /<table/);
  assert.doesNotMatch(html, /Purchase Units/);
  assert.doesNotMatch(html, /Selected slot:/);
  assert.doesNotMatch(html, /Commander:/);
  assert.doesNotMatch(html, /Battle Stats/);
  assert.match(html, /data-role="run-loadout-grid-shell"/);
  assert.match(html, /Selected Squad/);
  assert.match(html, /2x Grunt/);
  assert.match(html, /1x Longshot/);
  assert.match(html, /data-action="run-loadout-add"/);
  assert.match(html, /data-action="run-loadout-remove"/);
  assert.match(html, /data-action="back-to-commander-select"/);
  assert.match(html, /assets\/sprites\/units\/purple\/grunt\.svg/);
  assert.match(html, /assets\/sprites\/units\/purple\/bruiser\/bruiser-full\.png/);
  assert.match(html, /run-unit-card__preview-image--sheet/);
  assert.match(html, /run-unit-card__preview-sheet-surface/);
  assert.match(html, /@keyframes run-unit-preview-bruiser-idle-0-2-4x4/);
  assert.match(html, /--preview-columns:4;/);
  assert.match(html, /--preview-rows:4;/);
  assert.doesNotMatch(html, /run-unit-card__preview-strip/);
  assert.match(html, /class="run-loadout-unit-card run-loadout-unit-card--selected"/);
  assert.match(html, /class="run-loadout-unit-card__count"/);
  assert.match(html, /Count/);
  assert.match(html, /run-loadout-start-button/);
  assert.match(html, /title-button__icon/);
  assert.match(html, /run-loadout-commander__details/);
  assert.match(html, /Commander Details/);
});

test("run loadout naming review renders one validated editable identity per purchased unit", () => {
  const state = createRunLoadoutState();
  state.runLoadout.namingReviewOpen = true;
  const html = renderRunLoadoutView(state);

  assert.match(html, /role="dialog"/);
  assert.match(html, /Name Your Squad/);
  assert.equal((html.match(/data-run-loadout-unit-name=/g) ?? []).length, 3);
  assert.equal((html.match(/data-action="randomize-run-loadout-name"/g) ?? []).length, 3);
  assert.match(html, /value="Mara"/);
  assert.match(html, /data-action="start-run"/);
  assert.match(html, /Deploy To Map One/);
});

test("run loadout naming review rejects duplicate and unsafe custom names", () => {
  const state = createRunLoadoutState();
  state.runLoadout.namingReviewOpen = true;
  state.runLoadout.units[0].name = "Rook";
  state.runLoadout.units[2].name = "<script>";
  const html = renderRunLoadoutView(state);

  assert.match(html, /That name is already part of this run\./);
  assert.match(html, /Use letters, numbers/);
  assert.match(html, /value="&lt;script&gt;"/);
  assert.match(html, /data-action="start-run"[\s\S]*?disabled/);
  assert.doesNotMatch(html, /value="<script>"/);
});

test("run loadout commander summary keeps blaze and echo status text concise", () => {
  const blazeHtml = renderRunLoadoutView({
    ...createRunLoadoutState(),
    selectedCommanderId: "blaze"
  });
  const echoHtml = renderRunLoadoutView({
    ...createRunLoadoutState(),
    selectedCommanderId: "echo"
  });

  assert.match(blazeHtml, /All enemies take 10% damage and Burn for 1 turn\./);
  assert.doesNotMatch(blazeHtml, /halves attack/i);
  assert.match(echoHtml, /All enemy units get -1 movement and become Corrupted for 1 turn\./);
  assert.doesNotMatch(echoHtml, /randomly halves one visible stat/i);
});

test("run loadout previews follow the saved player color", () => {
  const state = createRunLoadoutState();
  state.metaState.options = {
    playerColor: "blue",
    enemyColor: "purple"
  };

  const html = renderRunLoadoutView(state);

  assert.match(html, /assets\/sprites\/units\/blue\/grunt\.svg/);
  assert.doesNotMatch(html, /assets\/sprites\/units\/purple\/grunt\.svg/);
});
