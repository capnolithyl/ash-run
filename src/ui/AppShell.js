import { SCREEN_IDS } from "../game/core/constants.js";
import { appShellCommanderSliderMethods } from "./appShell/commanderSliderMethods.js";
import { appShellEventMethods } from "./appShell/eventMethods.js";
import { appShellInputMethods } from "./appShell/inputMethods.js";
import { appShellRenderMethods } from "./appShell/renderMethods.js";

export { shouldTriggerCommanderSwipe } from "./appShell/shared.js";

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
    this.combatCutscenePlayback = null;
    this.fundsAnimationFrame = null;
    this.activeFundsGainElement = null;
    this.activeFundsGainId = null;
    this.battleDrawers = {
      intel: false,
      command: false,
      intelTab: "selected"
    };
    this.runLoadoutTableScroll = {
      top: 0,
      left: 0
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
}

Object.assign(AppShell.prototype, appShellEventMethods);
Object.assign(AppShell.prototype, appShellRenderMethods);
Object.assign(AppShell.prototype, appShellCommanderSliderMethods);
Object.assign(AppShell.prototype, appShellInputMethods);
