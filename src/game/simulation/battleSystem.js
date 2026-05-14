import {
  BATTLE_MODES,
  ENEMY_AI_ARCHETYPES,
  ENEMY_AI_ARCHETYPE_ORDER,
  TURN_SIDES
} from "../core/constants.js";
import { createInitialGearState } from "../content/runUpgrades.js";
import { pushLevelUpEvents, appendLog } from "./battleLog.js";
import { findUnitById } from "./battleUnits.js";
import { buildBattlePresentation } from "./battlePresentation.js";
import { getRecruitDiscount } from "./commanderEffects.js";
import * as debugActions from "./debugActions.js";
import * as missionRules from "./missionRules.js";
import * as playerActions from "./playerActions.js";
import { awardExperience } from "./progression.js";
import * as transportRules from "./transportRules.js";
import * as turnFlow from "./turnFlow.js";

export class BattleSystem {
  constructor(initialState) {
    this.state = structuredClone(initialState);
    this.state.mode ??= BATTLE_MODES.SKIRMISH;
    this.state.pendingAction ??= null;
    this.state.enemyTurn ??= null;
    this.state.levelUpQueue ??= [];
    this.state.lastPowerResult ??= null;
    if (this.state.enemyTurn && !("pendingAttack" in this.state.enemyTurn)) {
      this.state.enemyTurn.pendingAttack = null;
    }
    if (this.state.enemyTurn && !("pendingSlipstream" in this.state.enemyTurn)) {
      this.state.enemyTurn.pendingSlipstream = null;
    }
    if (this.state.enemyTurn && !("started" in this.state.enemyTurn)) {
      this.state.enemyTurn.started = true;
    }
    if (this.state.pendingAction && !this.state.pendingAction.mode) {
      this.state.pendingAction.mode = "menu";
    }
    this.state.enemy.recruitsBuiltThisMap ??= 0;
    for (const side of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
      this.state[side].effects ??= [];
      for (const unit of this.state[side].units) {
        unit.cooldowns ??= {};
        unit.gear ??= { slot: null };
        unit.gearState = {
          ...createInitialGearState(unit.gear.slot),
          ...(unit.gearState ?? {})
        };
        unit.transport ??= {
          carryingUnitId: null,
          carriedByUnitId: null,
          canUnloadAfterMove: false,
          hasLockedUnload: false
        };
        unit.statuses ??= [];
        unit.movedThisTurn ??= false;
        unit.temporary ??= null;
      }
    }
    this.state.player.recruitDiscount = getRecruitDiscount(this.state, TURN_SIDES.PLAYER);
    this.state.enemy.aiArchetype ??= ENEMY_AI_ARCHETYPES.BALANCED;
    if (!ENEMY_AI_ARCHETYPE_ORDER.includes(this.state.enemy.aiArchetype)) {
      this.state.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.BALANCED;
    }
    this.state.enemy.recruitDiscount = getRecruitDiscount(this.state, TURN_SIDES.ENEMY);
    missionRules.normalizeMissionState(this.state);
  }

  getSnapshot() {
    missionRules.normalizeMissionState(this.state);
    const snapshot = structuredClone(this.state);
    snapshot.presentation = buildBattlePresentation(snapshot);
    return snapshot;
  }

  getStateForSave() {
    missionRules.normalizeMissionState(this.state);
    return structuredClone(this.state);
  }

  clearSelection() {
    this.state.selection = { type: null, id: null, x: null, y: null };
  }

  clearPendingAction() {
    this.state.pendingAction = null;
  }

  acknowledgeLevelUp() {
    if (!this.state.levelUpQueue.length) {
      return false;
    }

    this.state.levelUpQueue.shift();
    return true;
  }

  setSelection(nextSelection) {
    const current = this.state.selection;
    const isSameSelection =
      current.type === nextSelection.type &&
      current.id === nextSelection.id &&
      current.x === nextSelection.x &&
      current.y === nextSelection.y;

    if (isSameSelection) {
      this.clearSelection();
      return;
    }

    this.state.selection = nextSelection;
  }

  tickUnitDurations(side) {
    return turnFlow.tickUnitDurations(this, side);
  }

  getAdjacentFriendlyTransport(unit) {
    return transportRules.getAdjacentFriendlyTransport(this.state, unit);
  }

  getAdjacentFriendlyTransports(unit) {
    return transportRules.getAdjacentFriendlyTransports(this.state, unit);
  }

  syncTransportCargoPosition(runner) {
    return transportRules.syncTransportCargoPosition(this.state, runner);
  }

  getAdjacentTransportPassenger(runner) {
    return transportRules.getAdjacentTransportPassenger(this.state, runner);
  }

  boardUnitIntoRunner(unit, runner) {
    return transportRules.boardUnitIntoRunner(this.state, unit, runner);
  }

  getNearestOpponentDistance(unit, tile) {
    return transportRules.getNearestOpponentDistance(this.state, unit, tile);
  }

  unloadTransportForEnemy(runner, destination = null) {
    return transportRules.unloadTransportForEnemy(this.state, runner, destination);
  }

  getSupportTargetForUnit(unit, options) {
    return playerActions.getSupportTargetForUnit(this, unit, options);
  }

  getSupportTargetsForUnit(unit, options) {
    return playerActions.getSupportTargetsForUnit(this, unit, options);
  }

  applySupportAbility(unit, target) {
    return playerActions.applySupportAbility(this, unit, target);
  }

  getMedpackTargetsForUnit(unit, options) {
    return playerActions.getMedpackTargetsForUnit(this, unit, options);
  }

  applyMedpackAbility(unit, target) {
    return playerActions.applyMedpackAbility(this, unit, target);
  }

  handleTileSelection(x, y) {
    return playerActions.handleTileSelection(this, x, y);
  }

  handleContextAction() {
    return playerActions.handleContextAction(this);
  }

  selectNextReadyUnit() {
    return playerActions.selectNextReadyUnit(this);
  }

  attackTarget(attackerId, defenderId) {
    return playerActions.attackTarget(this, attackerId, defenderId);
  }

  canCaptureWithPendingUnit() {
    return playerActions.canCaptureWithPendingUnit(this);
  }

  beginPendingAttack() {
    return playerActions.beginPendingAttack(this);
  }

  cancelPendingAttack() {
    return playerActions.cancelPendingAttack(this);
  }

  beginPendingUnload() {
    return playerActions.beginPendingUnload(this);
  }

  unloadTransportWithPendingUnit(x, y) {
    return playerActions.unloadTransportWithPendingUnit(this, x, y);
  }

  enterTransportWithPendingUnit(runnerId = null) {
    return playerActions.enterTransportWithPendingUnit(this, runnerId);
  }

  useSupportAbilityWithPendingUnit(targetId = null) {
    return playerActions.useSupportAbilityWithPendingUnit(this, targetId);
  }

  useMedpackWithPendingUnit(targetId = null) {
    return playerActions.useMedpackWithPendingUnit(this, targetId);
  }

  useExtinguishAbilityWithPendingUnit(targetId = null) {
    return playerActions.useExtinguishAbilityWithPendingUnit(this, targetId);
  }

  rescueHostageWithPendingUnit() {
    return playerActions.rescueHostageWithPendingUnit(this);
  }

  dropOffHostageWithPendingUnit() {
    return playerActions.dropOffHostageWithPendingUnit(this);
  }

  waitWithPendingUnit() {
    return playerActions.waitWithPendingUnit(this);
  }

  captureWithPendingUnit() {
    return playerActions.captureWithPendingUnit(this);
  }

  redoPendingMove() {
    return playerActions.redoPendingMove(this);
  }

  getPlayerUnitLimitStatus() {
    return playerActions.getPlayerUnitLimitStatus(this);
  }

  recruitUnit(unitTypeId) {
    return playerActions.recruitUnit(this, unitTypeId);
  }

  activatePower() {
    return playerActions.activatePower(this);
  }

  getLastPowerResult() {
    return structuredClone(this.state.lastPowerResult);
  }

  spawnDebugUnit(unitTypeId, owner, x, y, statOverrides = {}, gearSlot = null) {
    return debugActions.spawnDebugUnit(this, unitTypeId, owner, x, y, statOverrides, gearSlot);
  }

  applyDebugStatsToSelectedUnit(debugPatch) {
    return debugActions.applyDebugStatsToSelectedUnit(this, debugPatch);
  }

  setDebugCommanders(commanderAssignments) {
    return debugActions.setDebugCommanders(this, commanderAssignments);
  }

  setDebugCharge(side, charge) {
    return debugActions.setDebugCharge(this, side, charge);
  }

  resetDebugUnitActions(side) {
    return debugActions.resetDebugUnitActions(this, side);
  }

  endTurn() {
    return turnFlow.endTurn(this);
  }

  isEnemyTurnActive() {
    return turnFlow.isEnemyTurnActive(this);
  }

  startEnemyTurnActions() {
    return turnFlow.startEnemyTurnActions(this);
  }

  hasPendingEnemyTurn() {
    return turnFlow.hasPendingEnemyTurn(this);
  }

  processEnemyTurnStep() {
    return turnFlow.processEnemyTurnStep(this);
  }

  performEnemyEndTurnRecruitment() {
    return turnFlow.performEnemyEndTurnRecruitment(this);
  }

  shouldEnemyUsePower() {
    return turnFlow.shouldEnemyUsePower(this);
  }

  finalizeEnemyTurn() {
    return turnFlow.finalizeEnemyTurn(this);
  }

  collectIncome(side) {
    return turnFlow.collectIncome(this, side);
  }

  resetActions(side) {
    return turnFlow.resetActions(this, side);
  }

  performEnemyRecruitment() {
    return turnFlow.performEnemyRecruitment(this);
  }

  updateVictoryState() {
    return turnFlow.updateVictoryState(this);
  }

  awardExperienceToUnit(unitId, amount) {
    const unit = findUnitById(this.state, unitId);
    const reward = Math.max(0, Number(amount) || 0);

    if (!unit || reward <= 0) {
      return false;
    }

    const result = awardExperience(unit, reward, this.state.seed);
    this.state.seed = result.seed;
    Object.assign(unit, result.unit);
    result.notes.forEach((note) => appendLog(this.state, note));
    pushLevelUpEvents(this.state, unit, result.levelUps);
    return true;
  }
}
