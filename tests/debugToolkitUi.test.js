import test from "node:test";
import assert from "node:assert/strict";
import { getSandboxMapFamilies } from "../src/game/content/maps.js";
import { appShellEventMethods } from "../src/ui/appShell/eventMethods.js";

function createClassList() {
  return {
    active: new Set(),
    toggle(className, enabled) {
      enabled ? this.active.add(className) : this.active.delete(className);
    }
  };
}

test("battle pause tab selection remembers Debug independently from standard options", () => {
  const tabs = ["display", "audio", "gameplay", "debug"].map((tabId) => ({
    dataset: { optionsTab: tabId, optionsScope: "battle-pause" },
    classList: createClassList(),
    attributes: {},
    tabIndex: -1,
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  }));
  const panels = tabs.map((tab) => ({
    id: `options-panel-${tab.dataset.optionsTab}`,
    hidden: false
  }));
  const tabsRoot = {
    querySelectorAll(selector) {
      return selector.includes('role="tab"') ? tabs : panels;
    }
  };
  const shell = {
    activeOptionsTab: "audio",
    activeBattlePauseTab: null,
    root: {
      querySelector() {
        return tabsRoot;
      },
      querySelectorAll: tabsRoot.querySelectorAll
    }
  };

  assert.equal(
    appShellEventMethods.selectOptionsTab.call(shell, "debug", { scope: "battle-pause" }),
    true
  );
  assert.equal(shell.activeBattlePauseTab, "debug");
  assert.equal(shell.activeOptionsTab, "audio");
  assert.equal(tabs[3].attributes["aria-selected"], "true");
  assert.equal(panels[3].hidden, false);
  assert.equal(panels[0].hidden, true);
});

test("debug tool selection swaps panels without replacing their field values", () => {
  const cards = ["battlefield", "spawn", "selected-unit"].map((toolId) => ({
    dataset: { debugTool: toolId },
    classList: createClassList(),
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  }));
  const preservedField = { value: "77" };
  const panels = cards.map((card) => ({
    dataset: { battleDebugPanel: card.dataset.debugTool },
    hidden: card.dataset.debugTool !== "battlefield",
    field: card.dataset.debugTool === "spawn" ? preservedField : null
  }));
  const shell = {
    battleDrawers: { debugTool: "battlefield" },
    root: {
      querySelectorAll(selector) {
        return selector === "[data-debug-tool]" ? cards : panels;
      }
    }
  };

  assert.equal(appShellEventMethods.selectDebugTool.call(shell, "spawn"), true);
  assert.equal(shell.battleDrawers.debugTool, "spawn");
  assert.equal(cards[1].attributes["aria-current"], "true");
  assert.equal(panels[1].hidden, false);
  assert.equal(panels[0].hidden, true);
  assert.equal(preservedField.value, "77");
});

test("sandbox stage fields retain valid stages, fall back on map change, and reject gaps", () => {
  const families = getSandboxMapFamilies();
  const family = families[0];
  const validStage = family.stages.at(-1).stage;
  const invalidStage = Math.max(...family.stages.map((candidate) => candidate.stage)) + 1;
  const familyField = { value: family.id };
  const stageField = {
    value: `${validStage}`,
    min: "",
    max: "",
    step: "",
    validationMessage: "",
    focused: false,
    reported: false,
    setCustomValidity(message) {
      this.validationMessage = message;
    },
    focus() {
      this.focused = true;
    },
    reportValidity() {
      this.reported = true;
    }
  };
  const help = { textContent: "" };
  const error = { textContent: "", hidden: true };
  const size = { textContent: "" };
  const elements = new Map([
    ['[data-debug-field="sandbox-map-family"]', familyField],
    ['[data-debug-field="sandbox-stage"]', stageField],
    ["[data-debug-stage-help]", help],
    ["[data-debug-map-error]", error],
    ["[data-debug-battlefield-size]", size]
  ]);
  const shell = {
    root: {
      querySelector(selector) {
        return elements.get(selector) ?? null;
      }
    },
    resolveDebugSandboxMapId: appShellEventMethods.resolveDebugSandboxMapId
  };

  assert.equal(appShellEventMethods.syncSandboxStageField.call(shell), true);
  assert.equal(stageField.value, `${validStage}`);
  assert.equal(stageField.min, `${family.stages[0].stage}`);
  assert.equal(stageField.max, `${family.stages.at(-1).stage}`);
  assert.match(help.textContent, new RegExp(`${validStage}`));
  assert.ok(appShellEventMethods.resolveDebugSandboxMapId.call(shell));

  stageField.value = `${invalidStage}`;
  assert.equal(
    appShellEventMethods.resolveDebugSandboxMapId.call(shell, { report: true }),
    null
  );
  assert.match(error.textContent, /is unavailable/);
  assert.equal(error.hidden, false);
  assert.equal(stageField.focused, true);
  assert.equal(stageField.reported, true);

  stageField.value = "999";
  appShellEventMethods.syncSandboxStageField.call(shell);
  assert.equal(stageField.value, `${family.stages[0].stage}`);
  assert.equal(error.hidden, true);
});
