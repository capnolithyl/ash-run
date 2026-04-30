import {
  BATTLE_FUNDS_GAIN_ANIMATION_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  TURN_SIDES
} from "../core/constants.js";
import { getBattleSnapshotTransitionDurationMs } from "../phaser/view/battleAnimationEvents.js";
import {
  addRunIntel,
  applyBattleVictoryToRun,
  createBattleStateForRun,
  createSlotRecord,
  isRunComplete,
  normalizeBattleState,
  normalizeRunState
} from "../state/runFactory.js";
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

export const controllerRunMethods = {
  async advanceRun() {
    if (!this.battleSystem || !this.state.runState) {
      return;
    }

    const battleState = normalizeBattleState(this.battleSystem.getStateForSave());

    if (battleState.victory?.winner !== TURN_SIDES.PLAYER) {
      return;
    }

    let nextRunState = applyBattleVictoryToRun(this.state.runState, battleState);
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

    const nextRunState = {
      ...this.state.runState,
      selectedRewards:
        reward.type === "unit"
          ? [...(this.state.runState.selectedRewards ?? [])]
          : [...(this.state.runState.selectedRewards ?? []), reward],
      roster:
        reward.type === "unit" && reward.unitTypeId
          ? [
              ...(this.state.runState.roster ?? []),
              createPersistentUnitSnapshot(createUnitFromType(reward.unitTypeId, TURN_SIDES.PLAYER))
            ]
          : [...(this.state.runState.roster ?? [])],
      pendingRewardChoices: []
    };
    this.state.runState = normalizeRunState(nextRunState);
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

      if (this.state.battleSnapshot?.victory) {
        await this.persistCurrentRun();
        return;
      }
    }

    while (this.battleSystem?.hasPendingEnemyTurn()) {
      while (this.state.battleUi.pauseMenuOpen) {
        await delay(100);
      }

      const previousSnapshot = this.state.battleSnapshot;
      const step = this.battleSystem.processEnemyTurnStep();
      this.syncBattleState();

      if (!step.changed || this.state.battleSnapshot?.victory) {
        break;
      }

      while (this.state.battleSnapshot?.levelUpQueue?.length) {
        await delay(100);
      }

      const stepDelay = getBattleSnapshotTransitionDurationMs(
        previousSnapshot,
        this.state.battleSnapshot
      );
      await delay(stepDelay);
    }

    while (this.state.battleUi.pauseMenuOpen) {
      await delay(100);
    }

    const recruitment = this.battleSystem?.performEnemyEndTurnRecruitment();

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
    const nextSnapshot = this.battleSystem?.getSnapshot() ?? null;
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

  async debugSpawnUnit({ owner, unitTypeId, x, y, stats }) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.spawnDebugUnit(unitTypeId, owner, x, y, stats);

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
  }
};
