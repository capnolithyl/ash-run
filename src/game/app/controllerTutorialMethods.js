import { BATTLE_MODES, SCREEN_IDS, TURN_SIDES } from "../core/constants.js";
import { BUILD_FEATURES } from "../core/buildProfiles.js";
import {
  TUTORIAL_STEPS,
  applyTutorialStepEntryEffects,
  createTutorialBattleSession,
  createTutorialBattleState,
  createTutorialIntroState,
  createTutorialPresentation,
  getTutorialStep
} from "../content/tutorial.js";
import { BattleSystem } from "../simulation/battleSystem.js";
import { findUnitById } from "../simulation/battleUnits.js";
import { getUnitAt } from "../simulation/selectors.js";

function isTileMatch(payload, expected) {
  return payload?.x === expected?.x && payload?.y === expected?.y;
}

function getCurrentTutorialStep(controller) {
  return getTutorialStep(controller.state.tutorial);
}

function getCurrentExpectedAction(controller) {
  return getCurrentTutorialStep(controller)?.expectedAction ?? null;
}

function isActiveTutorialBattle(controller) {
  return Boolean(
    controller.state.screen === SCREEN_IDS.BATTLE &&
      controller.state.tutorial?.phase === "battle" &&
      controller.battleSystem?.state?.mode === BATTLE_MODES.TUTORIAL
  );
}

function getTutorialBattleState(controller) {
  return controller.battleSystem?.state ?? null;
}

function getTutorialNudgeMessage(expected, fallback) {
  return expected?.nudge ?? fallback ?? "Let us follow the highlighted training step first.";
}

function canUseTileForExpectedAction(controller, payload, expected) {
  const battleState = getTutorialBattleState(controller);

  if (!battleState) {
    return false;
  }

  const unit = getUnitAt(battleState, payload.x, payload.y);

  if (expected.type === "selectUnit") {
    return unit?.id === expected.unitId;
  }

  if (expected.type === "moveUnit") {
    const selectedUnitId = battleState.selection?.type === "unit" ? battleState.selection.id : null;
    return selectedUnitId === expected.unitId && isTileMatch(payload, expected);
  }

  if (expected.type === "attackTarget") {
    const pendingAction = battleState.pendingAction;
    return (
      pendingAction?.unitId === expected.unitId &&
      (pendingAction.mode ?? "menu") === "fire" &&
      unit?.id === expected.targetUnitId &&
      unit.owner === TURN_SIDES.ENEMY
    );
  }

  return false;
}

function didCompleteExpectedAction(controller, action, payload, expected) {
  const battleState = getTutorialBattleState(controller);

  if (!battleState || !expected) {
    return false;
  }

  if (expected.type === "selectUnit" && action === "tile") {
    return battleState.selection?.type === "unit" && battleState.selection.id === expected.unitId;
  }

  if (expected.type === "moveUnit" && action === "tile") {
    return (
      battleState.pendingAction?.unitId === expected.unitId &&
      battleState.pendingAction?.toX === expected.x &&
      battleState.pendingAction?.toY === expected.y
    );
  }

  if (expected.type === "attackTarget" && action === "tile") {
    const target = findUnitById(battleState, expected.targetUnitId);
    return payload?.targetUnitId === expected.targetUnitId && (!target || target.current.hp < 100);
  }

  if (expected.type === "button" && action === expected.action) {
    if (expected.buildingId) {
      const building = battleState.map.buildings.find((candidate) => candidate.id === expected.buildingId);
      return building?.owner === TURN_SIDES.PLAYER;
    }

    return true;
  }

  if (expected.type === "endTurn" && action === "end-turn") {
    return battleState.turn.activeSide === TURN_SIDES.PLAYER && battleState.turn.number > 1;
  }

  if (expected.type === "activatePower" && action === "activate-power") {
    return battleState.player.powerUsedTurn === battleState.turn.number;
  }

  return false;
}

export const controllerTutorialMethods = {
  resetTutorialToIntro() {
    this.state.tutorial = createTutorialIntroState();
  },

  isTutorialBattle() {
    return this.state.battleSnapshot?.mode === BATTLE_MODES.TUTORIAL ||
      this.battleSystem?.state?.mode === BATTLE_MODES.TUTORIAL ||
      this.state.tutorial?.phase === "battle";
  },

  startTutorialBattle() {
    if (!this.isFeatureEnabled(BUILD_FEATURES.TUTORIAL)) {
      return false;
    }

    this.battleSystem = new BattleSystem(createTutorialBattleState());
    this.state.tutorial = createTutorialBattleSession();
    this.state.runState = null;
    this.state.runStatus = null;
    this.state.debugMode = false;
    this.state.banner = "Training sim active: no saves, rewards, or unlocks will be written.";
    this.state.screen = SCREEN_IDS.BATTLE;
    this.resetBattleUi();
    this.syncBattleState();
  },

  openTutorialEpilogue() {
    if (!this.isFeatureEnabled(BUILD_FEATURES.TUTORIAL)) {
      return false;
    }

    this.clearBattleSession();
    this.state.tutorial = createTutorialIntroState({
      phase: "epilogue",
      completed: true
    });
    this.state.screen = SCREEN_IDS.TUTORIAL;
    this.state.banner = "";
    this.emit();
  },

  skipTutorial() {
    this.openTutorialEpilogue();
  },

  continueTutorialStep() {
    if (!isActiveTutorialBattle(this)) {
      return;
    }

    const expected = getCurrentExpectedAction(this);

    if (expected?.type !== "continue") {
      this.showTutorialNudge(getTutorialNudgeMessage(expected));
      return;
    }

    this.advanceTutorialStep();
  },

  showTutorialNudge(message) {
    if (!this.state.tutorial || !["battle", "complete"].includes(this.state.tutorial.phase)) {
      return;
    }

    this.state.tutorial = {
      ...this.state.tutorial,
      nudge: {
        id: `tutorial-nudge-${Date.now()}`,
        message
      }
    };

    if (this.battleSystem) {
      this.syncBattleState();
      return;
    }

    this.emit();
  },

  clearTutorialNudge() {
    if (this.state.tutorial?.nudge) {
      this.state.tutorial = {
        ...this.state.tutorial,
        nudge: null
      };
    }
  },

  decorateTutorialSnapshot(snapshot) {
    if (!snapshot?.presentation || snapshot.mode !== BATTLE_MODES.TUTORIAL) {
      return snapshot;
    }

    snapshot.presentation.tutorial = createTutorialPresentation(this.state.tutorial);
    return snapshot;
  },

  applyTutorialStepEntryEffects() {
    if (!isActiveTutorialBattle(this)) {
      return false;
    }

    const step = getCurrentTutorialStep(this);
    const appliedKey = `${step.id}:${step.onEnter ?? ""}`;

    if (!step.onEnter || this.state.tutorial?.lastEntryEffectKey === appliedKey) {
      return false;
    }

    const changed = applyTutorialStepEntryEffects(this.battleSystem.state, step);

    this.state.tutorial = {
      ...this.state.tutorial,
      lastEntryEffectKey: appliedKey
    };

    return changed;
  },

  advanceTutorialStep() {
    if (!isActiveTutorialBattle(this)) {
      return;
    }

    const nextStepIndex = Math.min(
      TUTORIAL_STEPS.length - 1,
      Math.max(0, Number(this.state.tutorial.stepIndex) || 0) + 1
    );

    this.state.tutorial = {
      ...this.state.tutorial,
      stepIndex: nextStepIndex,
      nudge: null
    };

    const changed = this.applyTutorialStepEntryEffects();

    if (changed || this.battleSystem) {
      this.syncBattleState();
      return;
    }

    this.emit();
  },

  completeTutorialBattle() {
    if (!this.state.tutorial || this.state.tutorial.phase === "complete") {
      return;
    }

    this.state.tutorial = {
      ...this.state.tutorial,
      phase: "complete",
      completed: true,
      nudge: null
    };
  },

  guardTutorialBattleAction(action, payload = {}) {
    if (!isActiveTutorialBattle(this)) {
      return true;
    }

    const expected = getCurrentExpectedAction(this);

    if (!expected || expected.type === "free") {
      return true;
    }

    if (action === "tile" && canUseTileForExpectedAction(this, payload, expected)) {
      return true;
    }

    if (expected.type === "button" && action === expected.action) {
      return true;
    }

    if (expected.type === "endTurn" && action === "end-turn") {
      return true;
    }

    if (expected.type === "activatePower" && action === "activate-power") {
      return true;
    }

    this.showTutorialNudge(getTutorialNudgeMessage(expected));
    return false;
  },

  async handleTutorialBattleActionResult(action, payload = {}, changed = false) {
    if (!changed || !isActiveTutorialBattle(this)) {
      return;
    }

    const expected = getCurrentExpectedAction(this);

    if (!didCompleteExpectedAction(this, action, payload, expected)) {
      return;
    }

    if (this.battleSystem.state.victory?.winner === TURN_SIDES.PLAYER) {
      this.completeTutorialBattle();
      return;
    }

    const nextStepIndex = Math.min(
      TUTORIAL_STEPS.length - 1,
      Math.max(0, Number(this.state.tutorial.stepIndex) || 0) + 1
    );

    this.state.tutorial = {
      ...this.state.tutorial,
      stepIndex: nextStepIndex,
      nudge: null
    };
    this.applyTutorialStepEntryEffects();
  }
};
