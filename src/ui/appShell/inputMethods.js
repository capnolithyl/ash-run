import { SCREEN_IDS } from "../../game/core/constants.js";
import {
  GAMEPAD_AXIS_THRESHOLD,
  GAMEPAD_BUTTONS,
  GAMEPAD_REPEAT_INITIAL_MS,
  GAMEPAD_REPEAT_MS,
  normalizeLoopedIndex,
  shouldTriggerCommanderSwipe
} from "./shared.js";

export const appShellInputMethods = {
  handlePointerDown(event) {
    this.useMouseInputMode(event);

    if (event.button !== 0) {
      return;
    }

    const slider = event.target?.closest?.('[data-role="commander-slider"]');

    if (!slider) {
      return;
    }

    this.commanderSliderSwipeState = {
      slider,
      sliderId: this.getCommanderSliderId(slider),
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      swiped: false
    };
  },

  handlePointerMove(event) {
    this.useMouseInputMode(event);

    const swipeState = this.commanderSliderSwipeState;

    if (!swipeState || swipeState.pointerId !== event.pointerId || swipeState.swiped) {
      return;
    }

    const deltaX = event.clientX - swipeState.startX;
    const deltaY = event.clientY - swipeState.startY;

    if (!shouldTriggerCommanderSwipe(deltaX, deltaY)) {
      return;
    }

    swipeState.swiped = true;
    swipeState.slider?.setPointerCapture?.(event.pointerId);
    this.scrollCommanderSliderById(swipeState.sliderId, deltaX > 0 ? -1 : 1);

    if (event.cancelable) {
      event.preventDefault();
    }
  },

  handlePointerUp(event) {
    if (this.commanderSliderSwipeState?.pointerId === event.pointerId) {
      this.releaseCommanderSliderPointerCapture(this.commanderSliderSwipeState, event.pointerId);

      if (this.commanderSliderSwipeState.swiped) {
        this.commanderSliderSuppressClick = true;
        window.setTimeout(() => {
          this.commanderSliderSuppressClick = false;
        }, 0);
      }

      this.commanderSliderSwipeState = null;
    }
  },

  handlePointerCancel(event) {
    if (this.commanderSliderSwipeState?.pointerId === event.pointerId) {
      this.releaseCommanderSliderPointerCapture(this.commanderSliderSwipeState, event.pointerId);
      this.commanderSliderSwipeState = null;
    }
  },

  releaseCommanderSliderPointerCapture(swipeState, pointerId) {
    if (!swipeState?.slider?.hasPointerCapture?.(pointerId)) {
      return;
    }

    swipeState.slider.releasePointerCapture?.(pointerId);
  },

  useMouseInputMode(event) {
    if (event?.pointerType && event.pointerType !== "mouse") {
      return;
    }

    this.setInputMode("mouse");
  },

  setInputMode(mode) {
    if (this.inputMode === mode) {
      return;
    }

    this.inputMode = mode;
    this.root.dataset.inputMode = mode;

    if (mode !== "controller") {
      this.clearControllerFocus();
    }
  },

  handleDragStart(event) {
    if (event.target?.closest?.('[data-role="commander-slider"]')) {
      event.preventDefault();
    }
  },

  handleResize() {
    if (
      this.latestState?.screen !== SCREEN_IDS.COMMANDER_SELECT &&
      this.latestState?.screen !== SCREEN_IDS.SKIRMISH_SETUP
    ) {
      return;
    }

    this.syncCommanderSliders(this.latestState, { forceCurrentIndex: true, behavior: "auto" });
  },

  pollGamepadInput(time) {
    this.gamepadPollFrame = window.requestAnimationFrame((nextTime) =>
      this.pollGamepadInput(nextTime)
    );

    const gamepad = this.getPrimaryGamepad();

    if (!gamepad || !this.latestState) {
      this.gamepadButtonState.clear();
      this.gamepadMoveDirection = null;
      return;
    }

    if (this.consumeGamepadButtonPress(gamepad, GAMEPAD_BUTTONS.START)) {
      this.setInputMode("controller");
      this.handleGamepadStart();
      return;
    }

    if (this.consumeGamepadButtonPress(gamepad, GAMEPAD_BUTTONS.B)) {
      this.setInputMode("controller");
      this.handleGamepadBack();
      return;
    }

    if (this.consumeGamepadButtonPress(gamepad, GAMEPAD_BUTTONS.Y)) {
      this.setInputMode("controller");
      this.handleGamepadUtility();
      return;
    }

    if (this.consumeGamepadButtonPress(gamepad, GAMEPAD_BUTTONS.A)) {
      this.setInputMode("controller");
      this.activateControllerFocus();
      return;
    }

    if (this.consumeGamepadButtonPress(gamepad, GAMEPAD_BUTTONS.LB)) {
      this.setInputMode("controller");
      this.moveControllerFocusByStep(-1);
      return;
    }

    if (this.consumeGamepadButtonPress(gamepad, GAMEPAD_BUTTONS.RB)) {
      this.setInputMode("controller");
      this.moveControllerFocusByStep(1);
      return;
    }

    const moveDirection = this.getGamepadMoveDirection(gamepad);

    if (!moveDirection) {
      this.gamepadMoveDirection = null;
      this.gamepadNextMoveAt = 0;
      return;
    }

    const directionChanged =
      !this.gamepadMoveDirection ||
      this.gamepadMoveDirection.x !== moveDirection.x ||
      this.gamepadMoveDirection.y !== moveDirection.y;

    if (!directionChanged && time < this.gamepadNextMoveAt) {
      return;
    }

    this.setInputMode("controller");
    this.moveControllerFocus(moveDirection);
    this.gamepadMoveDirection = moveDirection;
    this.gamepadNextMoveAt =
      time + (directionChanged ? GAMEPAD_REPEAT_INITIAL_MS : GAMEPAD_REPEAT_MS);
  },

  getPrimaryGamepad() {
    return (
      globalThis.navigator
        ?.getGamepads?.()
        ?.find((gamepad) => gamepad?.connected && gamepad.buttons?.length) ?? null
    );
  },

  consumeGamepadButtonPress(gamepad, buttonIndex) {
    const pressed = Boolean(gamepad?.buttons?.[buttonIndex]?.pressed);
    const previous = this.gamepadButtonState.get(buttonIndex) === true;
    this.gamepadButtonState.set(buttonIndex, pressed);
    return pressed && !previous;
  },

  getGamepadMoveDirection(gamepad) {
    const axisX = Number(gamepad?.axes?.[0] ?? 0);
    const axisY = Number(gamepad?.axes?.[1] ?? 0);
    const dpadLeft = Boolean(gamepad?.buttons?.[14]?.pressed);
    const dpadRight = Boolean(gamepad?.buttons?.[15]?.pressed);
    const dpadUp = Boolean(gamepad?.buttons?.[12]?.pressed);
    const dpadDown = Boolean(gamepad?.buttons?.[13]?.pressed);
    const horizontal = dpadLeft
      ? -1
      : dpadRight
        ? 1
        : axisX <= -GAMEPAD_AXIS_THRESHOLD
          ? -1
          : axisX >= GAMEPAD_AXIS_THRESHOLD
            ? 1
            : 0;
    const vertical = dpadUp
      ? -1
      : dpadDown
        ? 1
        : axisY <= -GAMEPAD_AXIS_THRESHOLD
          ? -1
          : axisY >= GAMEPAD_AXIS_THRESHOLD
            ? 1
            : 0;

    if (!horizontal && !vertical) {
      return null;
    }

    if (horizontal && Math.abs(axisX) >= Math.abs(axisY)) {
      return { x: horizontal, y: 0 };
    }

    if (vertical) {
      return { x: 0, y: vertical };
    }

    return { x: horizontal, y: 0 };
  },

  syncControllerFocusAfterRender() {
    if (this.inputMode !== "controller") {
      this.clearControllerFocus();
      return;
    }

    if (!this.controllerFocusElement) {
      this.focusPreferredBattleControl();
      this.focusDefaultMenuControl();
      return;
    }

    const previousAction = this.controllerFocusElement.dataset?.action;
    const previousUnitTypeId = this.controllerFocusElement.dataset?.unitTypeId;
    const previousCommanderId = this.controllerFocusElement.dataset?.commanderId;
    const previousSlotId = this.controllerFocusElement.dataset?.slotId;

    if (this.isElementControllerFocusable(this.controllerFocusElement)) {
      this.setControllerFocus(this.controllerFocusElement);
      return;
    }

    const replacement = this.getControllerFocusableElements().find((element) => {
      if (previousAction && element.dataset.action !== previousAction) {
        return false;
      }

      return (
        (!previousUnitTypeId || element.dataset.unitTypeId === previousUnitTypeId) &&
        (!previousCommanderId || element.dataset.commanderId === previousCommanderId) &&
        (!previousSlotId || element.dataset.slotId === previousSlotId)
      );
    });

    if (replacement) {
      this.setControllerFocus(replacement);
      return;
    }

    this.clearControllerFocus();
    this.focusPreferredBattleControl();
    this.focusDefaultMenuControl();
  },

  focusPreferredBattleControl() {
    if (this.latestState?.screen !== SCREEN_IDS.BATTLE) {
      return;
    }

    const preferred = this.root.querySelector(
      ".battle-overlay button:not(:disabled), .battle-command-prompt button:not(:disabled), .recruit-card:not(:disabled)"
    );

    if (preferred && this.isElementControllerFocusable(preferred)) {
      this.setControllerFocus(preferred);
    }
  },

  focusDefaultMenuControl() {
    if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
      return;
    }

    const elements = this.getControllerFocusableElements();

    if (elements.length) {
      this.setControllerFocus(this.getDefaultControllerFocus(elements));
    }
  },

  getControllerFocusableElements() {
    return Array.from(
      this.root.querySelectorAll(
        'button[data-action], label[for], input[type="range"], input[type="checkbox"]:not(.battle-drawer-toggle):not(.tutorial-step-toggle)'
      )
    ).filter((element) => this.isElementControllerFocusable(element));
  },

  isElementControllerFocusable(element) {
    if (!element || !this.root.contains(element)) {
      return false;
    }

    if (element.disabled || element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    const styles = window.getComputedStyle(element);

    if (
      styles.display === "none" ||
      styles.visibility === "hidden" ||
      styles.pointerEvents === "none"
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.right < 0 ||
      rect.bottom < 0 ||
      rect.left > window.innerWidth ||
      rect.top > window.innerHeight
    ) {
      return false;
    }

    const sliderViewport = element.closest('[data-role="commander-slider"]');

    if (sliderViewport) {
      const viewportRect = sliderViewport.getBoundingClientRect();
      return rect.right > viewportRect.left && rect.left < viewportRect.right;
    }

    return true;
  },

  setControllerFocus(element) {
    if (!this.isElementControllerFocusable(element)) {
      this.clearControllerFocus();
      return;
    }

    if (this.controllerFocusElement && this.controllerFocusElement !== element) {
      this.controllerFocusElement.classList.remove("is-controller-focused");
    }

    this.controllerFocusElement = element;
    element.classList.add("is-controller-focused");

    if (typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }
  },

  clearControllerFocus() {
    this.controllerFocusElement?.classList.remove("is-controller-focused");
    this.controllerFocusElement = null;
  },

  moveControllerFocusByStep(step) {
    const elements = this.getControllerFocusableElements();

    if (!elements.length) {
      this.clearControllerFocus();
      return;
    }

    const currentIndex = elements.indexOf(this.controllerFocusElement);
    const nextIndex = normalizeLoopedIndex(currentIndex + step, elements.length);
    this.setControllerFocus(elements[nextIndex]);
  },

  moveControllerFocus(direction) {
    const current = this.controllerFocusElement;

    if (current?.type === "range" && direction.x !== 0) {
      this.adjustRangeWithController(current, direction.x);
      return;
    }

    const elements = this.getControllerFocusableElements();

    if (!elements.length) {
      this.clearControllerFocus();
      return;
    }

    if (!this.isElementControllerFocusable(current)) {
      this.setControllerFocus(this.getDefaultControllerFocus(elements));
      return;
    }

    const currentRect = current.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2
    };
    let bestCandidate = null;
    let bestScore = Infinity;

    for (const element of elements) {
      if (element === current) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      const deltaX = center.x - currentCenter.x;
      const deltaY = center.y - currentCenter.y;
      const primaryDistance = direction.x ? deltaX * direction.x : deltaY * direction.y;

      if (primaryDistance <= 4) {
        continue;
      }

      const crossDistance = direction.x ? Math.abs(deltaY) : Math.abs(deltaX);
      const score = primaryDistance + crossDistance * 1.8;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = element;
      }
    }

    if (bestCandidate) {
      this.setControllerFocus(bestCandidate);
      return;
    }

    this.moveControllerFocusByStep(direction.x + direction.y > 0 ? 1 : -1);
  },

  getDefaultControllerFocus(elements) {
    if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
      return (
        elements.find((element) => element.closest(".battle-overlay, .battle-command-prompt")) ??
        elements.find((element) => element.classList.contains("recruit-card")) ??
        elements.find((element) => element.dataset.action === "end-turn") ??
        elements[0]
      );
    }

    if (this.latestState?.screen === SCREEN_IDS.COMMANDER_SELECT) {
      return (
        elements.find(
          (element) =>
            element.dataset.action === "select-commander" &&
            element.dataset.commanderId === this.latestState.selectedCommanderId
        ) ??
        elements.find((element) => element.dataset.action === "open-run-loadout") ??
        elements[0]
      );
    }

    if (this.latestState?.screen === SCREEN_IDS.RUN_LOADOUT) {
      return (
        elements.find((element) => element.dataset.action === "run-loadout-add") ??
        elements.find((element) => element.dataset.action === "start-run") ??
        elements.find((element) => element.dataset.action === "back-to-commander-select") ??
        elements[0]
      );
    }

    return elements[0];
  },

  adjustRangeWithController(range, direction) {
    const step = Number(range.step) || 1;
    const min = Number(range.min) || 0;
    const max = Number(range.max) || 100;
    const current = Number(range.value) || min;
    const nextValue = Math.max(min, Math.min(max, current + step * direction));

    if (nextValue === current) {
      return;
    }

    range.value = `${nextValue}`;
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  },

  activateControllerFocus() {
    const elements = this.getControllerFocusableElements();

    if (!elements.length) {
      return;
    }

    if (!this.isElementControllerFocusable(this.controllerFocusElement)) {
      this.setControllerFocus(this.getDefaultControllerFocus(elements));
      return;
    }

    this.controllerFocusElement.click();
  },

  handleGamepadStart() {
    if (this.latestState?.screen !== SCREEN_IDS.BATTLE) {
      this.activateControllerFocus();
      return;
    }

    if (this.latestState.battleUi?.pauseMenuOpen) {
      this.controller.closePauseMenu();
      return;
    }

    this.controller.openPauseMenu();
  },

  handleGamepadBack() {
    const cancelElement = this.root.querySelector(
      [
        '[data-action="cancel-attack"]',
        '[data-action="cancel-transport-choice"]',
        '[data-action="cancel-support-choice"]',
        '[data-action="cancel-medpack-choice"]',
        '[data-action="cancel-extinguish-choice"]',
        '[data-action="cancel-unload-choice"]',
        '[data-action="cancel-abandon-run"]',
        '[data-action="resume-battle"]',
        '[data-action="redo-move"]',
        '[data-action="back-to-commander-select"]',
        '[data-action="back-to-title"]'
      ].join(",")
    );

    if (cancelElement && this.isElementControllerFocusable(cancelElement)) {
      this.setControllerFocus(cancelElement);
      cancelElement.click();
      return;
    }

    if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
      if (this.controllerFocusElement) {
        this.clearControllerFocus();
        return;
      }

      this.controller.handleBattleContextAction();
    }
  },

  handleGamepadUtility() {
    if (this.latestState?.screen !== SCREEN_IDS.BATTLE) {
      return;
    }

    const commandPrompt = this.root.querySelector(".battle-command-prompt");

    if (commandPrompt) {
      const waitButton = commandPrompt.querySelector('[data-action="wait-unit"]');

      if (waitButton && this.isElementControllerFocusable(waitButton)) {
        this.setControllerFocus(waitButton);
        waitButton.click();
      }

      return;
    }

    const endTurnButton = this.root.querySelector('[data-action="end-turn"]');

    if (endTurnButton && this.isElementControllerFocusable(endTurnButton)) {
      this.setControllerFocus(endTurnButton);
      endTurnButton.click();
    }
  }
};
