import { BATTLE_MODES, SCREEN_IDS, TURN_SIDES } from "../core/constants.js";
import { RUN_UPGRADES, UNIT_UNLOCK_TIERS } from "../content/runUpgrades.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { BattleSystem } from "../simulation/battleSystem.js";
import { createPersistentUnitSnapshot, createUnitFromType } from "../simulation/unitFactory.js";
import {
  createBattleStateForRun,
  createNewRunState,
  createSkirmishBattleState,
  normalizeBattleState,
  normalizeRunState
} from "../state/runFactory.js";
import {
  createBattleUiState,
  createDefaultRunLoadoutState,
  pickFirstAvailableSlot
} from "./controllerShared.js";

export const controllerFlowMethods = {
  resetBattleUi() {
    if (this.battleNoticeTimer) {
      clearTimeout(this.battleNoticeTimer);
      this.battleNoticeTimer = null;
    }

    this.state.battleUi = createBattleUiState();
  },

  clearBattleSession() {
    this.battleSystem = null;
    this.state.runState = null;
    this.state.battleSnapshot = null;
    this.state.debugMode = false;
    this.state.runStatus = null;
    this.state.banner = "";
    this.resetBattleUi();
  },

  openNewRun() {
    this.state.screen = SCREEN_IDS.COMMANDER_SELECT;
    this.state.selectedCommanderId = this.state.metaState.unlockedCommanderIds[0] ?? null;
    this.state.selectedSlotId = pickFirstAvailableSlot(this.state.slots);
    this.state.banner = "";
    this.state.debugMode = false;
    this.state.runLoadout = createDefaultRunLoadoutState();
    this.resetBattleUi();
    this.emit();
  },

  openRunLoadout() {
    if (!this.state.selectedCommanderId) {
      return;
    }

    this.state.screen = SCREEN_IDS.RUN_LOADOUT;
    this.resetBattleUi();
    this.emit();
  },

  returnToCommanderSelect() {
    this.state.screen = SCREEN_IDS.COMMANDER_SELECT;
    this.resetBattleUi();
    this.emit();
  },

  startDebugRun() {
    const commanderId = this.state.metaState.unlockedCommanderIds[0] ?? this.state.selectedCommanderId;

    if (!commanderId) {
      return;
    }

    const runState = createNewRunState({
      slotId: this.state.selectedSlotId,
      commanderId
    });
    runState.availableRunCardIds = [...this.state.metaState.unlockedRunCardIds];
    runState.availableDraftUnitIds = [...this.state.metaState.unlockedUnitIds];
    const battleState = createBattleStateForRun(runState);

    this.battleSystem = new BattleSystem(battleState);
    this.state.runState = runState;
    this.state.screen = SCREEN_IDS.BATTLE;
    this.state.runStatus = null;
    this.state.debugMode = true;
    this.state.banner = "Sandbox active: saves are disabled.";
    this.resetBattleUi();
    this.syncBattleState();
  },

  openContinue() {
    this.state.screen = SCREEN_IDS.LOAD_SLOT;
    this.state.banner = "";
    this.resetBattleUi();
    this.emit();
  },

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
  },
  openTutorial() {
    this.state.screen = SCREEN_IDS.TUTORIAL;
    this.state.banner = "";
    this.resetBattleUi();
    this.emit();
  },

  openOptions() {
    this.state.screen = SCREEN_IDS.OPTIONS;
    this.resetBattleUi();
    this.emit();
  },

  openProgression() {
    this.state.screen = SCREEN_IDS.PROGRESSION;
    this.resetBattleUi();
    this.emit();
  },

  async returnToTitle() {
    const bannerMessage = this.state.runStatus === "failed" ? "Run failed." : this.state.banner;

    if (this.state.runStatus === "failed" || this.state.runStatus === "complete") {
      await this.deleteSlot(this.state.selectedSlotId, false);
    }

    this.state.screen = SCREEN_IDS.TITLE;
    this.clearBattleSession();
    this.state.banner = bannerMessage;
    this.emit();
  },

  selectCommander(commanderId) {
    if (!this.state.metaState.unlockedCommanderIds.includes(commanderId)) {
      return;
    }

    this.state.selectedCommanderId = commanderId;
    this.emit();
  },

  selectSlot(slotId) {
    this.state.selectedSlotId = slotId;
    this.emit();
  },

  addRunLoadoutUnit(unitTypeId) {
    const unitType = UNIT_CATALOG[unitTypeId];

    if (!unitType) {
      return;
    }

    if (!this.state.metaState.unlockedUnitIds.includes(unitTypeId)) {
      return;
    }

    if (this.state.runLoadout.fundsRemaining < unitType.cost) {
      return;
    }

    this.state.runLoadout.units.push(unitTypeId);
    this.state.runLoadout.fundsRemaining -= unitType.cost;
    this.emit();
  },

  removeRunLoadoutUnit(unitTypeId) {
    const index = this.state.runLoadout.units.lastIndexOf(unitTypeId);

    if (index < 0) {
      return;
    }

    const unitType = UNIT_CATALOG[unitTypeId];
    this.state.runLoadout.units.splice(index, 1);
    this.state.runLoadout.fundsRemaining += unitType?.cost ?? 0;
    this.emit();
  },

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
  },

  purchaseUnitUnlock(unitTypeId) {
    if (this.state.metaState.unlockedUnitIds.includes(unitTypeId)) {
      return;
    }

    const targetTier = UNIT_UNLOCK_TIERS.find((tier) => tier.unitIds.includes(unitTypeId));

    if (!targetTier || targetTier.tier <= 0) {
      return;
    }

    const previousTier = UNIT_UNLOCK_TIERS.find((tier) => tier.tier === targetTier.tier - 1);
    const previousTierUnlocked = previousTier
      ? previousTier.unitIds.every((id) => this.state.metaState.unlockedUnitIds.includes(id))
      : true;

    if (!previousTierUnlocked) {
      return;
    }

    const cost = targetTier.unlockCost ?? 0;

    if (this.state.metaState.metaCurrency < cost) {
      return;
    }

    this.state.metaState.metaCurrency -= cost;
    this.state.metaState.unlockedUnitIds.push(unitTypeId);
    this.storage.saveMeta(this.state.metaState);
    this.emit();
  },

  purchaseRunCardUnlock(cardId) {
    if (this.state.metaState.unlockedRunCardIds.includes(cardId)) {
      return;
    }

    const card = RUN_UPGRADES.find((entry) => entry.id === cardId);

    if (!card) {
      return;
    }

    const cost = card.unlockCost ?? 80;

    if (this.state.metaState.metaCurrency < cost) {
      return;
    }

    this.state.metaState.metaCurrency -= cost;
    this.state.metaState.unlockedRunCardIds.push(cardId);
    this.storage.saveMeta(this.state.metaState);
    this.emit();
  },

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
  },

  async startNewRun() {
    if (!this.state.selectedCommanderId || this.state.runLoadout.units.length === 0) {
      return;
    }

    const runState = createNewRunState({
      slotId: this.state.selectedSlotId,
      commanderId: this.state.selectedCommanderId
    });
    runState.availableRunCardIds = [...this.state.metaState.unlockedRunCardIds];
    runState.availableDraftUnitIds = [...this.state.metaState.unlockedUnitIds];
    const purchasedRoster = this.state.runLoadout.units
      .map((unitTypeId) => createUnitFromType(unitTypeId, TURN_SIDES.PLAYER))
      .map((unit) => createPersistentUnitSnapshot(unit));

    runState.roster = purchasedRoster;
    const battleState = createBattleStateForRun(runState);

    this.battleSystem = new BattleSystem(battleState);
    this.state.runState = runState;
    this.state.screen = SCREEN_IDS.BATTLE;
    this.state.runStatus = null;
    this.resetBattleUi();
    this.state.metaState.lastPlayedSlotId = this.state.selectedSlotId;
    await this.storage.saveMeta(this.state.metaState);
    await this.persistCurrentRun();
  },

  async loadSlot(slotId) {
    const slotRecord = await this.storage.loadSlot(slotId);

    if (!slotRecord) {
      return;
    }

    if (slotRecord.runState && !slotRecord.battleState?.mode) {
      slotRecord.battleState.mode = BATTLE_MODES.RUN;
    }

    const normalizedRunState = normalizeRunState(slotRecord.runState);
    const normalizedBattleState = normalizeBattleState(slotRecord.battleState);

    if ((normalizedRunState?.availableRunCardIds?.length ?? 0) === 0) {
      normalizedRunState.availableRunCardIds = [...this.state.metaState.unlockedRunCardIds];
    }

    if ((normalizedRunState?.availableDraftUnitIds?.length ?? 0) === 0) {
      normalizedRunState.availableDraftUnitIds = [...this.state.metaState.unlockedUnitIds];
    }

    this.state.selectedSlotId = slotId;
    this.state.runState = normalizedRunState;
    this.battleSystem = new BattleSystem(normalizedBattleState);
    this.state.screen = SCREEN_IDS.BATTLE;
    this.state.debugMode = false;
    this.resetBattleUi();
    this.state.metaState.lastPlayedSlotId = slotId;
    this.state.runStatus =
      slotRecord.battleState?.victory?.winner === TURN_SIDES.ENEMY ? "failed" : null;

    await this.storage.saveMeta(this.state.metaState);
    this.syncBattleState();
  },

  async updateOptions(patch) {
    this.state.metaState.options = {
      ...this.state.metaState.options,
      ...patch
    };
    await this.storage.saveMeta(this.state.metaState);
    this.emit();
  },

  async deleteSlot(slotId, emitAfter = true) {
    await this.storage.deleteSlot(slotId);
    this.state.slots = await this.storage.listSlots();

    if (emitAfter) {
      this.emit();
    }
  },

  async quitGame() {
    await this.storage.quit();
  }
};
