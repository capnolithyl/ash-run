import { UNIT_TAGS } from "../core/constants.js";
import { TERRAIN_LIBRARY } from "./terrain.js";
import { UNIT_CATALOG } from "./unitCatalog.js";

export const REINFORCEMENT_TRIGGER_TYPES = {
  RESCUE_PICKED_UP: "rescue-picked-up",
  TILE_CROSSED: "tile-crossed",
  UNIT_KILLED: "unit-killed",
  ENEMY_CASUALTIES: "enemy-casualties",
  PLAYER_TURNS_COMPLETED: "player-turns-completed"
};

export const REINFORCEMENT_TRIGGER_ORDER = [
  REINFORCEMENT_TRIGGER_TYPES.RESCUE_PICKED_UP,
  REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED,
  REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED,
  REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES,
  REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED
];

const REINFORCEMENT_MAX_ACTIVATIONS = 99;
const REINFORCEMENT_MAX_INTERVAL = 99;

const ONE_SHOT_TRIGGER_TYPES = new Set([
  REINFORCEMENT_TRIGGER_TYPES.RESCUE_PICKED_UP,
  REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED
]);

const INTERVAL_TRIGGER_TYPES = new Set([
  REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES,
  REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED
]);

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

function sanitizeText(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function sanitizeId(value, fallback) {
  return sanitizeText(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || fallback;
}

function isInsideMap(mapData, x, y) {
  return (
    Boolean(mapData) &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < mapData.width &&
    y < mapData.height
  );
}

function tileKey(point) {
  return `${point.x},${point.y}`;
}

export function isOneShotReinforcementTrigger(triggerType) {
  return ONE_SHOT_TRIGGER_TYPES.has(triggerType);
}

export function isIntervalReinforcementTrigger(triggerType) {
  return INTERVAL_TRIGGER_TYPES.has(triggerType);
}

export function getReinforcementTriggerLabel(triggerType) {
  switch (triggerType) {
    case REINFORCEMENT_TRIGGER_TYPES.RESCUE_PICKED_UP:
      return "Hostage Picked Up";
    case REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED:
      return "Tile Crossed";
    case REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED:
      return "Specific Unit Killed";
    case REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES:
      return "Enemy Casualties";
    case REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED:
      return "Player Turns Completed";
    default:
      return "Reinforcement Trigger";
  }
}

export function isValidReinforcementUnitTile(mapData, unitTypeId, x, y) {
  if (!isInsideMap(mapData, x, y) || !Object.hasOwn(UNIT_CATALOG, unitTypeId)) {
    return false;
  }

  const terrain = TERRAIN_LIBRARY[mapData.tiles?.[y]?.[x]];
  const family = UNIT_CATALOG[unitTypeId].family;

  if (!terrain) {
    return false;
  }

  if (family === UNIT_TAGS.AIR) {
    return true;
  }

  return !terrain.blocksGround && !(terrain.blockedFamilies ?? []).includes(family);
}

function normalizeTriggerTiles(tiles, mapData) {
  const unique = [];
  const seen = new Set();

  for (const tile of tiles ?? []) {
    if (!isInsideMap(mapData, tile?.x, tile?.y)) {
      continue;
    }

    const normalized = { x: tile.x, y: tile.y };
    const key = tileKey(normalized);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function normalizeReinforcementTrigger(triggerInput, mapData) {
  const requestedType = triggerInput?.type;
  const type = REINFORCEMENT_TRIGGER_ORDER.includes(requestedType)
    ? requestedType
    : REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED;
  const trigger = { type };

  if (type === REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED) {
    trigger.tiles = normalizeTriggerTiles(triggerInput?.tiles, mapData);
  }

  if (type === REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED) {
    trigger.targetUnitId = sanitizeText(triggerInput?.targetUnitId, "");
  }

  if (isIntervalReinforcementTrigger(type)) {
    trigger.every = clampInteger(
      triggerInput?.every,
      1,
      REINFORCEMENT_MAX_INTERVAL,
      1
    );
  }

  return trigger;
}

function normalizeWaveUnits(units, mapData, waveId) {
  const normalized = [];
  const occupied = new Set();

  for (const [index, unit] of (units ?? []).entries()) {
    if (
      !Object.hasOwn(UNIT_CATALOG, unit?.unitTypeId) ||
      !isValidReinforcementUnitTile(mapData, unit.unitTypeId, unit.x, unit.y)
    ) {
      continue;
    }

    const key = tileKey(unit);
    if (occupied.has(key)) {
      continue;
    }

    occupied.add(key);
    normalized.push({
      id: sanitizeId(
        unit.id,
        `${waveId}-${unit.unitTypeId}-${unit.x}-${unit.y}-${index + 1}`
      ),
      unitTypeId: unit.unitTypeId,
      level: clampInteger(unit.level, 1, 99, 1),
      x: unit.x,
      y: unit.y
    });
  }

  return normalized;
}

function buildReinforcementWaveId(reinforcements = []) {
  const usedIds = new Set((reinforcements ?? []).map((wave) => wave.id));
  let index = 1;

  while (usedIds.has(`wave-${index}`)) {
    index += 1;
  }

  return `wave-${index}`;
}

export function createDefaultReinforcementWave(reinforcements = []) {
  const id = buildReinforcementWaveId(reinforcements);

  return {
    id,
    name: `Wave ${id.replace("wave-", "")}`,
    maxActivations: 1,
    trigger: {
      type: REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED,
      every: 1
    },
    units: []
  };
}

export function normalizeMapReinforcements(reinforcements, mapData) {
  const normalized = [];
  const usedIds = new Set();

  for (const [index, waveInput] of (reinforcements ?? []).entries()) {
    const fallbackId = `wave-${index + 1}`;
    const baseId = sanitizeId(waveInput?.id, fallbackId);
    let id = baseId;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);
    const trigger = normalizeReinforcementTrigger(waveInput?.trigger, mapData);
    normalized.push({
      id,
      name: sanitizeText(waveInput?.name, `Wave ${index + 1}`),
      maxActivations: isOneShotReinforcementTrigger(trigger.type)
        ? 1
        : clampInteger(
            waveInput?.maxActivations,
            1,
            REINFORCEMENT_MAX_ACTIVATIONS,
            1
          ),
      trigger,
      units: normalizeWaveUnits(waveInput?.units, mapData, id)
    });
  }

  return normalized;
}

export function getReinforcementValidationErrors(mapData, rawReinforcements = mapData?.reinforcements) {
  const errors = [];
  const startingEnemyIds = new Set(
    (mapData?.units ?? [])
      .filter((unit) => unit.owner === "enemy")
      .map((unit) => unit.id)
  );
  const seenWaveIds = new Set();

  for (const [index, wave] of (rawReinforcements ?? []).entries()) {
    const waveLabel = sanitizeText(wave?.name, `Wave ${index + 1}`);
    const waveId = sanitizeId(wave?.id, `wave-${index + 1}`);
    const triggerType = wave?.trigger?.type;

    if (seenWaveIds.has(waveId)) {
      errors.push(`${waveLabel} must have a unique wave ID.`);
    }
    seenWaveIds.add(waveId);

    if (!REINFORCEMENT_TRIGGER_ORDER.includes(triggerType)) {
      errors.push(`${waveLabel} needs a valid trigger.`);
    }

    if (!Array.isArray(wave?.units) || wave.units.length === 0) {
      errors.push(`${waveLabel} needs at least one reinforcement unit.`);
    }

    const occupied = new Set();
    const unitIds = new Set();
    for (const unit of wave?.units ?? []) {
      if (!Object.hasOwn(UNIT_CATALOG, unit?.unitTypeId)) {
        errors.push(`${waveLabel} contains an unknown reinforcement unit type.`);
        continue;
      }

      if (!isValidReinforcementUnitTile(mapData, unit.unitTypeId, unit.x, unit.y)) {
        errors.push(`${waveLabel} has a reinforcement on an invalid tile.`);
      }

      const key = tileKey(unit);
      if (occupied.has(key)) {
        errors.push(`${waveLabel} cannot place two reinforcements on the same tile.`);
      }
      occupied.add(key);

      const unitId = sanitizeId(unit?.id, "");
      if (unitId && unitIds.has(unitId)) {
        errors.push(`${waveLabel} must give each reinforcement a unique unit ID.`);
      }
      if (unitId) {
        unitIds.add(unitId);
      }
    }

    if (
      triggerType === REINFORCEMENT_TRIGGER_TYPES.RESCUE_PICKED_UP &&
      mapData?.goal?.type !== "rescue"
    ) {
      errors.push(`${waveLabel} can use Hostage Picked Up only on a rescue map.`);
    }

    if (triggerType === REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED) {
      if (!Array.isArray(wave?.trigger?.tiles) || wave.trigger.tiles.length === 0) {
        errors.push(`${waveLabel} needs at least one trigger tile.`);
      }

      if (
        (wave?.trigger?.tiles ?? []).some(
          (tile) => !isInsideMap(mapData, tile?.x, tile?.y)
        )
      ) {
        errors.push(`${waveLabel} contains an invalid trigger tile.`);
      }
    }

    if (triggerType === REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED) {
      if (!startingEnemyIds.has(wave?.trigger?.targetUnitId)) {
        errors.push(`${waveLabel} must target a placed enemy unit.`);
      }
    }

    if (
      isIntervalReinforcementTrigger(triggerType) &&
      (
        !Number.isInteger(Number(wave?.trigger?.every)) ||
        Number(wave.trigger.every) < 1 ||
        Number(wave.trigger.every) > REINFORCEMENT_MAX_INTERVAL
      )
    ) {
      errors.push(`${waveLabel} needs an interval from 1 to ${REINFORCEMENT_MAX_INTERVAL}.`);
    }

    if (
      !isOneShotReinforcementTrigger(triggerType) &&
      (
        !Number.isInteger(Number(wave?.maxActivations)) ||
        Number(wave.maxActivations) < 1 ||
        Number(wave.maxActivations) > REINFORCEMENT_MAX_ACTIVATIONS
      )
    ) {
      errors.push(
        `${waveLabel} needs an activation limit from 1 to ${REINFORCEMENT_MAX_ACTIVATIONS}.`
      );
    }
  }

  return errors;
}
