import {
  BATTLE_POST_COMBAT_PAUSE_MS,
  BATTLE_FUNDS_GAIN_ANIMATION_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  TURN_SIDES
} from "../core/constants.js";
import { randomInt } from "../core/random.js";
import {
  canUnitEquipRunUpgrade,
  drawImmediateRunCards,
  getRunUpgradeById,
  getRunUpgradeValue,
  isGearUpgrade,
  normalizeOwnedRunCardIds
} from "../content/runUpgrades.js";
import {
  COMMANDER_POWER_PULSE_DURATION_MS,
  COMMANDER_POWER_TARGET_STAGGER_MS,
  getBattleSnapshotTransitionDurationMs
} from "../phaser/view/battleAnimationEvents.js";
import { deriveBattleCombatCutscene } from "../phaser/view/battleCombatCutscene.js";
import {
  addRunIntel,
  applyBattleVictoryToRun,
  createBattleStateForRun,
  createSlotRecord,
  isRunComplete,
  normalizeBattleState,
  normalizeRunState
} from "../state/runFactory.js";
import { normalizeUnlockedRunCardIds } from "../state/defaults.js";
import { BattleSystem } from "../simulation/battleSystem.js";
import { createPersistentUnitSnapshot, createUnitFromType } from "../simulation/unitFactory.js";
import {
  RUN_META_CURRENCY_CLEAR_BONUS,
  RUN_META_CURRENCY_MAP_REWARD,
  cloneFocusSelection,
  delay,
  getFocusSideForSelection,
  getFundsGainFromSnapshots,
  unlockNextCommander
} from "./controllerShared.js";

const ENEMY_TURN_MAX_STEPS = 100;
const ENEMY_TURN_MAX_WALL_TIME_MS = 30000;

function getEligibleGearRosterUnits(runState, reward) {
  return (runState?.roster ?? []).filter((unit) => canUnitEquipRunUpgrade(unit, reward));
}

function getRunCardRewardSnapshot(cardId) {
  const card = getRunUpgradeById(cardId);

  if (!card) {
    return null;
  }

  return {
    id: card.id,
    type: card.type,
    name: card.name,
    rarity: card.rarity,
    summary: card.summary,
    eligibleFamily: card.eligibleFamily ?? null
  };
}

function reloadSandboxRunWithCards(controller, ownedRunCardIds) {
  if (!controller.battleSystem || !controller.state.debugMode || !controller.state.runState) {
    return false;
  }

  const currentBattleState = normalizeBattleState(controller.battleSystem.getStateForSave());
  const currentRunState = normalizeRunState(controller.state.runState);
  const currentMapId = currentBattleState?.map?.id ?? currentRunState.mapSequence?.[currentRunState.mapIndex] ?? null;
  const nextOwnedRunCardIds = normalizeOwnedRunCardIds(ownedRunCardIds);
  const nextRunState = normalizeRunState({
    ...currentRunState,
    ownedRunCardIds: nextOwnedRunCardIds,
    selectedRewards: nextOwnedRunCardIds.map(getRunCardRewardSnapshot).filter(Boolean),
    pendingRewardChoices: [],
    pendingGearReward: null
  });

  if (currentMapId) {
    nextRunState.mapSequence = [
      currentMapId,
      ...nextRunState.mapSequence.filter((mapId) => mapId !== currentMapId)
    ].slice(0, nextRunState.targetMapCount);
  }

  const pauseMenuOpen = controller.state.battleUi.pauseMenuOpen;
  const nextBattleState = createBattleStateForRun(nextRunState);
  controller.battleSystem = new BattleSystem(nextBattleState);
  controller.battleSystem.setDebugCommanders({
    [TURN_SIDES.PLAYER]: currentBattleState.player.commanderId,
    [TURN_SIDES.ENEMY]: currentBattleState.enemy.commanderId,
    enemyAiArchetype: currentBattleState.enemy.aiArchetype
  });
  controller.state.runState = nextRunState;
  controller.state.battleUi.pauseMenuOpen = pauseMenuOpen;
  controller.state.battleUi.runCardsOpen = false;
  controller.syncBattleState();
  return true;
}

function clearCombatCutscene(controller) {
  if (controller.battleCombatCutsceneTimer) {
    clearTimeout(controller.battleCombatCutsceneTimer);
    controller.battleCombatCutsceneTimer = null;
  }

  controller.state.battleUi.combatCutscene = null;
}

function forcePassEnemyTurn(controller, reason) {
  clearCombatCutscene(controller);
  return controller.battleSystem?.forcePassEnemyTurn?.(reason) ?? { changed: false, reason };
}

function maybeSyncCombatCutscene(controller, previousSnapshot, nextSnapshot) {
  if (controller.state.metaState.options.combatCutsceneAnimations === false) {
    return;
  }

  const cutscene = deriveBattleCombatCutscene(previousSnapshot, nextSnapshot);

  if (!cutscene) {
    return;
  }

  if (controller.battleCombatCutsceneTimer) {
    clearTimeout(controller.battleCombatCutsceneTimer);
    controller.battleCombatCutsceneTimer = null;
  }

  const nextCutscene = {
    id: `combat-cutscene-${++controller.battleCombatCutsceneSequence}`,
    startedAt: Date.now(),
    hudSnapshot: previousSnapshot ? structuredClone(previousSnapshot) : null,
    ...cutscene
  };

  controller.state.battleUi.combatCutscene = nextCutscene;
  controller.battleCombatCutsceneTimer = setTimeout(() => {
    controller.battleCombatCutsceneTimer = null;

    if (controller.state.battleUi.combatCutscene?.id === nextCutscene.id) {
      controller.state.battleUi.combatCutscene = null;
      controller.emit();
    }
  }, nextCutscene.durationMs);
}

export const controllerRunMethods = {
  async advanceRun() {
    if (!this.battleSystem || !this.state.runState) {
      return;
    }

    const battleState = normalizeBattleState(this.battleSystem.getStateForSave());

    if (battleState.victory?.winner !== TURN_SIDES.PLAYER) {
      return;
    }

    const availableRunCardIds = normalizeUnlockedRunCardIds([
      ...(this.state.metaState.unlockedRunCardIds ?? []),
      ...(this.state.runState.availableRunCardIds ?? [])
    ]);
    this.state.metaState.unlockedRunCardIds = availableRunCardIds;
    let nextRunState = applyBattleVictoryToRun(
      {
        ...this.state.runState,
        availableRunCardIds
      },
      battleState
    );
    nextRunState = addRunIntel(nextRunState, "mapClear", RUN_META_CURRENCY_MAP_REWARD);
    this.state.metaState.metaCurrency += RUN_META_CURRENCY_MAP_REWARD;
    this.state.banner = `Map ${nextRunState.mapIndex}/${nextRunState.targetMapCount} clear. +${RUN_META_CURRENCY_MAP_REWARD} Intel Credits.`;

    if (isRunComplete(nextRunState)) {
      nextRunState = addRunIntel(nextRunState, "runClearBonus", RUN_META_CURRENCY_CLEAR_BONUS);
      this.state.runState = nextRunState;
      this.state.runStatus = "complete";
      this.state.metaState.latestClearTurnCount = nextRunState.totalTurns;
      this.state.metaState.bestClearTurnCount = Math.min(
        this.state.metaState.bestClearTurnCount ?? Number.POSITIVE_INFINITY,
        nextRunState.totalTurns
      );

      const unlocked = unlockNextCommander(this.state.metaState);
      this.state.metaState.metaCurrency += RUN_META_CURRENCY_CLEAR_BONUS;

      if (unlocked) {
        this.state.banner = `${unlocked.name} is now unlocked. Run clear in ${nextRunState.totalTurns} turns. +${RUN_META_CURRENCY_CLEAR_BONUS} bonus Intel Credits.`;
      } else {
        this.state.banner = `Run clear in ${nextRunState.totalTurns} turns. +${RUN_META_CURRENCY_CLEAR_BONUS} bonus Intel Credits.`;
      }

      await this.storage.saveMeta(this.state.metaState);
      await this.deleteSlot(this.state.selectedSlotId, false);
      this.syncBattleState();
      return;
    }

    this.state.runState = nextRunState;
    await this.storage.saveMeta(this.state.metaState);

    if ((nextRunState.pendingRewardChoices ?? []).length > 0) {
      this.state.runStatus = "reward";
      await this.persistCurrentRun();
      return;
    }

    this.state.runStatus = null;
    await this.startNextRunBattle();
  },

  async selectRunReward(rewardId) {
    if (!this.state.runState || this.state.runStatus !== "reward") {
      return;
    }

    const reward = (this.state.runState.pendingRewardChoices ?? []).find((choice) => choice.id === rewardId);

    if (!reward) {
      return;
    }

    let ownedRunCardIds = normalizeOwnedRunCardIds(this.state.runState);
    let selectedRewards = [...(this.state.runState.selectedRewards ?? [])];
    let roster = [...(this.state.runState.roster ?? [])];
    const bonusRewards = [];

    if (reward.type === "unit" && reward.unitTypeId) {
      roster = [
        ...roster,
        createPersistentUnitSnapshot(createUnitFromType(reward.unitTypeId, TURN_SIDES.PLAYER))
      ];
    } else {
      ownedRunCardIds = [...new Set([...ownedRunCardIds, reward.id])];
      selectedRewards = [...selectedRewards, reward];
    }

    if (reward.id === "lottery-ticket") {
      const roll = randomInt(this.state.runState.seed, 1, 100);
      const winChance = Math.round(getRunUpgradeValue("lottery-ticket", "winChance", 0.5) * 100);
      const wonLottery = roll.value <= winChance;
      const nextSeed = roll.seed;

      if (wonLottery) {
        const lotteryRunState = {
          ...this.state.runState,
          seed: nextSeed,
          ownedRunCardIds
        };
        const lotteryDraw = drawImmediateRunCards(
          lotteryRunState,
          this.state.runState.mapIndex + 1,
          `${this.state.runState.seed}-${this.state.runState.mapIndex}-lottery`,
          getRunUpgradeValue("lottery-ticket", "cardCount", 2)
        );
        bonusRewards.push(...lotteryDraw.choices);
        ownedRunCardIds = [...new Set([...ownedRunCardIds, ...bonusRewards.map((choice) => choice.id)])];
        selectedRewards = [...selectedRewards, ...bonusRewards];
      }

      this.state.banner = wonLottery
        ? `Lottery Ticket paid out: ${bonusRewards.map((choice) => choice.name).join(", ")}.`
        : "Lottery Ticket missed. You win some, you lose some.";
    }

    const nextRunState = {
      ...this.state.runState,
      ownedRunCardIds,
      selectedRewards,
      roster,
      pendingRewardChoices: [],
      pendingGearReward: isGearUpgrade(reward) ? reward : null
    };
    this.state.runState = normalizeRunState(nextRunState);
    this.state.runStatus = isGearUpgrade(reward) ? "reward-equip" : null;

    if (isGearUpgrade(reward)) {
      await this.persistCurrentRun();
      return;
    }

    await this.startNextRunBattle();
  },

  async equipPendingRunGear(unitId) {
    if (!this.state.runState || this.state.runStatus !== "reward-equip") {
      return;
    }

    const reward = this.state.runState.pendingGearReward;
    const eligibleUnits = getEligibleGearRosterUnits(this.state.runState, reward);
    const targetIndex = eligibleUnits.findIndex((unit) => unit.id === unitId);

    if (!reward || targetIndex < 0) {
      return;
    }

    const nextRoster = (this.state.runState.roster ?? []).map((unit) =>
      unit.id === unitId
        ? {
            ...structuredClone(unit),
            gear: {
              slot: reward.id
            }
          }
        : unit
    );

    this.state.runState = normalizeRunState({
      ...this.state.runState,
      roster: nextRoster,
      pendingGearReward: null
    });
    this.state.runStatus = null;
    await this.startNextRunBattle();
  },

  async discardPendingRunGear() {
    if (!this.state.runState || this.state.runStatus !== "reward-equip") {
      return;
    }

    this.state.runState = normalizeRunState({
      ...this.state.runState,
      pendingGearReward: null
    });
    this.state.runStatus = null;
    await this.startNextRunBattle();
  },

  async startNextRunBattle() {
    if (!this.state.runState) {
      return;
    }

    const nextBattleState = createBattleStateForRun(this.state.runState);
    this.battleSystem = new BattleSystem(nextBattleState);
    this.resetBattleUi();
    await this.persistCurrentRun();
  },

  async acknowledgeDefeat() {
    this.state.runStatus = "failed";
    this.emit();
  },

  async acknowledgeLevelUp() {
    if (!this.battleSystem) {
      return;
    }

    const changed = this.battleSystem.acknowledgeLevelUp();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async persistCurrentRun() {
    if (!this.battleSystem || !this.state.runState) {
      this.syncBattleState();
      return;
    }

    if (this.state.debugMode) {
      this.syncBattleState();
      return;
    }

    const battleState = normalizeBattleState(this.battleSystem.getStateForSave());
    this.state.runState = normalizeRunState(this.state.runState);

    if (battleState.victory?.winner === TURN_SIDES.ENEMY) {
      this.state.runStatus = "failed";
    }

    const slotRecord = createSlotRecord(this.state.runState, battleState);
    await this.storage.saveSlot(this.state.selectedSlotId, slotRecord);
    this.state.slots = await this.storage.listSlots();
    this.syncBattleState();
  },

  prepareFundsGain(incomeGain, { pending = false } = {}) {
    if (!incomeGain || incomeGain.amount <= 0) {
      this.state.battleUi.fundsGain = null;
      return null;
    }

    const fundsGain = {
      id: `funds-${++this.fundsGainSequence}`,
      side: incomeGain.side,
      amount: incomeGain.amount,
      from: incomeGain.previousFunds,
      to: incomeGain.nextFunds,
      durationMs: BATTLE_FUNDS_GAIN_ANIMATION_MS,
      pending
    };

    this.state.battleUi.fundsGain = fundsGain;
    return fundsGain;
  },

  async playPreparedFundsGain(fundsGainId) {
    const currentGain = this.state.battleUi.fundsGain;

    if (!currentGain || currentGain.id !== fundsGainId) {
      return;
    }

    this.state.battleUi.fundsGain = {
      ...currentGain,
      pending: false
    };
    this.syncBattleState();
    await delay(currentGain.durationMs);

    if (this.state.battleUi.fundsGain?.id === fundsGainId) {
      this.state.battleUi.fundsGain = null;
      this.syncBattleState();
    }
  },

  async playFundsGain(incomeGain) {
    if (this.isRunBattle()) {
      this.state.battleUi.fundsGain = null;
      this.syncBattleState();
      return;
    }

    const fundsGain = this.prepareFundsGain(incomeGain);

    if (!fundsGain) {
      this.syncBattleState();
      return;
    }

    await this.playPreparedFundsGain(fundsGain.id);
  },

  async runEnemyTurnSequence() {
    if (this.state.battleSnapshot?.turn.activeSide === TURN_SIDES.ENEMY && !this.state.battleSnapshot?.victory) {
      await delay(BATTLE_TURN_BANNER_SETTLE_MS);
    }

    while (this.state.battleUi.pauseMenuOpen) {
      await delay(100);
    }

    const enemyStart = this.battleSystem?.startEnemyTurnActions();

    if (enemyStart?.changed) {
      if (this.battleSystem.getStateForSave().victory) {
        this.syncBattleState();
        await this.persistCurrentRun();
        return;
      }

      if (this.isRunBattle(this.battleSystem.getStateForSave())) {
        this.state.battleUi.fundsGain = null;
        this.syncBattleState();
      } else {
        await this.playFundsGain(enemyStart.incomeGain);
      }

      if (this.state.battleSnapshot?.victory) {
        await this.persistCurrentRun();
        return;
      }
    } else {
      this.syncBattleState();
    }

    const enemyPowerUsed = this.battleSystem?.shouldEnemyUsePower?.()
      ? this.battleSystem.activatePower()
      : false;

    if (enemyPowerUsed) {
      await this.playPowerOverlay(TURN_SIDES.ENEMY);
      const enemyPowerResult = this.battleSystem?.getLastPowerResult?.() ?? null;
      const enemyPowerTailMs = enemyPowerResult?.targets?.length
        ? Math.max(0, enemyPowerResult.targets.length - 1) * COMMANDER_POWER_TARGET_STAGGER_MS +
          COMMANDER_POWER_PULSE_DURATION_MS
        : 0;

      if (enemyPowerTailMs > 0) {
        await delay(enemyPowerTailMs);
      }

      if (this.state.battleSnapshot?.victory) {
        await this.persistCurrentRun();
        return;
      }
    } else if ((this.battleSystem?.getLastPowerResult?.()?.notes?.length ?? 0) > 0) {
      this.syncBattleState();
    }

    let enemyTurnForcePassed = false;
    let enemyStepCount = 0;
    const enemyTurnStartedAt = Date.now();

    while (this.battleSystem?.hasPendingEnemyTurn()) {
      if (
        enemyStepCount >= ENEMY_TURN_MAX_STEPS ||
        Date.now() - enemyTurnStartedAt >= ENEMY_TURN_MAX_WALL_TIME_MS
      ) {
        forcePassEnemyTurn(this, "timeout");
        enemyTurnForcePassed = true;
        this.syncBattleState();
        break;
      }

      while (this.state.battleUi.pauseMenuOpen) {
        await delay(100);
      }

      const previousSnapshot = this.state.battleSnapshot;
      let step;

      try {
        step = this.battleSystem.processEnemyTurnStep();
        enemyStepCount += 1;
        this.syncBattleState();
      } catch {
        forcePassEnemyTurn(this, "error");
        enemyTurnForcePassed = true;
        this.syncBattleState();
        break;
      }

      if (!step.changed || this.state.battleSnapshot?.victory) {
        break;
      }

      try {
        while (this.state.battleSnapshot?.levelUpQueue?.length) {
          await delay(100);
        }

        const combatCutsceneDuration = this.state.battleUi.combatCutscene?.durationMs ?? 0;
        const stepDelay = getBattleSnapshotTransitionDurationMs(
          previousSnapshot,
          this.state.battleSnapshot,
          {
            combatCutsceneDurationMs: combatCutsceneDuration,
            postCombatDelayMs: combatCutsceneDuration > 0 ? BATTLE_POST_COMBAT_PAUSE_MS : 0
          }
        );
        await delay(Math.max(stepDelay, combatCutsceneDuration));
      } catch {
        forcePassEnemyTurn(this, "error");
        enemyTurnForcePassed = true;
        this.syncBattleState();
        break;
      }
    }

    while (this.state.battleUi.pauseMenuOpen) {
      await delay(100);
    }

    const recruitment = enemyTurnForcePassed
      ? null
      : this.battleSystem?.performEnemyEndTurnRecruitment();

    if (recruitment?.changed) {
      this.syncBattleState();
      await delay(760);
    }

    const playerStart = this.battleSystem?.finalizeEnemyTurn();

    if (playerStart?.changed) {
      if (this.isRunBattle(this.battleSystem?.getStateForSave())) {
        this.state.battleUi.fundsGain = null;
        this.syncBattleState();
      } else {
        const playerFundsGain = this.prepareFundsGain(playerStart.incomeGain, {
          pending: true
        });

        this.syncBattleState();

        if (playerFundsGain && !this.state.battleSnapshot?.victory) {
          await delay(BATTLE_TURN_BANNER_SETTLE_MS);
          await this.playPreparedFundsGain(playerFundsGain.id);
        }
      }
    }

    await this.persistCurrentRun();
  },

  syncBattleState({ allowEnemyFocusDuringEnemyTurn = false } = {}) {
    const previousSnapshot = this.state.battleSnapshot;
    const rawSnapshot = this.battleSystem?.getSnapshot() ?? null;
    const nextSnapshot = this.decorateTutorialSnapshot?.(rawSnapshot) ?? rawSnapshot;
    const shouldShowFunds = !this.isRunBattle(nextSnapshot);

    if (!shouldShowFunds) {
      this.state.battleUi.fundsGain = null;
    }

    const autoFundsGain =
      shouldShowFunds && !this.state.battleUi.fundsGain
        ? getFundsGainFromSnapshots(previousSnapshot, nextSnapshot)
        : null;

    if (autoFundsGain) {
      this.prepareFundsGain(autoFundsGain, { pending: true });
    }

    this.state.battleSnapshot = nextSnapshot;

    const focusSide = getFocusSideForSelection(
      this.state.battleSnapshot,
      this.state.battleSnapshot?.selection
    );

    if (focusSide === TURN_SIDES.PLAYER) {
      this.state.battleUi.playerFocus = cloneFocusSelection(this.state.battleSnapshot.selection);
    } else if (
      focusSide === TURN_SIDES.ENEMY &&
      (
        this.state.battleSnapshot?.turn.activeSide !== TURN_SIDES.ENEMY ||
        allowEnemyFocusDuringEnemyTurn
      )
    ) {
      this.state.battleUi.enemyFocus = cloneFocusSelection(this.state.battleSnapshot.selection);
    }

    maybeSyncCombatCutscene(this, previousSnapshot, nextSnapshot);

    this.emit();

    if (autoFundsGain) {
      const fundsGainId = this.state.battleUi.fundsGain?.id;

      if (fundsGainId) {
        queueMicrotask(() => {
          void this.playPreparedFundsGain(fundsGainId);
        });
      }
    }
  },

  async debugSpawnUnit({ owner, unitTypeId, x, y, stats, gearSlot = null }) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.spawnDebugUnit(unitTypeId, owner, x, y, stats, gearSlot);

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async debugApplySelectedUnitStats(stats) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.applyDebugStatsToSelectedUnit(stats);

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async debugSetCommanders({ playerCommanderId, enemyCommanderId, enemyAiArchetype = null }) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.setDebugCommanders({
      [TURN_SIDES.PLAYER]: playerCommanderId,
      [TURN_SIDES.ENEMY]: enemyCommanderId,
      enemyAiArchetype
    });

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async debugSetCharge(side, charge) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.setDebugCharge(side, charge);

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async debugRefreshActions(side) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.resetDebugUnitActions(side);

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  openRunCardsPanel() {
    if (!this.battleSystem) {
      return;
    }

    this.state.battleUi.runCardsOpen = true;
    this.emit();
  },

  closeRunCardsPanel() {
    this.state.battleUi.runCardsOpen = false;
    this.emit();
  },

  debugAddRunCard(cardId) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const card = getRunUpgradeById(cardId);

    if (!card || card.hidden) {
      return;
    }

    const ownedRunCardIds = normalizeOwnedRunCardIds(this.state.runState);
    const nextOwnedRunCardIds = [...new Set([...ownedRunCardIds, card.id])];

    if (reloadSandboxRunWithCards(this, nextOwnedRunCardIds)) {
      this.state.banner = `${card.name} added to the sandbox run.`;
      this.showBattleNotice({
        title: "Upgrade Card Added",
        message: `${card.name} is active in the reloaded sandbox battle.`,
        tone: "success"
      });
    }
  },

  debugClearRunCards() {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    if (reloadSandboxRunWithCards(this, [])) {
      this.state.banner = "Sandbox upgrade cards cleared.";
      this.showBattleNotice({
        title: "Upgrade Cards Cleared",
        message: "The sandbox battle was reloaded without run cards.",
        tone: "info"
      });
    }
  }
};
