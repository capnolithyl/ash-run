import { stringToSeed } from "../core/random.js";
import { TURN_SIDES } from "../core/constants.js";
import {
  normalizeMapReinforcements,
  REINFORCEMENT_TRIGGER_TYPES
} from "../content/reinforcements.js";
import {
  findAvailableDeploymentPoint,
  getOccupiedTiles
} from "../state/deployment.js";
import { appendLog } from "./battleLog.js";
import { createUnitFromTypeAtLevel } from "./unitFactory.js";

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value))];
}

function getCurrentEnemyUnitIds(state) {
  return (state.enemy?.units ?? [])
    .filter((unit) => unit.current?.hp > 0)
    .map((unit) => unit.id);
}

function getInitialKnownEnemyUnitIds(state) {
  return uniqueStrings([
    ...(state.map?.units ?? [])
      .filter((unit) => unit.owner === TURN_SIDES.ENEMY)
      .map((unit) => unit.id),
    ...getCurrentEnemyUnitIds(state)
  ]);
}

export function normalizeReinforcementState(state) {
  if (!state?.map) {
    return null;
  }

  state.map.reinforcements = normalizeMapReinforcements(
    state.map.reinforcements,
    state.map
  );

  const existing = state.reinforcementState;
  const activationsByWaveId = {};

  for (const wave of state.map.reinforcements) {
    const count = Number(existing?.activationsByWaveId?.[wave.id]);
    activationsByWaveId[wave.id] = Number.isInteger(count)
      ? Math.max(0, Math.min(wave.maxActivations, count))
      : 0;
  }

  state.reinforcementState = {
    activationsByWaveId,
    enemyCasualties: Math.max(0, Math.floor(Number(existing?.enemyCasualties) || 0)),
    knownEnemyUnitIds: uniqueStrings(
      existing?.knownEnemyUnitIds ?? getInitialKnownEnemyUnitIds(state)
    ),
    defeatedEnemyUnitIds: uniqueStrings(existing?.defeatedEnemyUnitIds)
  };

  for (const unitId of getCurrentEnemyUnitIds(state)) {
    if (!state.reinforcementState.knownEnemyUnitIds.includes(unitId)) {
      state.reinforcementState.knownEnemyUnitIds.push(unitId);
    }
  }

  return state.reinforcementState;
}

function synchronizeReinforcementCasualties(state) {
  const reinforcementState = normalizeReinforcementState(state);
  if (!reinforcementState) {
    return [];
  }

  const aliveEnemyIds = new Set(getCurrentEnemyUnitIds(state));
  const defeatedEnemyIds = new Set(reinforcementState.defeatedEnemyUnitIds);
  const newlyDefeated = [];

  for (const unitId of reinforcementState.knownEnemyUnitIds) {
    if (!aliveEnemyIds.has(unitId) && !defeatedEnemyIds.has(unitId)) {
      defeatedEnemyIds.add(unitId);
      newlyDefeated.push(unitId);
    }
  }

  reinforcementState.defeatedEnemyUnitIds = [...defeatedEnemyIds];
  reinforcementState.enemyCasualties += newlyDefeated.length;
  return newlyDefeated;
}

function getOccupiedBattleTiles(state) {
  return getOccupiedTiles(
    [...(state.player?.units ?? []), ...(state.enemy?.units ?? [])].filter(
      (unit) => unit.current?.hp > 0 && !unit.transport?.carriedByUnitId
    )
  );
}

function createReinforcementUnit(state, wave, authoredUnit, activationNumber, unitIndex) {
  const id = `${wave.id}-activation-${activationNumber}-${unitIndex + 1}-${authoredUnit.id || "unit"}`;
  const seed = stringToSeed(
    `${state.seed}-${state.map.id}-${wave.id}-${activationNumber}-${authoredUnit.id}-${authoredUnit.level}`
  );
  const unit = createUnitFromTypeAtLevel(
    authoredUnit.unitTypeId,
    TURN_SIDES.ENEMY,
    authoredUnit.level,
    seed
  );

  unit.id = id;
  return unit;
}

function deployReinforcementWave(state, wave, options = {}) {
  const reinforcementState = normalizeReinforcementState(state);
  const previousCount = reinforcementState.activationsByWaveId[wave.id] ?? 0;
  const activationNumber = previousCount + 1;
  const occupiedTiles = getOccupiedBattleTiles(state);
  const deployments = [];
  const skippedUnits = [];

  reinforcementState.activationsByWaveId[wave.id] = activationNumber;

  for (const [unitIndex, authoredUnit] of wave.units.entries()) {
    const unit = createReinforcementUnit(
      state,
      wave,
      authoredUnit,
      activationNumber,
      unitIndex
    );
    const spawnPoint = findAvailableDeploymentPoint(
      state.map,
      unit,
      authoredUnit,
      occupiedTiles
    );

    if (!spawnPoint) {
      skippedUnits.push(authoredUnit);
      continue;
    }

    unit.x = spawnPoint.x;
    unit.y = spawnPoint.y;
    unit.hasMoved = !options.allowImmediateEnemyActions;
    unit.hasAttacked = !options.allowImmediateEnemyActions;
    occupiedTiles.add(`${unit.x},${unit.y}`);
    state.enemy.units.push(unit);
    reinforcementState.knownEnemyUnitIds.push(unit.id);
    deployments.push({
      unitId: unit.id,
      unitTypeId: unit.unitTypeId,
      waveId: wave.id,
      activationNumber,
      x: unit.x,
      y: unit.y
    });
  }

  appendLog(
    state,
    `Enemy reinforcements arrived: ${wave.name} (${deployments.length} deployed).`
  );

  for (const authoredUnit of skippedUnits) {
    appendLog(
      state,
      `${wave.name} could not deploy ${authoredUnit.unitTypeId}; no valid tile was open.`
    );
  }

  return {
    waveId: wave.id,
    activationNumber,
    deployments,
    skippedUnitCount: skippedUnits.length
  };
}

function isWaveAvailable(state, wave) {
  const activations = state.reinforcementState.activationsByWaveId[wave.id] ?? 0;
  return activations < wave.maxActivations;
}

function getIntervalActivationCount(state, wave, progress) {
  const activations = state.reinforcementState.activationsByWaveId[wave.id] ?? 0;
  const every = Math.max(1, wave.trigger.every ?? 1);
  const reachedActivations = Math.floor(progress / every);
  return Math.max(0, Math.min(wave.maxActivations, reachedActivations) - activations);
}

function pathCrossesWave(path, wave) {
  const triggerTiles = new Set(
    (wave.trigger.tiles ?? []).map((tile) => `${tile.x},${tile.y}`)
  );

  return (path ?? []).some((tile) => triggerTiles.has(`${tile.x},${tile.y}`));
}

function getWaveActivationCountForContext(state, wave, context) {
  if (!isWaveAvailable(state, wave)) {
    return 0;
  }

  const trigger = wave.trigger;
  const defeatedEnemyIds = new Set(state.reinforcementState.defeatedEnemyUnitIds);

  switch (trigger.type) {
    case REINFORCEMENT_TRIGGER_TYPES.RESCUE_PICKED_UP:
      return ["carried", "delivered"].includes(state.mission?.rescue?.status) ? 1 : 0;
    case REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED:
      return context.type === "tile-crossed" && pathCrossesWave(context.path, wave) ? 1 : 0;
    case REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED:
      return defeatedEnemyIds.has(trigger.targetUnitId) ? 1 : 0;
    case REINFORCEMENT_TRIGGER_TYPES.ENEMY_CASUALTIES:
      return getIntervalActivationCount(
        state,
        wave,
        state.reinforcementState.enemyCasualties
      );
    case REINFORCEMENT_TRIGGER_TYPES.PLAYER_TURNS_COMPLETED:
      return context.type === "enemy-turn-start"
        ? getIntervalActivationCount(state, wave, Math.max(0, state.turn.number - 1))
        : 0;
    default:
      return 0;
  }
}

export function resolveReinforcementTriggers(state, context = { type: "state" }) {
  normalizeReinforcementState(state);
  synchronizeReinforcementCasualties(state);

  const activations = [];

  for (const wave of state.map.reinforcements) {
    const activationCount = getWaveActivationCountForContext(state, wave, context);

    for (let index = 0; index < activationCount; index += 1) {
      activations.push(
        deployReinforcementWave(state, wave, {
          allowImmediateEnemyActions: context.allowImmediateEnemyActions === true
        })
      );
    }
  }

  return activations;
}

export function resolveReinforcementTileCrossing(state, path) {
  return resolveReinforcementTriggers(state, {
    type: "tile-crossed",
    path
  });
}

export function resolveEnemyTurnStartReinforcements(state) {
  return resolveReinforcementTriggers(state, {
    type: "enemy-turn-start",
    allowImmediateEnemyActions: true
  });
}
