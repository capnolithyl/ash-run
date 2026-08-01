import { TERRAIN_LIBRARY } from "../content/terrain.js";
import { BUILDING_RECRUITMENT, UNIT_CATALOG } from "../content/unitCatalog.js";
import { getTargetProfileForAttack, WEAPON_CLASSES } from "../content/weaponClasses.js";
import { TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import {
  canRunCardUnitCrossBlockedTerrain,
  getRunCardStaminaCostMultiplier,
  getRunCardTerrainMoveCost,
  isUnitZombified
} from "./runCardEffects.js";

const SECONDARY_ATTACK_RATIO = 0.55;
const NOVA_OVERLOAD_SOURCE = "nova-overload";

function tileKey(x, y) {
  return `${x},${y}`;
}

const MOVEMENT_DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

export function getLivingUnits(state, side) {
  return state[side].units.filter((unit) => unit.current.hp > 0 && !isUnitZombified(unit));
}

function getAllUnits(state) {
  return [...state.player.units, ...state.enemy.units];
}

function hasCorruptedStat(unit, stat) {
  return (unit?.statuses ?? []).some((status) => status.type === "corrupted" && status.stat === stat);
}

function halveVisibleStat(value) {
  return Math.max(0, Math.ceil(value * 0.5));
}

export function getEffectiveCurrentAmmo(unit) {
  const ammo = Math.max(0, unit?.current?.ammo ?? 0);
  return hasCorruptedStat(unit, "ammo") ? halveVisibleStat(ammo) : ammo;
}

export function getEffectiveCurrentStamina(unit) {
  const stamina = Math.max(0, unit?.current?.stamina ?? 0);
  return hasCorruptedStat(unit, "stamina") ? halveVisibleStat(stamina) : stamina;
}

function canUseOverloadedPrimaryAttack(unit) {
  return (unit?.statuses ?? []).some(
    (status) =>
      status.type === "attackPercent" &&
      status.source === NOVA_OVERLOAD_SOURCE &&
      status.primaryAttackWithoutAmmo === true
  );
}

export function getUnitAt(state, x, y) {
  return getAllUnits(state).find(
    (unit) =>
      unit.current.hp > 0 &&
      !unit.transport?.carriedByUnitId &&
      unit.x === x &&
      unit.y === y
  );
}

export function getBuildingAt(state, x, y) {
  return state.map.buildings.find((building) => building.x === x && building.y === y);
}

export function getUnitAttackProfile(unit) {
  if (
    !unit ||
    unit.temporary?.hostageCarrier ||
    unit.stats?.maxRange <= 0 ||
    unit.stats?.attack <= 0
  ) {
    return null;
  }

  const hasPrimaryAmmo = getEffectiveCurrentAmmo(unit) > 0;

  if (hasPrimaryAmmo || canUseOverloadedPrimaryAttack(unit)) {
    return {
      type: "primary",
      attack: unit.stats.attack,
      weaponClass: unit.stats.weaponClass,
      minRange: unit.stats.minRange,
      maxRange: unit.stats.maxRange,
      consumesAmmo: hasPrimaryAmmo
    };
  }

  return {
    type: "secondary",
    attack: Math.max(1, Math.floor(unit.stats.attack * SECONDARY_ATTACK_RATIO)),
    weaponClass: WEAPON_CLASSES.RIFLE,
    minRange: 1,
    maxRange: 1,
    consumesAmmo: false
  };
}

export function getAntiAirGearAmmo(unit) {
  return Math.max(0, unit?.gearState?.aaKitAmmo ?? 0);
}

function hasUsableAntiAirKit(unit) {
  return unit?.gear?.slot === "gear-aa-kit" && getAntiAirGearAmmo(unit) > 0;
}

export function getAttackProfileForTarget(attacker, target) {
  if (
    attacker &&
    target?.family === UNIT_TAGS.AIR &&
    hasUsableAntiAirKit(attacker) &&
    attacker.stats?.maxRange > 0 &&
    attacker.stats?.attack > 0
  ) {
    return {
      type: "gear-aa",
      attack: attacker.stats.attack,
      weaponClass: null,
      minRange: attacker.stats.minRange,
      maxRange: attacker.stats.maxRange,
      consumesAmmo: false,
      consumesGearAmmo: true
    };
  }

  return getUnitAttackProfile(attacker);
}

export function getSelectedUnit(state) {
  if (state.selection.type !== "unit") {
    return null;
  }

  return getAllUnits(state).find((unit) => unit.id === state.selection.id) ?? null;
}

export function getSelectedBuilding(state) {
  if (state.selection.type !== "building") {
    return null;
  }

  return state.map.buildings.find((building) => building.id === state.selection.id) ?? null;
}

export function getSelectionCoordinates(state) {
  if (state.selection.type === "tile") {
    if (Number.isInteger(state.selection.x) && Number.isInteger(state.selection.y)) {
      return { x: state.selection.x, y: state.selection.y };
    }

    return null;
  }

  const selectedUnit = getSelectedUnit(state);

  if (selectedUnit) {
    return { x: selectedUnit.x, y: selectedUnit.y };
  }

  const selectedBuilding = getSelectedBuilding(state);

  if (selectedBuilding) {
    return { x: selectedBuilding.x, y: selectedBuilding.y };
  }

  return null;
}

export function getTerrainAt(state, x, y) {
  const terrainKey = state.map.tiles[y]?.[x];
  return TERRAIN_LIBRARY[terrainKey];
}

function getMovementCost(state, unit, terrain, terrainKey) {
  if (!terrain) {
    return 99;
  }

  if (unit.family === UNIT_TAGS.AIR) {
    return 1;
  }

  const baseCost = unit.family === UNIT_TAGS.VEHICLE ? terrain.vehicleMoveCost : terrain.moveCost;
  return getRunCardTerrainMoveCost(state, unit, terrainKey, baseCost);
}

export function getUnitMovementAllowance(unit, movementBudget) {
  const requestedBudget = Math.max(0, Math.floor(movementBudget ?? 0));
  const currentStamina = Math.max(0, Math.floor(getEffectiveCurrentStamina(unit) ?? requestedBudget));
  const hostagePenalty = unit?.temporary?.hostageCarrier ? 1 : 0;
  const reducedBudget = Math.max(0, requestedBudget - hostagePenalty);
  const minimumAllowance = unit?.temporary?.hostageCarrier && requestedBudget > 0 && currentStamina > 0 ? 1 : 0;
  return Math.max(minimumAllowance, Math.min(reducedBudget, currentStamina));
}

function isTerrainBlockedForUnit(state, unit, terrain, terrainKey) {
  if (!terrain) {
    return true;
  }

  if (unit.family === UNIT_TAGS.AIR) {
    return false;
  }

  if (canRunCardUnitCrossBlockedTerrain(state, unit, terrainKey)) {
    return false;
  }

  if (terrain.blocksGround) {
    return true;
  }

  return (terrain.blockedFamilies ?? []).includes(unit.family);
}

function isAirUnit(unit) {
  return unit?.family === UNIT_TAGS.AIR;
}

function occupiesBlockingLayer(movingUnit, occupant) {
  if (!occupant) {
    return false;
  }

  return isAirUnit(movingUnit) === isAirUnit(occupant);
}

export function canUnitOccupyTile(state, unit, x, y) {
  const terrainKey = state.map.tiles[y]?.[x];
  const terrain = TERRAIN_LIBRARY[terrainKey];

  if (isTerrainBlockedForUnit(state, unit, terrain, terrainKey)) {
    return false;
  }

  const occupant = getUnitAt(state, x, y);
  return !occupant || occupant.id === unit.id;
}

export function getValidUnloadTiles(state, runner, carriedUnit) {
  if (!runner || !carriedUnit || runner.transport?.carryingUnitId !== carriedUnit.id) {
    return [];
  }

  return [
    { x: runner.x + 1, y: runner.y },
    { x: runner.x - 1, y: runner.y },
    { x: runner.x, y: runner.y + 1 },
    { x: runner.x, y: runner.y - 1 }
  ].filter((tile) => canUnitOccupyTile(state, carriedUnit, tile.x, tile.y));
}

function getMovementSearch(state, unit, movementBudget) {
  const allowedBudget = getUnitMovementAllowance(unit, movementBudget);
  const currentStamina = Math.max(0, Math.floor(getEffectiveCurrentStamina(unit) ?? allowedBudget));
  const frontier = [{ x: unit.x, y: unit.y, moveCost: 0, staminaCost: 0 }];
  const bestCosts = new Map([[tileKey(unit.x, unit.y), 0]]);
  const bestStaminaCosts = new Map([[tileKey(unit.x, unit.y), 0]]);
  const previous = new Map();
  const settled = new Set();
  const reachable = [];

  while (frontier.length > 0) {
    frontier.sort(
      (left, right) =>
        left.moveCost - right.moveCost ||
        left.staminaCost - right.staminaCost ||
        left.y - right.y ||
        left.x - right.x
    );
    const current = frontier.shift();
    const currentKey = tileKey(current.x, current.y);

    if (settled.has(currentKey)) {
      continue;
    }

    settled.add(currentKey);

    const currentOccupant = getUnitAt(state, current.x, current.y);

    if (!currentOccupant || currentOccupant.id === unit.id) {
      reachable.push({ x: current.x, y: current.y, cost: current.moveCost });
    }

    for (const direction of MOVEMENT_DIRECTIONS) {
      const nextX = current.x + direction.x;
      const nextY = current.y + direction.y;
      const terrainKey = state.map.tiles[nextY]?.[nextX];
      const terrain = TERRAIN_LIBRARY[terrainKey];

      if (!terrain) {
        continue;
      }

      const stepMoveCost = getMovementCost(state, unit, terrain, terrainKey);
      const nextCost = current.moveCost + stepMoveCost;
      const nextStaminaCost =
        current.staminaCost + stepMoveCost * getRunCardStaminaCostMultiplier(state, unit);
      const key = tileKey(nextX, nextY);
      const occupant = getUnitAt(state, nextX, nextY);
      const occupiedByBlockingUnit =
        occupant &&
        occupant.id !== unit.id &&
        occupant.owner !== unit.owner &&
        occupiesBlockingLayer(unit, occupant);
      const bestKnownCost = bestCosts.get(key);
      const bestKnownStaminaCost = bestStaminaCosts.get(key);

      if (
        nextCost > allowedBudget ||
        nextStaminaCost > currentStamina ||
        isTerrainBlockedForUnit(state, unit, terrain, terrainKey) ||
        occupiedByBlockingUnit ||
        (
          bestKnownCost !== undefined &&
          bestKnownStaminaCost !== undefined &&
          bestKnownCost <= nextCost &&
          bestKnownStaminaCost <= nextStaminaCost
        )
      ) {
        continue;
      }

      bestCosts.set(key, nextCost);
      bestStaminaCosts.set(key, nextStaminaCost);
      previous.set(key, currentKey);
      frontier.push({ x: nextX, y: nextY, moveCost: nextCost, staminaCost: nextStaminaCost });
    }
  }

  return {
    reachable,
    bestCosts,
    bestStaminaCosts,
    previous
  };
}

function parseTileKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

/**
 * Breadth-first flood fill is enough for the current board sizes and keeps
 * the movement rules readable while we are prototyping.
 */
export function getReachableTiles(state, unit, movementBudget) {
  return getMovementSearch(state, unit, movementBudget).reachable.map((tile) => ({
    x: tile.x,
    y: tile.y
  }));
}

export function getMovementDistanceMapToTiles(state, unit, targetTiles = []) {
  const frontier = [];
  const distances = new Map();
  const settled = new Set();

  for (const targetTile of targetTiles) {
    const terrainKey = state.map.tiles[targetTile.y]?.[targetTile.x];
    const terrain = TERRAIN_LIBRARY[terrainKey];

    if (isTerrainBlockedForUnit(state, unit, terrain, terrainKey)) {
      continue;
    }

    const key = tileKey(targetTile.x, targetTile.y);
    if (!distances.has(key)) {
      distances.set(key, 0);
      frontier.push({ x: targetTile.x, y: targetTile.y, distance: 0 });
    }
  }

  while (frontier.length > 0) {
    frontier.sort(
      (left, right) =>
        left.distance - right.distance ||
        left.y - right.y ||
        left.x - right.x
    );
    const current = frontier.shift();
    const currentKey = tileKey(current.x, current.y);

    if (settled.has(currentKey)) {
      continue;
    }

    settled.add(currentKey);

    const currentTerrainKey = state.map.tiles[current.y]?.[current.x];
    const currentTerrain = TERRAIN_LIBRARY[currentTerrainKey];

    if (isTerrainBlockedForUnit(state, unit, currentTerrain, currentTerrainKey)) {
      continue;
    }

    const stepStaminaCost =
      getMovementCost(state, unit, currentTerrain, currentTerrainKey) *
      getRunCardStaminaCostMultiplier(state, unit);

    for (const direction of MOVEMENT_DIRECTIONS) {
      const nextX = current.x + direction.x;
      const nextY = current.y + direction.y;
      const terrainKey = state.map.tiles[nextY]?.[nextX];
      const terrain = TERRAIN_LIBRARY[terrainKey];

      if (isTerrainBlockedForUnit(state, unit, terrain, terrainKey)) {
        continue;
      }

      const nextDistance = current.distance + stepStaminaCost;
      const key = tileKey(nextX, nextY);
      const bestKnownDistance = distances.get(key);

      if (bestKnownDistance !== undefined && bestKnownDistance <= nextDistance) {
        continue;
      }

      distances.set(key, nextDistance);
      frontier.push({ x: nextX, y: nextY, distance: nextDistance });
    }
  }

  return distances;
}

export function getMovementPath(state, unit, movementBudget, targetX, targetY) {
  const search = getMovementSearch(state, unit, movementBudget);
  const targetKey = tileKey(targetX, targetY);

  if (!search.bestCosts.has(targetKey)) {
    return [];
  }

  const path = [];
  let currentKey = targetKey;

  while (currentKey) {
    path.unshift(parseTileKey(currentKey));
    currentKey = search.previous.get(currentKey);
  }

  return path;
}

export function getMovementPathCost(state, unit, movementBudget, targetX, targetY) {
  const search = getMovementSearch(state, unit, movementBudget);
  const targetKey = tileKey(targetX, targetY);
  const staminaCost = search.bestStaminaCosts.get(targetKey);
  return staminaCost === undefined ? null : Math.ceil(staminaCost);
}

export function getTargetsInRange(state, unit, minimumRange, maximumRange) {
  const enemySide = unit.owner === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
  const targets = [];

  for (const target of getLivingUnits(state, enemySide)) {
    const distance = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);

    if (
      distance >= minimumRange &&
      distance <= maximumRange &&
      canUnitAttackTarget(unit, target)
    ) {
      targets.push(target);
    }
  }

  return targets;
}

export function canUnitAttackTarget(attacker, target) {
  if (
    !attacker ||
    !target ||
    attacker.transport?.carriedByUnitId ||
    target.transport?.carriedByUnitId
  ) {
    return false;
  }

  const attackProfile = getAttackProfileForTarget(attacker, target);

  if (!attackProfile) {
    return false;
  }

  if (getTargetProfileForAttack(attacker, target, attackProfile)) {
    return true;
  }

  return false;
}

export function getTilesInRange(state, originX, originY, minimumRange, maximumRange) {
  const tiles = [];

  for (let row = 0; row < state.map.height; row += 1) {
    for (let column = 0; column < state.map.width; column += 1) {
      const distance = Math.abs(originX - column) + Math.abs(originY - row);

      if (distance >= minimumRange && distance <= maximumRange) {
        tiles.push({ x: column, y: row });
      }
    }
  }

  return tiles;
}

export function getRecruitmentOptions(state, building, side) {
  const unitIds = BUILDING_RECRUITMENT[building.type] ?? [];

  return unitIds.map((unitId) => {
    const baseUnit = UNIT_CATALOG[unitId];
    return {
      ...baseUnit,
      adjustedCost: Math.max(100, baseUnit.cost - side.recruitDiscount)
    };
  });
}
