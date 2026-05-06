import {
  BATTLE_NOTICE_DISPLAY_MS,
  BATTLE_POWER_OVERLAY_DISPLAY_MS,
  SCREEN_IDS,
  TURN_SIDES
} from "../core/constants.js";
import { COMMANDERS } from "../content/commanders.js";
import {
  BATTLE_CONTEXT_ACTION_DEDUPE_MS,
  RUN_CAPTURE_EXPERIENCE_REWARD,
  RUN_CAPTURE_INTEL_REWARD,
  delay,
  getCommanderPowerTitle
} from "./controllerShared.js";
import { addRunIntel, createEmptyBattleRewardLedger } from "../state/runFactory.js";

function getPendingCaptureRewardContext(controller) {
  const battleState = controller.battleSystem?.getStateForSave();
  const pendingAction = battleState?.pendingAction;

  if (!pendingAction?.unitId || !controller.isRunBattle(battleState)) {
    return null;
  }

  const unit = battleState.player?.units?.find((candidate) => candidate.id === pendingAction.unitId);
  const building = unit
    ? battleState.map?.buildings?.find((candidate) => candidate.x === unit.x && candidate.y === unit.y)
    : null;

  if (!unit || !building) {
    return null;
  }

  return {
    unitId: unit.id,
    buildingId: building.id
  };
}

export const controllerBattleMethods = {
  openPauseMenu() {
    if (!this.battleSystem || this.state.screen !== SCREEN_IDS.BATTLE || this.state.battleSnapshot?.victory) {
      return;
    }

    this.state.battleUi.pauseMenuOpen = true;
    this.state.battleUi.confirmAbandon = false;
    this.emit();
  },

  closePauseMenu() {
    if (!this.state.battleUi.pauseMenuOpen) {
      return;
    }

    this.state.battleUi.pauseMenuOpen = false;
    this.state.battleUi.confirmAbandon = false;
    this.emit();
  },

  isBattleInputLocked() {
    return Boolean(
      this.state.battleUi.pauseMenuOpen ||
        this.state.battleUi.fundsGain ||
        this.state.battleUi.powerOverlay ||
        this.state.battleSnapshot?.levelUpQueue?.length
    );
  },

  showBattleNotice({ title, message, tone = "info" }) {
    if (this.state.screen !== SCREEN_IDS.BATTLE) {
      return;
    }

    const notice = {
      id: `notice-${++this.battleNoticeSequence}`,
      title,
      message,
      tone,
      createdAt: Date.now(),
      durationMs: BATTLE_NOTICE_DISPLAY_MS
    };

    this.state.battleUi.notice = notice;
    this.emit();

    if (this.battleNoticeTimer) {
      clearTimeout(this.battleNoticeTimer);
    }

    this.battleNoticeTimer = setTimeout(() => {
      this.battleNoticeTimer = null;

      if (this.state.battleUi.notice?.id === notice.id) {
        this.state.battleUi.notice = null;
        this.emit();
      }
    }, BATTLE_NOTICE_DISPLAY_MS);
  },

  async playPowerOverlay(side) {
    const battleState = this.battleSystem?.getStateForSave();
    const commanderId = battleState?.[side]?.commanderId;
    const commander = COMMANDERS.find((candidate) => candidate.id === commanderId);

    if (!commander) {
      this.syncBattleState();
      return;
    }

    const overlay = {
      id: `power-${++this.battlePowerOverlaySequence}`,
      side,
      commanderName: commander.name,
      title: getCommanderPowerTitle(commander),
      summary: commander.active.summary,
      accent: commander.accent
    };

    this.state.battleUi.powerOverlay = overlay;
    this.syncBattleState();
    await delay(BATTLE_POWER_OVERLAY_DISPLAY_MS);

    if (this.state.battleUi.powerOverlay?.id === overlay.id) {
      this.state.battleUi.powerOverlay = null;
      this.syncBattleState();
    }
  },

  promptAbandonRun() {
    if (!this.state.battleUi.pauseMenuOpen) {
      return;
    }

    this.state.battleUi.confirmAbandon = true;
    this.emit();
  },

  cancelAbandonRun() {
    if (!this.state.battleUi.pauseMenuOpen) {
      return;
    }

    this.state.battleUi.confirmAbandon = false;
    this.emit();
  },

  async abandonRun() {
    if (this.state.runState && this.battleSystem) {
      this.battleSystem.state.pendingAction = null;
      this.battleSystem.state.rewardLedger ??= createEmptyBattleRewardLedger();
      this.battleSystem.state.rewardLedger.forfeited = true;
      this.battleSystem.state.victory = {
        winner: TURN_SIDES.ENEMY,
        message: "Retreat ordered. Earned Intel Credits were extracted."
      };
      this.state.battleUi.pauseMenuOpen = false;
      this.state.battleUi.confirmAbandon = false;
      this.state.runStatus = "failed";
      this.state.banner = "Run forfeited. Earned Intel Credits were preserved.";
      await this.persistCurrentRun();
      return;
    }

    this.state.screen = SCREEN_IDS.TITLE;
    this.clearBattleSession();
    this.emit();
  },

  async handleBattleTileClick(x, y) {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.handleTileSelection(x, y);

    if (changed) {
      if (this.battleSystem.isEnemyTurnActive?.()) {
        this.syncBattleState({ allowEnemyFocusDuringEnemyTurn: true });
        return;
      }

      await this.persistCurrentRun();
    }
  },

  setBattleHoverTile(tile) {
    if (!this.battleSystem || this.state.screen !== SCREEN_IDS.BATTLE) {
      return;
    }

    const nextTile =
      tile && Number.isInteger(tile.x) && Number.isInteger(tile.y)
        ? { x: tile.x, y: tile.y }
        : null;
    const currentTile = this.state.battleUi.hoveredTile;

    if (currentTile?.x === nextTile?.x && currentTile?.y === nextTile?.y) {
      return;
    }

    this.state.battleUi.hoveredTile = nextTile;
    this.emit();
  },

  async handleBattleContextAction() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const now = Date.now();

    if (now - this.lastBattleContextActionAt < BATTLE_CONTEXT_ACTION_DEDUPE_MS) {
      return;
    }

    this.lastBattleContextActionAt = now;

    const changed = this.battleSystem.handleContextAction();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async recruitUnit(unitTypeId) {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (this.state.runState && !this.state.debugMode) {
      this.showBattleNotice({
        title: "Run Rules",
        message: "Recruiting is disabled in run mode. Expand your squad between maps instead.",
        tone: "info"
      });
      return;
    }

    const changed = this.battleSystem.recruitUnit(unitTypeId);

    if (changed) {
      await this.persistCurrentRun();
      return;
    }

    const unitLimit = this.battleSystem.getPlayerUnitLimitStatus?.();

    if (unitLimit?.isAtLimit) {
      this.showBattleNotice({
        title: "Unit Limit Reached",
        message: `${unitLimit.count}/${unitLimit.limit} units are already deployed.`,
        tone: "warning"
      });
    }
  },

  async selectNextReadyUnit() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.selectNextReadyUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async waitWithSelectedUnit() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.waitWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async captureWithSelectedUnit() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const captureRewardContext = getPendingCaptureRewardContext(this);
    const changed = this.battleSystem.captureWithPendingUnit();

    if (changed) {
      if (captureRewardContext && !this.state.debugMode) {
        const rewardLedger = this.battleSystem.state.rewardLedger ??= createEmptyBattleRewardLedger();
        const rewardAlreadyClaimed = rewardLedger.rewardedCaptureBuildingIds.includes(
          captureRewardContext.buildingId
        );

        if (!rewardAlreadyClaimed) {
          rewardLedger.rewardedCaptureBuildingIds.push(captureRewardContext.buildingId);
          rewardLedger.captureIntel += RUN_CAPTURE_INTEL_REWARD;
          rewardLedger.captureExperience += RUN_CAPTURE_EXPERIENCE_REWARD;
          this.battleSystem.awardExperienceToUnit(
            captureRewardContext.unitId,
            RUN_CAPTURE_EXPERIENCE_REWARD
          );
          this.state.runState = addRunIntel(this.state.runState, "capture", RUN_CAPTURE_INTEL_REWARD);
          this.state.metaState.metaCurrency += RUN_CAPTURE_INTEL_REWARD;
          await this.storage.saveMeta(this.state.metaState);
          this.showBattleNotice({
            title: "Intel Secured",
            message: `+${RUN_CAPTURE_INTEL_REWARD} Intel Credits and +${RUN_CAPTURE_EXPERIENCE_REWARD} EXP.`,
            tone: "info"
          });
        }
      }

      await this.persistCurrentRun();
    }
  },

  async useSelectedSupportAbility() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.useSupportAbilityWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async useSelectedMedpack() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.useMedpackWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async useSelectedExtinguish() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.useExtinguishAbilityWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async enterSelectedTransport() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.enterTransportWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async beginSelectedUnload() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.beginPendingUnload();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async beginSelectedAttack() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.beginPendingAttack();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async cancelSelectedAttack() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.cancelPendingAttack();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async redoSelectedMove() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.redoPendingMove();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async endTurn() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.endTurn();

    if (!changed) {
      this.syncBattleState();
      return;
    }

    this.syncBattleState();

    if (this.battleSystem.isEnemyTurnActive()) {
      await this.runEnemyTurnSequence();
      return;
    }

    if (this.state.battleSnapshot?.turn.activeSide === TURN_SIDES.ENEMY && !this.state.battleSnapshot?.victory) {
      this.battleSystem.finalizeEnemyTurn();
    }

    await this.persistCurrentRun();
  },

  async activatePower() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (this.state.battleSnapshot?.turn.activeSide !== TURN_SIDES.PLAYER) {
      return;
    }

    if (this.state.debugMode) {
      this.battleSystem.setDebugCharge(TURN_SIDES.PLAYER, 9999);
    }

    const changed = this.battleSystem.activatePower();

    if (changed) {
      await this.playPowerOverlay(TURN_SIDES.PLAYER);
      await this.persistCurrentRun();
      return;
    }

    this.syncBattleState();
  }
};
