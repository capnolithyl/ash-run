import {
  PLAYER_STARTING_FUNDS,
  PROTOTYPE_ROSTER_CAP,
  PROTOTYPE_RUN_GOAL,
  TURN_SIDES,
  UNIT_TAGS
} from "../core/constants.js";
import { getBuildingIncomeForSide } from "../core/economy.js";
import { createId } from "../core/id.js";
import { pickOne, shuffle, stringToSeed } from "../core/random.js";
import { COMMANDERS } from "../content/commanders.js";
import { BUILDING_RECRUITMENT, UNIT_CATALOG } from "../content/unitCatalog.js";
import { MAP_POOL, getMapById } from "../content/maps.js";
import { createPersistentUnitSnapshot, createUnitFromType } from "../simulation/unitFactory.js";
import {
  deployPersistentRoster,
  findOpenDeploymentPoint,
  getOccupiedTiles,
  placeFreshUnits
} from "./deployment.js";
import {
  applyEnemyMapControlScaling,
  buildScaledEnemyRoster,
  getEnemyStartingFunds
} from "./enemyScaling.js";
import { buildPersistentStarterRoster, getCommanderStarterUnitIds } from "./rosters.js";

const ANTI_AIR_UNIT_IDS = new Set(["skyguard", "interceptor"]);

function buildEnemyRoster(commanderId, difficultyTier) {
  return buildScaledEnemyRoster(getCommanderStarterUnitIds(commanderId), difficultyTier);
}

function buildMapSequence(seed, targetMapCount) {
  const shuffled = shuffle(seed, MAP_POOL.map((mapDefinition) => mapDefinition.id));
  return shuffled.value.slice(0, Math.max(targetMapCount, 10));
}

function createPlayerBattleRoster(runState, mapDefinition) {
  const roster = (
    runState.roster.length > 0
      ? runState.roster
      : buildPersistentStarterRoster(runState.commanderId)
  ).slice(0, PROTOTYPE_ROSTER_CAP);

  return deployPersistentRoster(roster, TURN_SIDES.PLAYER, mapDefinition, mapDefinition.playerSpawns);
}

function createEnemyBattleRoster(runState, mapDefinition, enemyCommanderId) {
  const difficultyTier = runState.mapIndex + 1;

  return placeFreshUnits(
    buildEnemyRoster(enemyCommanderId, difficultyTier),
    mapDefinition,
    mapDefinition.enemySpawns
  );
}

function hasAirThreat(units) {
  return units.some((unit) => unit.family === UNIT_TAGS.AIR);
}

function hasAntiAirCounter(units) {
  return units.some((unit) => ANTI_AIR_UNIT_IDS.has(unit.unitTypeId));
}

function canRecruitAntiAirNow(mapDefinition, playerOpeningFunds) {
  return mapDefinition.buildings
    .filter((building) => building.owner === TURN_SIDES.PLAYER)
    .some((building) =>
      (BUILDING_RECRUITMENT[building.type] ?? []).some(
        (unitTypeId) =>
          ANTI_AIR_UNIT_IDS.has(unitTypeId) &&
          UNIT_CATALOG[unitTypeId].cost <= playerOpeningFunds
      )
    );
}

function addEmergencyAntiAirIfNeeded(playerUnits, enemyUnits, mapDefinition, playerOpeningFunds) {
  if (
    !hasAirThreat(enemyUnits) ||
    hasAntiAirCounter(playerUnits) ||
    canRecruitAntiAirNow(mapDefinition, playerOpeningFunds)
  ) {
    return {
      units: playerUnits,
      addedUnit: null
    };
  }

  const replacementIndex =
    playerUnits.length >= PROTOTYPE_ROSTER_CAP
      ? Math.max(0, playerUnits.findIndex((unit) => unit.family !== UNIT_TAGS.AIR))
      : playerUnits.length;
  const spawnPoint =
    playerUnits[replacementIndex] ??
    findOpenDeploymentPoint(
      mapDefinition,
      createUnitFromType("skyguard", TURN_SIDES.PLAYER),
      mapDefinition.playerSpawns[replacementIndex % mapDefinition.playerSpawns.length],
      getOccupiedTiles(playerUnits)
    );
  const skyguard = createUnitFromType("skyguard", TURN_SIDES.PLAYER);
  skyguard.x = spawnPoint.x;
  skyguard.y = spawnPoint.y;
  const units = [...playerUnits];
  units[replacementIndex] = skyguard;

  return {
    units,
    addedUnit: skyguard
  };
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
  const difficultyTier = runState.mapIndex + 1;
  const enemyCommanderId = pickEnemyCommander(runState.seed + runState.mapIndex, runState.commanderId);
  const capturedBuildings = applyEnemyMapControlScaling(mapDefinition, difficultyTier);
  const playerOpeningFunds =
    PLAYER_STARTING_FUNDS + getBuildingIncomeForSide(mapDefinition.buildings, TURN_SIDES.PLAYER);
  const playerUnits = createPlayerBattleRoster(runState, mapDefinition);
  const enemyUnits = createEnemyBattleRoster(runState, mapDefinition, enemyCommanderId);
  const antiAirSafety = addEmergencyAntiAirIfNeeded(
    playerUnits,
    enemyUnits,
    mapDefinition,
    playerOpeningFunds
  );
  const openingLog = [`${runState.mapIndex + 1}/${runState.targetMapCount}: ${mapDefinition.name}`];

  if (difficultyTier > 1) {
    openingLog.push(`Enemy pressure increased to tier ${difficultyTier}.`);
  }

  if (capturedBuildings.length > 0) {
    openingLog.push(
      `Enemy opened with ${capturedBuildings.length} forward sector${
        capturedBuildings.length === 1 ? "" : "s"
      }.`
    );
  }

  if (antiAirSafety.addedUnit) {
    openingLog.push("Anti-air escort assigned to answer enemy air power.");
  }

  return {
    id: createId("battle"),
    seed: runState.seed + runState.mapIndex,
    difficultyTier,
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
      units: antiAirSafety.units
    },
    enemy: {
      commanderId: enemyCommanderId,
      funds: getEnemyStartingFunds(difficultyTier),
      charge: 0,
      recruitDiscount: 0,
      recruitsBuiltThisMap: 0,
      units: enemyUnits
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
    log: openingLog,
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
