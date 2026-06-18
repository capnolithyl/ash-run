import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WINDOW_RESOLUTION,
  DISPLAY_MODES,
  getClosestDisplayResolutionPreset,
  getDisplayPresetAvailability,
  normalizeDisplayOptions,
  resolveDisplayResolutionForBounds,
  resolveWindowResolutionForWorkArea
} from "../src/game/core/displayOptions.js";
import { createDefaultMetaState, normalizeMetaOptions } from "../src/game/state/defaults.js";
import { appShellEventMethods } from "../src/ui/appShell/eventMethods.js";
import { getUnitColorCssVariables } from "../src/ui/unitColorTheme.js";
import { renderOptionFields } from "../src/ui/views/optionFieldsView.js";

test("display options default to fullscreen with a desktop preset fallback", () => {
  const metaState = createDefaultMetaState();

  assert.equal(metaState.options.displayMode, DISPLAY_MODES.FULLSCREEN);
  assert.equal(metaState.options.windowResolution, DEFAULT_WINDOW_RESOLUTION);
  assert.equal(metaState.options.battlefieldNameTooltips, true);
});

test("display option normalization repairs unsupported saved values", () => {
  assert.deepEqual(
    normalizeMetaOptions({
      displayMode: "phone",
      windowResolution: "800x600",
      masterVolume: 0.2
    }),
    {
      showGrid: true,
      screenShake: true,
      battlefieldNameTooltips: true,
      combatCutsceneAnimations: true,
      masterVolume: 0.2,
      muted: false,
      playerColor: "purple",
      enemyColor: "blue",
      displayMode: DISPLAY_MODES.FULLSCREEN,
      windowResolution: DEFAULT_WINDOW_RESOLUTION
    }
  );

  assert.deepEqual(normalizeDisplayOptions({ displayMode: DISPLAY_MODES.BORDERLESS }), {
    displayMode: DISPLAY_MODES.BORDERLESS,
    windowResolution: DEFAULT_WINDOW_RESOLUTION
  });
});

test("unit color options repair invalid and duplicate saved values", () => {
  assert.deepEqual(
    normalizeMetaOptions({
      playerColor: "teal",
      enemyColor: "teal"
    }),
    {
      showGrid: true,
      screenShake: true,
      battlefieldNameTooltips: true,
      combatCutsceneAnimations: true,
      masterVolume: 0.4,
      muted: false,
      playerColor: "purple",
      enemyColor: "blue",
      displayMode: DISPLAY_MODES.FULLSCREEN,
      windowResolution: DEFAULT_WINDOW_RESOLUTION
    }
  );

  const duplicate = normalizeMetaOptions({
    playerColor: "blue",
    enemyColor: "blue"
  });

  assert.equal(duplicate.playerColor, "blue");
  assert.equal(duplicate.enemyColor, "purple");
});

test("battlefield name tooltip option can be persisted off", () => {
  const options = normalizeMetaOptions({
    battlefieldNameTooltips: false
  });
  const html = renderOptionFields(options);

  assert.equal(options.battlefieldNameTooltips, false);
  assert.match(html, /data-option="battlefieldNameTooltips"/);
  assert.doesNotMatch(
    html,
    /<input type="checkbox" checked data-option="battlefieldNameTooltips"/
  );
});

test("incomplete saved palettes keep their accent selection", () => {
  const options = normalizeMetaOptions({
    playerColor: "green",
    enemyColor: "blue"
  });
  const html = renderOptionFields(options);

  assert.equal(options.playerColor, "green");
  assert.deepEqual(getUnitColorCssVariables(options), {
    "--player-color": "#66ffbf",
    "--enemy-color": "#5db8ff"
  });
  assert.match(html, /name="playerColor"[\s\S]*value="green"[\s\S]*checked[\s\S]*disabled/);
});

test("display preset availability filters resolutions against monitor work area", () => {
  const availability = getDisplayPresetAvailability({ width: 1366, height: 728 });

  assert.equal(availability.find((preset) => preset.id === "1280x720")?.available, true);
  assert.equal(availability.find((preset) => preset.id === "1280x720")?.windowedAvailable, true);
  assert.equal(availability.find((preset) => preset.id === "1366x768")?.available, false);
  assert.equal(availability.find((preset) => preset.id === "1366x768")?.nativeAvailable, false);
  assert.equal(
    resolveWindowResolutionForWorkArea("2560x1440", { width: 1366, height: 728 }).id,
    "1280x720"
  );
});

test("native display preset resolution picks the closest official desktop size", () => {
  assert.equal(getClosestDisplayResolutionPreset({ width: 2560, height: 1440 }).id, "2560x1440");
  assert.equal(getClosestDisplayResolutionPreset({ width: 1920, height: 1080 }).id, "1920x1080");
  assert.equal(
    resolveDisplayResolutionForBounds("2560x1440", { width: 1920, height: 1080 }).id,
    "1920x1080"
  );
});

test("options view renders display mode and resolution controls", () => {
  const html = renderOptionFields(createDefaultMetaState().options, {
    showDisplayOptions: true,
    desktopAvailable: true,
    draft: {
      displayMode: DISPLAY_MODES.WINDOWED,
      windowResolution: "1280x720"
    },
    presets: getDisplayPresetAvailability({ width: 1600, height: 900 })
  });

  assert.match(html, /data-display-option="displayMode"/);
  assert.match(html, /data-display-option="windowResolution"/);
  assert.match(html, /value="1280x720"[\s\S]*selected/);
  assert.match(html, /data-action="apply-display-settings"/);
  assert.match(html, /data-option="playerColor"/);
  assert.match(html, /data-option="enemyColor"/);
  assert.match(html, /data-option="battlefieldNameTooltips"/);
  assert.match(html, /<input type="checkbox" checked data-option="battlefieldNameTooltips"/);
  assert.match(html, /name="playerColor"[\s\S]*value="purple"[\s\S]*checked/);
  assert.match(html, /name="enemyColor"[\s\S]*value="blue"[\s\S]*checked/);
  assert.match(html, /value="green"[\s\S]*disabled/);
  assert.match(html, /Player Units: Blue[\s\S]*disabled/);
  assert.match(html, /Enemy Units: Purple[\s\S]*disabled/);
});

test("option change handling preserves radio string values", async () => {
  let receivedPatch = null;

  await appShellEventMethods.handleChange.call(
    {
      controller: {
        async updateOptions(patch) {
          receivedPatch = patch;
        }
      }
    },
    {
      target: {
        dataset: {
          option: "playerColor"
        },
        type: "radio",
        value: "blue"
      }
    }
  );

  assert.deepEqual(receivedPatch, { playerColor: "blue" });
});
