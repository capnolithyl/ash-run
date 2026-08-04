import { APP_TOAST_DISPLAY_MS, BATTLE_MODES, SCREEN_IDS, TURN_SIDES } from "../core/constants.js";
import { BUILD_FEATURES } from "../core/buildProfiles.js";
import { createId } from "../core/id.js";
import { RUN_UPGRADES, UNIT_UNLOCK_TIERS } from "../content/runUpgrades.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import {
  generateRunUnitName,
  normalizeRunUnitName,
  validateRunUnitName
} from "../content/runUnitNames.js";
import { normalizeMetaOptions, normalizeUnlockedRunCardIds } from "../state/defaults.js";
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

function getAvailableRunCardIdsForRun(metaState, currentIds = []) {
  return normalizeUnlockedRunCardIds([
    ...(metaState?.unlockedRunCardIds ?? []),
    ...(Array.isArray(currentIds) ? currentIds : [])
  ]);
}

function getOtherDraftNames(units, draftId) {
  return units
    .filter((draft) => draft.id !== draftId)
    .map((draft) => draft.name);
}

function areRunLoadoutNamesValid(units) {
  return units.every((draft) =>
    validateRunUnitName(draft.name, getOtherDraftNames(units, draft.id)).valid
  );
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

  async openNewRun({ bypassTutorialPrompt = false } = {}) {
    if (
      !bypassTutorialPrompt &&
      this.isFeatureEnabled(BUILD_FEATURES.TUTORIAL) &&
      this.state.metaState.tutorial?.promptSeen !== true
    ) {
      this.state.screen = SCREEN_IDS.TITLE;
      this.state.tutorial = {
        ...this.state.tutorial,
        phase: "new-run-prompt",
        returnIntent: "new-run"
      };
      this.state.banner = "";
      this.emit();
      return true;
    }

    this.state.screen = SCREEN_IDS.COMMANDER_SELECT;
    this.state.selectedCommanderId = this.state.metaState.unlockedCommanderIds[0] ?? null;
    this.state.selectedSlotId = pickFirstAvailableSlot(this.state.slots);
    this.state.banner = "";
    this.state.debugMode = false;
    this.state.runLoadout = createDefaultRunLoadoutState();
    this.resetBattleUi();
    this.emit();
    return true;
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
    if (!this.isFeatureEnabled(BUILD_FEATURES.SANDBOX)) {
      return false;
    }

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
    runState.availableRunCardIds = getAvailableRunCardIdsForRun(
      this.state.metaState,
      previousRunState?.availableRunCardIds
    );
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
    runState.pendingUnitNaming = null;

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
    if (!this.isFeatureEnabled(BUILD_FEATURES.SKIRMISH)) {
      return false;
    }

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
    if (!this.isFeatureEnabled(BUILD_FEATURES.TUTORIAL)) {
      return false;
    }

    return this.openTutorialHub?.() ?? false;
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
    this.resetTutorialToHub?.();
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

    const id = createId(unitTypeId);
    const name = generateRunUnitName(unitTypeId, {
      unitId: id,
      excludedNames: this.state.runLoadout.units.map((draft) => draft.name)
    });

    this.state.runLoadout.units.push({
      id,
      unitTypeId,
      name,
      nameRoll: 0
    });
    this.state.runLoadout.fundsRemaining -= unitType.cost;
    this.emit();
  },

  removeRunLoadoutUnit(unitTypeId) {
    const index = this.state.runLoadout.units.findLastIndex(
      (draft) => draft.unitTypeId === unitTypeId
    );

    if (index < 0) {
      return;
    }

    const unitType = UNIT_CATALOG[unitTypeId];
    this.state.runLoadout.units.splice(index, 1);
    this.state.runLoadout.fundsRemaining += unitType?.cost ?? 0;
    this.emit();
  },

  openRunLoadoutNamingReview() {
    if (this.state.runLoadout.units.length === 0) {
      return;
    }

    this.state.runLoadout.namingReviewOpen = true;
    this.emit();
  },

  closeRunLoadoutNamingReview() {
    this.state.runLoadout.namingReviewOpen = false;
    this.emit();
  },

  updateRunLoadoutUnitName(unitId, value) {
    const draft = this.state.runLoadout.units.find((unit) => unit.id === unitId);

    if (!draft) {
      return;
    }

    draft.name = normalizeRunUnitName(value);
    this.emit();
  },

  randomizeRunLoadoutUnitName(unitId) {
    const draft = this.state.runLoadout.units.find((unit) => unit.id === unitId);

    if (!draft) {
      return;
    }

    draft.nameRoll = (draft.nameRoll ?? 0) + 1;
    draft.name = generateRunUnitName(draft.unitTypeId, {
      unitId: draft.id,
      roll: draft.nameRoll,
      excludedNames: [
        ...getOtherDraftNames(this.state.runLoadout.units, draft.id),
        draft.name
      ]
    });
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
    if (!this.isFeatureEnabled(BUILD_FEATURES.SKIRMISH)) {
      return false;
    }

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
    if (
      !this.state.selectedCommanderId ||
      this.state.runLoadout.units.length === 0 ||
      !this.state.runLoadout.namingReviewOpen ||
      !areRunLoadoutNamesValid(this.state.runLoadout.units)
    ) {
      return;
    }

    const runState = createNewRunState({
      slotId: this.state.selectedSlotId,
      commanderId: this.state.selectedCommanderId
    });
    runState.availableRunCardIds = getAvailableRunCardIdsForRun(this.state.metaState);
    runState.availableDraftUnitIds = [...this.state.metaState.unlockedUnitIds];
    const purchasedRoster = this.state.runLoadout.units
      .map((draft) => ({
        ...createUnitFromType(draft.unitTypeId, TURN_SIDES.PLAYER),
        id: draft.id,
        name: normalizeRunUnitName(draft.name)
      }))
      .map((unit) => createPersistentUnitSnapshot(unit));

    runState.roster = purchasedRoster;
    runState.unitNameHistory = purchasedRoster.map((unit) => unit.name);
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
    const runUnitNamesById = new Map(
      (normalizedRunState?.roster ?? []).map((unit) => [unit.id, unit.name])
    );

    if (Array.isArray(normalizedBattleState?.player?.units)) {
      normalizedBattleState.player.units = normalizedBattleState.player.units.map((unit) => ({
        ...unit,
        name: runUnitNamesById.get(unit.id) ?? unit.name
      }));
    }

    normalizedRunState.availableRunCardIds = getAvailableRunCardIdsForRun(
      this.state.metaState,
      normalizedRunState.availableRunCardIds
    );

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
    this.state.runStatus = slotRecord.battleState?.victory?.winner === TURN_SIDES.ENEMY
      ? "failed"
      : normalizedRunState.pendingUnitNaming
        ? "reward-name-unit"
        : normalizedRunState.pendingGearReward
          ? "reward-equip"
          : (normalizedRunState.pendingRewardChoices?.length ?? 0) > 0
            ? "reward"
            : null;

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
