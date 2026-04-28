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
  getElevationRangeBonus,
  getPositionArmorBonus
} from "./combatResolver.js";
import { findUnitById } from "./battleUnits.js";
import {
  getBuildingAt,
  getReachableTiles,
  getRecruitmentOptions,
  getLivingUnits,
  getSelectionCoordinates,
  getSelectedBuilding,
  getSelectedUnit,
  getValidUnloadTiles,
  getTerrainAt,
  getTilesInRange,
  getUnitAt,
  getUnitAttackProfile
} from "./selectors.js";

function getLivingUnitsForSide(state, side) {
  return getLivingUnits(state, side).filter((unit) => !unit.transport?.carriedByUnitId);
}

function getSupportNeedScore(unit) {
  return (
    Math.max(0, unit.stats.maxHealth - unit.current.hp) * 2 +
    Math.max(0, unit.stats.ammoMax - unit.current.ammo) * 3 +
    Math.max(0, unit.stats.staminaMax - unit.current.stamina) * 2
  );
}

function createEmptyPresentation() {
  return {
    selectedTile: null,
    pendingAction: null,
    reachableTiles: [],
    movePreviewTiles: [],
    attackPreviewTiles: [],
    unloadPreviewTiles: [],
    transportTargetUnitIds: [],
    supportTargetUnitIds: [],
    attackableUnitIds: [],
    movementBudget: null,
    recruitOptions: []
  };
}

function formatSelectionOwner(owner) {
  return owner === TURN_SIDES.PLAYER ? "Player" : "Enemy";
}

function describeTerrain(terrain, terrainId = null) {
  if (!terrain) {
    return null;
  }

  return {
    id: terrainId,
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
  const positionArmorBonus = getPositionArmorBonus(state, unit);

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
    positionArmorBonus,
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

  const terrainId = state.map.tiles[selectionCoordinates.y]?.[selectionCoordinates.x] ?? null;
  const terrain = getTerrainAt(state, selectionCoordinates.x, selectionCoordinates.y);

  if (!terrain) {
    return null;
  }

  const building = getBuildingAt(state, selectionCoordinates.x, selectionCoordinates.y);

  return {
    x: selectionCoordinates.x,
    y: selectionCoordinates.y,
    terrain: describeTerrain(terrain, terrainId),
    unit: describeUnit(state, getUnitAt(state, selectionCoordinates.x, selectionCoordinates.y)),
    building: building ? describeBuilding(building) : null
  };
}

function getFocusCoordinates(state, focus) {
  if (!focus?.type) {
    return null;
  }

  if (focus.type === "tile") {
    return Number.isInteger(focus.x) && Number.isInteger(focus.y)
      ? { x: focus.x, y: focus.y }
      : null;
  }

  if (focus.type === "unit") {
    const unit = findUnitById(state, focus.id);

    return unit
      ? { x: unit.x, y: unit.y }
      : Number.isInteger(focus.x) && Number.isInteger(focus.y)
        ? { x: focus.x, y: focus.y }
        : null;
  }

  if (focus.type === "building") {
    const building = state.map.buildings.find((candidate) => candidate.id === focus.id);

    return building
      ? { x: building.x, y: building.y }
      : Number.isInteger(focus.x) && Number.isInteger(focus.y)
        ? { x: focus.x, y: focus.y }
        : null;
  }

  return null;
}

export function buildFocusedTile(state, focus) {
  return buildSelectedTile(state, getFocusCoordinates(state, focus));
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
  const carriedUnit = unit.transport?.carryingUnitId
    ? findUnitById(state, unit.transport.carryingUnitId)
    : null;
  const validUnloadTiles = getValidUnloadTiles(state, unit, carriedUnit);
  const unloadPreviewTiles = mode === "unload" ? validUnloadTiles : [];
  const supportTargetFamily = unit.unitTypeId === "medic" ? "infantry" : unit.unitTypeId === "mechanic" ? "vehicle" : null;
  const canSupport =
    Boolean(supportTargetFamily) &&
    (unit.cooldowns?.support ?? 0) <= 0;
  const supportTargets = canSupport
    ? getLivingUnitsForSide(state, unit.owner)
        .filter((candidate) => {
          if (candidate.id === unit.id || candidate.family !== supportTargetFamily) {
            return false;
          }
          return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
        })
        .map((target) => ({
          target,
          needScore: getSupportNeedScore(target)
        }))
        .filter((option) => option.needScore > 0)
        .sort((left, right) => right.needScore - left.needScore || left.target.id.localeCompare(right.target.id))
    : [];
  const adjacentRunners = unit.family === "infantry"
    ? getLivingUnitsForSide(state, unit.owner)
        .filter((candidate) =>
          candidate.unitTypeId === "runner" &&
          !candidate.transport?.carryingUnitId &&
          Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1
        )
        .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id))
    : [];
  const canEnterTransport = adjacentRunners.length > 0 && !unit.transport?.carriedByUnitId;
  const transportTargetUnitIds = mode === "transport"
    ? adjacentRunners.map((runner) => runner.id)
    : [];
  const supportTargetUnitIds = mode === "support"
    ? supportTargets.map((option) => option.target.id)
    : [];
  const canUnloadTransport =
    unit.unitTypeId === "runner" &&
    Boolean(unit.transport?.carryingUnitId) &&
    !unit.transport?.hasLockedUnload &&
    (unit.transport?.canUnloadAfterMove || unit.hasMoved) &&
    validUnloadTiles.length > 0;

  return {
    ...pendingAction,
    mode,
    unitName: unit.name,
    canCapture: canCaptureBuilding(unit, building),
    canFire: attackableUnitIds.length > 0,
    canSupport: supportTargets.length > 0,
    supportCooldown: unit.cooldowns?.support ?? 0,
    canEnterTransport,
    canUnloadTransport,
    isTargeting: mode === "fire",
    isChoosingTransport: mode === "transport",
    isChoosingSupport: mode === "support",
    isUnloading: mode === "unload",
    unloadPreviewTiles,
    transportTargetUnitIds,
    supportTargetUnitIds,
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
      unloadPreviewTiles:
        pendingAction?.unitId === selectedUnit.id ? pendingAction.unloadPreviewTiles ?? [] : [],
      transportTargetUnitIds:
        pendingAction?.unitId === selectedUnit.id ? pendingAction.transportTargetUnitIds ?? [] : [],
      supportTargetUnitIds:
        pendingAction?.unitId === selectedUnit.id ? pendingAction.supportTargetUnitIds ?? [] : [],
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
