import { TURN_SIDES } from "../core/constants.js";
import { describeBuilding } from "../content/buildings.js";
import {
  getArmorModifier,
  getAttackModifier,
  getMovementModifier,
  getRangeModifier
} from "./commanderEffects.js";
import { getLevelProgress } from "./progression.js";
import { canCaptureBuilding } from "./captureRules.js";
import {
  getAttackForecast,
  getAttackRangeCap,
  getAttackableUnitIds,
  getElevationRangeBonus
} from "./combatResolver.js";
import { findUnitById } from "./battleUnits.js";
import {
  getBuildingAt,
  getReachableTiles,
  getRecruitmentOptions,
  getSelectionCoordinates,
  getSelectedBuilding,
  getSelectedUnit,
  getTerrainAt,
  getTilesInRange,
  getUnitAt,
  getUnitAttackProfile
} from "./selectors.js";

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

  const building = getBuildingAt(state, selectionCoordinates.x, selectionCoordinates.y);

  return {
    x: selectionCoordinates.x,
    y: selectionCoordinates.y,
    terrain: describeTerrain(terrain),
    unit: describeUnit(state, getUnitAt(state, selectionCoordinates.x, selectionCoordinates.y)),
    building: building ? describeBuilding(building) : null
  };
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

export function buildBattlePresentation(snapshot) {
  const selectedUnit = getSelectedUnit(snapshot);
  const selectedBuilding = getSelectedBuilding(snapshot);
  const selectedTile = buildSelectedTile(snapshot, getSelectionCoordinates(snapshot));
  const pendingAction = createPendingActionView(snapshot);

  if (selectedUnit) {
    const attackProfile = getUnitAttackProfile(selectedUnit);
    const movementBudget =
      selectedUnit.stats.movement + getMovementModifier(snapshot, selectedUnit);
    const rangeCap = getAttackRangeCap(snapshot, selectedUnit, attackProfile);
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
      attackProfile && rangeCap > 0 && shouldRevealAttackTargets
        ? getTilesInRange(
            snapshot,
            selectedUnit.x,
            selectedUnit.y,
            attackProfile.minRange,
            rangeCap
          )
        : [];

    return {
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
  }

  if (selectedBuilding) {
    return {
      ...createEmptyPresentation(),
      selectedBuildingId: selectedBuilding.id,
      selectedTile,
      pendingAction,
      recruitOptions:
        snapshot.turn.activeSide === TURN_SIDES.PLAYER && selectedBuilding.owner === TURN_SIDES.PLAYER
          ? getRecruitmentOptions(snapshot, selectedBuilding, snapshot.player)
          : []
    };
  }

  if (selectedTile) {
    return {
      ...createEmptyPresentation(),
      selectedTile,
      pendingAction
    };
  }

  return {
    ...createEmptyPresentation(),
    pendingAction
  };
}
