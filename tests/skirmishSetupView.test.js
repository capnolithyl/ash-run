import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_UNLOCKED_COMMANDER_IDS } from "../src/game/content/commanders.js";
import { MAP_POOL, replaceCustomMaps } from "../src/game/content/maps.js";
import { getMapGoalLabel } from "../src/game/content/mapGoals.js";
import { renderSkirmishSetupView } from "../src/ui/views/skirmishSetupView.js";

function createSkirmishState(patch = {}) {
  return {
    slots: [],
    metaState: {
      unlockedCommanderIds: DEFAULT_UNLOCKED_COMMANDER_IDS
    },
    skirmishSetup: {
      step: "commanders",
      playerCommanderId: "atlas",
      enemyCommanderId: "viper",
      mapId: MAP_POOL[0]?.id ?? null,
      startingFunds: 1200,
      fundsPerBuilding: 100,
      ...patch
    }
  };
}

test.afterEach(() => {
  replaceCustomMaps([]);
});

test("skirmish setup renders commander selection as the first step", () => {
  const html = renderSkirmishSetupView(createSkirmishState());

  assert.match(html, /Choose Commanders/);
  assert.match(html, /data-action="select-skirmish-player-commander"/);
  assert.match(html, /data-action="select-skirmish-enemy-commander"/);
  assert.match(html, /data-action="scroll-skirmish-commanders"/);
  assert.match(html, /commander-slider--skirmish/);
  assert.match(html, /data-role="commander-slider"/);
  assert.match(html, /data-commander-slider-id="skirmish-player"/);
  assert.match(html, /data-role="commander-slider-track"/);
  assert.match(html, /data-slider-copy-count="3"/);
  assert.match(html, /data-action="skirmish-next-step"/);
  assert.doesNotMatch(html, /Map Preview/);
});

test("skirmish setup renders map, economy controls, and visual legend on the second step", () => {
  const selectedMap = MAP_POOL[0];
  const html = renderSkirmishSetupView(createSkirmishState({ step: "map" }));

  assert.match(html, /Choose The Battlefield/);
  assert.match(html, /Map Preview/);
  assert.match(html, /data-action="select-skirmish-map"/);
  assert.match(html, /class="skirmish-map-option skirmish-map-option--active"/);
  assert.match(html, /data-role="skirmish-map-list"/);
  assert.match(html, /class="skirmish-map-grid"/);
  assert.match(html, /class="skirmish-map-tile skirmish-map-tile--/);
  assert.doesNotMatch(html, /Â|â|Ã/);
  assert.match(html, /Player building/);
  assert.match(html, /Enemy building/);
  assert.match(html, /Neutral building/);
  assert.match(html, /data-skirmish-field="startingFunds"/);
  assert.match(html, /data-skirmish-field="fundsPerBuilding"/);
  assert.match(html, /type="range"/);
  assert.match(html, /data-skirmish-output="startingFunds">1200/);
  assert.match(html, new RegExp(`<strong>${getMapGoalLabel(selectedMap.goal)}</strong>`));
  assert.match(html, /data-action="skirmish-previous-step"/);
  assert.match(html, /data-action="start-skirmish"/);
});

test("skirmish setup immediately lists saved custom maps from the live registry", () => {
  replaceCustomMaps([
    {
      id: "custom-district",
      name: "Custom District",
      theme: "ash",
      width: 8,
      height: 8
    }
  ]);

  const html = renderSkirmishSetupView(
    createSkirmishState({
      step: "map",
      mapId: "custom-district"
    })
  );

  assert.match(html, /data-map-id="custom-district"/);
  assert.match(html, /Custom District/);
  assert.match(html, /aria-selected="true"/);
});
