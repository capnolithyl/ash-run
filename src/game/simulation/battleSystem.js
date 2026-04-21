import {
  BUILDING_KEYS,
  COMMANDER_POWER_MAX,
  PROTOTYPE_ROSTER_CAP,
  TERRAIN_KEYS,
  TURN_SIDES,
  UNIT_TAGS
} from "../core/constants.js";
import { getBuildingIncomeForSide } from "../core/economy.js";
import { randomInt } from "../core/random.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { describeBuilding } from "../content/buildings.js";
import { awardExperience, getLevelProgress, getXpThreshold } from "./progression.js";
import {
  activateCommanderPower,
  applyChargeFromCombat,
  getArmorModifier,
  getAttackModifier,
  getIncomeBonus,
  getMovementModifier,
  getRangeModifier,
  getRecruitDiscount,
  tickSideStatuses
} from "./commanderEffects.js";
import {
  canUnitAttackTarget,
  getBuildingAt,
  getLivingUnits,
  getMovementPath,
  getReachableTiles,
  getRecruitmentOptions,
  getSelectionCoordinates,
  getSelectedBuilding,
  getSelectedUnit,
  getTerrainAt,
  getTilesInRange,
  getTargetsInRange,
  getUnitAt
} from "./selectors.js";
import { createUnitFromType } from "./unitFactory.js";

const STAT_LABELS = {
  attack: "Attack",
  armor: "Armor",
  maxHealth: "Max HP",
  movement: "Movement",
  maxRange: "Range",
  staminaMax: "Stamina",
  ammoMax: "Ammo",
  luck: "Luck"
};

function createEmptyPresentation() {
  return {
    selectedTile: null,
    pendingAction: null,
    reachableTiles: [],
    movePreviewTiles: [],
    attackPreviewTiles: [],
    attackableUnitIds: [],
    movementBudget: null,
    recruitOptions: []
  };
}

function formatSelectionOwner(owner) {
  return owner === TURN_SIDES.PLAYER ? "Player" : "Enemy";
}

function describeTerrain(terrain) {
  if (!terrain) {
    return null;
  }

  return {
    label: terrain.label,
    armorBonus: terrain.armorBonus ?? 0,
    moveCost: terrain.moveCost,
    vehicleMoveCost: terrain.vehicleMoveCost,
    blocksGround: terrain.blocksGround,
    blockedFamilies: [...(terrain.blockedFamilies ?? [])]
  };
}

function getTerrainArmorBonus(state, unit) {
  if (unit.family === UNIT_TAGS.AIR) {
    return 0;
  }

  const terrain = getTerrainAt(state, unit.x, unit.y);
  return terrain?.armorBonus ?? 0;
}

function getBuildingArmorBonus(state, unit) {
  if (unit.family === UNIT_TAGS.AIR) {
    return 0;
  }

  const building = getBuildingAt(state, unit.x, unit.y);

  if (!building || building.owner !== unit.owner) {
    return 0;
  }

  if (building.type === BUILDING_KEYS.COMMAND) {
    return 5;
  }

  if (building.type === BUILDING_KEYS.SECTOR) {
    return 3;
  }

  return 3;
}

function getElevationRangeBonus(state, unit) {
  if (unit.unitTypeId !== "longshot") {
    return 0;
  }

  return state.map.tiles[unit.y]?.[unit.x] === TERRAIN_KEYS.MOUNTAIN ? 1 : 0;
}

function findUnitById(state, unitId) {
  return [...state.player.units, ...state.enemy.units].find((unit) => unit.id === unitId);
}

function compareUnitsForSelectionOrder(left, right) {
  if (left.y !== right.y) {
    return left.y - right.y;
  }

  if (left.x !== right.x) {
    return left.x - right.x;
  }

  return left.id.localeCompare(right.id);
}

function getReadyPlayerUnits(state) {
  return getLivingUnits(state, TURN_SIDES.PLAYER)
    .filter((unit) => !unit.hasMoved)
    .sort(compareUnitsForSelectionOrder);
}

function canCaptureBuilding(unit, building) {
  return Boolean(
    unit &&
    building &&
    unit.owner === TURN_SIDES.PLAYER &&
    unit.family === UNIT_TAGS.INFANTRY &&
    building.owner !== unit.owner
  );
}

function describeUnit(state, unit) {
  if (!unit) {
    return null;
  }

  const experience = getLevelProgress(unit);

  return {
    id: unit.id,
    owner: unit.owner,
    ownerLabel: formatSelectionOwner(unit.owner),
    name: unit.name,
    family: unit.family,
    level: unit.level,
    hp: unit.current.hp,
    maxHealth: unit.stats.maxHealth,
    attack: unit.stats.attack + getAttackModifier(state, unit),
    armor: unit.stats.armor + getArmorModifier(state, unit),
    movement: unit.stats.movement + getMovementModifier(state, unit),
    minRange: unit.stats.minRange,
    maxRange: unit.stats.maxRange + getRangeModifier(state, unit) + getElevationRangeBonus(state, unit),
    experience: experience.current,
    experienceToNextLevel: experience.threshold,
    experienceRatio: experience.ratio,
    stamina: unit.current.stamina,
    staminaMax: unit.stats.staminaMax,
    ammo: unit.current.ammo,
    ammoMax: unit.stats.ammoMax,
    luck: unit.stats.luck,
    hasMoved: unit.hasMoved,
    hasAttacked: unit.hasAttacked
  };
}

function buildSelectedTile(state, selectionCoordinates) {
  if (!selectionCoordinates) {
    return null;
  }

  const terrain = getTerrainAt(state, selectionCoordinates.x, selectionCoordinates.y);

  if (!terrain) {
    return null;
  }

  return {
    x: selectionCoordinates.x,
    y: selectionCoordinates.y,
    terrain: describeTerrain(terrain),
    unit: describeUnit(state, getUnitAt(state, selectionCoordinates.x, selectionCoordinates.y)),
    building: (() => {
      const building = getBuildingAt(state, selectionCoordinates.x, selectionCoordinates.y);
      return building ? describeBuilding(building) : null;
    })()
  };
}

function appendLog(state, message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 10);
}

function pushLevelUpEvents(state, unit, levelUps) {
  if (unit.owner !== TURN_SIDES.PLAYER || levelUps.length === 0) {
    return;
  }

  for (const levelUp of levelUps) {
    state.levelUpQueue.push({
      unitId: unit.id,
      unitName: unit.name,
      previousLevel: levelUp.previousLevel,
      newLevel: levelUp.newLevel,
      statGains: [
        {
          stat: levelUp.stat,
          label: STAT_LABELS[levelUp.stat] ?? levelUp.stat,
          delta: levelUp.increment,
          previousValue: levelUp.previousValue,
          nextValue: levelUp.nextValue
        }
      ]
    });
  }
}

function getDamageResult(state, attacker, defender) {
  const attackerAttack = attacker.stats.attack + getAttackModifier(state, attacker);
  const defenderArmor =
    defender.stats.armor +
    getArmorModifier(state, defender) +
    getTerrainArmorBonus(state, defender) +
    getBuildingArmorBonus(state, defender);
  const isEffective = attacker.effectiveAgainstTags.includes(defender.family);
  const healthRatio = Math.max(0, attacker.current.hp / attacker.stats.maxHealth);

  const attackRoll = randomInt(state.seed, 0, attacker.stats.luck);
  state.seed = attackRoll.seed;

  const baseAttack = isEffective ? attackerAttack * 2 : attackerAttack;
  const scaledAttack = Math.round((baseAttack + attackRoll.value) * healthRatio);
  const damage = Math.max(1, scaledAttack - defenderArmor);

  return {
    damage,
    isEffective
  };
}

function getDamageAmount(attackerAttack, defenderArmor, isEffective, hp, maxHealth, luckRoll) {
  const healthRatio = Math.max(0, hp / maxHealth);
  const baseAttack = isEffective ? attackerAttack * 2 : attackerAttack;
  const scaledAttack = Math.round((baseAttack + luckRoll) * healthRatio);
  return Math.max(1, scaledAttack - defenderArmor);
}

function getDamageRange(state, attacker, defender, hpMin, hpMax) {
  const attackerAttack = attacker.stats.attack + getAttackModifier(state, attacker);
  const defenderArmor = defender.stats.armor + getArmorModifier(state, defender);
  const isEffective = attacker.effectiveAgainstTags.includes(defender.family);
  const normalizedHpMin = Math.max(0, Math.min(hpMin, hpMax));
  const normalizedHpMax = Math.max(0, Math.max(hpMin, hpMax));
  const luckMin = 0;
  const luckMax = Math.max(0, attacker.stats.luck);

  return {
    min: getDamageAmount(
      attackerAttack,
      defenderArmor,
      isEffective,
      normalizedHpMin,
      attacker.stats.maxHealth,
      luckMin
    ),
    max: getDamageAmount(
      attackerAttack,
      defenderArmor,
      isEffective,
      normalizedHpMax,
      attacker.stats.maxHealth,
      luckMax
    ),
    isEffective
  };
}

function getAttackForecast(state, attacker, defender) {
  const dealt = getDamageRange(state, attacker, defender, attacker.current.hp, attacker.current.hp);
  const defenderHpAfterHitMin = Math.max(0, defender.current.hp - dealt.max);
  const defenderHpAfterHitMax = Math.max(0, defender.current.hp - dealt.min);
  const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
  const defenderRangeCap = defender.stats.maxRange + getRangeModifier(state, defender);
  const canCounter =
    defender.current.ammo > 0 &&
    defenderHpAfterHitMax > 0 &&
    distance >= defender.stats.minRange &&
    distance <= defenderRangeCap;
  const received = canCounter
    ? getDamageRange(
        state,
        defender,
        attacker,
        Math.max(1, defenderHpAfterHitMin),
        defenderHpAfterHitMax
      )
    : null;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    dealt: {
      min: dealt.min,
      max: dealt.max
    },
    received: received
      ? {
          min: received.min,
          max: received.max
        }
      : null,
    defenderHpAfterHit: {
      min: defenderHpAfterHitMin,
      max: defenderHpAfterHitMax
    }
  };
}

function removeDeadUnits(state) {
  for (const side of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
    state[side].units = state[side].units.filter((unit) => unit.current.hp > 0);
  }
}

function getNonKillExperience(damage) {
  return Math.max(12, Math.round(damage * 2.5));
}

function getDefenseExperience(damage) {
  return Math.max(8, Math.round(damage * 1.6));
}

function getKillExperience(attacker, defender) {
  const levelDelta = defender.level - attacker.level;
  const threshold = getXpThreshold(attacker.level);
  const multiplier = Math.max(0.45, 1 + levelDelta * 0.25);

  return Math.round(threshold * multiplier);
}

function getAttackableUnitIds(state, unit) {
  if (!unit || unit.hasAttacked || unit.current.ammo <= 0) {
    return [];
  }

  const rangeCap = unit.stats.maxRange + getRangeModifier(state, unit) + getElevationRangeBonus(state, unit);

  return getTargetsInRange(state, unit, unit.stats.minRange, rangeCap).map((target) => target.id);
}

function serviceUnitsOnSectors(state, side) {
  let servicedUnits = 0;

  for (const unit of getLivingUnits(state, side)) {
    const building = getBuildingAt(state, unit.x, unit.y);

    if (!building || building.type !== BUILDING_KEYS.SECTOR || building.owner !== side) {
      continue;
    }

    const healAmount = Math.max(1, Math.ceil(unit.stats.maxHealth * 0.1));
    const previousHp = unit.current.hp;
    const previousAmmo = unit.current.ammo;
    const previousStamina = unit.current.stamina;

    unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + healAmount);
    unit.current.ammo = unit.stats.ammoMax;
    unit.current.stamina = unit.stats.staminaMax;

    if (
      unit.current.hp !== previousHp ||
      unit.current.ammo !== previousAmmo ||
      unit.current.stamina !== previousStamina
    ) {
      servicedUnits += 1;
    }
  }

  if (servicedUnits > 0) {
    appendLog(
      state,
      `${side === TURN_SIDES.PLAYER ? "Allied" : "Enemy"} sector nodes serviced ${servicedUnits} unit${
        servicedUnits === 1 ? "" : "s"
      }.`
    );
  }
}

function createPendingActionView(state) {
  const pendingAction = state.pendingAction;

  if (!pendingAction) {
    return null;
  }

  const unit = findUnitById(state, pendingAction.unitId);

  if (!unit) {
    return null;
  }

  const building = getBuildingAt(state, unit.x, unit.y);
  const mode = pendingAction.mode ?? "menu";
  const attackableUnitIds = getAttackableUnitIds(state, unit);

  return {
    ...pendingAction,
    mode,
    unitName: unit.name,
    canCapture: canCaptureBuilding(unit, building),
    canFire: attackableUnitIds.length > 0,
    isTargeting: mode === "fire",
    attackableUnitIds,
    building: building ? describeBuilding(building) : null
  };
}

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
    this.state.player.recruitDiscount = getRecruitDiscount(this.state, TURN_SIDES.PLAYER);
    this.state.enemy.recruitDiscount = getRecruitDiscount(this.state, TURN_SIDES.ENEMY);
  }

  getSnapshot() {
    const snapshot = structuredClone(this.state);
    const selectedUnit = getSelectedUnit(snapshot);
    const selectedBuilding = getSelectedBuilding(snapshot);
    const selectedTile = buildSelectedTile(snapshot, getSelectionCoordinates(snapshot));
    const pendingAction = createPendingActionView(snapshot);

    if (selectedUnit) {
      const movementBudget =
        selectedUnit.stats.movement + getMovementModifier(snapshot, selectedUnit);
      const rangeCap =
        selectedUnit.stats.maxRange +
        getRangeModifier(snapshot, selectedUnit) +
        getElevationRangeBonus(snapshot, selectedUnit);
      const attackableUnitIds = getAttackableUnitIds(snapshot, selectedUnit);
      const shouldRevealAttackTargets =
        !pendingAction ||
        pendingAction.unitId !== selectedUnit.id ||
        pendingAction.isTargeting;
      const movePreviewTiles =
        pendingAction?.unitId === selectedUnit.id
          ? []
          : getReachableTiles(snapshot, selectedUnit, movementBudget);
      const attackPreviewTiles =
        selectedUnit.current.ammo > 0 && rangeCap > 0 && shouldRevealAttackTargets
          ? getTilesInRange(
              snapshot,
              selectedUnit.x,
              selectedUnit.y,
              selectedUnit.stats.minRange,
              rangeCap
            )
          : [];

      snapshot.presentation = {
        ...createEmptyPresentation(),
        selectedUnitId: selectedUnit.id,
        selectedTile,
        pendingAction,
        movementBudget,
        movePreviewTiles,
        attackPreviewTiles,
        reachableTiles:
          selectedUnit.owner === TURN_SIDES.PLAYER &&
          snapshot.turn.activeSide === TURN_SIDES.PLAYER &&
          pendingAction?.unitId !== selectedUnit.id &&
          !selectedUnit.hasMoved
            ? movePreviewTiles
            : [],
        attackableUnitIds:
          selectedUnit.owner === TURN_SIDES.PLAYER &&
          snapshot.turn.activeSide === TURN_SIDES.PLAYER &&
          shouldRevealAttackTargets
            ? attackableUnitIds
            : [],
        attackForecasts:
          selectedUnit.owner === TURN_SIDES.PLAYER &&
          snapshot.turn.activeSide === TURN_SIDES.PLAYER &&
          pendingAction?.unitId === selectedUnit.id &&
          pendingAction?.isTargeting
            ? Object.fromEntries(
                attackableUnitIds
                  .map((targetId) => {
                    const target = findUnitById(snapshot, targetId);
                    return target ? [target.id, getAttackForecast(snapshot, selectedUnit, target)] : null;
                  })
                  .filter(Boolean)
              )
            : {}
      };
    } else if (selectedBuilding) {
      snapshot.presentation = {
        ...createEmptyPresentation(),
        selectedBuildingId: selectedBuilding.id,
        selectedTile,
        pendingAction,
        recruitOptions:
          snapshot.turn.activeSide === TURN_SIDES.PLAYER && selectedBuilding.owner === TURN_SIDES.PLAYER
            ? getRecruitmentOptions(snapshot, selectedBuilding, snapshot.player)
            : []
      };
    } else if (selectedTile) {
      snapshot.presentation = {
        ...createEmptyPresentation(),
        selectedTile,
        pendingAction
      };
    } else {
      snapshot.presentation = {
        ...createEmptyPresentation(),
        pendingAction
      };
    }

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

    if (selectedUnit?.owner === TURN_SIDES.PLAYER && unitAtTile?.owner === TURN_SIDES.ENEMY) {
      const changed = this.attackTarget(selectedUnit.id, unitAtTile.id);

      if (!changed) {
        appendLog(this.state, "Target is out of range or that unit already acted.");
      }

      return changed;
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

      if (canMoveToTile && (selectedUnit.x !== x || selectedUnit.y !== y)) {
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

        selectedUnit.x = x;
        selectedUnit.y = y;
        selectedUnit.current.stamina = Math.max(0, selectedUnit.current.stamina - 1);
        this.state.selection = { type: "unit", id: selectedUnit.id, x, y };
        appendLog(this.state, `${selectedUnit.name} repositioned.`);
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

    if (!attacker || !defender || attacker.hasAttacked || attacker.current.ammo <= 0) {
      return false;
    }

    const rangeCap =
      attacker.stats.maxRange + getRangeModifier(this.state, attacker) + getElevationRangeBonus(this.state, attacker);
    const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);

    if (
      distance < attacker.stats.minRange ||
      distance > rangeCap ||
      !canUnitAttackTarget(attacker, defender)
    ) {
      return false;
    }

    const primaryStrike = getDamageResult(this.state, attacker, defender);
    defender.current.hp = Math.max(0, defender.current.hp - primaryStrike.damage);
    attacker.current.ammo = Math.max(0, attacker.current.ammo - 1);
    attacker.hasAttacked = true;
    attacker.hasMoved = true;

    appendLog(
      this.state,
      `${attacker.name} hit ${defender.name} for ${primaryStrike.damage}${
        primaryStrike.isEffective ? " effective" : ""
      } damage.`
    );

    applyChargeFromCombat(
      this.state,
      attacker.owner,
      defender.owner,
      primaryStrike.damage,
      primaryStrike.damage
    );
    const defenderDefenseXp = defender.current.hp > 0 ? getDefenseExperience(primaryStrike.damage) : 0;
    let defenderCounterXp = 0;
    let attackerDefenseXp = 0;

    if (defender.current.hp > 0 && defender.current.ammo > 0) {
      const counterRange =
        defender.stats.maxRange +
        getRangeModifier(this.state, defender) +
        getElevationRangeBonus(this.state, defender);

      if (
        distance >= defender.stats.minRange &&
        distance <= counterRange &&
        canUnitAttackTarget(defender, attacker)
      ) {
        const counterStrike = getDamageResult(this.state, defender, attacker);
        attacker.current.hp = Math.max(0, attacker.current.hp - counterStrike.damage);
        defender.current.ammo = Math.max(0, defender.current.ammo - 1);

        appendLog(this.state, `${defender.name} countered for ${counterStrike.damage} damage.`);

        applyChargeFromCombat(
          this.state,
          defender.owner,
          attacker.owner,
          counterStrike.damage,
          counterStrike.damage
        );
        defenderCounterXp =
          attacker.current.hp <= 0
            ? getKillExperience(defender, attacker)
            : getNonKillExperience(counterStrike.damage);

        if (attacker.current.hp > 0) {
          attackerDefenseXp = getDefenseExperience(counterStrike.damage);
        }
      }
    }

    const attackerXpGain =
      defender.current.hp <= 0
        ? getKillExperience(attacker, defender)
        : getNonKillExperience(primaryStrike.damage);
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

    building.owner = unit.owner;
    unit.hasMoved = true;
    unit.hasAttacked = true;
    appendLog(this.state, `${unit.name} captured ${describeBuilding(building).name}.`);
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

      const immediateTargets = getTargetsInRange(
        this.state,
        unit,
        unit.stats.minRange,
        unit.stats.maxRange + getRangeModifier(this.state, unit) + getElevationRangeBonus(this.state, unit)
      );

      if (immediateTargets.length > 0) {
        const target = immediateTargets.sort((left, right) => left.current.hp - right.current.hp)[0];
        this.attackTarget(unit.id, target.id);
        return {
          changed: true,
          done: this.state.victory || this.state.enemyTurn.pendingUnitIds.length === 0,
          type: "attack",
          unitId
        };
      }

      const reachableTiles = getReachableTiles(
        this.state,
        unit,
        unit.stats.movement + getMovementModifier(this.state, unit)
      );
      const playerUnits = getLivingUnits(this.state, TURN_SIDES.PLAYER);

      if (playerUnits.length === 0) {
        break;
      }

      let bestTile = { x: unit.x, y: unit.y, distance: Number.POSITIVE_INFINITY };

      for (const tile of reachableTiles) {
        const nearestDistance = playerUnits.reduce((bestDistance, target) => {
          const distance = Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y);
          return Math.min(bestDistance, distance);
        }, Number.POSITIVE_INFINITY);

        if (nearestDistance < bestTile.distance) {
          bestTile = { ...tile, distance: nearestDistance };
        }
      }

      const moved = bestTile.x !== unit.x || bestTile.y !== unit.y;
      const movementBudget = unit.stats.movement + getMovementModifier(this.state, unit);
      const movePath = moved
        ? getMovementPath(this.state, unit, movementBudget, bestTile.x, bestTile.y)
        : [];
      const moveSegments = Math.max(0, movePath.length - 1);

      if (moved) {
        unit.x = bestTile.x;
        unit.y = bestTile.y;
        unit.hasMoved = true;
        this.state.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };
      }

      const postMoveTargets = getTargetsInRange(
        this.state,
        unit,
        unit.stats.minRange,
        unit.stats.maxRange + getRangeModifier(this.state, unit) + getElevationRangeBonus(this.state, unit)
      );

      if (postMoveTargets.length > 0) {
        const target = postMoveTargets.sort((left, right) => left.current.hp - right.current.hp)[0];
        this.state.enemyTurn.pendingAttack = {
          attackerId: unit.id,
          targetId: target.id
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
    const productionSites = this.state.map.buildings.filter(
      (building) =>
        building.owner === TURN_SIDES.ENEMY &&
        ["barracks", "motor-pool", "airfield"].includes(building.type) &&
        !getUnitAt(this.state, building.x, building.y)
    );

    for (const building of productionSites) {
      const options = getRecruitmentOptions(this.state, building, this.state.enemy)
        .sort((left, right) => left.adjustedCost - right.adjustedCost);
      const affordable = options.find((option) => option.adjustedCost <= this.state.enemy.funds);

      if (!affordable) {
        continue;
      }

      const recruit = createUnitFromType(affordable.id, TURN_SIDES.ENEMY);
      recruit.x = building.x;
      recruit.y = building.y;
      recruit.hasMoved = true;
      recruit.hasAttacked = true;
      this.state.enemy.units.push(recruit);
      this.state.enemy.funds -= affordable.adjustedCost;
      appendLog(this.state, `Enemy deployed ${recruit.name}.`);
      deployments.push({
        unitId: recruit.id,
        unitTypeId: recruit.unitTypeId,
        buildingId: building.id,
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
