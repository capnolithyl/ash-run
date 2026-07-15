import test from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/game/app/GameController.js";
import { controllerBattleMethods } from "../src/game/app/controllerBattleMethods.js";
import { createDefaultOptions, normalizeMetaOptions } from "../src/game/state/defaults.js";
import {
  classifyUiActionAudioCue,
  isGameplayAudioRoutedAction,
  UI_AUDIO_CUES
} from "../src/ui/appShell/audioFeedback.js";
import { appShellDisplayMethods } from "../src/ui/appShell/displayMethods.js";
import { appShellEventMethods } from "../src/ui/appShell/eventMethods.js";
import { appShellInputMethods } from "../src/ui/appShell/inputMethods.js";

function createElement({
  dataset = {},
  disabled = false,
  readOnly = false,
  ariaDisabled = null,
  classes = [],
  tagName = "BUTTON",
  textContent = "Control",
  contained = []
} = {}) {
  const element = {
    dataset,
    disabled,
    readOnly,
    tagName,
    textContent,
    classList: {
      contains(name) {
        return classes.includes(name);
      },
      add() {},
      remove() {}
    },
    getAttribute(name) {
      if (name === "aria-disabled") {
        return ariaDisabled;
      }
      return null;
    },
    querySelector() {
      return null;
    },
    matches() {
      return false;
    },
    closest(selector) {
      if (selector === "label") {
        return null;
      }
      if (selector === '[data-role="commander-slider"]') {
        return null;
      }
      return element;
    },
    contains(candidate) {
      return contained.includes(candidate);
    },
    focus() {
      return undefined;
    }
  };

  return element;
}

function createAudioController(cues, overrides = {}) {
  return {
    emitAudioCue(cueId, context) {
      cues.push({ cueId, context });
    },
    ...overrides
  };
}

test("audio option defaults and old saves normalize category volumes without a migration", () => {
  assert.deepEqual(
    {
      masterVolume: createDefaultOptions().masterVolume,
      musicVolume: createDefaultOptions().musicVolume,
      sfxVolume: createDefaultOptions().sfxVolume,
      muted: createDefaultOptions().muted
    },
    {
      masterVolume: 0.4,
      musicVolume: 1,
      sfxVolume: 0.85,
      muted: false
    }
  );

  const repaired = normalizeMetaOptions({
    masterVolume: 2,
    musicVolume: -1,
    sfxVolume: "nope",
    muted: "true"
  });

  assert.equal(repaired.masterVolume, 1);
  assert.equal(repaired.musicVolume, 0);
  assert.equal(repaired.sfxVolume, 0.85);
  assert.equal(repaired.muted, false);
});

test("controller audio requests are ephemeral and do not emit state changes", () => {
  const controller = new GameController();
  const requests = [];
  const optionPreviews = [];
  let stateChanges = 0;
  const unsubscribeState = controller.subscribe(() => {
    stateChanges += 1;
  });
  const unsubscribeAudio = controller.subscribeAudioCues((request) => requests.push(request));
  const unsubscribeOptions = controller.subscribeAudioOptions((options) => optionPreviews.push(options));
  const before = controller.getState();

  controller.emitAudioCue("ui.confirm", {
    dedupeKey: "continue",
    eventId: 9,
    pan: 0.2,
    source: "test"
  });

  assert.deepEqual(requests, [
    {
      cueId: "ui.confirm",
      dedupeKey: "continue",
      eventId: 9,
      pan: 0.2,
      source: "test"
    }
  ]);
  assert.equal(stateChanges, 0);
  assert.deepEqual(controller.getState(), before);

  controller.previewAudioOptions({ sfxVolume: 0.23 });
  assert.equal(optionPreviews.at(-1).sfxVolume, 0.23);
  assert.equal(stateChanges, 0);
  assert.deepEqual(controller.getState(), before);

  unsubscribeOptions();
  unsubscribeAudio();
  unsubscribeState();
  controller.emitAudioCue("ui.cancel");
  assert.equal(requests.length, 1);
});

test("audio range input previews live gain without persisting or rerendering", () => {
  const previews = [];
  const valueLabel = { textContent: "85%" };
  const target = createElement({ dataset: { option: "sfxVolume" }, tagName: "INPUT" });
  target.type = "range";
  target.value = "0.37";
  target.closest = (selector) =>
    selector === ".option-row"
      ? { querySelector: () => valueLabel }
      : selector === "label"
        ? null
        : target;

  appShellEventMethods.handleInput.call(
    {
      controller: {
        previewAudioOptions(patch) {
          previews.push(patch);
        }
      }
    },
    { target }
  );

  assert.deepEqual(previews, [{ sfxVolume: 0.37 }]);
  assert.equal(valueLabel.textContent, "37%");
});

test("UI actions classify cancel, danger, adjust, and ordinary confirmation distinctly", () => {
  assert.equal(classifyUiActionAudioCue("resume-battle"), UI_AUDIO_CUES.CANCEL);
  assert.equal(classifyUiActionAudioCue("confirm-abandon-run"), UI_AUDIO_CUES.DANGER);
  assert.equal(classifyUiActionAudioCue("select-slot"), UI_AUDIO_CUES.ADJUST);
  assert.equal(classifyUiActionAudioCue("select-options-tab"), UI_AUDIO_CUES.ADJUST);
  assert.equal(classifyUiActionAudioCue("start-run"), UI_AUDIO_CUES.CONFIRM);
  assert.equal(isGameplayAudioRoutedAction("begin-attack"), true);
  assert.equal(isGameplayAudioRoutedAction("start-run"), false);
  assert.equal(
    classifyUiActionAudioCue(null, createElement({ dataset: { windowAction: "close" } })),
    UI_AUDIO_CUES.DANGER
  );
});

test("delegated hover fires once on logical entry and ignores nested or disabled transitions", () => {
  const cues = [];
  const child = {};
  const enabled = createElement({ dataset: { action: "start-run" }, contained: [child] });
  const disabled = createElement({ dataset: { action: "start-run" }, disabled: true });
  const shell = { controller: createAudioController(cues) };

  appShellEventMethods.handleAudioPointerOver.call(shell, {
    target: enabled,
    relatedTarget: null
  });
  appShellEventMethods.handleAudioPointerOver.call(shell, {
    target: enabled,
    relatedTarget: child
  });
  appShellEventMethods.handleAudioPointerOver.call(shell, {
    target: disabled,
    relatedTarget: null
  });

  assert.deepEqual(cues.map(({ cueId }) => cueId), [UI_AUDIO_CUES.HOVER]);
  assert.equal(cues[0].context.userInitiated, false);
});

test("delegated clicks keep disabled, ARIA-disabled, and suppressed swipe controls silent", async () => {
  const cues = [];
  const controller = createAudioController(cues, {
    selectCommander() {
      throw new Error("suppressed commander click should not route");
    }
  });
  const shell = {
    latestState: {},
    controller,
    commanderSliderSuppressClick: true
  };
  const suppressed = createElement({ dataset: { action: "select-commander" } });
  suppressed.closest = (selector) =>
    selector === "label" ? null : selector === '[data-role="commander-slider"]' ? {} : suppressed;

  await appShellEventMethods.handleClick.call(shell, {
    target: suppressed,
    preventDefault() {}
  });
  await appShellEventMethods.handleClick.call(
    { latestState: {}, controller },
    { target: createElement({ dataset: { action: "start-run" }, disabled: true }) }
  );
  await appShellEventMethods.handleClick.call(
    { latestState: {}, controller },
    {
      target: createElement({
        dataset: { action: "start-run" },
        ariaDisabled: "true"
      })
    }
  );

  assert.deepEqual(cues, []);
});

test("gameplay actions defer feedback to validated controller and presentation cues", async () => {
  const cues = [];
  let beganAttack = 0;
  const controller = createAudioController(cues, {
    async beginSelectedAttack() {
      beganAttack += 1;
    }
  });

  await appShellEventMethods.handleClick.call(
    { latestState: {}, controller },
    { target: createElement({ dataset: { action: "begin-attack" } }) }
  );

  assert.equal(beganAttack, 1);
  assert.deepEqual(cues, []);
});

test("click, keyboard click, tooltip controls, and one form change use the same delegated routing", async () => {
  const cues = [];
  let changes = 0;
  const controller = createAudioController(cues, {
    openOptions() {},
    async updateOptions() {
      changes += 1;
    }
  });
  const shell = { latestState: {}, controller };

  await appShellEventMethods.handleClick.call(shell, {
    target: createElement({ dataset: { action: "open-options" } })
  });
  await appShellEventMethods.handleClick.call(shell, {
    target: createElement({ dataset: { tooltipTrigger: "active" } })
  });
  await appShellEventMethods.handleChange.call(shell, {
    target: createElement({
      dataset: { option: "sfxVolume" },
      tagName: "INPUT",
      textContent: "",
      type: "range",
      value: "0.6"
    })
  });

  assert.deepEqual(
    cues.map(({ cueId }) => cueId),
    [UI_AUDIO_CUES.CONFIRM, UI_AUDIO_CUES.ADJUST, UI_AUDIO_CUES.ADJUST]
  );
  assert.equal(changes, 1);
});

test("window chrome controls route feedback even though they do not use data-action", async () => {
  const cues = [];
  let minimized = 0;
  const trigger = createElement({ dataset: { windowAction: "minimize" } });

  await appShellDisplayMethods.handleWindowChromeClick.call(
    {
      controller: createAudioController(cues),
      getDesktopApi() {
        return {
          async minimizeWindow() {
            minimized += 1;
          }
        };
      }
    },
    { target: trigger }
  );

  assert.equal(minimized, 1);
  assert.deepEqual(cues.map(({ cueId }) => cueId), [UI_AUDIO_CUES.ADJUST]);
});

test("manual controller focus movement ticks once while render restoration stays silent", () => {
  const cues = [];
  const first = createElement({ dataset: { action: "open-options" } });
  const second = createElement({ dataset: { action: "open-progression" } });
  const shell = {
    controller: createAudioController(cues),
    controllerFocusElement: null,
    isElementControllerFocusable() {
      return true;
    },
    clearControllerFocus() {
      this.controllerFocusElement = null;
    }
  };

  appShellInputMethods.setControllerFocus.call(shell, first);
  appShellInputMethods.setControllerFocus.call(shell, second, { announce: true });
  appShellInputMethods.setControllerFocus.call(shell, second, { announce: true });

  assert.deepEqual(cues.map(({ cueId }) => cueId), [UI_AUDIO_CUES.HOVER]);
});

test("gamepad pause and context feedback only fires after successful controller validation", () => {
  const cues = [];
  let pauseAccepted = false;
  const controller = createAudioController(cues, {
    openPauseMenu() {
      return pauseAccepted;
    },
    handleBattleContextAction() {}
  });
  const shell = {
    latestState: { screen: "battle", battleUi: { pauseMenuOpen: false } },
    controller,
    root: { querySelector: () => null },
    controllerFocusElement: null
  };

  appShellInputMethods.handleGamepadStart.call(shell);
  appShellInputMethods.handleGamepadBack.call(shell);
  assert.deepEqual(cues, []);

  pauseAccepted = true;
  appShellInputMethods.handleGamepadStart.call(shell);
  assert.deepEqual(cues.map(({ cueId }) => cueId), [UI_AUDIO_CUES.CONFIRM]);
});

test("commander swipe navigation emits one adjust cue while its click remains suppressed", () => {
  const cues = [];
  let scrollSteps = 0;
  const slider = { setPointerCapture() {} };
  const shell = {
    controller: createAudioController(cues),
    commanderSliderSwipeState: {
      slider,
      sliderId: "run-commanders",
      pointerId: 4,
      startX: 100,
      startY: 100,
      swiped: false
    },
    useMouseInputMode() {},
    scrollCommanderSliderById(_id, step) {
      scrollSteps += step;
    }
  };

  appShellInputMethods.handlePointerMove.call(shell, {
    pointerId: 4,
    clientX: 40,
    clientY: 102,
    cancelable: true,
    preventDefault() {}
  });

  assert.equal(scrollSteps, 1);
  assert.deepEqual(cues.map(({ cueId }) => cueId), [UI_AUDIO_CUES.ADJUST]);
});

test("battlefield selection cues are derived after tile validation", async () => {
  const cases = [
    {
      name: "selection",
      state: { selection: null, pendingAction: null },
      change(state) {
        state.selection = { type: "unit", id: "unit-1", x: 2, y: 2 };
        return true;
      },
      expected: "battle.select"
    },
    {
      name: "movement",
      state: {
        selection: { type: "unit", id: "unit-1", x: 1, y: 1 },
        pendingAction: null
      },
      change(state) {
        state.pendingAction = {
          type: "move",
          unitId: "unit-1",
          mode: "menu",
          fromX: 1,
          fromY: 1,
          toX: 2,
          toY: 2
        };
        state.selection = { type: "unit", id: "unit-1", x: 2, y: 2 };
        return true;
      },
      expected: "battle.move-confirm"
    },
    {
      name: "target",
      state: {
        selection: { type: "unit", id: "medic-1", x: 1, y: 1 },
        pendingAction: { type: "move", unitId: "medic-1", mode: "support" }
      },
      change(state) {
        state.pendingAction = null;
        state.selection = null;
        return true;
      },
      expected: "battle.target-confirm"
    },
    {
      name: "invalid target",
      state: {
        selection: { type: "unit", id: "medic-1", x: 1, y: 1 },
        pendingAction: { type: "move", unitId: "medic-1", mode: "support" }
      },
      change() {
        return false;
      },
      expected: "battle.invalid"
    },
    {
      name: "deselection",
      state: {
        selection: { type: "tile", id: null, x: 1, y: 1 },
        pendingAction: null
      },
      change(state) {
        state.selection = null;
        return true;
      },
      expected: "battle.deselect"
    }
  ];

  for (const entry of cases) {
    const cues = [];
    const battleState = structuredClone(entry.state);
    const shell = {
      battleSystem: {
        state: battleState,
        handleTileSelection() {
          return entry.change(battleState);
        },
        isEnemyTurnActive() {
          return false;
        }
      },
      state: {},
      emitAudioCue: createAudioController(cues).emitAudioCue,
      isBattleInputLocked() {
        return false;
      },
      guardTutorialBattleAction() {
        return true;
      },
      async persistCurrentRun() {}
    };

    await controllerBattleMethods.handleBattleTileClick.call(shell, 2, 2);
    assert.deepEqual(cues.map(({ cueId }) => cueId), [entry.expected], entry.name);
  }
});

test("battle targeting, context rollback, next-unit selection, and end-turn cues require success", async () => {
  const cues = [];
  const battleState = {
    selection: { type: "unit", id: "medic-1", x: 1, y: 1 },
    pendingAction: { type: "move", unitId: "medic-1", mode: "menu" }
  };
  const shell = {
    battleSystem: {
      state: battleState,
      useSupportAbilityWithPendingUnit() {
        battleState.pendingAction.mode = "support";
        return true;
      },
      handleContextAction() {
        battleState.pendingAction.mode = "menu";
        return true;
      },
      selectNextReadyUnit() {
        battleState.selection = { type: "unit", id: "unit-2", x: 3, y: 3 };
        return true;
      },
      endTurn() {
        return true;
      },
      isEnemyTurnActive() {
        return false;
      }
    },
    state: {
      battleSnapshot: { turn: { number: 3, activeSide: "player" } }
    },
    lastBattleContextActionAt: 0,
    emitAudioCue: createAudioController(cues).emitAudioCue,
    isBattleInputLocked() {
      return false;
    },
    guardTutorialBattleAction() {
      return true;
    },
    syncBattleState() {},
    async persistCurrentRun() {}
  };

  await controllerBattleMethods.useSelectedSupportAbility.call(shell);
  await controllerBattleMethods.handleBattleContextAction.call(shell);
  battleState.pendingAction = null;
  await controllerBattleMethods.selectNextReadyUnit.call(shell);
  await controllerBattleMethods.endTurn.call(shell);

  assert.deepEqual(cues.map(({ cueId }) => cueId), [
    "battle.targeting",
    "ui.cancel",
    "battle.select",
    "battle.turn-end"
  ]);
});
