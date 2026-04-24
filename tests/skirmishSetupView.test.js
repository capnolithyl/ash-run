import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_UNLOCKED_COMMANDER_IDS } from "../src/game/content/commanders.js";
import { renderSkirmishSetupView } from "../src/ui/views/skirmishSetupView.js";

test("skirmish setup renders commander picks, map list, preview, and economy controls", () => {
  const html = renderSkirmishSetupView({
    slots: [],
    metaState: {
      unlockedCommanderIds: DEFAULT_UNLOCKED_COMMANDER_IDS
    },
    skirmishSetup: {
      playerCommanderId: "atlas",
      enemyCommanderId: "viper",
      mapId: "ashline-crossing",
      startingFunds: 1200,
      fundsPerBuilding: 100
    }
  });

  assert.match(html, /Build A One-Off Battle/);
  assert.match(html, /data-action="select-skirmish-player-commander"/);
  assert.match(html, /data-action="select-skirmish-enemy-commander"/);
  assert.match(html, /Map Preview/);
  assert.match(html, /data-action="select-skirmish-map"/);
  assert.match(html, /class="skirmish-map-option skirmish-map-option--active"/);
  assert.match(html, /class="skirmish-map-grid"/);
  assert.match(html, /class="skirmish-map-tile skirmish-map-tile--/);
  assert.doesNotMatch(html, /Â|â|Ã/);
  assert.match(html, /data-skirmish-field="startingFunds"/);
  assert.match(html, /data-skirmish-field="fundsPerBuilding"/);
  assert.match(html, /type="range"/);
  assert.match(html, /data-skirmish-output="startingFunds">1200/);
  assert.match(html, /data-action="start-skirmish"/);
});
