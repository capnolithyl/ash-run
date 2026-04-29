import { createEmitter } from "../core/emitter.js";
import { BATTLE_MODES, SCREEN_IDS, SLOT_IDS } from "../core/constants.js";
import { StorageRepository } from "../services/StorageRepository.js";
import { createDefaultMetaState } from "../state/defaults.js";
import {
  createBattleUiState,
  createDefaultRunLoadoutState,
  createDefaultSkirmishSetupState,
  pickFirstAvailableSlot
} from "./controllerShared.js";
import { controllerFlowMethods } from "./controllerFlowMethods.js";
import { controllerBattleMethods } from "./controllerBattleMethods.js";
import { controllerRunMethods } from "./controllerRunMethods.js";

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
      skirmishSetup: createDefaultSkirmishSetupState(),
      runLoadout: createDefaultRunLoadoutState()
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
}

Object.assign(GameController.prototype, controllerFlowMethods);
Object.assign(GameController.prototype, controllerBattleMethods);
Object.assign(GameController.prototype, controllerRunMethods);
