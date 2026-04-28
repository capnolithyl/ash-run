import {
  BATTLE_FUNDS_GAIN_ANIMATION_MS,
  BATTLE_TURN_BANNER_DISPLAY_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  SCREEN_IDS
} from "../game/core/constants.js";
import { renderBattleHudView } from "./views/battleHudView.js";
import { renderCommanderSelectView } from "./views/commanderSelectView.js";
import { titleCaseSlot } from "./formatters.js";
import { renderOptionsView } from "./views/optionsView.js";
import { renderSaveSlotView } from "./views/saveSlotView.js";
import { renderSkirmishSetupView } from "./views/skirmishSetupView.js";
import { renderTitleView } from "./views/titleView.js";
import { renderTutorialView } from "./views/tutorialView.js";

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeLoopedIndex(index, count) {
  if (count <= 0) {
    return 0;
  }

  return ((index % count) + count) % count;
}

function getVisibleLoopedIndices(startIndex, visibleCount, count) {
  return Array.from({ length: visibleCount }, (_, offset) =>
    normalizeLoopedIndex(startIndex + offset, count)
  );
}

const DEBUG_SPAWN_STAT_DATASETS = [
  ["spawn-attack", "statAttack"],
  ["spawn-armor", "statArmor"],
  ["spawn-max-health", "statMaxHealth"],
  ["spawn-movement", "statMovement"],
  ["spawn-min-range", "statMinRange"],
  ["spawn-max-range", "statMaxRange"],
  ["spawn-max-stamina", "statMaxStamina"],
  ["spawn-max-ammo", "statMaxAmmo"],
  ["spawn-luck", "statLuck"]
];

const COMMANDER_SWIPE_THRESHOLD_PX = 44;
const COMMANDER_SWIPE_DIRECTION_RATIO = 1.2;
const GAMEPAD_BUTTONS = {
  A: 0,
  B: 1,
  Y: 3,
  LB: 4,
  RB: 5,
  START: 9
};
const GAMEPAD_REPEAT_INITIAL_MS = 220;
const GAMEPAD_REPEAT_MS = 120;
const GAMEPAD_AXIS_THRESHOLD = 0.5;
const BATTLE_HP_METER_ANIMATION_MS = 380;
const BATTLE_XP_METER_ANIMATION_MS = 620;

export function shouldTriggerCommanderSwipe(deltaX, deltaY) {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  return (
    horizontalDistance >= COMMANDER_SWIPE_THRESHOLD_PX &&
    horizontalDistance > verticalDistance * COMMANDER_SWIPE_DIRECTION_RATIO
  );
}

/**
 * The DOM shell handles all text-heavy UI.
 * Phaser remains focused on the animated background and battlefield itself.
 */
export class AppShell {
  constructor(root, controller) {
    this.root = root;
    this.controller = controller;
    this.latestState = null;
    this.commanderSliderStates = new Map();
    this.commanderSliderTrackIndex = null;
    this.commanderSliderTransitioning = false;
    this.commanderSliderSwipeState = null;
    this.commanderSliderSuppressClick = false;
    this.previousBattleSnapshot = null;
    this.levelUpRevealUntil = 0;
    this.levelUpRevealTimer = null;
    this.victoryRevealUntil = 0;
    this.victoryRevealTimer = null;
    this.turnBanner = null;
    this.turnBannerUntil = 0;
    this.turnBannerTimer = null;
    this.lastTurnBannerKey = null;
    this.fundsAnimationFrame = null;
    this.activeFundsGainElement = null;
    this.activeFundsGainId = null;
    this.battleDrawers = {
      intel: false,
      command: false
    };
    this.controllerFocusElement = null;
    this.inputMode = "mouse";
    this.gamepadButtonState = new Map();
    this.gamepadMoveDirection = null;
    this.gamepadNextMoveAt = 0;
    this.gamepadPollFrame = null;
    this.root.dataset.inputMode = this.inputMode;

    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("input", (event) => this.handleInput(event));
    this.root.addEventListener("change", (event) => this.handleChange(event));
    this.root.addEventListener("contextmenu", (event) => this.handleContextMenu(event));
    this.root.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.root.addEventListener("dragstart", (event) => this.handleDragStart(event));
    this.root.addEventListener("transitionend", (event) => this.handleTransitionEnd(event));
    window.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    window.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    window.addEventListener("pointercancel", (event) => this.handlePointerCancel(event));
    window.addEventListener("resize", () => this.handleResize());

    this.controller.subscribe((state) => {
      this.latestState = state;
      this.render(state);
    });

    this.gamepadPollFrame = window.requestAnimationFrame((time) => this.pollGamepadInput(time));
  }

  getDebugField(field, fallback = "") {
    return this.root.querySelector(`[data-debug-field="${field}"]`)?.value ?? fallback;
  }

  getDebugNumberField(field, fallback = 0) {
    const parsed = Number(this.getDebugField(field, fallback));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  syncDebugSpawnStatFields() {
    const unitTypeSelect = this.root.querySelector('[data-debug-field="spawn-unit-type"]');
    const selectedOption = unitTypeSelect?.selectedOptions?.[0];

    if (!selectedOption) {
      return;
    }

    for (const [field, datasetKey] of DEBUG_SPAWN_STAT_DATASETS) {
      const input = this.root.querySelector(`[data-debug-field="${field}"]`);

      if (input) {
        input.value = selectedOption.dataset[datasetKey] ?? "";
      }
    }
  }

  render(state) {
    if (state.screen === SCREEN_IDS.COMMANDER_SELECT) {
      this.renderCommanderSelect(state);
      this.syncControllerFocusAfterRender();
      return;
    }

    this.resetCommanderSliderState();

    switch (state.screen) {
      case SCREEN_IDS.LOAD_SLOT:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderSaveSlotView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.OPTIONS:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderOptionsView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.SKIRMISH_SETUP:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderSkirmishSetupView(state);
        this.syncCommanderSliders(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.TUTORIAL:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderTutorialView(state);
        this.syncControllerFocusAfterRender();
        return;
      case SCREEN_IDS.BATTLE: {
        const suppressLevelUpOverlay = this.shouldSuppressLevelUpOverlay(state);
        const suppressOutcomeOverlay = this.shouldSuppressOutcomeOverlay(state);
        const turnBanner = this.getTurnBanner(state);
        const previousMeterState = this.captureBattleMeterState();
        this.captureBattleDrawerState();
        this.root.innerHTML = renderBattleHudView(state, {
          suppressLevelUpOverlay,
          suppressOutcomeOverlay,
          turnBanner
        });
        this.syncDebugSpawnStatFields();
        this.applyBattleDrawerState();
        this.animateBattleMeters(previousMeterState);
        this.animateFundsGain(state);
        this.previousBattleSnapshot = state.battleSnapshot;
        this.syncControllerFocusAfterRender();
        return;
      }
      case SCREEN_IDS.TITLE:
      default:
        this.resetBattleUiTimers();
        this.previousBattleSnapshot = null;
        this.root.innerHTML = renderTitleView(state);
        this.syncControllerFocusAfterRender();
    }
  }

  resetBattleUiTimers() {
    if (this.levelUpRevealTimer) {
      window.clearTimeout(this.levelUpRevealTimer);
      this.levelUpRevealTimer = null;
    }

    if (this.victoryRevealTimer) {
      window.clearTimeout(this.victoryRevealTimer);
      this.victoryRevealTimer = null;
    }

    if (this.turnBannerTimer) {
      window.clearTimeout(this.turnBannerTimer);
      this.turnBannerTimer = null;
    }

    if (this.fundsAnimationFrame) {
      window.cancelAnimationFrame(this.fundsAnimationFrame);
      this.fundsAnimationFrame = null;
    }

    this.levelUpRevealUntil = 0;
    this.victoryRevealUntil = 0;
    this.turnBannerUntil = 0;
    this.turnBanner = null;
    this.lastTurnBannerKey = null;
    this.activeFundsGainElement = null;
    this.activeFundsGainId = null;
    this.battleDrawers.intel = false;
    this.battleDrawers.command = false;
  }

  resetCommanderSliderState() {
    this.commanderSliderStates.clear();
    this.commanderSliderTrackIndex = null;
    this.commanderSliderTransitioning = false;
    this.commanderSliderSwipeState = null;
    this.commanderSliderSuppressClick = false;
  }

  captureBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");

    if (intelDrawer) {
      this.battleDrawers.intel = intelDrawer.checked;
    }

    if (commandDrawer) {
      this.battleDrawers.command = commandDrawer.checked;
    }
  }

  applyBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");

    if (intelDrawer) {
      intelDrawer.checked = this.battleDrawers.intel;
    }

    if (commandDrawer) {
      commandDrawer.checked = this.battleDrawers.command;
    }
  }

  getVictoryKey(snapshot) {
    const victory = snapshot?.victory;

    if (!victory) {
      return null;
    }

    return `${snapshot.id}-${victory.winner}-${victory.message}`;
  }

  getTurnKey(snapshot) {
    if (!snapshot) {
      return null;
    }

    return `${snapshot.id}-${snapshot.turn.number}-${snapshot.turn.activeSide}`;
  }

  getLevelUpKey(snapshot) {
    const levelUpEvent = snapshot?.levelUpQueue?.[0];

    if (!levelUpEvent) {
      return null;
    }

    return `${levelUpEvent.unitId}-${levelUpEvent.previousLevel}-${levelUpEvent.newLevel}`;
  }

  shouldSuppressLevelUpOverlay(state) {
    const currentKey = this.getLevelUpKey(state.battleSnapshot);
    const previousKey = this.getLevelUpKey(this.previousBattleSnapshot);
    const isFreshReveal = currentKey && !previousKey;

    if (isFreshReveal) {
      this.levelUpRevealUntil = Date.now() + 2200;

      if (this.levelUpRevealTimer) {
        window.clearTimeout(this.levelUpRevealTimer);
      }

      this.levelUpRevealTimer = window.setTimeout(() => {
        this.levelUpRevealTimer = null;

        if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
          this.render(this.latestState);
        }
      }, 2220);
    }

    if (!currentKey) {
      this.levelUpRevealUntil = 0;
      return false;
    }

    return Date.now() < this.levelUpRevealUntil;
  }

  shouldSuppressOutcomeOverlay(state) {
    const currentKey = this.getVictoryKey(state.battleSnapshot);
    const previousKey = this.getVictoryKey(this.previousBattleSnapshot);
    const isFreshVictory = currentKey && !previousKey;

    if (isFreshVictory) {
      this.victoryRevealUntil = Date.now() + 1800;

      if (this.victoryRevealTimer) {
        window.clearTimeout(this.victoryRevealTimer);
      }

      this.victoryRevealTimer = window.setTimeout(() => {
        this.victoryRevealTimer = null;

        if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
          this.render(this.latestState);
        }
      }, 1820);
    }

    if (!currentKey) {
      this.victoryRevealUntil = 0;
      return false;
    }

    if (state.battleSnapshot?.levelUpQueue?.length) {
      return true;
    }

    return Date.now() < this.victoryRevealUntil;
  }

  getTurnBanner(state) {
    const snapshot = state.battleSnapshot;
    const currentKey = this.getTurnKey(snapshot);

    if (!snapshot || !currentKey || snapshot.victory) {
      return null;
    }

    if (currentKey !== this.lastTurnBannerKey) {
      this.lastTurnBannerKey = currentKey;
      this.turnBanner = {
        key: currentKey,
        side: snapshot.turn.activeSide,
        number: snapshot.turn.number
      };
      this.turnBannerUntil = Date.now() + BATTLE_TURN_BANNER_DISPLAY_MS;

      if (this.turnBannerTimer) {
        window.clearTimeout(this.turnBannerTimer);
      }

      this.turnBannerTimer = window.setTimeout(() => {
        this.turnBannerTimer = null;

        if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
          this.render(this.latestState);
        }
      }, BATTLE_TURN_BANNER_SETTLE_MS);
    }

    if (Date.now() >= this.turnBannerUntil) {
      return null;
    }

    return this.turnBanner;
  }

  animateFundsGain(state) {
    const fundsGain = state.battleUi?.fundsGain;

    if (!fundsGain || fundsGain.pending) {
      if (this.fundsAnimationFrame) {
        window.cancelAnimationFrame(this.fundsAnimationFrame);
        this.fundsAnimationFrame = null;
      }

      this.activeFundsGainId = null;
      this.activeFundsGainElement = null;
      return;
    }

    const valueElement = this.root.querySelector(`[data-funds-value="${fundsGain.side}"]`);

    if (!valueElement) {
      return;
    }

    if (this.activeFundsGainId === fundsGain.id && this.activeFundsGainElement === valueElement) {
      return;
    }

    if (this.fundsAnimationFrame) {
      window.cancelAnimationFrame(this.fundsAnimationFrame);
      this.fundsAnimationFrame = null;
    }

    this.activeFundsGainId = fundsGain.id;
    this.activeFundsGainElement = valueElement;

    const from = Number(fundsGain.from);
    const to = Number(fundsGain.to);
    const duration = Number(fundsGain.durationMs) || BATTLE_FUNDS_GAIN_ANIMATION_MS;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      valueElement.textContent = `${to}`;
      return;
    }

    const startedAt = performance.now();
    valueElement.textContent = `${from}`;

    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const easedProgress = 1 - (1 - progress) ** 3;
      const currentValue = Math.round(from + (to - from) * easedProgress);

      valueElement.textContent = `${currentValue}`;

      if (progress < 1 && this.activeFundsGainId === fundsGain.id) {
        this.fundsAnimationFrame = window.requestAnimationFrame(tick);
        return;
      }

      valueElement.textContent = `${to}`;
      this.fundsAnimationFrame = null;
    };

    this.fundsAnimationFrame = window.requestAnimationFrame(tick);
  }

  captureBattleMeterState() {
    const meterState = new Map();

    for (const card of this.root.querySelectorAll("[data-selection-unit-card]")) {
      const unitId = card.dataset.selectionUnitCard;

      if (!unitId) {
        continue;
      }

      const hpFill = card.querySelector('[data-meter-fill="hp"]');
      const xpFill = card.parentElement?.querySelector?.('.selection-section--xp [data-meter-fill="xp"]');

      meterState.set(unitId, {
        hp: Number(hpFill?.dataset.meterValue),
        xp: Number(xpFill?.dataset.meterValue)
      });
    }

    return meterState;
  }

  animateBattleMeters(previousMeterState) {
    if (
      !previousMeterState?.size ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    for (const card of this.root.querySelectorAll("[data-selection-unit-card]")) {
      const unitId = card.dataset.selectionUnitCard;

      if (!unitId) {
        continue;
      }

      const previousMeter = previousMeterState.get(unitId);

      if (!previousMeter) {
        continue;
      }

      const hpFill = card.querySelector('[data-meter-fill="hp"]');
      const nextHp = Number(hpFill?.dataset.meterValue);

      if (Number.isFinite(previousMeter.hp) && Number.isFinite(nextHp) && previousMeter.hp !== nextHp) {
        this.animateBattleMeterFill(hpFill, previousMeter.hp, nextHp, {
          duration: BATTLE_HP_METER_ANIMATION_MS,
          emphasisClass: nextHp < previousMeter.hp ? "is-animating-loss" : "is-animating-gain"
        });
      }

      const xpFill = card.parentElement?.querySelector?.('.selection-section--xp [data-meter-fill="xp"]');
      const nextXp = Number(xpFill?.dataset.meterValue);

      if (Number.isFinite(previousMeter.xp) && Number.isFinite(nextXp) && nextXp > previousMeter.xp) {
        this.animateBattleMeterFill(xpFill, previousMeter.xp, nextXp, {
          duration: BATTLE_XP_METER_ANIMATION_MS,
          emphasisClass: "is-animating-gain"
        });
      }
    }
  }

  animateBattleMeterFill(fill, from, to, { duration, emphasisClass } = {}) {
    if (!fill || !Number.isFinite(from) || !Number.isFinite(to) || Math.abs(from - to) < 0.1) {
      return;
    }

    fill.style.transition = "none";
    fill.style.width = `${from}%`;
    fill.classList.remove("is-animating-loss", "is-animating-gain");
    void fill.offsetWidth;

    if (emphasisClass) {
      fill.classList.add(emphasisClass);
    }

    window.requestAnimationFrame(() => {
      fill.style.transition = `width ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      fill.style.width = `${to}%`;
    });

    window.setTimeout(() => {
      if (!document.body.contains(fill)) {
        return;
      }

      fill.style.transition = "";
      fill.classList.remove("is-animating-loss", "is-animating-gain");
    }, duration + 140);
  }

  renderCommanderSelect(state) {
    const existingScreen = this.root.querySelector('[data-screen-id="commander-select"]');

    if (!existingScreen) {
      this.root.innerHTML = renderCommanderSelectView(state);
      this.syncCommanderSlider(state);
      return;
    }

    for (const commanderCard of existingScreen.querySelectorAll("[data-commander-id]")) {
      commanderCard.classList.toggle(
        "commander-card--selected",
        commanderCard.dataset.commanderId === state.selectedCommanderId
      );
    }

    for (const slotCard of existingScreen.querySelectorAll("[data-slot-id]")) {
      slotCard.classList.toggle(
        "slot-card--active",
        slotCard.dataset.slotId === state.selectedSlotId
      );
    }

    const selectedSlot = state.slots.find((slot) => slot.slotId === state.selectedSlotId);
    const selectedSlotText = existingScreen.querySelector('[data-role="selected-slot-text"]');
    const selectedSlotNote = existingScreen.querySelector('[data-role="selected-slot-note"]');
    const startRunButton = existingScreen.querySelector('[data-role="start-run-button"]');

    if (selectedSlotText) {
      selectedSlotText.textContent = `Selected slot: ${titleCaseSlot(state.selectedSlotId)}`;
    }

    if (selectedSlotNote) {
      selectedSlotNote.textContent = selectedSlot?.exists
        ? "Existing save will be replaced."
        : "Fresh save slot.";
    }

    if (startRunButton) {
      startRunButton.disabled = !state.selectedCommanderId;
    }

    this.syncCommanderSlider(state);
  }

  scrollCommanderSlider(direction) {
    this.scrollCommanderSliderById("new-run", direction);
  }

  scrollCommanderSliderById(sliderId, direction) {
    const metrics = this.getCommanderSliderMetrics(sliderId);
    const sliderState = this.getCommanderSliderState(metrics?.id);

    if (!metrics || !metrics.realCount) {
      return;
    }

    if (sliderState.transitioning) {
      return;
    }

    if (!Number.isInteger(sliderState.trackIndex)) {
      sliderState.trackIndex = metrics.homeStartIndex;
    }

    sliderState.trackIndex += direction;
    sliderState.transitioning = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
      animate: sliderState.transitioning
    });
  }

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
  }

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
  }

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
  }

  handlePointerCancel(event) {
    if (this.commanderSliderSwipeState?.pointerId === event.pointerId) {
      this.releaseCommanderSliderPointerCapture(this.commanderSliderSwipeState, event.pointerId);
      this.commanderSliderSwipeState = null;
    }
  }

  releaseCommanderSliderPointerCapture(swipeState, pointerId) {
    if (!swipeState?.slider?.hasPointerCapture?.(pointerId)) {
      return;
    }

    swipeState.slider.releasePointerCapture?.(pointerId);
  }

  useMouseInputMode(event) {
    if (event?.pointerType && event.pointerType !== "mouse") {
      return;
    }

    this.setInputMode("mouse");
  }

  setInputMode(mode) {
    if (this.inputMode === mode) {
      return;
    }

    this.inputMode = mode;
    this.root.dataset.inputMode = mode;

    if (mode !== "controller") {
      this.clearControllerFocus();
    }
  }

  handleDragStart(event) {
    if (event.target?.closest?.('[data-role="commander-slider"]')) {
      event.preventDefault();
    }
  }

  handleResize() {
    if (
      this.latestState?.screen !== SCREEN_IDS.COMMANDER_SELECT &&
      this.latestState?.screen !== SCREEN_IDS.SKIRMISH_SETUP
    ) {
      return;
    }

    this.syncCommanderSliders(this.latestState, { forceCurrentIndex: true, behavior: "auto" });
  }

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
  }

  getPrimaryGamepad() {
    return (
      globalThis.navigator
        ?.getGamepads?.()
        ?.find((gamepad) => gamepad?.connected && gamepad.buttons?.length) ?? null
    );
  }

  consumeGamepadButtonPress(gamepad, buttonIndex) {
    const pressed = Boolean(gamepad?.buttons?.[buttonIndex]?.pressed);
    const previous = this.gamepadButtonState.get(buttonIndex) === true;
    this.gamepadButtonState.set(buttonIndex, pressed);
    return pressed && !previous;
  }

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
  }

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
  }

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
  }

  focusDefaultMenuControl() {
    if (this.latestState?.screen === SCREEN_IDS.BATTLE) {
      return;
    }

    const elements = this.getControllerFocusableElements();

    if (elements.length) {
      this.setControllerFocus(this.getDefaultControllerFocus(elements));
    }
  }

  getControllerFocusableElements() {
    return Array.from(
      this.root.querySelectorAll(
        'button[data-action], label[for], input[type="range"], input[type="checkbox"]:not(.battle-drawer-toggle):not(.tutorial-step-toggle)'
      )
    ).filter((element) => this.isElementControllerFocusable(element));
  }

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
  }

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
  }

  clearControllerFocus() {
    this.controllerFocusElement?.classList.remove("is-controller-focused");
    this.controllerFocusElement = null;
  }

  moveControllerFocusByStep(step) {
    const elements = this.getControllerFocusableElements();

    if (!elements.length) {
      this.clearControllerFocus();
      return;
    }

    const currentIndex = elements.indexOf(this.controllerFocusElement);
    const nextIndex = normalizeLoopedIndex(currentIndex + step, elements.length);
    this.setControllerFocus(elements[nextIndex]);
  }

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
  }

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
        elements.find((element) => element.dataset.action === "start-run") ??
        elements[0]
      );
    }

    return elements[0];
  }

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
  }

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
  }

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
  }

  handleGamepadBack() {
    const cancelElement = this.root.querySelector(
      [
        '[data-action="cancel-attack"]',
        '[data-action="cancel-transport-choice"]',
        '[data-action="cancel-support-choice"]',
        '[data-action="cancel-unload-choice"]',
        '[data-action="cancel-abandon-run"]',
        '[data-action="resume-battle"]',
        '[data-action="redo-move"]',
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
  }

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

  syncCommanderSlider(state, options = {}) {
    this.syncCommanderSliderById("new-run", state, options);
  }

  syncCommanderSliders(state, options = {}) {
    for (const viewport of this.root.querySelectorAll('[data-role="commander-slider"]')) {
      this.syncCommanderSliderById(this.getCommanderSliderId(viewport), state, options);
    }
  }

  syncCommanderSliderById(sliderId, state, options = {}) {
    const metrics = this.getCommanderSliderMetrics(sliderId);
    const sliderState = this.getCommanderSliderState(metrics?.id);

    if (!metrics || !metrics.realCount) {
      return;
    }

    const selectedCommanderId = this.getSelectedCommanderIdForSlider(metrics.id, state);
    const selectedIndex = metrics.realSlides.findIndex(
      (card) => card.dataset.commanderId === selectedCommanderId
    );
    const fallbackIndex = selectedIndex >= 0 ? selectedIndex : 0;

    if (!Number.isInteger(sliderState.trackIndex) || options.forceCurrentIndex) {
      const normalizedIndex = Number.isInteger(sliderState.trackIndex)
        ? normalizeLoopedIndex(sliderState.trackIndex - metrics.homeStartIndex, metrics.realCount)
        : fallbackIndex;
      sliderState.trackIndex = metrics.homeStartIndex + normalizedIndex;
      this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
        animate: options.behavior === "smooth"
      });
      return;
    }

    const currentStartIndex = normalizeLoopedIndex(
      sliderState.trackIndex - metrics.homeStartIndex,
      metrics.realCount
    );
    const visibleIndices = new Set(
      getVisibleLoopedIndices(currentStartIndex, metrics.visibleCount, metrics.realCount)
    );

    if (selectedIndex >= 0 && !visibleIndices.has(selectedIndex)) {
      sliderState.trackIndex = metrics.homeStartIndex + selectedIndex;
      this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
        animate: options.behavior === "smooth"
      });
      return;
    }

    this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
      animate: false
    });
  }

  getSelectedCommanderIdForSlider(sliderId, state) {
    if (sliderId === "skirmish-player") {
      return state.skirmishSetup?.playerCommanderId;
    }

    if (sliderId === "skirmish-enemy") {
      return state.skirmishSetup?.enemyCommanderId;
    }

    return state.selectedCommanderId;
  }

  getCommanderSliderState(sliderId = "new-run") {
    if (!this.commanderSliderStates.has(sliderId)) {
      this.commanderSliderStates.set(sliderId, {
        trackIndex: null,
        transitioning: false
      });
    }

    return this.commanderSliderStates.get(sliderId);
  }

  getCommanderSliderId(element) {
    return element?.dataset?.commanderSliderId || "new-run";
  }

  getCommanderSliderVisibleCount(slider) {
    const styles = window.getComputedStyle(slider);
    const rawValue = Number.parseInt(styles.getPropertyValue("--commander-visible-count"), 10);
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1;
  }

  getCommanderSliderMetrics(sliderId = "new-run") {
    const viewport = Array.from(this.root.querySelectorAll('[data-role="commander-slider"]')).find(
      (candidate) => this.getCommanderSliderId(candidate) === sliderId
    );
    const track = Array.from(this.root.querySelectorAll('[data-role="commander-slider-track"]')).find(
      (candidate) => this.getCommanderSliderId(candidate) === sliderId
    );

    if (!viewport || !track) {
      return null;
    }

    const cards = Array.from(track.querySelectorAll("[data-slide-index]"));
    const copyCount = Number.parseInt(track.dataset.sliderCopyCount ?? "1", 10);
    const homeCopyIndex = Number.parseInt(track.dataset.sliderHomeCopyIndex ?? "0", 10);
    const realCount = copyCount > 0 ? Math.floor(cards.length / copyCount) : 0;
    const homeStartIndex = Math.max(0, homeCopyIndex * realCount);
    const realSlides = cards.slice(homeStartIndex, homeStartIndex + realCount);
    const firstCard = cards[0] ?? null;
    const trackStyles = window.getComputedStyle(track);
    const columnGap = Number.parseFloat(trackStyles.columnGap || trackStyles.gap || "0");
    const slideWidth = firstCard?.getBoundingClientRect().width ?? 0;

    return {
      id: sliderId,
      viewport,
      track,
      cards,
      realSlides,
      copyCount: Number.isFinite(copyCount) && copyCount > 0 ? copyCount : 1,
      homeCopyIndex: Number.isFinite(homeCopyIndex) && homeCopyIndex >= 0 ? homeCopyIndex : 0,
      homeStartIndex,
      realCount,
      visibleCount: this.getCommanderSliderVisibleCount(viewport),
      step: slideWidth + (Number.isFinite(columnGap) ? columnGap : 0)
    };
  }

  setCommanderSliderTrackPosition(metrics, trackIndex, { animate }) {
    if (!metrics.track || !metrics.step) {
      return;
    }

    const useInstantPositioning =
      !animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    metrics.track.classList.toggle("commander-slider__track--instant", useInstantPositioning);
    metrics.track.style.transform = `translate3d(${-trackIndex * metrics.step}px, 0, 0)`;

    if (useInstantPositioning) {
      void metrics.track.getBoundingClientRect();
      metrics.track.classList.remove("commander-slider__track--instant");
      this.getCommanderSliderState(metrics.id).transitioning = false;
    }
  }

  handleTransitionEnd(event) {
    if (
      this.latestState?.screen !== SCREEN_IDS.COMMANDER_SELECT &&
      this.latestState?.screen !== SCREEN_IDS.SKIRMISH_SETUP
    ) {
      return;
    }

    const track = event.target.closest?.('[data-role="commander-slider-track"]');

    if (!track || event.propertyName !== "transform") {
      return;
    }

    const metrics = this.getCommanderSliderMetrics(this.getCommanderSliderId(track));
    const sliderState = this.getCommanderSliderState(metrics?.id);

    if (!metrics || !Number.isInteger(sliderState.trackIndex)) {
      if (metrics) {
        sliderState.transitioning = false;
      }
      return;
    }

    const minimumHomeIndex = metrics.homeStartIndex;
    const maximumHomeIndex = metrics.homeStartIndex + metrics.realCount - 1;

    if (
      sliderState.trackIndex >= minimumHomeIndex &&
      sliderState.trackIndex <= maximumHomeIndex
    ) {
      sliderState.transitioning = false;
      return;
    }

    const normalizedIndex = normalizeLoopedIndex(
      sliderState.trackIndex - metrics.homeStartIndex,
      metrics.realCount
    );
    sliderState.trackIndex = metrics.homeStartIndex + normalizedIndex;
    this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
      animate: false
    });
  }

  async handleContextMenu(event) {
    if (
      this.latestState?.screen !== SCREEN_IDS.BATTLE ||
      !event.target?.closest?.(".battle-shell")
    ) {
      return;
    }

    event.preventDefault();
    await this.controller.handleBattleContextAction();
  }

  async handleClick(event) {
    const trigger = event.target.closest("[data-action]");

    if (!trigger || !this.latestState) {
      return;
    }

    const { action, commanderId, slotId, unitTypeId } = trigger.dataset;

    switch (action) {
      case "open-new-run":
        this.controller.openNewRun();
        break;
      case "open-continue":
        this.controller.openContinue();
        break;
      case "open-skirmish":
        this.controller.openSkirmish();
        break;
      case "open-tutorial":
        this.controller.openTutorial();
        break;
      case "open-options":
        this.controller.openOptions();
        break;
      case "open-debug-run":
        this.controller.startDebugRun();
        break;
      case "back-to-title":
        await this.controller.returnToTitle();
        break;
      case "pause-battle":
        this.controller.openPauseMenu();
        break;
      case "resume-battle":
        this.controller.closePauseMenu();
        break;
      case "prompt-abandon-run":
        this.controller.promptAbandonRun();
        break;
      case "cancel-abandon-run":
        this.controller.cancelAbandonRun();
        break;
      case "confirm-abandon-run":
        await this.controller.abandonRun();
        break;
      case "acknowledge-level-up": {
        const overlay = this.root.querySelector(".battle-overlay--level-up");
        const card = overlay?.querySelector(".overlay-card--level-up");
        overlay?.classList.add("battle-overlay--closing");
        card?.classList.add("overlay-card--closing");
        await delay(220);
        await this.controller.acknowledgeLevelUp();
        break;
      }
      case "quit-game":
        await this.controller.quitGame();
        break;
      case "select-commander":
        if (
          this.commanderSliderSuppressClick &&
          trigger.closest('[data-role="commander-slider"]')
        ) {
          this.commanderSliderSuppressClick = false;
          event.preventDefault();
          return;
        }
        if (trigger.getAttribute("aria-disabled") === "true") {
          return;
        }
        this.controller.selectCommander(commanderId);
        break;
      case "commander-slider-prev":
        this.scrollCommanderSlider(-1);
        break;
      case "commander-slider-next":
        this.scrollCommanderSlider(1);
        break;
      case "scroll-skirmish-commanders":
        this.scrollCommanderSliderById(
          trigger.dataset.commanderSliderId,
          Number(trigger.dataset.skirmishDirection)
        );
        break;
      case "select-slot":
        this.controller.selectSlot(slotId);
        break;
      case "start-run":
        await this.controller.startNewRun();
        break;
      case "select-skirmish-player-commander":
        if (
          this.commanderSliderSuppressClick &&
          trigger.closest('[data-role="commander-slider"]')
        ) {
          this.commanderSliderSuppressClick = false;
          event.preventDefault();
          return;
        }
        if (trigger.getAttribute("aria-disabled") === "true") {
          return;
        }
        this.controller.updateSkirmishSetup({ playerCommanderId: commanderId });
        break;
      case "select-skirmish-enemy-commander":
        if (
          this.commanderSliderSuppressClick &&
          trigger.closest('[data-role="commander-slider"]')
        ) {
          this.commanderSliderSuppressClick = false;
          event.preventDefault();
          return;
        }
        this.controller.updateSkirmishSetup({ enemyCommanderId: commanderId });
        break;
      case "select-skirmish-map":
        this.controller.updateSkirmishSetup({ mapId: trigger.dataset.mapId });
        break;
      case "skirmish-next-step":
        this.controller.updateSkirmishSetup({ step: "map" });
        break;
      case "skirmish-previous-step":
        this.controller.updateSkirmishSetup({ step: "commanders" });
        break;
      case "start-skirmish":
        await this.controller.startSkirmish();
        break;
      case "load-slot":
        await this.controller.loadSlot(slotId);
        break;
      case "delete-slot":
        await this.controller.deleteSlot(slotId);
        break;
      case "end-turn":
        await this.controller.endTurn();
        break;
      case "activate-power":
        await this.controller.activatePower();
        break;
      case "recruit-unit":
        await this.controller.recruitUnit(unitTypeId);
        break;
      case "select-next-unit":
        await this.controller.selectNextReadyUnit();
        break;
      case "wait-unit":
        await this.controller.waitWithSelectedUnit();
        break;
      case "begin-attack":
        await this.controller.beginSelectedAttack();
        break;
      case "cancel-attack":
        await this.controller.cancelSelectedAttack();
        break;
      case "cancel-transport-choice":
        await this.controller.handleBattleContextAction();
        break;
      case "cancel-support-choice":
        await this.controller.handleBattleContextAction();
        break;
      case "cancel-unload-choice":
        await this.controller.handleBattleContextAction();
        break;
      case "capture-building":
        await this.controller.captureWithSelectedUnit();
        break;
      case "use-support":
        await this.controller.useSelectedSupportAbility();
        break;
      case "enter-transport":
        await this.controller.enterSelectedTransport();
        break;
      case "begin-unload":
        await this.controller.beginSelectedUnload();
        break;
      case "redo-move":
        await this.controller.redoSelectedMove();
        break;
      case "advance-run":
        await this.controller.advanceRun();
        break;
      case "debug-spawn-unit":
        await this.controller.debugSpawnUnit({
          owner: this.getDebugField("spawn-owner", "player"),
          unitTypeId: this.getDebugField("spawn-unit-type", "grunt"),
          x: this.getDebugNumberField("spawn-x", 0),
          y: this.getDebugNumberField("spawn-y", 0),
          stats: {
            attack: this.getDebugNumberField("spawn-attack", NaN),
            armor: this.getDebugNumberField("spawn-armor", NaN),
            maxHealth: this.getDebugNumberField("spawn-max-health", NaN),
            movement: this.getDebugNumberField("spawn-movement", NaN),
            minRange: this.getDebugNumberField("spawn-min-range", NaN),
            maxRange: this.getDebugNumberField("spawn-max-range", NaN),
            staminaMax: this.getDebugNumberField("spawn-max-stamina", NaN),
            ammoMax: this.getDebugNumberField("spawn-max-ammo", NaN),
            luck: this.getDebugNumberField("spawn-luck", NaN)
          }
        });
        break;
      case "debug-apply-selected-stats":
        await this.controller.debugApplySelectedUnitStats({
          hp: this.getDebugNumberField("unit-hp", NaN),
          maxHealth: this.getDebugNumberField("unit-max-health", NaN),
          attack: this.getDebugNumberField("unit-attack", NaN),
          armor: this.getDebugNumberField("unit-armor", NaN),
          movement: this.getDebugNumberField("unit-movement", NaN),
          minRange: this.getDebugNumberField("unit-min-range", NaN),
          maxRange: this.getDebugNumberField("unit-max-range", NaN),
          stamina: this.getDebugNumberField("unit-stamina", NaN),
          staminaMax: this.getDebugNumberField("unit-max-stamina", NaN),
          ammo: this.getDebugNumberField("unit-ammo", NaN),
          ammoMax: this.getDebugNumberField("unit-max-ammo", NaN),
          luck: this.getDebugNumberField("unit-luck", NaN),
          level: this.getDebugNumberField("unit-level", NaN),
          experience: this.getDebugNumberField("unit-experience", NaN)
        });
        break;
      case "debug-apply-commanders":
        await this.controller.debugSetCommanders({
          playerCommanderId: this.getDebugField("player-commander", "atlas"),
          enemyCommanderId: this.getDebugField("enemy-commander", "viper")
        });
        break;
      case "debug-full-charge-player":
        await this.controller.debugSetCharge("player", 9999);
        break;
      case "debug-full-charge-enemy":
        await this.controller.debugSetCharge("enemy", 9999);
        break;
      case "debug-refresh-player-actions":
        await this.controller.debugRefreshActions("player");
        break;
      case "debug-refresh-enemy-actions":
        await this.controller.debugRefreshActions("enemy");
        break;
      default:
        break;
    }
  }

  async handleChange(event) {
    const skirmishField = event.target.dataset.skirmishField;

    if (skirmishField) {
      await this.controller.updateSkirmishSetup({
        [skirmishField]: Number(event.target.value)
      });
      return;
    }

    if (event.target.dataset.debugField === "spawn-unit-type") {
      this.syncDebugSpawnStatFields();
      return;
    }

    const optionKey = event.target.dataset.option;

    if (!optionKey) {
      return;
    }

    const nextValue =
      event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);

    await this.controller.updateOptions({
      [optionKey]: nextValue
    });
  }

  handleInput(event) {
    const skirmishField = event.target.dataset.skirmishField;

    if (!skirmishField) {
      return;
    }

    const output = this.root.querySelector(`[data-skirmish-output="${skirmishField}"]`);

    if (output) {
      output.textContent = event.target.value;
    }
  }

}
