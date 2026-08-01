import { createEmitter } from "../core/emitter.js";
import { BATTLE_MODES, SCREEN_IDS, SLOT_IDS } from "../core/constants.js";
import {
  BUILD_FEATURES,
  CURRENT_BUILD_PROFILE,
  getBuildProfileConfig,
  isBuildFeatureEnabled
} from "../core/buildProfiles.js";
import { StorageRepository } from "../services/StorageRepository.js";
import {
  createDefaultMetaState,
  normalizeMetaOptions,
  normalizeUnlockedRunCardIds
} from "../state/defaults.js";
import {
  createBattleUiState,
  createDefaultRunLoadoutState,
  createDefaultSkirmishSetupState,
  pickFirstAvailableSlot
} from "./controllerShared.js";
import { controllerFlowMethods } from "./controllerFlowMethods.js";
import { controllerBattleMethods } from "./controllerBattleMethods.js";
import { controllerMapEditorMethods } from "./controllerMapEditorMethods.js";
import { controllerRunMethods } from "./controllerRunMethods.js";
import { controllerTutorialMethods } from "./controllerTutorialMethods.js";
import { createBlankMapDefinition, createDefaultMapEditorState } from "../content/mapEditor.js";
import { replaceCustomMaps } from "../content/maps.js";
import { createTutorialIntroState } from "../content/tutorial.js";

/**
 * The controller owns app flow and save orchestration.
 * Scenes and DOM views only talk to it through explicit methods.
 */
export class GameController {
  constructor(storage = null, { buildProfile = CURRENT_BUILD_PROFILE } = {}) {
    this.buildProfileConfig = getBuildProfileConfig(buildProfile);
    this.storage = storage ?? new StorageRepository({ buildProfile: this.buildProfileConfig.id });
    this.events = createEmitter();
    this.battleSystem = null;
    this.fundsGainSequence = 0;
    this.battleNoticeSequence = 0;
    this.battlePowerOverlaySequence = 0;
    this.battleCombatCutsceneSequence = 0;
    this.enemyMoveHoldSequence = 0;
    this.toastSequence = 0;
    this.battleNoticeTimer = null;
    this.battleCombatCutsceneTimer = null;
    this.toastTimer = null;
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
      toast: null,
      runStatus: null,
      battleUi: createBattleUiState(),
      tutorial: createTutorialIntroState(),
      skirmishSetup: createDefaultSkirmishSetupState(),
      mapEditor: createDefaultMapEditorState(createBlankMapDefinition()),
      runLoadout: createDefaultRunLoadoutState()
    };
  }

  subscribe(handler) {
    return this.events.on("state:changed", handler);
  }

  /**
   * Subscribe to transient audio requests. These requests deliberately bypass
   * application state so feedback never dirties a save or causes a rerender.
   */
  subscribeAudioCues(handler) {
    return this.events.on("audio:cue", handler);
  }

  subscribeAudioOptions(handler) {
    return this.events.on("audio:options", handler);
  }

  emitAudioCue(cueId, context = {}) {
    if (typeof cueId !== "string" || !cueId.trim()) {
      return;
    }

    this.events.emit("audio:cue", {
      ...context,
      cueId
    });
  }

  previewAudioOptions(patch = {}) {
    const options = normalizeMetaOptions({
      ...this.state.metaState.options,
      ...patch
    });

    this.events.emit("audio:options", options);
  }

  getState() {
    return structuredClone(this.state);
  }

  emit() {
    this.ensureCurrentScreenIsAvailable();
    this.events.emit("state:changed", this.getState());
  }

  isFeatureEnabled(featureId) {
    return isBuildFeatureEnabled(this.buildProfileConfig, featureId);
  }

  ensureCurrentScreenIsAvailable() {
    const requiredFeatureByScreen = {
      [SCREEN_IDS.SKIRMISH_SETUP]: BUILD_FEATURES.SKIRMISH,
      [SCREEN_IDS.MAP_EDITOR]: BUILD_FEATURES.MAP_EDITOR,
      [SCREEN_IDS.TUTORIAL]: BUILD_FEATURES.TUTORIAL
    };
    const requiredFeature = requiredFeatureByScreen[this.state.screen];

    if (requiredFeature && !this.isFeatureEnabled(requiredFeature)) {
      this.state.screen = SCREEN_IDS.TITLE;
      return false;
    }

    return true;
  }

  isRunBattle(snapshot = null) {
    const resolvedSnapshot =
      snapshot ??
      this.state.battleSnapshot ??
      this.battleSystem?.getStateForSave?.() ??
      null;

    return resolvedSnapshot?.mode === BATTLE_MODES.RUN || Boolean(this.state.runState);
  }

  async initialize() {
    const loadedMeta = await this.storage.loadMeta();
    const defaultMeta = createDefaultMetaState();
    this.state.metaState = {
      ...defaultMeta,
      ...loadedMeta,
      options: normalizeMetaOptions(loadedMeta?.options),
      unlockedRunCardIds: normalizeUnlockedRunCardIds(loadedMeta?.unlockedRunCardIds)
    };
    if (this.isFeatureEnabled(BUILD_FEATURES.CUSTOM_MAPS)) {
      replaceCustomMaps((await this.storage.listCustomMaps?.()) ?? []);
    } else {
      replaceCustomMaps([]);
    }
    this.state.slots = await this.storage.listSlots();
    this.state.selectedCommanderId = this.state.metaState.unlockedCommanderIds[0] ?? null;
    this.state.selectedSlotId = pickFirstAvailableSlot(this.state.slots);
    this.state.skirmishSetup = createDefaultSkirmishSetupState(
      this.state.metaState.unlockedCommanderIds
    );
    this.state.ready = true;
    this.emit();
  }
}

Object.assign(GameController.prototype, controllerFlowMethods);
Object.assign(GameController.prototype, controllerBattleMethods);
Object.assign(GameController.prototype, controllerMapEditorMethods);
Object.assign(GameController.prototype, controllerRunMethods);
Object.assign(GameController.prototype, controllerTutorialMethods);
