import {
  BATTLE_NOTICE_DISPLAY_MS,
  BATTLE_POWER_OVERLAY_DISPLAY_MS,
  SCREEN_IDS,
  TURN_SIDES
} from "../core/constants.js";
import { getCommanderPortraitImageUrl } from "../content/commanderArt.js";
import {
  BATTLE_CONTEXT_ACTION_DEDUPE_MS,
  RUN_CAPTURE_EXPERIENCE_REWARD,
  RUN_CAPTURE_INTEL_REWARD,
  delay
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

function getUnitIdAt(controller, x, y) {
  const battleState = controller.battleSystem?.state ?? controller.battleSystem?.getStateForSave?.();
  return [...(battleState?.player?.units ?? []), ...(battleState?.enemy?.units ?? [])].find(
    (unit) => unit.x === x && unit.y === y && unit.current?.hp > 0
  )?.id ?? null;
}

const TARGETING_MODES = new Set([
  "fire",
  "unload",
  "transport",
  "support",
  "medpack",
  "extinguish",
  "slipstream"
]);

function captureBattleControlState(controller) {
  const battleState =
    controller.battleSystem?.state ?? controller.battleSystem?.getStateForSave?.() ?? null;
  const selection = battleState?.selection ?? null;
  const pendingAction = battleState?.pendingAction ?? null;

  return {
    selection: selection?.type
      ? {
          type: selection.type,
          id: selection.id ?? null,
          x: selection.x ?? null,
          y: selection.y ?? null
        }
      : null,
    pendingAction: pendingAction
      ? {
          type: pendingAction.type ?? null,
          unitId: pendingAction.unitId ?? null,
          mode: pendingAction.mode ?? "menu",
          fromX: pendingAction.fromX ?? null,
          fromY: pendingAction.fromY ?? null,
          toX: pendingAction.toX ?? null,
          toY: pendingAction.toY ?? null
        }
      : null
  };
}

function emitBattleControlCue(controller, cueId, dedupeKey, context = {}) {
  controller.emitAudioCue?.(cueId, {
    dedupeKey,
    source: "battle-control",
    ...context
  });
}

function emitTileSelectionCue(controller, before, after, changed, x, y) {
  const previousMode = before.pendingAction?.mode ?? null;

  if (!changed) {
    if (TARGETING_MODES.has(previousMode)) {
      emitBattleControlCue(controller, "battle.invalid", `invalid:${previousMode}:${x},${y}`);
    }
    return;
  }

  if (TARGETING_MODES.has(previousMode)) {
    emitBattleControlCue(
      controller,
      previousMode === "slipstream" ? "battle.move-confirm" : "battle.target-confirm",
      `target:${previousMode}:${before.pendingAction?.unitId ?? "unit"}:${x},${y}`
    );
    return;
  }

  const nextPending = after.pendingAction;
  const moved =
    nextPending?.type === "move" &&
    Number.isInteger(nextPending.fromX) &&
    Number.isInteger(nextPending.fromY) &&
    (nextPending.fromX !== nextPending.toX || nextPending.fromY !== nextPending.toY);

  if (moved) {
    emitBattleControlCue(
      controller,
      "battle.move-confirm",
      `move:${nextPending.unitId}:${nextPending.toX},${nextPending.toY}`
    );
    return;
  }

  if (!after.selection && before.selection) {
    emitBattleControlCue(
      controller,
      "battle.deselect",
      `deselect:${before.selection.type}:${before.selection.id ?? `${before.selection.x},${before.selection.y}`}`
    );
    return;
  }

  if (after.selection) {
    emitBattleControlCue(
      controller,
      "battle.select",
      `select:${after.selection.type}:${after.selection.id ?? `${after.selection.x},${after.selection.y}`}`
    );
  }
}

function emitTargetingModeCueIfEntered(controller, before, expectedMode) {
  const after = captureBattleControlState(controller);

  if (
    before.pendingAction?.mode !== expectedMode &&
    after.pendingAction?.mode === expectedMode
  ) {
    emitBattleControlCue(
      controller,
      "battle.targeting",
      `targeting:${expectedMode}:${after.pendingAction?.unitId ?? "unit"}`
    );
  }
}

export const controllerBattleMethods = {
  openPauseMenu() {
    if (
      !this.battleSystem ||
      this.state.screen !== SCREEN_IDS.BATTLE ||
      this.state.battleSnapshot?.victory ||
      this.state.battleUi.combatCutscene
    ) {
      return false;
    }

    this.state.battleUi.pauseMenuOpen = true;
    this.state.battleUi.confirmAbandon = false;
    this.emit();
    return true;
  },

  closePauseMenu() {
    if (!this.state.battleUi.pauseMenuOpen) {
      return false;
    }

    this.state.battleUi.pauseMenuOpen = false;
    this.state.battleUi.confirmAbandon = false;
    this.emit();
    return true;
  },

  isBattleInputLocked() {
    return Boolean(
      this.state.battleUi.pauseMenuOpen ||
        this.state.battleUi.fundsGain ||
        this.state.battleUi.powerOverlay ||
        this.state.battleUi.combatCutscene ||
        this.state.battleSnapshot?.levelUpQueue?.length
    );
  },

  showBattleNotice({
    title,
    message,
    tone = "info",
    durationMs = BATTLE_NOTICE_DISPLAY_MS,
    placement = "top",
    persistent = false
  }) {
    if (this.state.screen !== SCREEN_IDS.BATTLE) {
      return null;
    }

    const displayMs = Math.max(1, Number(durationMs) || BATTLE_NOTICE_DISPLAY_MS);
    const notice = {
      id: `notice-${++this.battleNoticeSequence}`,
      title,
      message,
      tone,
      placement,
      persistent: persistent === true,
      createdAt: Date.now(),
      durationMs: displayMs
    };

    this.state.battleUi.notice = notice;
    this.emit();

    if (this.battleNoticeTimer) {
      clearTimeout(this.battleNoticeTimer);
      this.battleNoticeTimer = null;
    }

    if (!notice.persistent) {
      this.battleNoticeTimer = setTimeout(() => {
        this.battleNoticeTimer = null;

        if (this.state.battleUi.notice?.id === notice.id) {
          this.state.battleUi.notice = null;
          this.emit();
        }
      }, displayMs);
    }

    return notice.id;
  },

  clearBattleNotice(noticeId = null) {
    if (noticeId && this.state.battleUi.notice?.id !== noticeId) {
      return false;
    }

    if (!this.state.battleUi.notice) {
      return false;
    }

    if (this.battleNoticeTimer) {
      clearTimeout(this.battleNoticeTimer);
      this.battleNoticeTimer = null;
    }

    this.state.battleUi.notice = null;
    this.emit();
    return true;
  },

  async playPowerOverlay(side) {
    const powerResult = this.battleSystem?.getLastPowerResult?.() ?? null;

    if (!powerResult || powerResult.side !== side) {
      this.syncBattleState();
      return;
    }

    const overlay = {
      id: `power-${++this.battlePowerOverlaySequence}`,
      side,
      commanderName: powerResult.commanderName,
      commanderTitle: powerResult.commanderTitle,
      powerName: powerResult.powerName,
      portraitImageUrl: getCommanderPortraitImageUrl(powerResult.commanderId),
      accent: powerResult.accent
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

    const targetUnitId = getUnitIdAt(this, x, y);

    if (!this.guardTutorialBattleAction?.("tile", { x, y, targetUnitId })) {
      return;
    }

    const beforeControlState = captureBattleControlState(this);
    const changed = this.battleSystem.handleTileSelection(x, y);
    const afterControlState = captureBattleControlState(this);
    emitTileSelectionCue(this, beforeControlState, afterControlState, changed, x, y);

    if (changed) {
      await this.handleTutorialBattleActionResult?.("tile", { x, y, targetUnitId }, changed);

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

    const beforeControlState = captureBattleControlState(this);
    const changed = this.battleSystem.handleContextAction();

    if (changed) {
      emitBattleControlCue(
        this,
        beforeControlState.pendingAction ? "ui.cancel" : "battle.deselect",
        beforeControlState.pendingAction
          ? `context:${beforeControlState.pendingAction.mode}:${beforeControlState.pendingAction.unitId}`
          : `context:deselect:${beforeControlState.selection?.id ?? "tile"}`
      );
      await this.persistCurrentRun();
    }
  },

  async recruitUnit(unitTypeId) {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (this.isTutorialBattle?.()) {
      emitBattleControlCue(this, "battle.invalid", `recruit:tutorial:${unitTypeId}`);
      this.showTutorialNudge?.("Recruitment is covered after the sim. This guided match uses a fixed squad.");
      return;
    }

    if (this.state.runState && !this.state.debugMode) {
      emitBattleControlCue(this, "battle.invalid", `recruit:run:${unitTypeId}`);
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
    emitBattleControlCue(this, "battle.invalid", `recruit:rejected:${unitTypeId}`);

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

    if (!this.guardTutorialBattleAction?.("select-next-unit")) {
      return;
    }

    const changed = this.battleSystem.selectNextReadyUnit();

    if (changed) {
      const selected = captureBattleControlState(this).selection;
      emitBattleControlCue(
        this,
        "battle.select",
        `select-next:${selected?.id ?? "unit"}`
      );
      await this.persistCurrentRun();
    }
  },

  async waitWithSelectedUnit() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (!this.guardTutorialBattleAction?.("wait-unit")) {
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

    if (!this.guardTutorialBattleAction?.("capture-building")) {
      return;
    }

    const captureRewardContext = getPendingCaptureRewardContext(this);
    const changed = this.battleSystem.captureWithPendingUnit();

    if (changed) {
      await this.handleTutorialBattleActionResult?.("capture-building", {}, changed);

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

  async useSelectedSupply() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.useSupplyWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async rescueHostageWithSelectedUnit() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.rescueHostageWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async dropOffHostageWithSelectedUnit() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const changed = this.battleSystem.dropOffHostageWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  },

  async useSelectedSupportAbility() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const beforeControlState = captureBattleControlState(this);
    const changed = this.battleSystem.useSupportAbilityWithPendingUnit();

    if (changed) {
      emitTargetingModeCueIfEntered(this, beforeControlState, "support");
      await this.persistCurrentRun();
    }
  },

  async useSelectedMedpack() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const beforeControlState = captureBattleControlState(this);
    const changed = this.battleSystem.useMedpackWithPendingUnit();

    if (changed) {
      emitTargetingModeCueIfEntered(this, beforeControlState, "medpack");
      await this.persistCurrentRun();
    }
  },

  async useSelectedExtinguish() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const beforeControlState = captureBattleControlState(this);
    const changed = this.battleSystem.useExtinguishAbilityWithPendingUnit();

    if (changed) {
      emitTargetingModeCueIfEntered(this, beforeControlState, "extinguish");
      await this.persistCurrentRun();
    }
  },

  async enterSelectedTransport() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const beforeControlState = captureBattleControlState(this);
    const changed = this.battleSystem.enterTransportWithPendingUnit();

    if (changed) {
      emitTargetingModeCueIfEntered(this, beforeControlState, "transport");
      await this.persistCurrentRun();
    }
  },

  async beginSelectedUnload() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    const beforeControlState = captureBattleControlState(this);
    const changed = this.battleSystem.beginPendingUnload();

    if (changed) {
      emitTargetingModeCueIfEntered(this, beforeControlState, "unload");
      await this.persistCurrentRun();
    }
  },

  async beginSelectedAttack() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (!this.guardTutorialBattleAction?.("begin-attack")) {
      return;
    }

    const beforeControlState = captureBattleControlState(this);
    const changed = this.battleSystem.beginPendingAttack();

    if (changed) {
      emitTargetingModeCueIfEntered(this, beforeControlState, "fire");
      await this.handleTutorialBattleActionResult?.("begin-attack", {}, changed);
      await this.persistCurrentRun();
    }
  },

  async cancelSelectedAttack() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (!this.guardTutorialBattleAction?.("cancel-attack")) {
      return;
    }

    const changed = this.battleSystem.cancelPendingAttack();

    if (changed) {
      emitBattleControlCue(this, "ui.cancel", "cancel:attack");
      await this.persistCurrentRun();
    }
  },

  async redoSelectedMove() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (!this.guardTutorialBattleAction?.("redo-move")) {
      return;
    }

    const changed = this.battleSystem.redoPendingMove();

    if (changed) {
      emitBattleControlCue(this, "ui.cancel", "cancel:move-rollback");
      await this.persistCurrentRun();
    }
  },

  async endTurn() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (!this.guardTutorialBattleAction?.("end-turn")) {
      return;
    }

    const changed = this.battleSystem.endTurn();

    if (!changed) {
      this.syncBattleState();
      return;
    }

    emitBattleControlCue(
      this,
      "battle.turn-end",
      `turn-end:${this.state.battleSnapshot?.turn?.number ?? "current"}`
    );

    this.syncBattleState();

    if (this.battleSystem.isEnemyTurnActive()) {
      await this.runEnemyTurnSequence();
      await this.handleTutorialBattleActionResult?.("end-turn", {}, changed);
      this.syncBattleState();
      return;
    }

    if (this.state.battleSnapshot?.turn.activeSide === TURN_SIDES.ENEMY && !this.state.battleSnapshot?.victory) {
      this.battleSystem.finalizeEnemyTurn();
    }

    await this.handleTutorialBattleActionResult?.("end-turn", {}, changed);
    await this.persistCurrentRun();
  },

  async activatePower() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }

    if (this.state.battleSnapshot?.turn.activeSide !== TURN_SIDES.PLAYER) {
      return;
    }

    if (!this.guardTutorialBattleAction?.("activate-power")) {
      return;
    }

    if (this.state.debugMode) {
      this.battleSystem.setDebugCharge(TURN_SIDES.PLAYER, 9999);
    }

    const changed = this.battleSystem.activatePower();

    if (changed) {
      await this.playPowerOverlay(TURN_SIDES.PLAYER);
      await this.handleTutorialBattleActionResult?.("activate-power", {}, changed);
      await this.persistCurrentRun();
      return;
    }

    emitBattleControlCue(
      this,
      "battle.invalid",
      `commander:rejected:${this.state.battleSnapshot?.turn?.number ?? "current"}`
    );
    this.syncBattleState();
  }
};
