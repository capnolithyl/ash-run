import {
  BUILDING_KEYS,
  ENEMY_RECRUITMENT_UNIT_LEAD_LIMIT,
  PROTOTYPE_ROSTER_CAP,
  TURN_SIDES
} from "../core/constants.js";
import { getBuildingIncomeForSide } from "../core/economy.js";
import { describeBuilding } from "../content/buildings.js";
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
  getCommanderPowerMaxForSide,
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
  getBestRepairPlan,
  getBestSupportPlan,
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
  getUnitAttackProfile,
  getValidUnloadTiles
} from "./selectors.js";
import { createUnitFromType } from "./unitFactory.js";

const PRODUCTION_BUILDING_TYPES = ["barracks", "motor-pool", "airfield"];
const INFANTRY_RECRUIT_TYPES = new Set(["grunt", "breaker", "longshot", "medic", "mechanic"]);

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
    for (const side of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
      for (const unit of this.state[side].units) {
        unit.cooldowns ??= {};
        unit.transport ??= {
          carryingUnitId: null,
          carriedByUnitId: null,
          canUnloadAfterMove: false,
          hasLockedUnload: false
        };
        unit.statuses ??= [];
      }
    }
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

  tickUnitDurations(side) {
    for (const unit of getLivingUnits(this.state, side)) {
      for (const [key, turns] of Object.entries(unit.cooldowns ?? {})) {
        if (turns > 0) {
          unit.cooldowns[key] = turns - 1;
        }
      }
      if (unit.unitTypeId === "runner" && unit.transport) {
        unit.transport.canUnloadAfterMove = false;
        unit.transport.hasLockedUnload = false;
      }
    }
  }

  getAdjacentFriendlyTransport(unit) {
    return this.getAdjacentFriendlyTransports(unit)[0] ?? null;
  }

  getAdjacentFriendlyTransports(unit) {
    if (!unit || unit.family !== "infantry" || unit.transport?.carriedByUnitId) {
      return [];
    }

    return getLivingUnits(this.state, unit.owner)
      .filter((candidate) => {
        if (candidate.unitTypeId !== "runner" || candidate.transport?.carryingUnitId) {
          return false;
        }
        const distance = Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y);
        return distance === 1;
      })
      .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
  }

  syncTransportCargoPosition(runner) {
    const carriedUnitId = runner?.transport?.carryingUnitId;

    if (!carriedUnitId) {
      return;
    }

    const carried = findUnitById(this.state, carriedUnitId);

    if (carried?.transport?.carriedByUnitId === runner.id) {
      carried.x = runner.x;
      carried.y = runner.y;
    }
  }

  getSupportTargetForUnit(unit, { requireNeed = false } = {}) {
    return this.getSupportTargetsForUnit(unit, { requireNeed })[0]?.target ?? null;
  }

  getSupportTargetsForUnit(unit, { requireNeed = true } = {}) {
    const targetFamily =
      unit?.unitTypeId === "medic"
        ? "infantry"
        : unit?.unitTypeId === "mechanic"
          ? "vehicle"
          : null;

    if (!targetFamily || (unit.cooldowns?.support ?? 0) > 0 || unit.transport?.carriedByUnitId) {
      return [];
    }

    return getLivingUnits(this.state, unit.owner)
      .filter((candidate) => {
        if (
          candidate.id === unit.id ||
          candidate.family !== targetFamily ||
          candidate.transport?.carriedByUnitId
        ) {
          return false;
        }

        return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
      })
      .map((target) => {
        const missingHp = target.stats.maxHealth - target.current.hp;
        const missingAmmo = target.stats.ammoMax - target.current.ammo;
        const missingStamina = target.stats.staminaMax - target.current.stamina;

        return {
          target,
          needScore: missingHp * 2 + missingAmmo * 3 + missingStamina * 2
        };
      })
      .filter((option) => !requireNeed || option.needScore > 0)
      .sort((left, right) => right.needScore - left.needScore || left.target.id.localeCompare(right.target.id));
  }

  applySupportAbility(unit, target) {
    if (!unit || !target) {
      return false;
    }

    target.current.hp = Math.min(target.stats.maxHealth, target.current.hp + Math.ceil(target.stats.maxHealth * 0.5));
    target.current.ammo = target.stats.ammoMax;
    target.current.stamina = target.stats.staminaMax;
    unit.cooldowns.support = unit.unitTypeId === "medic" ? 2 : 3;
    unit.hasMoved = true;
    unit.hasAttacked = true;
    appendLog(this.state, `${unit.name} serviced ${target.name}.`);
    return true;
  }

  getAdjacentTransportPassenger(runner) {
    if (runner?.unitTypeId !== "runner" || runner.transport?.carryingUnitId) {
      return null;
    }

    return getLivingUnits(this.state, runner.owner)
      .filter((candidate) => {
        if (
          candidate.id === runner.id ||
          candidate.family !== "infantry" ||
          candidate.transport?.carriedByUnitId ||
          candidate.hasMoved ||
          candidate.hasAttacked
        ) {
          return false;
        }

        return Math.abs(candidate.x - runner.x) + Math.abs(candidate.y - runner.y) === 1;
      })
      .sort((left, right) => {
        const score = (unit) => {
          if (unit.unitTypeId === "grunt") {
            return 6;
          }
          if (unit.unitTypeId === "breaker" || unit.unitTypeId === "longshot") {
            return 5;
          }
          return 3;
        };

        return score(right) - score(left);
      })[0] ?? null;
  }

  boardUnitIntoRunner(unit, runner) {
    if (!unit || !runner || runner.transport?.carryingUnitId) {
      return false;
    }

    unit.transport.carriedByUnitId = runner.id;
    unit.x = runner.x;
    unit.y = runner.y;
    unit.hasMoved = true;
    unit.hasAttacked = true;
    runner.transport.carryingUnitId = unit.id;
    this.syncTransportCargoPosition(runner);
    appendLog(this.state, `${unit.name} boarded ${runner.name}.`);
    return true;
  }

  getNearestOpponentDistance(unit, tile) {
    const opponentSide = unit.owner === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
    const opponents = getLivingUnits(this.state, opponentSide);

    if (opponents.length === 0) {
      return Number.POSITIVE_INFINITY;
    }

    return opponents.reduce(
      (nearest, opponent) => Math.min(nearest, Math.abs(opponent.x - tile.x) + Math.abs(opponent.y - tile.y)),
      Number.POSITIVE_INFINITY
    );
  }

  unloadTransportForEnemy(runner) {
    const carried = runner?.transport?.carryingUnitId
      ? findUnitById(this.state, runner.transport.carryingUnitId)
      : null;

    if (!runner || !carried || runner.transport.hasLockedUnload) {
      return false;
    }

    const destination = getValidUnloadTiles(this.state, runner, carried)
      .sort(
        (left, right) =>
          this.getNearestOpponentDistance(carried, left) -
          this.getNearestOpponentDistance(carried, right)
      )[0];

    if (!destination) {
      return false;
    }

    carried.transport.carriedByUnitId = null;
    carried.x = destination.x;
    carried.y = destination.y;
    carried.hasMoved = true;
    carried.hasAttacked = true;
    runner.transport.carryingUnitId = null;
    runner.hasMoved = true;
    runner.hasAttacked = true;
    appendLog(this.state, `${carried.name} disembarked from ${runner.name}.`);
    return true;
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
    if (this.state.victory) {
      return false;
    }

    const isPlayerTurn = this.state.turn.activeSide === TURN_SIDES.PLAYER;
    const unitAtTile = getUnitAt(this.state, x, y);
    const buildingAtTile = getBuildingAt(this.state, x, y);
    const selectedUnit = getSelectedUnit(this.state);
    const pendingAction = this.state.pendingAction;
    const pendingUnit = pendingAction ? findUnitById(this.state, pendingAction.unitId) : null;

    if (!isPlayerTurn) {
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
        this.state.selection = {
          type: "tile",
          id: null,
          x,
          y
        };
        return true;
      }

      this.clearSelection();
      return true;
    }

    if (pendingAction && pendingUnit?.owner === TURN_SIDES.PLAYER) {
      if ((pendingAction.mode ?? "menu") === "fire" && unitAtTile?.owner === TURN_SIDES.ENEMY) {
        const changed = this.attackTarget(pendingUnit.id, unitAtTile.id);

        if (!changed) {
          appendLog(this.state, "Attack is not available from the current position.");
        }

        return changed;
      }

      if ((pendingAction.mode ?? "menu") === "unload") {
        const changed = this.unloadTransportWithPendingUnit(x, y);
        if (!changed) {
          appendLog(this.state, "Unload destination is not valid.");
        }
        return changed;
      }

      if ((pendingAction.mode ?? "menu") === "transport") {
        const changed = unitAtTile?.owner === TURN_SIDES.PLAYER
          ? this.enterTransportWithPendingUnit(unitAtTile.id)
          : false;
        if (!changed) {
          appendLog(this.state, "Choose a highlighted runner.");
        }
        return changed;
      }

      if ((pendingAction.mode ?? "menu") === "support") {
        const changed = unitAtTile?.owner === TURN_SIDES.PLAYER
          ? this.useSupportAbilityWithPendingUnit(unitAtTile.id)
          : false;
        if (!changed) {
          appendLog(this.state, "Choose a highlighted unit.");
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
          if (selectedUnit.unitTypeId === "runner" && selectedUnit.transport?.carryingUnitId) {
            selectedUnit.transport.canUnloadAfterMove = true;
            this.syncTransportCargoPosition(selectedUnit);
          }
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
      if ((pendingAction.mode ?? "menu") === "unload") {
        pendingAction.mode = "menu";
        return true;
      }
      if ((pendingAction.mode ?? "menu") === "transport") {
        pendingAction.mode = "menu";
        return true;
      }
      if ((pendingAction.mode ?? "menu") === "support") {
        pendingAction.mode = "menu";
        return true;
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
    if (attacker.unitTypeId === "breaker" && defender.family === "vehicle") {
      const existing = defender.statuses.find((status) => status.type === "armor-break");
      if (existing) {
        existing.turnsRemaining = 1;
      } else {
        defender.statuses.push({ type: "armor-break", turnsRemaining: 1 });
      }
      appendLog(this.state, `${defender.name} armor was broken by ${attacker.name}.`);
    }
    const primaryStrike = getDamageResult(this.state, attacker, defender, attackProfile);
    defender.current.hp = Math.max(0, defender.current.hp - primaryStrike.damage);
    const primaryDamageDealt = defenderHpBefore - defender.current.hp;
    if (attackProfile.consumesAmmo) {
      attacker.current.ammo = Math.max(0, attacker.current.ammo - 1);
    }
    attacker.hasAttacked = true;
    attacker.hasMoved = true;
    if (attacker.unitTypeId === "runner" && attacker.transport?.carryingUnitId) {
      attacker.transport.hasLockedUnload = true;
    }

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

  beginPendingUnload() {
    const pendingAction = this.state.pendingAction;
    if (!pendingAction) {
      return false;
    }
    const unit = findUnitById(this.state, pendingAction.unitId);
    if (!unit?.transport?.carryingUnitId || unit.transport.hasLockedUnload) {
      return false;
    }
    const carried = findUnitById(this.state, unit.transport.carryingUnitId);
    if (getValidUnloadTiles(this.state, unit, carried).length === 0) {
      return false;
    }
    pendingAction.mode = "unload";
    return true;
  }

  unloadTransportWithPendingUnit(x, y) {
    const pendingAction = this.state.pendingAction;
    if (!pendingAction || (pendingAction.mode ?? "menu") !== "unload") {
      return false;
    }
    const runner = findUnitById(this.state, pendingAction.unitId);
    const carried = runner?.transport?.carryingUnitId
      ? findUnitById(this.state, runner.transport.carryingUnitId)
      : null;
    if (!runner || !carried) {
      return false;
    }
    const canUnloadToTile = getValidUnloadTiles(this.state, runner, carried)
      .some((tile) => tile.x === x && tile.y === y);
    if (!canUnloadToTile) {
      return false;
    }

    carried.transport.carriedByUnitId = null;
    carried.x = x;
    carried.y = y;
    carried.hasMoved = true;
    carried.hasAttacked = true;
    runner.transport.carryingUnitId = null;
    runner.hasMoved = true;
    runner.hasAttacked = true;
    appendLog(this.state, `${carried.name} disembarked from ${runner.name}.`);
    this.clearPendingAction();
    this.clearSelection();
    return true;
  }

  enterTransportWithPendingUnit(runnerId = null) {
    const pendingAction = this.state.pendingAction;
    const unit = pendingAction ? findUnitById(this.state, pendingAction.unitId) : null;
    const validRunners = unit ? this.getAdjacentFriendlyTransports(unit) : [];
    const runner = runnerId
      ? validRunners.find((candidate) => candidate.id === runnerId)
      : validRunners[0] ?? null;
    if (!unit || !runner) {
      return false;
    }

    if (!runnerId && validRunners.length > 1) {
      pendingAction.mode = "transport";
      return true;
    }

    this.boardUnitIntoRunner(unit, runner);
    this.clearPendingAction();
    this.state.selection = { type: "unit", id: runner.id, x: runner.x, y: runner.y };
    return true;
  }

  useSupportAbilityWithPendingUnit(targetId = null) {
    const pendingAction = this.state.pendingAction;
    if (!pendingAction) {
      return false;
    }
    const unit = findUnitById(this.state, pendingAction.unitId);
    if (!unit || !["medic", "mechanic"].includes(unit.unitTypeId)) {
      return false;
    }
    const cooldownKey = "support";
    if ((unit.cooldowns?.[cooldownKey] ?? 0) > 0) {
      return false;
    }

    const validTargets = this.getSupportTargetsForUnit(unit);
    const target = targetId
      ? validTargets.find((option) => option.target.id === targetId)?.target
      : validTargets[0]?.target ?? null;

    if (!target) {
      return false;
    }

    if (!targetId && validTargets.length > 1) {
      pendingAction.mode = "support";
      return true;
    }

    this.applySupportAbility(unit, target);
    this.clearPendingAction();
    this.clearSelection();
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
    this.syncTransportCargoPosition(unit);
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

  getPlayerUnitLimitStatus() {
    const count = getLivingUnits(this.state, TURN_SIDES.PLAYER).length;

    return {
      count,
      limit: PROTOTYPE_ROSTER_CAP,
      isAtLimit: count >= PROTOTYPE_ROSTER_CAP
    };
  }

  recruitUnit(unitTypeId) {
    const building = getSelectedBuilding(this.state);
    const turnKey = `${this.state.turn.activeSide}-${this.state.turn.number}`;

    if (
      !building ||
      this.state.turn.activeSide !== TURN_SIDES.PLAYER ||
      building.owner !== TURN_SIDES.PLAYER ||
      building.recruitLockedTurnKey === turnKey ||
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
    const isBarracksInfantry =
      building.type === BUILDING_KEYS.BARRACKS && INFANTRY_RECRUIT_TYPES.has(unitTypeId);
    recruit.hasMoved = !isBarracksInfantry;
    recruit.hasAttacked = !isBarracksInfantry;
    if (isBarracksInfantry) {
      building.recruitLockedTurnKey = turnKey;
    }

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

    this.state[side].charge = Math.max(
      0,
      Math.min(getCommanderPowerMaxForSide(this.state, side), Number(charge) || 0)
    );
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
    this.tickUnitDurations(TURN_SIDES.ENEMY);
    const incomeGain = this.collectIncome(TURN_SIDES.ENEMY);
    this.resetActions(TURN_SIDES.ENEMY);
    serviceUnitsOnSectors(this.state, TURN_SIDES.ENEMY);
    this.state.enemyTurn.pendingUnitIds = getLivingUnits(this.state, TURN_SIDES.ENEMY)
      .filter((unit) => !unit.hasMoved && !unit.hasAttacked && !unit.transport?.carriedByUnitId)
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

      if (
        !unit ||
        unit.current.hp <= 0 ||
        unit.transport?.carriedByUnitId ||
        (unit.hasMoved && unit.hasAttacked)
      ) {
        continue;
      }

      this.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

      if (unit.unitTypeId === "runner" && !unit.transport?.carryingUnitId) {
        const passenger = this.getAdjacentTransportPassenger(unit);
        if (passenger) {
          this.boardUnitIntoRunner(passenger, unit);
        }
      }

      const supportPlan = getBestSupportPlan(this.state, unit);

      if (supportPlan && this.applySupportAbility(unit, supportPlan.target)) {
        return {
          changed: true,
          done: this.state.victory || this.state.enemyTurn.pendingUnitIds.length === 0,
          type: "support",
          unitId
        };
      }

      const movementBudget = unit.stats.movement + getMovementModifier(this.state, unit);
      const reachableTiles = getReachableTiles(this.state, unit, movementBudget);
      const repairPlan = getBestRepairPlan(this.state, unit, reachableTiles);
      const capturePlan = getBestCapturePlan(this.state, unit, reachableTiles);
      const isGrunt = unit.unitTypeId === "grunt";
      const isSecondaryCapturer = ["breaker", "longshot"].includes(unit.unitTypeId);

      if (repairPlan) {
        const moved = repairPlan.tile.x !== unit.x || repairPlan.tile.y !== unit.y;
        const movePath = moved
          ? getMovementPath(this.state, unit, movementBudget, repairPlan.tile.x, repairPlan.tile.y)
          : [];
        const moveSegments = Math.max(0, movePath.length - 1);

        if (moved) {
          unit.x = repairPlan.tile.x;
          unit.y = repairPlan.tile.y;
          if (unit.unitTypeId === "runner" && unit.transport?.carryingUnitId) {
            unit.transport.canUnloadAfterMove = true;
          }
          this.syncTransportCargoPosition(unit);
          unit.hasMoved = true;
          this.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };
        } else {
          unit.hasMoved = true;
        }

        unit.hasAttacked = true;
        unit.cooldowns.repairMode = Math.max(
          unit.cooldowns.repairMode ?? 0,
          repairPlan.canRepairAfterMove ? (moved ? 2 : 1) : 2
        );
        appendLog(
          this.state,
          `${unit.name} entered repair mode near ${describeBuilding(repairPlan.building).name}.`
        );

        return {
          changed: true,
          done: this.state.victory || this.state.enemyTurn.pendingUnitIds.length === 0,
          type: moved ? "move" : "repair",
          unitId,
          moveSegments
        };
      }

      if (isGrunt && capturePlan) {
        const moved = capturePlan.tile.x !== unit.x || capturePlan.tile.y !== unit.y;
        const movePath = moved
          ? getMovementPath(this.state, unit, movementBudget, capturePlan.tile.x, capturePlan.tile.y)
          : [];
        const moveSegments = Math.max(0, movePath.length - 1);

        if (moved) {
          unit.x = capturePlan.tile.x;
          unit.y = capturePlan.tile.y;
          if (unit.unitTypeId === "runner" && unit.transport?.carryingUnitId) {
            unit.transport.canUnloadAfterMove = true;
          }
          this.syncTransportCargoPosition(unit);
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
          if (unit.unitTypeId === "runner" && unit.transport?.carryingUnitId) {
            unit.transport.canUnloadAfterMove = true;
          }
          this.syncTransportCargoPosition(unit);
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
        if (unit.unitTypeId === "runner" && unit.transport?.carryingUnitId) {
          unit.transport.canUnloadAfterMove = true;
        }
        this.syncTransportCargoPosition(unit);
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
        const unloaded = this.unloadTransportForEnemy(unit);
        if (!unloaded) {
          unit.hasAttacked = true;
        }
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
    this.tickUnitDurations(TURN_SIDES.PLAYER);
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
    const incomeByType = this.state.economy?.incomeByType;
    const buildingIncome = getBuildingIncomeForSide(this.state.map.buildings, side, incomeByType);
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
