import {
  BATTLE_TURN_BANNER_DISPLAY_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  SCREEN_IDS
} from "../../../game/core/constants.js";
import { renderBattleHudView } from "../../views/battleHudView.js";
import { renderCommandFeed } from "../../views/battleHud/interactionPanels.js";
import {
  getFocusTileForSide,
  renderTargetIntelPanel
} from "../../views/battleHud/selectionPanels.js";

const COMMANDER_TURN_TRANSITION_CLEAR_MS = 420;

function getTileKey(tile) {
  if (!tile || !Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
    return null;
  }

  return `${tile.x},${tile.y}`;
}

function getFocusKey(focus) {
  if (!focus?.type) {
    return null;
  }

  return [
    focus.type,
    focus.id ?? "",
    Number.isInteger(focus.x) ? focus.x : "",
    Number.isInteger(focus.y) ? focus.y : ""
  ].join(":");
}

function buildBattleRenderSignature(state) {
  const battleUi = state.battleUi ?? {};
  const battleSnapshot = state.battleSnapshot ?? null;
  const selection = battleSnapshot?.selection ?? {};
  const pendingAction = battleSnapshot?.pendingAction ?? null;
  const levelUpEvent = battleSnapshot?.levelUpQueue?.[0] ?? null;
  const victory = battleSnapshot?.victory ?? null;

  return {
    screen: state.screen,
    snapshotId: battleSnapshot?.id ?? null,
    mapId: battleSnapshot?.map?.id ?? null,
    turnKey: battleSnapshot
      ? `${battleSnapshot.turn?.number ?? 0}:${battleSnapshot.turn?.activeSide ?? ""}`
      : null,
    selectionKey: selection?.type
      ? `${selection.type}:${selection.id ?? ""}:${selection.x ?? ""}:${selection.y ?? ""}`
      : null,
    pendingActionKey: pendingAction
      ? [
          pendingAction.type ?? "",
          pendingAction.unitId ?? "",
          pendingAction.mode ?? "",
          pendingAction.toX ?? "",
          pendingAction.toY ?? "",
          pendingAction.targetId ?? ""
        ].join(":")
      : null,
    logKey: battleSnapshot
      ? `${battleSnapshot.log?.length ?? 0}:${battleSnapshot.log?.[0] ?? ""}:${battleSnapshot.log?.at?.(-1) ?? ""}`
      : null,
    playerStateKey: battleSnapshot
      ? [
          battleSnapshot.player?.commanderId ?? "",
          battleSnapshot.player?.funds ?? 0,
          battleSnapshot.player?.charge ?? 0,
          battleSnapshot.player?.units?.length ?? 0
        ].join(":")
      : null,
    enemyStateKey: battleSnapshot
      ? [
          battleSnapshot.enemy?.commanderId ?? "",
          battleSnapshot.enemy?.aiArchetype ?? "",
          battleSnapshot.enemy?.funds ?? 0,
          battleSnapshot.enemy?.charge ?? 0,
          battleSnapshot.enemy?.units?.length ?? 0
        ].join(":")
      : null,
    levelUpKey: levelUpEvent
      ? `${levelUpEvent.unitId}:${levelUpEvent.previousLevel}:${levelUpEvent.newLevel}`
      : null,
    victoryKey: victory ? `${victory.winner ?? ""}:${victory.message ?? ""}` : null,
    hoveredTileKey: getTileKey(battleUi.hoveredTile),
    pauseMenuOpen: battleUi.pauseMenuOpen === true,
    confirmAbandon: battleUi.confirmAbandon === true,
    fundsGainId: battleUi.fundsGain?.id ?? null,
    noticeId: battleUi.notice?.id ?? null,
    powerOverlayId: battleUi.powerOverlay?.id ?? null,
    combatCutsceneId: battleUi.combatCutscene?.id ?? null,
    playerFocusKey: getFocusKey(battleUi.playerFocus),
    enemyFocusKey: getFocusKey(battleUi.enemyFocus),
    debugMode: state.debugMode === true,
    runStatus: state.runStatus ?? null,
    banner: state.banner ?? "",
    tutorialKey: state.battleSnapshot?.presentation?.tutorial
      ? [
          state.battleSnapshot.presentation.tutorial.phase ?? "",
          state.battleSnapshot.presentation.tutorial.stepId ?? "",
          state.battleSnapshot.presentation.tutorial.nudge ?? ""
        ].join(":")
      : ""
  };
}

export const appShellBattleScreenMethods = {
  queueCommanderTurnTransition() {
    if (this.commanderTurnAnimationFrame) {
      window.cancelAnimationFrame(this.commanderTurnAnimationFrame);
      this.commanderTurnAnimationFrame = null;
    }

    if (this.commanderTurnAnimationSettleFrame) {
      window.cancelAnimationFrame(this.commanderTurnAnimationSettleFrame);
      this.commanderTurnAnimationSettleFrame = null;
    }

    if (this.commanderTurnAnimationClearTimer) {
      window.clearTimeout(this.commanderTurnAnimationClearTimer);
      this.commanderTurnAnimationClearTimer = null;
    }

    this.commanderTurnAnimationFrame = window.requestAnimationFrame(() => {
      this.commanderTurnAnimationFrame = null;
      this.commanderTurnAnimationSettleFrame = window.requestAnimationFrame(() => {
        this.commanderTurnAnimationSettleFrame = null;

        for (const element of this.root.querySelectorAll("[data-turn-animation-from]")) {
          element.removeAttribute("data-turn-animation-from");
        }
      });
    });

    this.commanderTurnAnimationClearTimer = window.setTimeout(() => {
      this.commanderTurnAnimationClearTimer = null;
      this.pendingCommanderTurnAnimationFromSide = null;
      this.pendingCommanderTurnAnimationTurnKey = null;
    }, COMMANDER_TURN_TRANSITION_CLEAR_MS);
  },

  applyTutorialHighlights(state) {
    for (const element of this.root.querySelectorAll("[data-tutorial-highlight]")) {
      element.removeAttribute("data-tutorial-highlight");
      element.classList.remove("tutorial-highlight");
    }

    const selectors = state.battleSnapshot?.presentation?.tutorial?.uiSelectors ?? [];

    selectors.forEach((selector, index) => {
      for (const element of this.root.querySelectorAll(selector)) {
        element.dataset.tutorialHighlight = String(index + 1);
        element.classList.add("tutorial-highlight");
      }
    });
  },

  isHoverOnlyBattleUpdate(state) {
    const previousSignature = this.previousBattleRenderSignature;
    const nextSignature = buildBattleRenderSignature(state);

    if (
      !previousSignature ||
      previousSignature.screen !== SCREEN_IDS.BATTLE ||
      nextSignature.screen !== SCREEN_IDS.BATTLE
    ) {
      return false;
    }

    if (
      previousSignature.snapshotId !== nextSignature.snapshotId ||
      previousSignature.mapId !== nextSignature.mapId ||
      previousSignature.turnKey !== nextSignature.turnKey ||
      previousSignature.selectionKey !== nextSignature.selectionKey ||
      previousSignature.pendingActionKey !== nextSignature.pendingActionKey ||
      previousSignature.logKey !== nextSignature.logKey ||
      previousSignature.playerStateKey !== nextSignature.playerStateKey ||
      previousSignature.enemyStateKey !== nextSignature.enemyStateKey ||
      previousSignature.levelUpKey !== nextSignature.levelUpKey ||
      previousSignature.victoryKey !== nextSignature.victoryKey ||
      previousSignature.pauseMenuOpen !== nextSignature.pauseMenuOpen ||
      previousSignature.confirmAbandon !== nextSignature.confirmAbandon ||
      previousSignature.fundsGainId !== nextSignature.fundsGainId ||
      previousSignature.noticeId !== nextSignature.noticeId ||
      previousSignature.powerOverlayId !== nextSignature.powerOverlayId ||
      previousSignature.combatCutsceneId !== nextSignature.combatCutsceneId ||
      previousSignature.playerFocusKey !== nextSignature.playerFocusKey ||
      previousSignature.enemyFocusKey !== nextSignature.enemyFocusKey ||
      previousSignature.debugMode !== nextSignature.debugMode ||
      previousSignature.runStatus !== nextSignature.runStatus ||
      previousSignature.banner !== nextSignature.banner ||
      previousSignature.tutorialKey !== nextSignature.tutorialKey
    ) {
      return false;
    }

    return previousSignature.hoveredTileKey !== nextSignature.hoveredTileKey;
  },

  updateBattleHoverPanels(state) {
    const battleSnapshot = state.battleSnapshot;

    if (!battleSnapshot) {
      return;
    }

    const hoveredTile = state.battleUi?.hoveredTile ?? null;
    const enemyFocusTile = getFocusTileForSide(
      battleSnapshot,
      state.battleUi,
      "enemy"
    );
    const patches = [
      {
        selector: ".battle-side-panel--target",
        markup: renderTargetIntelPanel(battleSnapshot, hoveredTile, enemyFocusTile)
      },
      {
        selector: ".battle-side-panel--feed",
        markup: renderCommandFeed(battleSnapshot.log, hoveredTile)
      },
      {
        selector: ".battle-compact-sheet__panel--target",
        markup: renderTargetIntelPanel(battleSnapshot, hoveredTile, enemyFocusTile)
      },
      {
        selector: ".battle-compact-sheet__panel--feed",
        markup: renderCommandFeed(battleSnapshot.log, hoveredTile)
      }
    ];

    for (const patch of patches) {
      const element = this.root.querySelector(patch.selector);

      if (!element) {
        continue;
      }

      const scrollTop = element.scrollTop;
      element.innerHTML = patch.markup;
      element.scrollTop = scrollTop;
    }
  },

  renderBattleScreen(state) {
    if (this.isHoverOnlyBattleUpdate(state) && this.root.querySelector(".battle-shell")) {
      this.updateBattleHoverPanels(state);
      this.applyTutorialHighlights(state);
      this.previousBattleSnapshot = state.battleSnapshot;
      this.previousBattleRenderSignature = buildBattleRenderSignature(state);
      return;
    }

    this.prepareBattlePresentationPlayback(state);
    const suppressLevelUpOverlay = this.shouldSuppressLevelUpOverlay(state);
    const suppressOutcomeOverlay = this.shouldSuppressOutcomeOverlay(state);
    const turnBanner = this.getTurnBanner(state);
    const experiencePresentation = this.getBattleExperiencePresentation();
    const levelUpPresentation = this.getLevelUpPresentation(state, { suppressLevelUpOverlay });
    const previousActiveSide = this.previousBattleSnapshot?.turn?.activeSide ?? null;
    const currentActiveSide = state.battleSnapshot?.turn?.activeSide ?? null;
    const currentTurnKey = this.getTurnKey(state.battleSnapshot);
    const detectedCommanderTurnAnimationFromSide =
      previousActiveSide && previousActiveSide !== currentActiveSide ? previousActiveSide : null;
    if (detectedCommanderTurnAnimationFromSide && currentTurnKey) {
      this.pendingCommanderTurnAnimationFromSide = detectedCommanderTurnAnimationFromSide;
      this.pendingCommanderTurnAnimationTurnKey = currentTurnKey;
    }
    const commanderTurnAnimationFromSide =
      currentTurnKey && this.pendingCommanderTurnAnimationTurnKey === currentTurnKey
        ? this.pendingCommanderTurnAnimationFromSide
        : detectedCommanderTurnAnimationFromSide;
    const previousMeterState = this.captureBattleMeterState();
    this.captureBattleDrawerState();
    this.root.innerHTML = renderBattleHudView(state, {
      suppressLevelUpOverlay,
      suppressOutcomeOverlay,
      turnBanner,
      experiencePresentation,
      levelUpPresentation,
      commanderTurnAnimationFromSide
    });
    if (commanderTurnAnimationFromSide) {
      this.queueCommanderTurnTransition();
    }
    this.syncDebugSpawnStatFields();
    this.applyBattleDrawerState();
    this.animateBattleMeters(previousMeterState);
    this.animateFundsGain(state);
    this.syncCombatCutscenePlayback(state);
    this.syncBattlePresentationPlayback(state, { suppressLevelUpOverlay });
    this.applyTutorialHighlights(state);
    this.previousBattleSnapshot = state.battleSnapshot;
    this.previousBattleRenderSignature = buildBattleRenderSignature(state);
  },

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

    if (this.commanderTurnAnimationFrame) {
      window.cancelAnimationFrame(this.commanderTurnAnimationFrame);
      this.commanderTurnAnimationFrame = null;
    }

    if (this.commanderTurnAnimationSettleFrame) {
      window.cancelAnimationFrame(this.commanderTurnAnimationSettleFrame);
      this.commanderTurnAnimationSettleFrame = null;
    }

    if (this.commanderTurnAnimationClearTimer) {
      window.clearTimeout(this.commanderTurnAnimationClearTimer);
      this.commanderTurnAnimationClearTimer = null;
    }

    this.stopCombatCutscenePlayback();
    this.clearBattlePresentationPlayback();

    this.levelUpRevealUntil = 0;
    this.victoryRevealUntil = 0;
    this.turnBannerUntil = 0;
    this.turnBanner = null;
    this.lastTurnBannerKey = null;
    this.activeFundsGainElement = null;
    this.activeFundsGainId = null;
    this.battleDrawers.intel = false;
    this.battleDrawers.command = false;
    this.battleDrawers.intelTab = "selected";
    this.battleDrawers.debugAccordion = null;
    this.battleDrawers.selectedPanelScrollTop = 0;
    this.battleDrawers.targetPanelScrollTop = 0;
    this.battleDrawers.feedPanelScrollTop = 0;
    this.battleDrawers.compactSelectedScrollTop = 0;
    this.battleDrawers.compactTargetScrollTop = 0;
    this.battleDrawers.compactFeedScrollTop = 0;
    this.pendingCommanderTurnAnimationFromSide = null;
    this.pendingCommanderTurnAnimationTurnKey = null;
    this.previousBattleRenderSignature = null;
  },

  getVictoryKey(snapshot) {
    const victory = snapshot?.victory;

    if (!victory) {
      return null;
    }

    return `${snapshot.id}-${victory.winner}-${victory.message}`;
  },

  getTurnKey(snapshot) {
    if (!snapshot) {
      return null;
    }

    return `${snapshot.id}-${snapshot.turn.number}-${snapshot.turn.activeSide}`;
  },

  getLevelUpKey(snapshot) {
    const levelUpEvent = snapshot?.levelUpQueue?.[0];

    if (!levelUpEvent) {
      return null;
    }

    return `${levelUpEvent.unitId}-${levelUpEvent.previousLevel}-${levelUpEvent.newLevel}`;
  },

  shouldSuppressLevelUpOverlay(state) {
    const currentKey = this.getLevelUpKey(state.battleSnapshot);
    const previousKey = this.getLevelUpKey(this.previousBattleSnapshot);
    const isFreshReveal = currentKey && !previousKey;
    const revealAt = currentKey ? this.getLevelUpRevealAt(currentKey) : 0;
    const revealDelayMs = Math.max(0, revealAt - Date.now());

    if (isFreshReveal) {
      this.levelUpRevealUntil = revealAt;

      if (this.levelUpRevealTimer) {
        window.clearTimeout(this.levelUpRevealTimer);
      }

      this.levelUpRevealTimer = window.setTimeout(() => {
        this.levelUpRevealTimer = null;

        if (
          this.latestState?.screen === SCREEN_IDS.BATTLE &&
          !this.latestState?.battleUi?.combatCutscene
        ) {
            this.render(this.latestState);
        }
      }, revealDelayMs + 20);
    }

    if (!currentKey) {
      this.levelUpRevealUntil = 0;
      this.activeLevelUpPlayback = null;
      return false;
    }

    return Date.now() < revealAt;
  },

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

        if (
          this.latestState?.screen === SCREEN_IDS.BATTLE &&
          !this.latestState?.battleUi?.combatCutscene
        ) {
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
  },

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

        if (
          this.latestState?.screen === SCREEN_IDS.BATTLE &&
          !this.latestState?.battleUi?.combatCutscene
        ) {
          this.render(this.latestState);
        }
      }, BATTLE_TURN_BANNER_SETTLE_MS);
    }

    if (Date.now() >= this.turnBannerUntil) {
      return null;
    }

    return this.turnBanner;
  }
};
