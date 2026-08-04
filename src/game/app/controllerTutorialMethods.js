import { BATTLE_MODES, SCREEN_IDS, TURN_SIDES } from "../core/constants.js";
import { BUILD_FEATURES } from "../core/buildProfiles.js";
import {
  createTutorialHubSession,
  createTutorialLessonBattleState,
  createTutorialLessonPresentation,
  createTutorialLessonSession,
  evaluateTutorialObjective,
  getTutorialLesson,
  getTutorialLessonStep,
  validateTutorialCurriculum
} from "../content/tutorialCurriculum.js";
import { TUTORIAL_TABS } from "../content/tutorialConstants.js";
import { applyTutorialStepEntryEffects as applyLegacyEntryEffect } from "../content/tutorial.js";
import {
  completeTutorialLesson as markTutorialLessonComplete,
  isTutorialLessonUnlocked,
  normalizeTutorialProgress
} from "../state/tutorialProgress.js";
import { BattleSystem } from "../simulation/battleSystem.js";
import { findUnitById } from "../simulation/battleUnits.js";
import { getMovementPath, getUnitAt } from "../simulation/selectors.js";
import { getMovementModifier } from "../simulation/commanderEffects.js";

function isActiveTutorialBattle(controller) {
  return Boolean(
    controller.state.screen === SCREEN_IDS.BATTLE &&
      controller.state.tutorial?.phase === "battle" &&
      controller.battleSystem?.state?.mode === BATTLE_MODES.TUTORIAL
  );
}

function currentStep(controller) {
  return getTutorialLessonStep(
    controller.state.tutorial?.activeLessonId,
    controller.state.tutorial?.stepIndex
  );
}

function isTileMatch(payload, expected) {
  return payload?.x === expected?.x && payload?.y === expected?.y;
}

function resolveTutorialTargetTile(state, target) {
  if (!target) return null;
  if (Number.isInteger(target.x) && Number.isInteger(target.y)) return target;
  if (target.type === "unit") return findUnitById(state, target.id);
  if (target.type === "building") {
    return state?.map?.buildings?.find((building) => building.id === target.id) ?? null;
  }
  return null;
}

function canUseTileForExpectedAction(controller, payload, expected) {
  const state = controller.battleSystem?.state;
  const unit = state ? getUnitAt(state, payload.x, payload.y) : null;

  if (!state) {
    return false;
  }

  if (expected.type === "selectUnit") {
    return unit?.id === expected.unitId;
  }

  if (expected.type === "holdUnit") {
    const selectedId = state.selection?.type === "unit" ? state.selection.id : null;
    return selectedId === expected.unitId && unit?.id === expected.unitId;
  }

  if (expected.type === "moveUnit") {
    const selectedId = state.selection?.type === "unit" ? state.selection.id : null;
    return selectedId === expected.unitId && isTileMatch(payload, expected);
  }

  if (expected.type === "unloadTile") {
    return state.pendingAction?.unitId === expected.unitId && state.pendingAction?.mode === "unload" && isTileMatch(payload, expected);
  }

  if (expected.type === "attackTarget") {
    return state.pendingAction?.unitId === expected.unitId && state.pendingAction?.mode === "fire" && unit?.id === expected.targetUnitId && unit.owner === TURN_SIDES.ENEMY;
  }

  return false;
}

function isActionAllowed(controller, action, payload, expected) {
  if (!expected || expected.type === "free") {
    return true;
  }

  if (expected.type === "objective") {
    return !expected.allowedActions?.length || expected.allowedActions.includes(action);
  }

  if (action === "tile") {
    return canUseTileForExpectedAction(controller, payload, expected);
  }

  if (expected.type === "button") {
    return action === expected.action;
  }

  if (expected.type === "endTurn") {
    return action === "end-turn";
  }

  if (expected.type === "activatePower") {
    return action === "activate-power";
  }

  return false;
}

function didCompleteExpectedAction(controller, action, payload, expected, changed) {
  const state = controller.battleSystem?.state;

  if (!changed || !state || !expected) {
    return false;
  }

  if (expected.type === "objective") {
    return evaluateTutorialObjective(state, expected);
  }

  if (expected.type === "selectUnit" && action === "tile") {
    return state.selection?.type === "unit" && state.selection.id === expected.unitId;
  }

  if (expected.type === "holdUnit" && action === "tile") {
    return state.pendingAction?.unitId === expected.unitId && state.pendingAction.fromX === state.pendingAction.toX && state.pendingAction.fromY === state.pendingAction.toY;
  }

  if (expected.type === "moveUnit" && action === "tile") {
    return state.pendingAction?.unitId === expected.unitId && state.pendingAction.toX === expected.x && state.pendingAction.toY === expected.y;
  }

  if (expected.type === "unloadTile" && action === "tile") {
    const passenger = getUnitAt(state, expected.x, expected.y);
    const runner = findUnitById(state, expected.unitId);
    return Boolean(passenger && !runner?.transport?.carryingUnitId);
  }

  if (expected.type === "attackTarget" && action === "tile") {
    const target = findUnitById(state, expected.targetUnitId);
    return payload?.targetUnitId === expected.targetUnitId && (!target || target.current.hp < target.stats.maxHealth);
  }

  if (expected.type === "button" && action === expected.action) {
    if (expected.buildingId) {
      return state.map.buildings.find((building) => building.id === expected.buildingId)?.owner === TURN_SIDES.PLAYER;
    }
    return true;
  }

  if (expected.type === "endTurn" && action === "end-turn") {
    return state.turn.activeSide === TURN_SIDES.PLAYER && state.turn.number > 1;
  }

  if (expected.type === "activatePower" && action === "activate-power") {
    return state.player.powerUsedTurn === state.turn.number;
  }

  return false;
}

async function saveTutorialMeta(controller) {
  try {
    await controller.storage.saveMeta(controller.state.metaState);
    return true;
  } catch (error) {
    console.error("Unable to save tutorial progress.", error);
    controller.state.banner = "Training progress could not be saved. You can keep playing.";
    return false;
  }
}

export const controllerTutorialMethods = {
  resetTutorialToHub(overrides = {}) {
    this.state.tutorial = createTutorialHubSession(overrides);
  },

  isTutorialBattle() {
    return this.state.battleSnapshot?.mode === BATTLE_MODES.TUTORIAL ||
      this.battleSystem?.state?.mode === BATTLE_MODES.TUTORIAL ||
      this.state.tutorial?.phase === "battle";
  },

  validateTutorialRegistry() {
    return validateTutorialCurriculum();
  },

  openTutorialHub({ returnIntent = null, activeTab = TUTORIAL_TABS.GUIDED } = {}) {
    if (!this.isFeatureEnabled(BUILD_FEATURES.TUTORIAL)) {
      return false;
    }

    if (this.validateTutorialRegistry().length > 0) {
      return false;
    }

    const retainedReturnIntent = returnIntent ?? this.state.tutorial?.returnIntent ?? null;
    this.clearBattleSession();
    this.state.tutorial = createTutorialHubSession({
      activeTab: Object.values(TUTORIAL_TABS).includes(activeTab) ? activeTab : TUTORIAL_TABS.GUIDED,
      returnIntent: retainedReturnIntent
    });
    this.state.screen = SCREEN_IDS.TUTORIAL;
    this.state.banner = "";
    this.emit();
    return true;
  },

  selectTutorialTab(tabId) {
    if (this.state.screen !== SCREEN_IDS.TUTORIAL || !Object.values(TUTORIAL_TABS).includes(tabId)) {
      return false;
    }

    this.state.tutorial = { ...this.state.tutorial, activeTab: tabId };
    this.emit();
    return true;
  },

  async resolveTutorialPrompt(choice) {
    const playTutorial = choice === "play";
    this.state.metaState.tutorial = normalizeTutorialProgress({
      ...this.state.metaState.tutorial,
      promptSeen: true
    });
    await saveTutorialMeta(this);

    if (playTutorial && this.openTutorialHub({ returnIntent: "new-run" })) {
      return true;
    }

    this.state.tutorial = createTutorialHubSession();
    return this.openNewRun({ bypassTutorialPrompt: true });
  },

  async continueFromTutorialToNewRun() {
    this.state.tutorial = createTutorialHubSession();
    return this.openNewRun({ bypassTutorialPrompt: true });
  },

  startTutorialLesson(lessonId) {
    if (!this.isFeatureEnabled(BUILD_FEATURES.TUTORIAL)) {
      return false;
    }

    const lesson = getTutorialLesson(lessonId);
    const progress = normalizeTutorialProgress(this.state.metaState.tutorial);

    if (!lesson || !isTutorialLessonUnlocked(progress, lessonId)) {
      this.state.banner = "That lesson is still locked.";
      this.emit();
      return false;
    }

    const battleState = createTutorialLessonBattleState(lessonId, lesson.steps[0]?.scenarioId);
    if (!battleState) {
      this.state.banner = "That training simulation could not be loaded.";
      this.emit();
      return false;
    }

    const returnIntent = this.state.tutorial?.returnIntent ?? null;
    this.battleSystem = new BattleSystem(battleState);
    this.state.tutorial = createTutorialLessonSession(lessonId, { returnIntent });
    this.state.tutorial.currentScenarioId = lesson.steps[0]?.scenarioId ?? null;
    this.state.runState = null;
    this.state.runStatus = null;
    this.state.debugMode = false;
    this.state.banner = "Training sim active: no run slots, rewards, or run statistics will be changed.";
    this.state.screen = SCREEN_IDS.BATTLE;
    this.resetBattleUi();
    this.applyTutorialStepEntryEffects();
    this.syncBattleState();
    return true;
  },

  startTutorialBattle() {
    return this.startTutorialLesson("basic-orders");
  },

  exitTutorialLesson() {
    if (!this.isTutorialBattle()) {
      return false;
    }

    return this.openTutorialHub({ returnIntent: this.state.tutorial?.returnIntent ?? null });
  },

  openTutorialEpilogue() {
    return this.openTutorialHub({ returnIntent: this.state.tutorial?.returnIntent ?? null });
  },

  skipTutorial() {
    return this.exitTutorialLesson();
  },

  continueTutorialStep() {
    if (!isActiveTutorialBattle(this)) {
      return false;
    }

    const step = currentStep(this);
    if (step?.expectedAction?.type !== "continue") {
      this.showTutorialNudge(step?.expectedAction?.nudge ?? "Complete the highlighted action first.");
      return false;
    }

    if (step.stageResult && this.state.battleUi?.combatCutscene) {
      this.showTutorialNudge("Let the battle animation finish, then review the victory result.");
      return false;
    }

    return this.advanceTutorialStep();
  },

  showTutorialNudge(message) {
    if (!this.state.tutorial || !["battle", "lesson-complete"].includes(this.state.tutorial.phase)) {
      return false;
    }

    this.state.tutorial = {
      ...this.state.tutorial,
      nudge: { id: `tutorial-nudge-${Date.now()}`, message }
    };
    this.syncBattleState();
    return true;
  },

  clearTutorialNudge() {
    if (this.state.tutorial?.nudge) {
      this.state.tutorial = { ...this.state.tutorial, nudge: null };
    }
  },

  decorateTutorialSnapshot(snapshot) {
    if (!snapshot?.presentation || snapshot.mode !== BATTLE_MODES.TUTORIAL) {
      return snapshot;
    }

    const presentation = createTutorialLessonPresentation(this.state.tutorial);
    const expected = currentStep(this)?.expectedAction;

    if (presentation && expected?.type === "moveUnit") {
      const unit = findUnitById(this.battleSystem?.state, expected.unitId);
      if (unit) {
        const budget = unit.stats.movement + getMovementModifier(this.battleSystem.state, unit);
        presentation.movementPath = getMovementPath(
          this.battleSystem.state,
          unit,
          budget,
          expected.x,
          expected.y
        );
      }
    }

    if (presentation) {
      presentation.cameraTarget = presentation.battlefieldHighlights?.[0] ?? null;
      const targetTile = resolveTutorialTargetTile(this.battleSystem?.state, presentation.cameraTarget);
      presentation.panelPlacement = targetTile &&
        targetTile.y >= (snapshot.map?.height ?? 0) * 0.5 &&
        targetTile.x < (snapshot.map?.width ?? 0) * 0.5
        ? "right"
        : "left";
    }
    snapshot.presentation.tutorial = presentation;
    return snapshot;
  },

  applyTutorialStepEntryEffects() {
    if (!isActiveTutorialBattle(this)) {
      return false;
    }

    const step = currentStep(this);
    if (!step) {
      return false;
    }

    const effectName = step.scenarioId ? `load-scenario:${step.scenarioId}` : step.onEnter;
    if (!effectName) {
      return false;
    }

    const effectKey = `${this.state.tutorial.sessionId}:${this.state.tutorial.activeLessonId}:${step.id}:battle:enter:${effectName}`;
    if (this.state.tutorial.appliedEffectKeys.includes(effectKey)) {
      return false;
    }

    let changed = false;
    if (step.scenarioId && step.scenarioId !== this.state.tutorial.currentScenarioId) {
      const state = createTutorialLessonBattleState(this.state.tutorial.activeLessonId, step.scenarioId);
      if (state) {
        this.battleSystem = new BattleSystem(state);
        this.resetBattleUi();
        changed = true;
      }
    } else if (step.onEnter) {
      changed = applyLegacyEntryEffect(this.battleSystem.state, step);
    }

    this.state.tutorial = {
      ...this.state.tutorial,
      currentScenarioId: step.scenarioId ?? this.state.tutorial.currentScenarioId,
      appliedEffectKeys: [...this.state.tutorial.appliedEffectKeys, effectKey]
    };
    return changed;
  },

  applyTutorialStepCompletionEffects(step = currentStep(this)) {
    const effectName = step?.onComplete;
    if (!isActiveTutorialBattle(this) || !effectName) {
      return false;
    }

    const effectKey = `${this.state.tutorial.sessionId}:${this.state.tutorial.activeLessonId}:${step.id}:battle:complete:${effectName}`;
    if (this.state.tutorial.appliedEffectKeys.includes(effectKey)) {
      return false;
    }

    let changed = false;
    if (effectName === "grant-training-level-up") {
      changed = this.battleSystem.awardExperienceToUnit(
        step.onCompletePayload?.unitId,
        step.onCompletePayload?.experience
      );
    }

    this.state.tutorial = {
      ...this.state.tutorial,
      appliedEffectKeys: [...this.state.tutorial.appliedEffectKeys, effectKey]
    };
    return changed;
  },

  async completeActiveTutorialLesson() {
    const lessonId = this.state.tutorial?.activeLessonId;
    if (!lessonId || this.state.tutorial.phase === "lesson-complete") {
      return false;
    }

    const lesson = getTutorialLesson(lessonId);
    const step = currentStep(this);
    const completionEffect = lesson?.completionEffect ?? "record-lesson-completion";
    const effectKey = `${this.state.tutorial.sessionId}:${lessonId}:${step?.id ?? "final"}:lesson-complete:complete:${completionEffect}`;
    this.state.metaState.tutorial = markTutorialLessonComplete(this.state.metaState.tutorial, lessonId);
    this.state.tutorial = {
      ...this.state.tutorial,
      phase: "lesson-complete",
      nudge: null,
      appliedEffectKeys: this.state.tutorial.appliedEffectKeys.includes(effectKey)
        ? this.state.tutorial.appliedEffectKeys
        : [...this.state.tutorial.appliedEffectKeys, effectKey]
    };
    await saveTutorialMeta(this);
    this.syncBattleState();
    return true;
  },

  advanceTutorialStep() {
    if (!isActiveTutorialBattle(this)) {
      return false;
    }

    const lesson = getTutorialLesson(this.state.tutorial.activeLessonId);
    const step = currentStep(this);
    if (!lesson || !step) {
      return false;
    }

    if (step.completesLesson || this.state.tutorial.stepIndex >= lesson.steps.length - 1) {
      void this.completeActiveTutorialLesson();
      return true;
    }

    this.state.tutorial = {
      ...this.state.tutorial,
      stepIndex: this.state.tutorial.stepIndex + 1,
      nudge: null
    };
    this.applyTutorialStepEntryEffects();
    this.syncBattleState();
    return true;
  },

  guardTutorialIntent(action, payload = {}) {
    if (!isActiveTutorialBattle(this)) {
      return true;
    }

    const expected = currentStep(this)?.expectedAction;
    if (isActionAllowed(this, action, payload, expected)) {
      this.clearTutorialNudge();
      return true;
    }

    this.showTutorialNudge(expected?.nudge ?? "Complete the highlighted action first.");
    return false;
  },

  guardTutorialBattleAction(action, payload = {}) {
    return this.guardTutorialIntent(action, payload);
  },

  async evaluateTutorialProgress(action, payload = {}, changed = false) {
    if (!isActiveTutorialBattle(this)) {
      return false;
    }

    const step = currentStep(this);
    if (!didCompleteExpectedAction(this, action, payload, step?.expectedAction, changed)) {
      return false;
    }

    this.applyTutorialStepCompletionEffects(step);

    if (step.completesLesson || this.state.tutorial.stepIndex >= getTutorialLesson(this.state.tutorial.activeLessonId).steps.length - 1) {
      return this.completeActiveTutorialLesson();
    }

    return this.advanceTutorialStep();
  },

  async handleTutorialBattleActionResult(action, payload = {}, changed = false) {
    return this.evaluateTutorialProgress(action, payload, changed);
  }
};
