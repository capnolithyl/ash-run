import {
  ENEMY_STARTING_FUNDS,
  PLAYER_STARTING_FUNDS,
  PROTOTYPE_ROSTER_CAP,
  PROTOTYPE_RUN_GOAL,
  TURN_SIDES
} from "../core/constants.js";
import { getBuildingIncomeForSide } from "../core/economy.js";
import { createId } from "../core/id.js";
import { pickOne, shuffle, stringToSeed } from "../core/random.js";
import { COMMANDERS } from "../content/commanders.js";
import { MAP_POOL, getMapById } from "../content/maps.js";
import { createUnitFromType, createPersistentUnitSnapshot, deployPersistentUnit } from "../simulation/unitFactory.js";

const STARTER_ROSTERS = {
  atlas: ["grunt", "runner", "longshot"],
  viper: ["grunt", "breaker", "longshot"],
  rook: ["grunt", "grunt", "bruiser"],
  echo: ["grunt", "longshot", "runner"],
  blaze: ["grunt", "runner", "runner"],
  knox: ["grunt", "breaker", "bruiser"],
  falcon: ["grunt", "gunship", "longshot"],
  graves: ["grunt", "grunt", "breaker"],
  nova: ["longshot", "runner", "gunship"],
  sable: ["grunt", "breaker", "runner"]
};

function buildStarterRoster(commanderId) {
  return (STARTER_ROSTERS[commanderId] ?? STARTER_ROSTERS.viper).map((unitTypeId) =>
    createPersistentUnitSnapshot(createUnitFromType(unitTypeId, TURN_SIDES.PLAYER))
  );
}

function buildEnemyRoster(commanderId, difficultyTier) {
  const roster = (STARTER_ROSTERS[commanderId] ?? STARTER_ROSTERS.atlas)
    .map((unitTypeId) => createUnitFromType(unitTypeId, TURN_SIDES.ENEMY));

  if (difficultyTier >= 3) {
    roster.push(createUnitFromType("bruiser", TURN_SIDES.ENEMY));
  }

  if (difficultyTier >= 6) {
    roster.push(createUnitFromType("skyguard", TURN_SIDES.ENEMY));
  }

  return roster;
}

function buildMapSequence(seed, targetMapCount) {
  const shuffled = shuffle(seed, MAP_POOL.map((mapDefinition) => mapDefinition.id));
  return shuffled.value.slice(0, Math.max(targetMapCount, 10));
}

function createPlayerBattleRoster(runState, mapDefinition) {
  const roster = (runState.roster.length > 0 ? runState.roster : buildStarterRoster(runState.commanderId))
    .slice(0, PROTOTYPE_ROSTER_CAP);

  return roster.map((unit, index) =>
    deployPersistentUnit(
      unit,
      TURN_SIDES.PLAYER,
      mapDefinition.playerSpawns[index % mapDefinition.playerSpawns.length]
    )
  );
}

function createEnemyBattleRoster(runState, mapDefinition, enemyCommanderId) {
  const difficultyTier = runState.mapIndex + 1;

  return buildEnemyRoster(enemyCommanderId, difficultyTier).map((unit, index) => ({
    ...unit,
    x: mapDefinition.enemySpawns[index % mapDefinition.enemySpawns.length].x,
    y: mapDefinition.enemySpawns[index % mapDefinition.enemySpawns.length].y
  }));
}

function pickEnemyCommander(seed, commanderId) {
  const candidates = COMMANDERS.filter((commander) => commander.id !== commanderId);
  return pickOne(seed, candidates).value.id;
}

export function createNewRunState({ slotId, commanderId }) {
  const seed = stringToSeed(`${commanderId}-${slotId}-${Date.now()}`);
  const targetMapCount = PROTOTYPE_RUN_GOAL;

  return {
    id: createId("run"),
    seed,
    slotId,
    commanderId,
    mapIndex: 0,
    totalTurns: 0,
    targetMapCount,
    mapSequence: buildMapSequence(seed, targetMapCount),
    roster: [],
    completedMaps: []
  };
}

export function createBattleStateForRun(runState) {
  const mapId = runState.mapSequence[runState.mapIndex % runState.mapSequence.length];
  const mapDefinition = structuredClone(getMapById(mapId));
  const enemyCommanderId = pickEnemyCommander(runState.seed + runState.mapIndex, runState.commanderId);
  const playerOpeningFunds =
    PLAYER_STARTING_FUNDS + getBuildingIncomeForSide(mapDefinition.buildings, TURN_SIDES.PLAYER);

  return {
    id: createId("battle"),
    seed: runState.seed + runState.mapIndex,
    map: mapDefinition,
    turn: {
      number: 1,
      activeSide: TURN_SIDES.PLAYER
    },
    player: {
      commanderId: runState.commanderId,
      funds: playerOpeningFunds,
      charge: 0,
      recruitDiscount: 0,
      units: createPlayerBattleRoster(runState, mapDefinition)
    },
    enemy: {
      commanderId: enemyCommanderId,
      funds: ENEMY_STARTING_FUNDS,
      charge: 0,
      recruitDiscount: 0,
      units: createEnemyBattleRoster(runState, mapDefinition, enemyCommanderId)
    },
    selection: {
      type: null,
      id: null,
      x: null,
      y: null
    },
    pendingAction: null,
    enemyTurn: null,
    levelUpQueue: [],
    log: [
      `${runState.mapIndex + 1}/${runState.targetMapCount}: ${mapDefinition.name}`
    ],
    victory: null
  };
}

export function createSlotRecord(runState, battleState) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    summary: {
      commanderId: runState.commanderId,
      mapIndex: runState.mapIndex + 1,
      targetMapCount: runState.targetMapCount,
      mapName: battleState?.map?.name ?? "No active map",
      totalTurns: runState.totalTurns ?? 0
    },
    runState,
    battleState
  };
}

function extractRosterFromBattle(battleState) {
  return battleState.player.units
    .filter((unit) => unit.current.hp > 0)
    .map((unit) => createPersistentUnitSnapshot(unit));
}

export function applyBattleVictoryToRun(runState, battleState) {
  return {
    ...structuredClone(runState),
    totalTurns: (runState.totalTurns ?? 0) + battleState.turn.number,
    roster: extractRosterFromBattle(battleState),
    completedMaps: [...runState.completedMaps, battleState.map.id],
    mapIndex: runState.mapIndex + 1
  };
}

export function isRunComplete(runState) {
  return runState.mapIndex >= runState.targetMapCount;
}
