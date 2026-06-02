import { APP_TOAST_DISPLAY_MS, BATTLE_MODES, SCREEN_IDS, TURN_SIDES } from "../core/constants.js";
import { RUN_UPGRADES, UNIT_UNLOCK_TIERS } from "../content/runUpgrades.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { normalizeMetaOptions } from "../state/defaults.js";
import { getMapById } from "../content/maps.js";
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

function resolveDebugRunMapId(mapId) {
  if (!mapId) {
    return null;
  }

  if (getMapById(`${mapId}-run`)) {
    return `${mapId}-run`;
  }

  if (getMapById(mapId)) {
    return mapId;
  }

  return null;
}

export const controllerFlowMethods = {
  showToast({ title, message = "", tone = "info", durationMs = APP_TOAST_DISPLAY_MS }) {
    const toast = {
      id: `toast-${++this.toastSequence}`,
      title,
      message,
      tone,
      createdAt: Date.now(),
      durationMs
    };

    this.state.toast = toast;
    this.emit();

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;

      if (this.state.toast?.id === toast.id) {
        this.state.toast = null;
        this.emit();
      }
    }, durationMs);
  },

  resetBattleUi() {
    if (this.battleNoticeTimer) {
      clearTimeout(this.battleNoticeTimer);
      this.battleNoticeTimer = null;
    }

    if (this.battleCombatCutsceneTimer) {
      clearTimeout(this.battleCombatCutsceneTimer);
      this.battleCombatCutsceneTimer = null;
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

  startDebugRun(options = {}) {
    const currentBattleState = this.battleSystem?.getStateForSave?.() ?? null;
    const commanderId =
      options.playerCommanderId ??
      currentBattleState?.player?.commanderId ??
      this.state.metaState.unlockedCommanderIds[0] ??
      this.state.selectedCommanderId;

    if (!commanderId) {
      return;
    }

    const keepPauseMenuOpen = options.keepPauseMenuOpen === true;
    const resolvedMapId = resolveDebugRunMapId(options.mapId);
    const runState = createNewRunState({
      slotId: this.state.selectedSlotId,
      commanderId
    });
    const previousRunState = normalizeRunState(this.state.runState);
    runState.availableRunCardIds = [
      ...(previousRunState?.availableRunCardIds?.length
        ? previousRunState.availableRunCardIds
        : this.state.metaState.unlockedRunCardIds)
    ];
    runState.availableDraftUnitIds = [
      ...(previousRunState?.availableDraftUnitIds?.length
        ? previousRunState.availableDraftUnitIds
        : this.state.metaState.unlockedUnitIds)
    ];
    runState.roster = [...(previousRunState?.roster ?? [])];
    runState.ownedRunCardIds = [...(previousRunState?.ownedRunCardIds ?? [])];
    runState.selectedRewards = [...(previousRunState?.selectedRewards ?? [])];
    runState.pendingRewardChoices = [];
    runState.pendingGearReward = null;

    if (resolvedMapId) {
      runState.mapSequence = [
        resolvedMapId,
        ...runState.mapSequence.filter((mapSequenceId) => mapSequenceId !== resolvedMapId)
      ].slice(0, runState.targetMapCount);
    }

    const battleState = createBattleStateForRun(runState);
    const playerCommanderId = options.playerCommanderId ?? commanderId;
    const enemyCommanderId = options.enemyCommanderId ?? currentBattleState?.enemy?.commanderId;
    const enemyAiArchetype = options.enemyAiArchetype ?? currentBattleState?.enemy?.aiArchetype;

    this.battleSystem = new BattleSystem(battleState);
    this.battleSystem.setDebugCommanders({
      [TURN_SIDES.PLAYER]: playerCommanderId,
      [TURN_SIDES.ENEMY]: enemyCommanderId,
      enemyAiArchetype
    });
    this.state.runState = runState;
    this.state.screen = SCREEN_IDS.BATTLE;
    this.state.runStatus = null;
    this.state.debugMode = true;
    this.state.banner = "Sandbox active: saves are disabled.";
    this.resetBattleUi();
    this.state.battleUi.pauseMenuOpen = keepPauseMenuOpen;
    this.syncBattleState();

    if (resolvedMapId) {
      const loadedMapName =
        getMapById(options.mapId)?.name ??
        getMapById(resolvedMapId)?.name ??
        this.state.battleSnapshot?.map?.name ??
        "Sandbox battlefield";

      this.showBattleNotice({
        title: "Sandbox Battlefield Loaded",
        message: `${loadedMapName} is ready for testing.`,
        tone: "info"
      });
    }
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
    if (!this.state.tutorial) {
      this.resetTutorialToIntro?.();
    }
    if (this.state.tutorial?.completed) {
      this.state.tutorial = {
        ...this.state.tutorial,
        phase: "epilogue"
      };
    } else if (!this.state.tutorial || this.state.tutorial.phase === "battle") {
      this.resetTutorialToIntro?.();
    }
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
    runState.ownedRunCardIds = [];
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
    this.state.metaState.options = normalizeMetaOptions({
      ...this.state.metaState.options,
      ...patch
    });
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
