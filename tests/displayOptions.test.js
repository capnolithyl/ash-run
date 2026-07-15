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
import { syncOptionsControls } from "../src/ui/appShell/render/screenRouter.js";
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
      musicVolume: 1,
      sfxVolume: 0.85,
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
      musicVolume: 1,
      sfxVolume: 0.85,
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
  assert.match(html, /data-option="masterVolume"/);
  assert.match(html, /data-option="musicVolume"/);
  assert.match(html, /data-option="sfxVolume"/);
  assert.doesNotMatch(
    html,
    /<input type="checkbox" checked data-option="battlefieldNameTooltips"/
  );
});

test("installed animated palettes are enabled and keep their accent selection", () => {
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
  assert.match(html, /name="playerColor"[\s\S]*value="green"[\s\S]*checked/);
  const greenInputs = html.match(/<input(?=[^>]*value="green")[^>]*>/g) ?? [];
  assert.equal(greenInputs.length, 2);
  assert.ok(greenInputs.some((input) => input.includes("checked") && !input.includes("disabled")));
  assert.ok(greenInputs.some((input) => input.includes("disabled")));
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
  assert.match(html, /value="green"/);
  assert.match(html, /value="orange"/);
  assert.match(html, /Player Units: Blue[\s\S]*disabled/);
  assert.match(html, /Enemy Units: Purple[\s\S]*disabled/);
});

test("options renderer groups controls into accessible vertical tabs", () => {
  const html = renderOptionFields(createDefaultMetaState().options, {
    showDisplayOptions: true,
    activeOptionsTab: "audio"
  });

  assert.match(html, /role="tablist"[^>]*aria-orientation="vertical"/);
  assert.match(html, /id="options-tab-audio"[\s\S]*?aria-selected="true"/);
  assert.match(html, /id="options-panel-display"[\s\S]*?hidden/);
  assert.match(html, /id="options-panel-audio"[\s\S]*?aria-labelledby="options-tab-audio"/);
  assert.match(html, /id="options-panel-gameplay"[\s\S]*?hidden/);
  assert.match(html, /options-panel-display[\s\S]*?data-display-option="displayMode"/);
  assert.match(html, /options-panel-audio[\s\S]*?data-option="masterVolume"/);
  assert.match(html, /options-panel-audio[\s\S]*?data-option="muted"/);
  assert.match(html, /options-panel-gameplay[\s\S]*?data-option="playerColor"/);
  assert.match(html, /options-panel-gameplay[\s\S]*?data-option="showGrid"/);
});

test("options tab selection updates ARIA state and supports arrow navigation", () => {
  const createClassList = () => ({
    active: new Set(),
    toggle(className, enabled) {
      enabled ? this.active.add(className) : this.active.delete(className);
    }
  });
  const tabs = ["display", "audio", "gameplay"].map((tabId) => ({
    dataset: { optionsTab: tabId },
    classList: createClassList(),
    attributes: {},
    tabIndex: -1,
    focused: false,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {
      this.focused = true;
    }
  }));
  const panels = ["display", "audio", "gameplay"].map((tabId) => ({
    id: `options-panel-${tabId}`,
    hidden: false
  }));
  const shell = {
    activeOptionsTab: "display",
    root: {
      querySelectorAll(selector) {
        return selector.includes('role="tab"') ? tabs : panels;
      }
    },
    selectOptionsTab: appShellEventMethods.selectOptionsTab
  };

  assert.equal(appShellEventMethods.selectOptionsTab.call(shell, "audio", { focus: true }), true);
  assert.equal(shell.activeOptionsTab, "audio");
  assert.equal(tabs[1].attributes["aria-selected"], "true");
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[1].focused, true);
  assert.equal(panels[1].hidden, false);
  assert.equal(panels[0].hidden, true);

  let prevented = false;
  appShellEventMethods.handleKeyDown.call(shell, {
    key: "ArrowDown",
    target: {
      closest() {
        return tabs[1];
      }
    },
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(shell.activeOptionsTab, "gameplay");
  assert.equal(tabs[2].focused, true);
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

test("options updates synchronize existing controls without replacing them", () => {
  const createControl = ({
    option,
    type,
    value = "",
    checked = false,
    disabled = false,
    className = "",
    title = "",
    valueLabel = ""
  }) => {
    const swatch = { className, title };
    const strong = { textContent: valueLabel };

    return {
      dataset: { option },
      type,
      value,
      checked,
      disabled,
      closest(selector) {
        if (selector === ".unit-color-swatch" && type === "radio") {
          return swatch;
        }

        if (selector === ".option-row") {
          return {
            querySelector() {
              return strong;
            }
          };
        }

        return null;
      },
      swatch,
      strong
    };
  };
  const currentControls = [
    createControl({ option: "muted", type: "checkbox" }),
    createControl({ option: "masterVolume", type: "range", value: "0.4", valueLabel: "40%" }),
    createControl({
      option: "playerColor",
      type: "radio",
      value: "green",
      className: "unit-color-swatch",
      title: "Green: Available"
    })
  ];
  const nextControls = [
    createControl({ option: "muted", type: "checkbox", checked: true }),
    createControl({ option: "masterVolume", type: "range", value: "0.65", valueLabel: "65%" }),
    createControl({
      option: "playerColor",
      type: "radio",
      value: "green",
      checked: true,
      className: "unit-color-swatch unit-color-swatch--selected",
      title: "Green: Available"
    })
  ];
  const currentContainer = { querySelectorAll: () => currentControls };
  const nextContainer = { querySelectorAll: () => nextControls };
  const originalControls = [...currentControls];

  syncOptionsControls(currentContainer, nextContainer);

  assert.equal(currentControls[0].checked, true);
  assert.equal(currentControls[1].value, "0.65");
  assert.equal(currentControls[1].strong.textContent, "65%");
  assert.equal(currentControls[2].checked, true);
  assert.equal(
    currentControls[2].swatch.className,
    "unit-color-swatch unit-color-swatch--selected"
  );
  assert.equal(currentControls[0], originalControls[0]);
  assert.equal(currentControls[1], originalControls[1]);
  assert.equal(currentControls[2], originalControls[2]);
});
