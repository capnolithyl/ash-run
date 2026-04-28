import { createEmitter } from "../core/emitter.js";
import {
  BATTLE_FUNDS_GAIN_ANIMATION_MS,
  BATTLE_MOVE_SETTLE_MS,
  BATTLE_NOTICE_DISPLAY_MS,
  BATTLE_POWER_OVERLAY_DISPLAY_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  SCREEN_IDS,
  SKIRMISH_DEFAULT_FUNDS_PER_BUILDING,
  SKIRMISH_DEFAULT_STARTING_FUNDS,
  SLOT_IDS,
  TURN_SIDES,
  getBattleMoveDuration
} from "../core/constants.js";
import { COMMANDERS } from "../content/commanders.js";
import { StorageRepository } from "../services/StorageRepository.js";
import { BattleSystem } from "../simulation/battleSystem.js";
import {
  applyBattleVictoryToRun,
  createBattleStateForRun,
  createSkirmishBattleState,
  createNewRunState,
  createSlotRecord,
  isRunComplete
} from "../state/runFactory.js";
import { createDefaultMetaState } from "../state/defaults.js";

function pickFirstAvailableSlot(slots) {
  return slots.find((slot) => !slot.exists)?.slotId ?? SLOT_IDS[0];
}

function unlockNextCommander(metaState) {
  const lockedCommander = COMMANDERS.find(
    (commander) => !metaState.unlockedCommanderIds.includes(commander.id)
  );

  if (!lockedCommander) {
    return null;
  }

  metaState.unlockedCommanderIds.push(lockedCommander.id);
  return lockedCommander;
}

function createBattleUiState() {
  return {
    pauseMenuOpen: false,
    confirmAbandon: false,
    fundsGain: null,
    notice: null,
    powerOverlay: null,
    hoveredTile: null,
    playerFocus: null,
    enemyFocus: null
  };
}

function createDefaultSkirmishSetupState(unlockedCommanderIds = []) {
  const defaultCommanderId = unlockedCommanderIds[0] ?? COMMANDERS[0]?.id ?? null;
  const defaultEnemyCommanderId =
    COMMANDERS.find((commander) => commander.id !== defaultCommanderId)?.id ?? defaultCommanderId;

  return {
    step: "commanders",
    playerCommanderId: defaultCommanderId,
    enemyCommanderId: defaultEnemyCommanderId,
    mapId: "ashline-crossing",
    startingFunds: SKIRMISH_DEFAULT_STARTING_FUNDS,
    fundsPerBuilding: SKIRMISH_DEFAULT_FUNDS_PER_BUILDING
  };
}

function cloneFocusSelection(selection) {
  if (!selection?.type) {
    return null;
  }

  return {
    type: selection.type,
    id: selection.id ?? null,
    x: selection.x ?? null,
    y: selection.y ?? null
  };
}

function getFocusSideForSelection(snapshot, selection) {
  if (!snapshot || !selection?.type) {
    return null;
  }

  if (selection.type === "unit") {
    if (snapshot.player.units.some((unit) => unit.id === selection.id && unit.current.hp > 0)) {
      return TURN_SIDES.PLAYER;
    }

    if (snapshot.enemy.units.some((unit) => unit.id === selection.id && unit.current.hp > 0)) {
      return TURN_SIDES.ENEMY;
    }

    return null;
  }

  if (selection.type === "building") {
    const building = snapshot.map.buildings.find((candidate) => candidate.id === selection.id);

    if (building?.owner === TURN_SIDES.PLAYER || building?.owner === TURN_SIDES.ENEMY) {
      return building.owner;
    }
  }

  return snapshot.turn.activeSide === TURN_SIDES.ENEMY ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
}

function getCommanderPowerTitle(commander) {
  const summary = commander?.active?.summary ?? "Commander Power";
  const [title] = summary.split(":");

  return title?.trim() || "Commander Power";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const BATTLE_CONTEXT_ACTION_DEDUPE_MS = 180;

/**
 * The controller owns app flow and save orchestration.
 * Scenes and DOM views only talk to it through explicit methods.
 */
export class GameController {
  constructor(storage = new StorageRepository()) {
    this.storage = storage;
    this.events = createEmitter();
    this.battleSystem = null;
    this.fundsGainSequence = 0;
    this.battleNoticeSequence = 0;
    this.battlePowerOverlaySequence = 0;
    this.battleNoticeTimer = null;
    this.lastBattleContextActionAt = 0;
    this.state = {
      ready: false,
      screen: SCREEN_IDS.TITLE,
      metaState: createDefaultMetaState(),
      slots: [],
      runState: null,
      battleSnapshot: null,
      debugMode: false,
      selectedCommanderId: null,
      selectedSlotId: SLOT_IDS[0],
      banner: "",
      runStatus: null,
      battleUi: createBattleUiState(),
      skirmishSetup: createDefaultSkirmishSetupState()
    };
  }

  subscribe(handler) {
    return this.events.on("state:changed", handler);
  }

  getState() {
    return structuredClone(this.state);
  }

  emit() {
    this.events.emit("state:changed", this.getState());
  }

  async initialize() {
    const loadedMeta = await this.storage.loadMeta();
    const defaultMeta = createDefaultMetaState();
    this.state.metaState = {
      ...defaultMeta,
      ...loadedMeta,
      options: {
        ...defaultMeta.options,
        ...(loadedMeta?.options ?? {})
      }
    };
    this.state.slots = await this.storage.listSlots();
    this.state.selectedCommanderId = this.state.metaState.unlockedCommanderIds[0] ?? null;
    this.state.selectedSlotId = pickFirstAvailableSlot(this.state.slots);
    this.state.skirmishSetup = createDefaultSkirmishSetupState(
      this.state.metaState.unlockedCommanderIds
    );
    this.state.ready = true;
    this.emit();
  }

  resetBattleUi() {
    if (this.battleNoticeTimer) {
      clearTimeout(this.battleNoticeTimer);
      this.battleNoticeTimer = null;
    }

    this.state.battleUi = createBattleUiState();
  }

  clearBattleSession() {
    this.battleSystem = null;
    this.state.runState = null;
    this.state.battleSnapshot = null;
    this.state.debugMode = false;
    this.state.runStatus = null;
    this.state.banner = "";
    this.resetBattleUi();
  }

  openNewRun() {
    this.state.screen = SCREEN_IDS.COMMANDER_SELECT;
    this.state.selectedCommanderId = this.state.metaState.unlockedCommanderIds[0] ?? null;
    this.state.selectedSlotId = pickFirstAvailableSlot(this.state.slots);
    this.state.banner = "";
    this.state.debugMode = false;
    this.resetBattleUi();
    this.emit();
  }

  startDebugRun() {
    const commanderId = this.state.metaState.unlockedCommanderIds[0] ?? this.state.selectedCommanderId;

    if (!commanderId) {
      return;
    }

    const runState = createNewRunState({
      slotId: this.state.selectedSlotId,
      commanderId
    });
    const battleState = createBattleStateForRun(runState);

    this.battleSystem = new BattleSystem(battleState);
    this.state.runState = runState;
    this.state.screen = SCREEN_IDS.BATTLE;
    this.state.runStatus = null;
    this.state.debugMode = true;
    this.state.banner = "Sandbox active: saves are disabled.";
    this.resetBattleUi();
    this.syncBattleState();
  }

  openContinue() {
    this.state.screen = SCREEN_IDS.LOAD_SLOT;
    this.state.banner = "";
    this.resetBattleUi();
    this.emit();
  }

  openSkirmish() {
    this.state.screen = SCREEN_IDS.SKIRMISH_SETUP;
    this.state.skirmishSetup = {
      ...this.state.skirmishSetup,
      step: "commanders"
    };
    this.state.banner = "";
    this.state.debugMode = false;
    this.resetBattleUi();
    this.emit();
  }

  openTutorial() {
    this.state.screen = SCREEN_IDS.TUTORIAL;
    this.state.banner = "";
    this.resetBattleUi();
    this.emit();
  }

  openOptions() {
    this.state.screen = SCREEN_IDS.OPTIONS;
    this.resetBattleUi();
    this.emit();
  }

  async returnToTitle() {
    if (this.state.runStatus === "failed" || this.state.runStatus === "complete") {
      await this.deleteSlot(this.state.selectedSlotId, false);
    }

    this.state.screen = SCREEN_IDS.TITLE;
    this.clearBattleSession();
    this.emit();
  }

  selectCommander(commanderId) {
    if (!this.state.metaState.unlockedCommanderIds.includes(commanderId)) {
      return;
    }

    this.state.selectedCommanderId = commanderId;
    this.emit();
  }

  selectSlot(slotId) {
    this.state.selectedSlotId = slotId;
    this.emit();
  }

  updateSkirmishSetup(patch) {
    const next = {
      ...this.state.skirmishSetup,
      ...patch
    };
    this.state.skirmishSetup = {
      ...next,
      step: next.step === "map" ? "map" : "commanders",
      startingFunds: Math.max(0, Number(next.startingFunds ?? 0)),
      fundsPerBuilding: Math.max(0, Number(next.fundsPerBuilding ?? 0))
    };
    this.emit();
  }

  async startSkirmish() {
    const {
      mapId,
      playerCommanderId,
      enemyCommanderId,
      startingFunds,
      fundsPerBuilding
    } = this.state.skirmishSetup;

    if (!playerCommanderId || !enemyCommanderId || !mapId) {
      return;
    }

    const battleState = createSkirmishBattleState({
      mapId,
      playerCommanderId,
      enemyCommanderId,
      startingFunds,
      fundsPerBuilding
    });

    this.battleSystem = new BattleSystem(battleState);
    this.state.runState = null;
    this.state.runStatus = null;
    this.state.debugMode = false;
    this.state.banner = "Skirmish mode active: this battle does not save run progress.";
    this.state.screen = SCREEN_IDS.BATTLE;
    this.resetBattleUi();
    this.syncBattleState();
  }

  async startNewRun() {
    if (!this.state.selectedCommanderId) {
      return;
    }

    const runState = createNewRunState({
      slotId: this.state.selectedSlotId,
      commanderId: this.state.selectedCommanderId
    });
    const battleState = createBattleStateForRun(runState);

    this.battleSystem = new BattleSystem(battleState);
    this.state.runState = runState;
    this.state.screen = SCREEN_IDS.BATTLE;
    this.state.runStatus = null;
    this.resetBattleUi();
    this.state.metaState.lastPlayedSlotId = this.state.selectedSlotId;
    await this.storage.saveMeta(this.state.metaState);
    await this.persistCurrentRun();
  }

  async loadSlot(slotId) {
    const slotRecord = await this.storage.loadSlot(slotId);

    if (!slotRecord) {
      return;
    }

    this.state.selectedSlotId = slotId;
    this.state.runState = slotRecord.runState;
    this.battleSystem = new BattleSystem(slotRecord.battleState);
    this.state.screen = SCREEN_IDS.BATTLE;
    this.state.debugMode = false;
    this.resetBattleUi();
    this.state.metaState.lastPlayedSlotId = slotId;
    this.state.runStatus =
      slotRecord.battleState?.victory?.winner === TURN_SIDES.ENEMY ? "failed" : null;

    await this.storage.saveMeta(this.state.metaState);
    this.syncBattleState();
  }

  async updateOptions(patch) {
    this.state.metaState.options = {
      ...this.state.metaState.options,
      ...patch
    };
    await this.storage.saveMeta(this.state.metaState);
    this.emit();
  }

  async deleteSlot(slotId, emitAfter = true) {
    await this.storage.deleteSlot(slotId);
    this.state.slots = await this.storage.listSlots();

    if (emitAfter) {
      this.emit();
    }
  }

  async quitGame() {
    await this.storage.quit();
  }

  openPauseMenu() {
    if (!this.battleSystem || this.state.screen !== SCREEN_IDS.BATTLE || this.state.battleSnapshot?.victory) {
      return;
    }

    this.state.battleUi.pauseMenuOpen = true;
    this.state.battleUi.confirmAbandon = false;
    this.emit();
  }

  closePauseMenu() {
    if (!this.state.battleUi.pauseMenuOpen) {
      return;
    }

    this.state.battleUi.pauseMenuOpen = false;
    this.state.battleUi.confirmAbandon = false;
    this.emit();
  }

  isBattleInputLocked() {
    return Boolean(
      this.state.battleUi.pauseMenuOpen ||
        this.state.battleUi.fundsGain ||
        this.state.battleUi.powerOverlay ||
        this.state.battleSnapshot?.levelUpQueue?.length
    );
  }

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
  }

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
  }

  promptAbandonRun() {
    if (!this.state.battleUi.pauseMenuOpen) {
      return;
    }

    this.state.battleUi.confirmAbandon = true;
    this.emit();
  }

  cancelAbandonRun() {
    if (!this.state.battleUi.pauseMenuOpen) {
      return;
    }

    this.state.battleUi.confirmAbandon = false;
    this.emit();
  }

  async abandonRun() {
    if (this.state.runState) {
      await this.deleteSlot(this.state.selectedSlotId, false);
    }

    this.state.screen = SCREEN_IDS.TITLE;
    this.clearBattleSession();
    this.emit();
  }

  async handleBattleTileClick(x, y) {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
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
  }

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
  }

  async handleBattleContextAction() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
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
  }

  async recruitUnit(unitTypeId) {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
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
  }

  async selectNextReadyUnit() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
      return;
    }

    const changed = this.battleSystem.selectNextReadyUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async waitWithSelectedUnit() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
      return;
    }

    const changed = this.battleSystem.waitWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async captureWithSelectedUnit() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
      return;
    }

    const changed = this.battleSystem.captureWithPendingUnit();

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async useSelectedSupportAbility() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }
    const changed = this.battleSystem.useSupportAbilityWithPendingUnit();
    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async enterSelectedTransport() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }
    const changed = this.battleSystem.enterTransportWithPendingUnit();
    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async beginSelectedUnload() {
    if (!this.battleSystem || this.isBattleInputLocked()) {
      return;
    }
    const changed = this.battleSystem.beginPendingUnload();
    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async beginSelectedAttack() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
      return;
    }

    const changed = this.battleSystem.beginPendingAttack();

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async cancelSelectedAttack() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
      return;
    }

    const changed = this.battleSystem.cancelPendingAttack();

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async redoSelectedMove() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
      return;
    }

    const changed = this.battleSystem.redoPendingMove();

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async endTurn() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
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
  }

  async activatePower() {
    if (
      !this.battleSystem ||
      this.isBattleInputLocked()
    ) {
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
    }
  }

  async advanceRun() {
    if (!this.battleSystem || !this.state.runState) {
      return;
    }

    const battleState = this.battleSystem.getStateForSave();

    if (battleState.victory?.winner !== TURN_SIDES.PLAYER) {
      return;
    }

    const nextRunState = applyBattleVictoryToRun(this.state.runState, battleState);

    if (isRunComplete(nextRunState)) {
      this.state.runState = nextRunState;
      this.state.runStatus = "complete";
      this.state.metaState.latestClearTurnCount = nextRunState.totalTurns;
      this.state.metaState.bestClearTurnCount = Math.min(
        this.state.metaState.bestClearTurnCount ?? Number.POSITIVE_INFINITY,
        nextRunState.totalTurns
      );

      const unlocked = unlockNextCommander(this.state.metaState);
      if (unlocked) {
        this.state.banner = `${unlocked.name} is now unlocked. Clear time: ${nextRunState.totalTurns} turns.`;
      } else {
        this.state.banner = `Run clear in ${nextRunState.totalTurns} turns. All commanders are already unlocked.`;
      }

      await this.storage.saveMeta(this.state.metaState);
      await this.deleteSlot(this.state.selectedSlotId, false);
      this.syncBattleState();
      return;
    }

    this.state.runState = nextRunState;
    const nextBattleState = createBattleStateForRun(nextRunState);
    this.battleSystem = new BattleSystem(nextBattleState);
    this.state.runStatus = null;
    this.resetBattleUi();
    await this.persistCurrentRun();
  }

  async acknowledgeDefeat() {
    this.state.runStatus = "failed";
    this.emit();
  }

  async acknowledgeLevelUp() {
    if (!this.battleSystem) {
      return;
    }

    const changed = this.battleSystem.acknowledgeLevelUp();

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async persistCurrentRun() {
    if (!this.battleSystem || !this.state.runState) {
      this.syncBattleState();
      return;
    }

    if (this.state.debugMode) {
      this.syncBattleState();
      return;
    }

    const battleState = this.battleSystem.getStateForSave();

    if (battleState.victory?.winner === TURN_SIDES.ENEMY) {
      this.state.runStatus = "failed";
    }

    const slotRecord = createSlotRecord(this.state.runState, battleState);
    await this.storage.saveSlot(this.state.selectedSlotId, slotRecord);
    this.state.slots = await this.storage.listSlots();
    this.syncBattleState();
  }

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
  }

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
  }

  async playFundsGain(incomeGain) {
    const fundsGain = this.prepareFundsGain(incomeGain);

    if (!fundsGain) {
      this.syncBattleState();
      return;
    }

    await this.playPreparedFundsGain(fundsGain.id);
  }

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

      await this.playFundsGain(enemyStart.incomeGain);

      if (this.state.battleSnapshot?.victory) {
        await this.persistCurrentRun();
        return;
      }
    } else {
      this.syncBattleState();
    }

    const enemyPowerUsed = this.battleSystem?.activatePower();

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

      const step = this.battleSystem.processEnemyTurnStep();
      this.syncBattleState();

      if (!step.changed || this.state.battleSnapshot?.victory) {
        break;
      }

      while (this.state.battleSnapshot?.levelUpQueue?.length) {
        await delay(100);
      }

      const stepDelay =
        step.type === "move"
          ? getBattleMoveDuration(step.moveSegments ?? 0) + BATTLE_MOVE_SETTLE_MS
          : 760;
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
      const playerFundsGain = this.prepareFundsGain(playerStart.incomeGain, {
        pending: true
      });

      this.syncBattleState();

      if (playerFundsGain && !this.state.battleSnapshot?.victory) {
        await delay(BATTLE_TURN_BANNER_SETTLE_MS);
        await this.playPreparedFundsGain(playerFundsGain.id);
      }
    }

    await this.persistCurrentRun();
  }

  syncBattleState({ allowEnemyFocusDuringEnemyTurn = false } = {}) {
    this.state.battleSnapshot = this.battleSystem?.getSnapshot() ?? null;

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
  }

  async debugSpawnUnit({ owner, unitTypeId, x, y, stats }) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.spawnDebugUnit(unitTypeId, owner, x, y, stats);

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async debugApplySelectedUnitStats(stats) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.applyDebugStatsToSelectedUnit(stats);

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async debugSetCommanders({ playerCommanderId, enemyCommanderId }) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.setDebugCommanders({
      [TURN_SIDES.PLAYER]: playerCommanderId,
      [TURN_SIDES.ENEMY]: enemyCommanderId
    });

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async debugSetCharge(side, charge) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.setDebugCharge(side, charge);

    if (changed) {
      await this.persistCurrentRun();
    }
  }

  async debugRefreshActions(side) {
    if (!this.battleSystem || !this.state.debugMode) {
      return;
    }

    const changed = this.battleSystem.resetDebugUnitActions(side);

    if (changed) {
      await this.persistCurrentRun();
    }
  }
}
