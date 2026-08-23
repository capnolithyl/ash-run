import { SCREEN_IDS } from "../game/core/constants.js";
import { appShellCommanderSliderMethods } from "./appShell/commanderSliderMethods.js";
import { appShellDisplayMethods } from "./appShell/displayMethods.js";
import { appShellEventMethods } from "./appShell/eventMethods.js";
import { appShellInputMethods } from "./appShell/inputMethods.js";
import { appShellRenderMethods } from "./appShell/renderMethods.js";

export { shouldTriggerCommanderSwipe } from "./appShell/shared.js";

/**
 * The DOM shell handles all text-heavy UI.
 * Phaser remains focused on the animated background and battlefield itself.
 */
export class AppShell {
  constructor(root, controller, options = {}) {
    this.root = root;
    this.controller = controller;
    this.windowChromeRoot = options.windowChromeRoot ?? null;
    this.latestState = null;
    this.desktopDisplayState = null;
    this.displayDraft = null;
    this.displayConfirmation = null;
    this.displayConfirmationTimer = null;
    this.displayStateRenderTimer = null;
    this.displayUnsubscribe = null;
    this.displayOperation = null;
    this.lastDisplayTransitionFailureId = null;
    this.displayStateRevision = -1;
    this.displayRestoreFocusAction = null;
    this.activeOptionsTab = "display";
    this.activeBattlePauseTab = null;
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
    this.tutorialNudgeTimer = null;
    this.lastTurnBannerKey = null;
    this.commanderTurnAnimationFrame = null;
    this.commanderTurnAnimationSettleFrame = null;
    this.commanderTurnAnimationClearTimer = null;
    this.pendingCommanderTurnAnimationFromSide = null;
    this.pendingCommanderTurnAnimationTurnKey = null;
    this.combatCutscenePlayback = null;
    this.fundsAnimationFrame = null;
    this.activeFundsGainElement = null;
    this.activeFundsGainId = null;
    this.battleExperienceAnimations = new Map();
    this.levelUpRevealByKey = new Map();
    this.activeLevelUpPlayback = null;
    this.battlePresentationAnimationFrame = null;
    this.battleDrawers = {
      intel: false,
      command: false,
      missionDetailsOpen: false,
      intelTab: "selected",
      debugTool: "battlefield",
      debugFieldValues: {},
      selectedPanelScrollTop: 0,
      targetPanelScrollTop: 0,
      feedPanelScrollTop: 0,
      compactSelectedScrollTop: 0,
      compactTargetScrollTop: 0,
      compactFeedScrollTop: 0
    };
    this.missionDetailsLayoutFrame = null;
    this.mapEditorUi = {
      openAccordion: null,
      leftRailScrollTop: 0,
      rightRailScrollTop: 0,
      unitsScrollTop: 0,
      focusedField: null
    };
    this.skirmishUi = {
      mapListScrollTop: 0
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

    this.root.addEventListener("click", (event) => {
      this.noteTutorialInputActivity();
      this.handleClick(event);
    });
    this.root.addEventListener("keydown", (event) => {
      this.noteTutorialInputActivity();
      this.handleKeyDown(event);
    });
    this.root.addEventListener("pointerover", (event) => this.handleAudioPointerOver(event));
    this.root.addEventListener("input", (event) => {
      this.noteTutorialInputActivity();
      this.handleInput(event);
    });
    this.root.addEventListener("change", (event) => {
      this.noteTutorialInputActivity();
      this.handleChange(event);
    });
    this.root.addEventListener("toggle", (event) => this.handleToggle(event), true);
    this.root.addEventListener("contextmenu", (event) => {
      this.noteTutorialInputActivity();
      this.handleContextMenu(event);
    });
    this.root.addEventListener("pointerdown", (event) => {
      this.noteTutorialInputActivity();
      this.handlePointerDown(event);
    });
    this.root.addEventListener("dragstart", (event) => this.handleDragStart(event));
    this.root.addEventListener("transitionend", (event) => this.handleTransitionEnd(event));
    this.windowChromeRoot?.addEventListener("click", (event) =>
      this.handleWindowChromeClick(event)
    );
    this.windowChromeRoot?.addEventListener("pointerover", (event) =>
      this.handleAudioPointerOver(event)
    );
    window.addEventListener("pointermove", (event) => {
      this.noteTutorialInputActivity();
      this.handlePointerMove(event);
    });
    window.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    window.addEventListener("pointercancel", (event) => this.handlePointerCancel(event));
    window.addEventListener("resize", () => this.handleResize());

    this.controller.subscribe((state) => {
      this.latestState = state;
      this.render(state);
    });

    this.initializeDisplayState();
    this.gamepadPollFrame = window.requestAnimationFrame((time) => this.pollGamepadInput(time));
  }
}

Object.assign(AppShell.prototype, appShellEventMethods);
Object.assign(AppShell.prototype, appShellRenderMethods);
Object.assign(AppShell.prototype, appShellCommanderSliderMethods);
Object.assign(AppShell.prototype, appShellInputMethods);
Object.assign(AppShell.prototype, appShellDisplayMethods);
