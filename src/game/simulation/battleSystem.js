import {
  BUILDING_KEYS,
  COMMANDER_POWER_MAX,
  ENEMY_RECRUITMENT_UNIT_LEAD_LIMIT,
  PROTOTYPE_ROSTER_CAP,
  TURN_SIDES
} from "../core/constants.js";
import { getBuildingIncomeForSide } from "../core/economy.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { awardExperience } from "./progression.js";
import { appendLog, pushLevelUpEvents } from "./battleLog.js";
import { buildBattlePresentation } from "./battlePresentation.js";
import { serviceUnitsOnSectors } from "./battleServicing.js";
import { findUnitById, getReadyPlayerUnits } from "./battleUnits.js";
import { canCaptureBuilding, captureBuildingForUnit } from "./captureRules.js";
import {
  activateCommanderPower,
  applyChargeFromCombat,
  getIncomeBonus,
  getMovementModifier,
  getRecruitDiscount,
  tickSideStatuses
} from "./commanderEffects.js";
import {
  getAttackRangeCap,
  getAttackableUnitIds,
  getDamageResult,
  getDefenseExperience,
  getKillExperience,
  getNonKillExperience,
  removeDeadUnits
} from "./combatResolver.js";
import {
  getBestCapturePlan,
  getBestMoveAttackOption,
  getEnemyRecruitmentLimit,
  getEnemyRecruitmentMapCap,
  pickBestFavorableAttack,
  pickEnemyRecruitmentCandidate,
  pickFallbackMovementTile
} from "./enemyAi.js";
import {
  canUnitAttackTarget,
  getBuildingAt,
  getLivingUnits,
  getMovementPath,
  getReachableTiles,
  getSelectedBuilding,
  getSelectedUnit,
  getTerrainAt,
  getUnitAt,
  getUnitAttackProfile
} from "./selectors.js";
import { createUnitFromType } from "./unitFactory.js";

const PRODUCTION_BUILDING_TYPES = ["barracks", "motor-pool", "airfield"];

export class BattleSystem {
  constructor(initialState) {
    this.state = structuredClone(initialState);
    this.state.pendingAction ??= null;
    this.state.enemyTurn ??= null;
    this.state.levelUpQueue ??= [];
    if (this.state.enemyTurn && !("pendingAttack" in this.state.enemyTurn)) {
      this.state.enemyTurn.pendingAttack = null;
    }
    if (this.state.enemyTurn && !("started" in this.state.enemyTurn)) {
      this.state.enemyTurn.started = true;
    }
    if (this.state.pendingAction && !this.state.pendingAction.mode) {
      this.state.pendingAction.mode = "menu";
    }
    this.state.enemy.recruitsBuiltThisMap ??= 0;
    this.state.player.recruitDiscount = getRecruitDiscount(this.state, TURN_SIDES.PLAYER);
    this.state.enemy.recruitDiscount = getRecruitDiscount(this.state, TURN_SIDES.ENEMY);
  }

  getSnapshot() {
    const snapshot = structuredClone(this.state);
    snapshot.presentation = buildBattlePresentation(snapshot);
    return snapshot;
  }

  getStateForSave() {
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

  handleTileSelection(x, y) {
    if (this.state.victory || this.state.turn.activeSide !== TURN_SIDES.PLAYER) {
      return false;
    }

    const unitAtTile = getUnitAt(this.state, x, y);
    const buildingAtTile = getBuildingAt(this.state, x, y);
    const selectedUnit = getSelectedUnit(this.state);
    const pendingAction = this.state.pendingAction;
    const pendingUnit = pendingAction ? findUnitById(this.state, pendingAction.unitId) : null;

    if (pendingAction && pendingUnit?.owner === TURN_SIDES.PLAYER) {
      if ((pendingAction.mode ?? "menu") === "fire" && unitAtTile?.owner === TURN_SIDES.ENEMY) {
        const changed = this.attackTarget(pendingUnit.id, unitAtTile.id);

        if (!changed) {
          appendLog(this.state, "Attack is not available from the current position.");
        }

        return changed;
      }

      return false;
    }

    if (selectedUnit?.owner === TURN_SIDES.PLAYER && !selectedUnit.hasMoved) {
      const movementBudget =
        selectedUnit.stats.movement + getMovementModifier(this.state, selectedUnit);
      const reachableTiles = getReachableTiles(
        this.state,
        selectedUnit,
        movementBudget
      );

      const canMoveToTile = reachableTiles.some((tile) => tile.x === x && tile.y === y);
      const isCurrentTile = selectedUnit.x === x && selectedUnit.y === y;

      if (canMoveToTile) {
        this.state.pendingAction = {
          type: "move",
          unitId: selectedUnit.id,
          mode: "menu",
          fromX: selectedUnit.x,
          fromY: selectedUnit.y,
          fromStamina: selectedUnit.current.stamina,
          toX: x,
          toY: y
        };

        if (!isCurrentTile) {
          selectedUnit.x = x;
          selectedUnit.y = y;
          selectedUnit.current.stamina = Math.max(0, selectedUnit.current.stamina - 1);
          appendLog(this.state, `${selectedUnit.name} repositioned.`);
        }

        this.state.selection = { type: "unit", id: selectedUnit.id, x, y };
        return true;
      }
    }

    if (unitAtTile) {
      this.setSelection({
        type: "unit",
        id: unitAtTile.id,
        x: unitAtTile.x,
        y: unitAtTile.y
      });
      return true;
    }

    if (buildingAtTile) {
      this.setSelection({
        type: "building",
        id: buildingAtTile.id,
        x: buildingAtTile.x,
        y: buildingAtTile.y
      });
      return true;
    }

    if (getTerrainAt(this.state, x, y)) {
      this.setSelection({
        type: "tile",
        id: null,
        x,
        y
      });
      return true;
    }

    this.clearSelection();
    return true;
  }

  handleContextAction() {
    if (this.state.victory || this.state.turn.activeSide !== TURN_SIDES.PLAYER) {
      return false;
    }

    const pendingAction = this.state.pendingAction;
    const pendingUnit = pendingAction ? findUnitById(this.state, pendingAction.unitId) : null;

    if (pendingAction && pendingUnit?.owner === TURN_SIDES.PLAYER) {
      if ((pendingAction.mode ?? "menu") === "fire") {
        return this.cancelPendingAttack();
      }

      return this.redoPendingMove();
    }

    if (this.state.selection?.type) {
      this.clearSelection();
      return true;
    }

    return false;
  }

  selectNextReadyUnit() {
    if (
      this.state.victory ||
      this.state.turn.activeSide !== TURN_SIDES.PLAYER ||
      this.state.pendingAction
    ) {
      return false;
    }

    const readyUnits = getReadyPlayerUnits(this.state);

    if (readyUnits.length === 0) {
      return false;
    }

    const selectedUnit = getSelectedUnit(this.state);
    const currentIndex = selectedUnit
      ? readyUnits.findIndex((unit) => unit.id === selectedUnit.id)
      : -1;
    const nextUnit = readyUnits[(currentIndex + 1 + readyUnits.length) % readyUnits.length];

    if (!nextUnit) {
      return false;
    }

    this.state.selection = {
      type: "unit",
      id: nextUnit.id,
      x: nextUnit.x,
      y: nextUnit.y
    };

    return true;
  }

  attackTarget(attackerId, defenderId) {
    const attacker = findUnitById(this.state, attackerId);
    const defender = findUnitById(this.state, defenderId);
    const attackProfile = getUnitAttackProfile(attacker);

    if (!attacker || !defender || attacker.hasAttacked || !attackProfile) {
      return false;
    }

    const rangeCap = getAttackRangeCap(this.state, attacker, attackProfile);
    const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);

    if (
      distance < attackProfile.minRange ||
      distance > rangeCap ||
      !canUnitAttackTarget(attacker, defender)
    ) {
      return false;
    }

    const defenderHpBefore = defender.current.hp;
    const primaryStrike = getDamageResult(this.state, attacker, defender, attackProfile);
    defender.current.hp = Math.max(0, defender.current.hp - primaryStrike.damage);
    const primaryDamageDealt = defenderHpBefore - defender.current.hp;
    if (attackProfile.consumesAmmo) {
      attacker.current.ammo = Math.max(0, attacker.current.ammo - 1);
    }
    attacker.hasAttacked = true;
    attacker.hasMoved = true;

    appendLog(
      this.state,
      `${attacker.name} hit ${defender.name}${
        primaryStrike.weaponType === "secondary" ? " with secondary fire" : ""
      } for ${primaryDamageDealt}${
        primaryStrike.isEffective ? " effective" : ""
      } damage.`
    );

    applyChargeFromCombat(
      this.state,
      attacker.owner,
      defender.owner,
      primaryDamageDealt,
      primaryDamageDealt
    );
    const defenderDefenseXp = defender.current.hp > 0 ? getDefenseExperience(primaryDamageDealt, attacker) : 0;
    let defenderCounterXp = 0;
    let attackerDefenseXp = 0;
    const defenderProfile = getUnitAttackProfile(defender);

    if (defender.current.hp > 0 && defenderProfile) {
      const counterRange = getAttackRangeCap(this.state, defender, defenderProfile);

      if (
        distance >= defenderProfile.minRange &&
        distance <= counterRange &&
        canUnitAttackTarget(defender, attacker)
      ) {
        const attackerHpBefore = attacker.current.hp;
        const counterStrike = getDamageResult(this.state, defender, attacker, defenderProfile);
        attacker.current.hp = Math.max(0, attacker.current.hp - counterStrike.damage);
        const counterDamageDealt = attackerHpBefore - attacker.current.hp;
        if (defenderProfile.consumesAmmo) {
          defender.current.ammo = Math.max(0, defender.current.ammo - 1);
        }

        appendLog(
          this.state,
          `${defender.name} countered${
            counterStrike.weaponType === "secondary" ? " with secondary fire" : ""
          } for ${counterDamageDealt} damage.`
        );

        applyChargeFromCombat(
          this.state,
          defender.owner,
          attacker.owner,
          counterDamageDealt,
          counterDamageDealt
        );
        defenderCounterXp =
          attacker.current.hp <= 0
            ? getKillExperience(defender, attacker, counterDamageDealt, attackerHpBefore)
            : getNonKillExperience(counterDamageDealt, attacker);

        if (attacker.current.hp > 0) {
          attackerDefenseXp = getDefenseExperience(counterDamageDealt, defender);
        }
      }
    }

    const attackerXpGain =
      defender.current.hp <= 0
        ? getKillExperience(attacker, defender, primaryDamageDealt, defenderHpBefore)
        : getNonKillExperience(primaryDamageDealt, defender);
    const attackerAfterXp = awardExperience(
      attacker,
      attackerXpGain + attackerDefenseXp,
      this.state.seed
    );
    this.state.seed = attackerAfterXp.seed;
    Object.assign(attacker, attackerAfterXp.unit);
    attackerAfterXp.notes.forEach((note) => appendLog(this.state, note));
    pushLevelUpEvents(this.state, attacker, attackerAfterXp.levelUps);

    if (defender.current.hp > 0 && defenderDefenseXp + defenderCounterXp > 0) {
      const defenderAfterXp = awardExperience(
        defender,
        defenderDefenseXp + defenderCounterXp,
        this.state.seed
      );
      this.state.seed = defenderAfterXp.seed;
      Object.assign(defender, defenderAfterXp.unit);
      defenderAfterXp.notes.forEach((note) => appendLog(this.state, note));
      pushLevelUpEvents(this.state, defender, defenderAfterXp.levelUps);
    }

    if (defender.current.hp <= 0) {
      appendLog(this.state, `${defender.name} was destroyed.`);
    }

    removeDeadUnits(this.state);
    this.clearPendingAction();
    this.clearSelection();
    this.updateVictoryState();
    return true;
  }

  canCaptureWithPendingUnit() {
    const pendingAction = this.state.pendingAction;

    if (!pendingAction) {
      return false;
    }

    const unit = findUnitById(this.state, pendingAction.unitId);
    const building = unit ? getBuildingAt(this.state, unit.x, unit.y) : null;

    return canCaptureBuilding(unit, building);
  }

  beginPendingAttack() {
    const pendingAction = this.state.pendingAction;

    if (!pendingAction) {
      return false;
    }

    const unit = findUnitById(this.state, pendingAction.unitId);

    if (!unit || getAttackableUnitIds(this.state, unit).length === 0) {
      return false;
    }

    pendingAction.mode = "fire";
    return true;
  }

  cancelPendingAttack() {
    const pendingAction = this.state.pendingAction;

    if (!pendingAction || (pendingAction.mode ?? "menu") !== "fire") {
      return false;
    }

    pendingAction.mode = "menu";
    return true;
  }

  waitWithPendingUnit() {
    const pendingAction = this.state.pendingAction;

    if (!pendingAction) {
      return false;
    }

    const unit = findUnitById(this.state, pendingAction.unitId);

    if (!unit) {
      this.clearPendingAction();
      return false;
    }

    unit.hasMoved = true;
    unit.hasAttacked = true;
    appendLog(this.state, `${unit.name} holds position.`);
    this.clearPendingAction();
    this.clearSelection();
    return true;
  }

  captureWithPendingUnit() {
    if (!this.canCaptureWithPendingUnit()) {
      return false;
    }

    const unit = findUnitById(this.state, this.state.pendingAction.unitId);
    const building = getBuildingAt(this.state, unit.x, unit.y);

    captureBuildingForUnit(this.state, unit, building);
    this.clearPendingAction();
    this.state.selection = {
      type: "building",
      id: building.id,
      x: building.x,
      y: building.y
    };
    this.updateVictoryState();
    return true;
  }

  redoPendingMove() {
    const pendingAction = this.state.pendingAction;

    if (!pendingAction) {
      return false;
    }

    const unit = findUnitById(this.state, pendingAction.unitId);

    if (!unit) {
      this.clearPendingAction();
      return false;
    }

    unit.x = pendingAction.fromX;
    unit.y = pendingAction.fromY;
    unit.current.stamina = pendingAction.fromStamina;
    this.clearPendingAction();
    this.state.selection = {
      type: "unit",
      id: unit.id,
      x: unit.x,
      y: unit.y
    };
    return true;
  }

  recruitUnit(unitTypeId) {
    const building = getSelectedBuilding(this.state);

    if (
      !building ||
      this.state.turn.activeSide !== TURN_SIDES.PLAYER ||
      building.owner !== TURN_SIDES.PLAYER ||
      getUnitAt(this.state, building.x, building.y)
    ) {
      return false;
    }

    const unitType = UNIT_CATALOG[unitTypeId];
    const adjustedCost = Math.max(100, unitType.cost - this.state.player.recruitDiscount);

    if (
      this.state.player.funds < adjustedCost ||
      getLivingUnits(this.state, TURN_SIDES.PLAYER).length >= PROTOTYPE_ROSTER_CAP
    ) {
      return false;
    }

    const recruit = createUnitFromType(unitTypeId, TURN_SIDES.PLAYER);
    recruit.x = building.x;
    recruit.y = building.y;
    recruit.hasMoved = true;
    recruit.hasAttacked = true;

    this.state.player.units.push(recruit);
    this.state.player.funds -= adjustedCost;
    appendLog(this.state, `${recruit.name} deployed from ${building.type}.`);
    return true;
  }

  activatePower() {
    const result = activateCommanderPower(this.state, this.state.turn.activeSide, this.state.seed);

    this.state.seed = result.seed;
    result.notes.forEach((note) => appendLog(this.state, note));
    this.updateVictoryState();
    return result.changed;
  }

  spawnDebugUnit(unitTypeId, owner, x, y, statOverrides = {}) {
    if (!UNIT_CATALOG[unitTypeId] || ![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(owner)) {
      return false;
    }

    if (!getTerrainAt(this.state, x, y) || getUnitAt(this.state, x, y)) {
      return false;
    }

    const unit = createUnitFromType(unitTypeId, owner);
    unit.x = x;
    unit.y = y;
    unit.hasMoved = false;
    unit.hasAttacked = false;

    for (const [statKey, value] of Object.entries(statOverrides)) {
      if (Number.isFinite(value) && statKey in unit.stats) {
        unit.stats[statKey] = Math.max(0, Math.floor(value));
      }
    }

    unit.stats.maxHealth = Math.max(1, unit.stats.maxHealth);
    unit.stats.movement = Math.max(1, unit.stats.movement);
    unit.stats.maxRange = Math.max(unit.stats.minRange, unit.stats.maxRange);
    unit.current.hp = unit.stats.maxHealth;
    unit.current.stamina = unit.stats.staminaMax;
    unit.current.ammo = unit.stats.ammoMax;

    this.state[owner].units.push(unit);
    this.state.selection = { type: "unit", id: unit.id, x, y };
    this.clearPendingAction();
    appendLog(this.state, `[Debug] Spawned ${unit.name} (${owner}) at ${x + 1},${y + 1}.`);
    this.updateVictoryState();
    return true;
  }

  applyDebugStatsToSelectedUnit(debugPatch) {
    const selectedUnit = getSelectedUnit(this.state);

    if (!selectedUnit) {
      return false;
    }

    const patchValue = (key, min = 0) => {
      const nextValue = Number(debugPatch[key]);

      if (Number.isFinite(nextValue)) {
        selectedUnit.stats[key] = Math.max(min, Math.floor(nextValue));
      }
    };

    patchValue("attack");
    patchValue("armor");
    patchValue("movement", 1);
    patchValue("minRange");
    patchValue("maxRange");
    patchValue("staminaMax");
    patchValue("ammoMax");
    patchValue("luck");

    if (selectedUnit.stats.maxRange < selectedUnit.stats.minRange) {
      selectedUnit.stats.maxRange = selectedUnit.stats.minRange;
    }

    const maxHealth = Number(debugPatch.maxHealth);

    if (Number.isFinite(maxHealth)) {
      selectedUnit.stats.maxHealth = Math.max(1, Math.floor(maxHealth));
    }

    const level = Number(debugPatch.level);

    if (Number.isFinite(level)) {
      selectedUnit.level = Math.max(1, Math.floor(level));
    }

    const experience = Number(debugPatch.experience);

    if (Number.isFinite(experience)) {
      selectedUnit.experience = Math.max(0, Math.floor(experience));
    }

    const hp = Number(debugPatch.hp);

    if (Number.isFinite(hp)) {
      selectedUnit.current.hp = Math.max(0, Math.min(selectedUnit.stats.maxHealth, Math.floor(hp)));
    } else {
      selectedUnit.current.hp = Math.min(selectedUnit.current.hp, selectedUnit.stats.maxHealth);
    }

    const stamina = Number(debugPatch.stamina);

    if (Number.isFinite(stamina)) {
      selectedUnit.current.stamina = Math.max(
        0,
        Math.min(selectedUnit.stats.staminaMax, Math.floor(stamina))
      );
    } else {
      selectedUnit.current.stamina = Math.min(selectedUnit.current.stamina, selectedUnit.stats.staminaMax);
    }

    const ammo = Number(debugPatch.ammo);

    if (Number.isFinite(ammo)) {
      selectedUnit.current.ammo = Math.max(0, Math.min(selectedUnit.stats.ammoMax, Math.floor(ammo)));
    } else {
      selectedUnit.current.ammo = Math.min(selectedUnit.current.ammo, selectedUnit.stats.ammoMax);
    }

    appendLog(this.state, `[Debug] Updated stats for ${selectedUnit.name}.`);
    this.updateVictoryState();
    return true;
  }

  setDebugCharge(side, charge) {
    if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(side)) {
      return false;
    }

    this.state[side].charge = Math.max(0, Math.min(COMMANDER_POWER_MAX, Number(charge) || 0));
    appendLog(this.state, `[Debug] ${side} commander charge set to ${Math.floor(this.state[side].charge)}.`);
    return true;
  }

  resetDebugUnitActions(side) {
    if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(side)) {
      return false;
    }

    for (const unit of getLivingUnits(this.state, side)) {
      unit.hasMoved = false;
      unit.hasAttacked = false;
      unit.current.stamina = unit.stats.staminaMax;
    }

    appendLog(this.state, `[Debug] Refreshed ${side} unit actions.`);
    return true;
  }

  endTurn() {
    if (this.state.victory) {
      return false;
    }

    if (this.state.pendingAction) {
      appendLog(this.state, "Resolve the selected unit action before ending the turn.");
      return false;
    }

    if (this.state.turn.activeSide === TURN_SIDES.PLAYER) {
      this.state.turn.activeSide = TURN_SIDES.ENEMY;
      this.state.turn.number += 1;
      this.clearSelection();
      this.state.enemyTurn = {
        started: false,
        pendingAttack: null,
        pendingUnitIds: []
      };
      this.updateVictoryState();
      return true;
    }

    return false;
  }

  isEnemyTurnActive() {
    return this.state.turn.activeSide === TURN_SIDES.ENEMY && !this.state.victory;
  }

  startEnemyTurnActions() {
    if (!this.state.enemyTurn || !this.isEnemyTurnActive() || this.state.enemyTurn.started) {
      return false;
    }

    this.state.enemyTurn.started = true;
    tickSideStatuses(this.state, TURN_SIDES.ENEMY);
    const incomeGain = this.collectIncome(TURN_SIDES.ENEMY);
    this.resetActions(TURN_SIDES.ENEMY);
    serviceUnitsOnSectors(this.state, TURN_SIDES.ENEMY);
    this.state.enemyTurn.pendingUnitIds = getLivingUnits(this.state, TURN_SIDES.ENEMY)
      .filter((unit) => !unit.hasMoved && !unit.hasAttacked)
      .map((unit) => unit.id);
    this.updateVictoryState();
    return {
      changed: true,
      incomeGain
    };
  }

  hasPendingEnemyTurn() {
    return Boolean(
      this.state.enemyTurn?.pendingAttack || this.state.enemyTurn?.pendingUnitIds?.length
    );
  }

  processEnemyTurnStep() {
    if (!this.state.enemyTurn || this.state.turn.activeSide !== TURN_SIDES.ENEMY || this.state.victory) {
      return { changed: false, done: true };
    }

    // Enemy turns are resolved as move and attack phases so the renderer can
    // let movement finish before combat begins.
    if (this.state.enemyTurn.pendingAttack) {
      const queuedAttack = this.state.enemyTurn.pendingAttack;
      this.state.enemyTurn.pendingAttack = null;
      const changed = this.attackTarget(queuedAttack.attackerId, queuedAttack.targetId);

      if (changed) {
        return {
          changed: true,
          done: this.state.victory || !this.hasPendingEnemyTurn(),
          type: "attack",
          unitId: queuedAttack.attackerId
        };
      }
    }

    while (this.state.enemyTurn.pendingUnitIds.length > 0) {
      const unitId = this.state.enemyTurn.pendingUnitIds.shift();
      const unit = findUnitById(this.state, unitId);

      if (!unit || unit.current.hp <= 0) {
        continue;
      }

      this.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

      const movementBudget = unit.stats.movement + getMovementModifier(this.state, unit);
      const reachableTiles = getReachableTiles(this.state, unit, movementBudget);
      const capturePlan = getBestCapturePlan(this.state, unit, reachableTiles);
      const isGrunt = unit.unitTypeId === "grunt";
      const isSecondaryCapturer = ["breaker", "longshot"].includes(unit.unitTypeId);

      if (isGrunt && capturePlan) {
        const moved = capturePlan.tile.x !== unit.x || capturePlan.tile.y !== unit.y;
        const movePath = moved
          ? getMovementPath(this.state, unit, movementBudget, capturePlan.tile.x, capturePlan.tile.y)
          : [];
        const moveSegments = Math.max(0, movePath.length - 1);

        if (moved) {
          unit.x = capturePlan.tile.x;
          unit.y = capturePlan.tile.y;
          unit.hasMoved = true;
          this.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };
        }

        if (capturePlan.canCaptureAfterMove) {
          captureBuildingForUnit(this.state, unit, capturePlan.building);
          this.updateVictoryState();
        } else if (moved) {
          unit.hasAttacked = true;
        }

        if (moved || capturePlan.canCaptureAfterMove) {
          return {
            changed: true,
            done: this.state.victory || this.state.enemyTurn.pendingUnitIds.length === 0,
            type: moved ? "move" : "capture",
            unitId,
            moveSegments
          };
        }
      }

      const immediateAttack = pickBestFavorableAttack(this.state, unit);

      if (immediateAttack) {
        this.attackTarget(unit.id, immediateAttack.target.id);
        return {
          changed: true,
          done: this.state.victory || this.state.enemyTurn.pendingUnitIds.length === 0,
          type: "attack",
          unitId
        };
      }

      if (isSecondaryCapturer && capturePlan) {
        const moved = capturePlan.tile.x !== unit.x || capturePlan.tile.y !== unit.y;
        const movePath = moved
          ? getMovementPath(this.state, unit, movementBudget, capturePlan.tile.x, capturePlan.tile.y)
          : [];
        const moveSegments = Math.max(0, movePath.length - 1);

        if (moved) {
          unit.x = capturePlan.tile.x;
          unit.y = capturePlan.tile.y;
          unit.hasMoved = true;
          this.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };
        }

        if (capturePlan.canCaptureAfterMove) {
          captureBuildingForUnit(this.state, unit, capturePlan.building);
          this.updateVictoryState();
        } else if (moved) {
          unit.hasAttacked = true;
        }

        if (moved || capturePlan.canCaptureAfterMove) {
          return {
            changed: true,
            done: this.state.victory || this.state.enemyTurn.pendingUnitIds.length === 0,
            type: moved ? "move" : "capture",
            unitId,
            moveSegments
          };
        }
      }

      const moveAttackOption = getBestMoveAttackOption(this.state, unit, reachableTiles);
      const fallbackTile = moveAttackOption?.tile ?? pickFallbackMovementTile(this.state, unit, reachableTiles);
      const moved = fallbackTile && (fallbackTile.x !== unit.x || fallbackTile.y !== unit.y);
      const movePath = moved
        ? getMovementPath(this.state, unit, movementBudget, fallbackTile.x, fallbackTile.y)
        : [];
      const moveSegments = Math.max(0, movePath.length - 1);

      if (moved) {
        unit.x = fallbackTile.x;
        unit.y = fallbackTile.y;
        unit.hasMoved = true;
        this.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };
      }

      if (moveAttackOption && moved) {
        this.state.enemyTurn.pendingAttack = {
          attackerId: unit.id,
          targetId: moveAttackOption.target.id
        };
        return {
          changed: true,
          done: this.state.victory || !this.hasPendingEnemyTurn(),
          type: "move",
          unitId,
          moveSegments
        };
      }

      if (moved) {
        unit.hasAttacked = true;
        appendLog(
          this.state,
          `${unit.name} ${fallbackTile.intent === "fallback" ? "fell back from danger" : "advanced into position"}.`
        );
        return {
          changed: true,
          done: this.state.victory || this.state.enemyTurn.pendingUnitIds.length === 0,
          type: "move",
          unitId,
          moveSegments
        };
      }
    }

    this.updateVictoryState();
    return { changed: false, done: true };
  }

  performEnemyEndTurnRecruitment() {
    if (!this.state.enemyTurn || !this.isEnemyTurnActive() || this.state.victory) {
      return {
        changed: false,
        deployments: []
      };
    }

    const deployments = this.performEnemyRecruitment();

    return {
      changed: deployments.length > 0,
      deployments
    };
  }

  finalizeEnemyTurn() {
    if (this.state.turn.activeSide !== TURN_SIDES.ENEMY) {
      return {
        changed: false,
        incomeGain: null
      };
    }

    this.state.enemyTurn = null;

    if (this.state.victory) {
      this.clearSelection();
      return {
        changed: true,
        incomeGain: null
      };
    }

    this.state.turn.activeSide = TURN_SIDES.PLAYER;
    tickSideStatuses(this.state, TURN_SIDES.PLAYER);
    const incomeGain = this.collectIncome(TURN_SIDES.PLAYER);
    this.resetActions(TURN_SIDES.PLAYER);
    serviceUnitsOnSectors(this.state, TURN_SIDES.PLAYER);
    this.clearSelection();
    return {
      changed: true,
      incomeGain
    };
  }

  collectIncome(side) {
    const commanderBonus = getIncomeBonus(this.state, side);
    const buildingIncome = getBuildingIncomeForSide(this.state.map.buildings, side);
    const previousFunds = this.state[side].funds;
    const amount = buildingIncome + commanderBonus;

    this.state[side].funds += amount;

    return {
      side,
      amount,
      buildingIncome,
      commanderBonus,
      previousFunds,
      nextFunds: this.state[side].funds
    };
  }

  resetActions(side) {
    for (const unit of getLivingUnits(this.state, side)) {
      unit.hasMoved = false;
      unit.hasAttacked = false;
      unit.current.stamina = unit.stats.staminaMax;
    }
  }

  performEnemyRecruitment() {
    const deployments = [];
    const maxDeployments = getEnemyRecruitmentLimit(this.state);
    const mapRecruitCap = getEnemyRecruitmentMapCap(this.state);
    const playerUnitCount = getLivingUnits(this.state, TURN_SIDES.PLAYER).length;
    const productionSites = this.state.map.buildings.filter(
      (building) =>
        building.owner === TURN_SIDES.ENEMY &&
        PRODUCTION_BUILDING_TYPES.includes(building.type) &&
        !getUnitAt(this.state, building.x, building.y)
    );

    const usedBuildingIds = new Set();

    while (
      deployments.length < maxDeployments &&
      this.state.enemy.recruitsBuiltThisMap < mapRecruitCap
    ) {
      const enemyUnitLead = getLivingUnits(this.state, TURN_SIDES.ENEMY).length - playerUnitCount;

      if (enemyUnitLead >= ENEMY_RECRUITMENT_UNIT_LEAD_LIMIT) {
        break;
      }

      const candidate = pickEnemyRecruitmentCandidate(this.state, productionSites, usedBuildingIds);

      if (!candidate) {
        break;
      }

      const recruit = createUnitFromType(candidate.option.id, TURN_SIDES.ENEMY);
      recruit.x = candidate.building.x;
      recruit.y = candidate.building.y;
      recruit.hasMoved = true;
      recruit.hasAttacked = true;
      this.state.enemy.units.push(recruit);
      this.state.enemy.funds -= candidate.option.adjustedCost;
      this.state.enemy.recruitsBuiltThisMap += 1;
      usedBuildingIds.add(candidate.building.id);
      appendLog(this.state, `Enemy deployed ${recruit.name}.`);
      deployments.push({
        unitId: recruit.id,
        unitTypeId: recruit.unitTypeId,
        buildingId: candidate.building.id,
        x: recruit.x,
        y: recruit.y
      });
    }

    return deployments;
  }

  updateVictoryState() {
    this.state.victory = null;
    const livingPlayer = getLivingUnits(this.state, TURN_SIDES.PLAYER);
    const livingEnemy = getLivingUnits(this.state, TURN_SIDES.ENEMY);

    if (livingEnemy.length === 0) {
      this.state.victory = {
        winner: TURN_SIDES.PLAYER,
        message: "Battle won. The route is clear."
      };
      return;
    }

    if (livingPlayer.length === 0) {
      this.state.victory = {
        winner: TURN_SIDES.ENEMY,
        message: "Your column was overrun."
      };
      return;
    }

    const enemyCommand = this.state.map.buildings.find(
      (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.ENEMY
    );
    const playerCommand = this.state.map.buildings.find(
      (building) => building.type === BUILDING_KEYS.COMMAND && building.owner === TURN_SIDES.PLAYER
    );

    if (!enemyCommand) {
      this.state.victory = {
        winner: TURN_SIDES.PLAYER,
        message: "Enemy command fell. The route is clear."
      };
      return;
    }

    if (!playerCommand) {
      this.state.victory = {
        winner: TURN_SIDES.ENEMY,
        message: "Your command post was captured."
      };
    }
  }
}
