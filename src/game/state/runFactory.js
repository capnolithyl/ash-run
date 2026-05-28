import {
  BATTLE_MODES,
  ENEMY_AI_ARCHETYPES,
  ENEMY_AI_ARCHETYPE_ORDER,
  ENEMY_STARTING_FUNDS,
  PROTOTYPE_RUN_GOAL,
  TURN_SIDES,
  UNIT_TAGS
} from "../core/constants.js";
import { MAP_GOAL_TYPES } from "../content/mapGoals.js";
import { getBuildingIncomeForSide } from "../core/economy.js";
import { createId } from "../core/id.js";
import { pickOne, pickWeighted, shuffle, stringToSeed } from "../core/random.js";
import {
  COMMANDERS,
  getCommanderEnemyAiWeights
} from "../content/commanders.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import {
  RUN_CARD_TYPES,
  RUN_UPGRADES,
  isGearUpgrade,
  getRunRewardTypeForMap
} from "../content/runUpgrades.js";
import { MAP_POOL, getMapById, getRunMapPoolForStage } from "../content/maps.js";
import {
  createPersistentUnitSnapshot,
  createUnitFromTypeAtLevel
} from "../simulation/unitFactory.js";
import {
  deployPersistentRoster,
  getOccupiedTiles
} from "./deployment.js";
import {
  applyEnemyMapControlScaling,
  getEnemyStartingFunds
} from "./enemyScaling.js";
import { normalizeMissionState } from "../simulation/missionRules.js";

function toSafeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function createEmptyIntelLedger() {
  return {
    capture: 0,
    mapClear: 0,
    runClearBonus: 0,
    total: 0
  };
}

function normalizeIntelLedger(intelLedger) {
  const nextLedger = {
    ...createEmptyIntelLedger(),
    ...(intelLedger ?? {})
  };
  nextLedger.capture = toSafeNumber(nextLedger.capture);
  nextLedger.mapClear = toSafeNumber(nextLedger.mapClear);
  nextLedger.runClearBonus = toSafeNumber(nextLedger.runClearBonus);
  nextLedger.total = toSafeNumber(nextLedger.total);
  return nextLedger;
}

export function addRunIntel(runState, ledgerKey, amount) {
  const reward = Math.max(0, Number(amount) || 0);

  if (!reward) {
    return normalizeRunState(runState);
  }

  const nextRunState = normalizeRunState(runState);
  nextRunState.intelLedger[ledgerKey] = toSafeNumber(nextRunState.intelLedger[ledgerKey]) + reward;
  nextRunState.intelLedger.total += reward;
  return nextRunState;
}

export function createEmptyBattleRewardLedger() {
  return {
    captureIntel: 0,
    captureExperience: 0,
    rewardedCaptureBuildingIds: [],
    forfeited: false
  };
}

function normalizeBattleRewardLedger(rewardLedger) {
  const nextRewardLedger = {
    ...createEmptyBattleRewardLedger(),
    ...(rewardLedger ?? {})
  };
  nextRewardLedger.captureIntel = toSafeNumber(nextRewardLedger.captureIntel);
  nextRewardLedger.captureExperience = toSafeNumber(nextRewardLedger.captureExperience);
  nextRewardLedger.rewardedCaptureBuildingIds = Array.isArray(nextRewardLedger.rewardedCaptureBuildingIds)
    ? [...nextRewardLedger.rewardedCaptureBuildingIds]
    : [];
  nextRewardLedger.forfeited = Boolean(nextRewardLedger.forfeited);
  return nextRewardLedger;
}

export function normalizeRunState(runState) {
  if (!runState) {
    return null;
  }

  return {
    ...structuredClone(runState),
    roster: [...(runState.roster ?? [])],
    completedMaps: [...(runState.completedMaps ?? [])],
    runUpgrades: [...(runState.runUpgrades ?? [])],
    availableRunCardIds: [...(runState.availableRunCardIds ?? [])],
    availableDraftUnitIds: [...(runState.availableDraftUnitIds ?? [])],
    selectedRewards: [...(runState.selectedRewards ?? [])],
    pendingRewardChoices: [...(runState.pendingRewardChoices ?? [])],
    pendingGearReward: runState.pendingGearReward ? structuredClone(runState.pendingGearReward) : null,
    intelLedger: normalizeIntelLedger(runState.intelLedger)
  };
}

export function normalizeBattleState(battleState) {
  if (!battleState) {
    return null;
  }

  const nextBattleState = structuredClone(battleState);
  nextBattleState.enemy ??= {};
  nextBattleState.enemy.aiArchetype ??= ENEMY_AI_ARCHETYPES.BALANCED;
  if (!ENEMY_AI_ARCHETYPE_ORDER.includes(nextBattleState.enemy.aiArchetype)) {
    nextBattleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.BALANCED;
  }

  if (nextBattleState.mode === BATTLE_MODES.RUN) {
    nextBattleState.rewardLedger = normalizeBattleRewardLedger(nextBattleState.rewardLedger);
  }

  normalizeMissionState(nextBattleState);

  if (nextBattleState.mission?.type === MAP_GOAL_TYPES.SURVIVE) {
    nextBattleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE;
  }

  return nextBattleState;
}

function createBattleUnitFromMapPlacement(unitDefinition, seed = 0) {
  const unit = createUnitFromTypeAtLevel(
    unitDefinition.unitTypeId,
    unitDefinition.owner,
    unitDefinition.level ?? 1,
    seed
  );

  return {
    ...unit,
    id: unitDefinition.id,
    x: unitDefinition.x,
    y: unitDefinition.y,
    current: {
      ...unit.current
    }
  };
}

function getMapPlacementSeed(seed, mapDefinition, unitDefinition) {
  return stringToSeed(`${seed}-${mapDefinition.id}-${unitDefinition.id}-${unitDefinition.level ?? 1}`);
}

function getPlacedBattleUnitsForSide(mapDefinition, owner, seed = 0) {
  return (mapDefinition.units ?? [])
    .filter((unit) => unit.owner === owner)
    .map((unit) => createBattleUnitFromMapPlacement(
      unit,
      getMapPlacementSeed(seed, mapDefinition, unit)
    ));
}

function buildMapSequence(seed, targetMapCount) {
  const sequence = [];
  const usedMapIds = new Set();
  const mapCount = Math.max(targetMapCount, 10);

  for (let stage = 1; stage <= mapCount; stage += 1) {
    const candidates = getRunMapPoolForStage(stage);

    if (candidates.length === 0) {
      continue;
    }

    const shuffled = shuffle(
      stringToSeed(`${seed}-${stage}-run-map`),
      candidates.map((mapDefinition) => mapDefinition.id)
    ).value;
    const selectedMapId = shuffled.find((mapId) => !usedMapIds.has(mapId)) ?? shuffled[0];

    if (selectedMapId) {
      sequence.push(selectedMapId);
      usedMapIds.add(selectedMapId);
    }
  }

  return sequence;
}

function createPlayerBattleRoster(runState, mapDefinition, occupiedTiles = new Set()) {
  const roster = runState.roster ?? [];

  return deployPersistentRoster(
    roster,
    TURN_SIDES.PLAYER,
    mapDefinition,
    mapDefinition.playerSpawns,
    { occupiedTiles }
  );
}

function createEnemyBattleRoster(mapDefinition, seed) {
  return getPlacedBattleUnitsForSide(mapDefinition, TURN_SIDES.ENEMY, seed);
}

function applyRunRewardsToUnits(runState, units) {
  const rewards = runState.selectedRewards ?? [];
  if (rewards.length === 0) {
    return units;
  }

  return units.map((unit) => {
    const nextUnit = structuredClone(unit);

    for (const reward of rewards) {
      if (reward.id === "passive-drill" && nextUnit.family === UNIT_TAGS.INFANTRY) {
        nextUnit.stats.movement += 1;
      }

      if (reward.id === "passive-plating" && nextUnit.family === UNIT_TAGS.VEHICLE) {
        nextUnit.stats.armor += 1;
      }
    }

    nextUnit.current = {
      hp: nextUnit.stats.maxHealth,
      stamina: nextUnit.stats.staminaMax,
      ammo: nextUnit.stats.ammoMax
    };

    return nextUnit;
  });
}

function pickEnemyCommander(seed, commanderId) {
  const candidates = COMMANDERS.filter((commander) => commander.id !== commanderId);
  return pickOne(seed, candidates).value.id;
}

function pickEnemyAiArchetype(seed, commanderId) {
  const weights = getCommanderEnemyAiWeights(commanderId);
  const weightedArchetypes = ENEMY_AI_ARCHETYPE_ORDER.map((archetype, index) => ({
    value: archetype,
    weight: weights[index]
  }));
  const roll = pickWeighted(stringToSeed(`${seed}-${commanderId}-enemy-ai`), weightedArchetypes);
  return roll.value ?? ENEMY_AI_ARCHETYPES.BALANCED;
}

function createIncomeTable(fundsPerBuilding) {
  return {
    sector: fundsPerBuilding,
    command: fundsPerBuilding,
    barracks: fundsPerBuilding,
    "motor-pool": fundsPerBuilding,
    airfield: fundsPerBuilding,
    hospital: fundsPerBuilding,
    "repair-station": fundsPerBuilding
  };
}

function resolveRunMapId(mapId) {
  if (!mapId || mapId.endsWith("-run")) {
    return mapId;
  }

  return getMapById(`${mapId}-run`) ? `${mapId}-run` : mapId;
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
    completedMaps: [],
    runUpgrades: [],
    availableRunCardIds: [],
    availableDraftUnitIds: [],
    selectedRewards: [],
    pendingRewardChoices: [],
    pendingGearReward: null,
    intelLedger: createEmptyIntelLedger()
  };
}

export function createBattleStateForRun(runState) {
  const normalizedRunState = normalizeRunState(runState);
  const mapId = resolveRunMapId(
    normalizedRunState.mapSequence[normalizedRunState.mapIndex % normalizedRunState.mapSequence.length]
  );
  const mapDefinition = structuredClone(getMapById(mapId));
  const difficultyTier = normalizedRunState.mapIndex + 1;
  const battleSeed = normalizedRunState.seed + normalizedRunState.mapIndex;
  const enemyCommanderId = pickEnemyCommander(
    battleSeed,
    normalizedRunState.commanderId
  );
  const enemyAiArchetype = pickEnemyAiArchetype(battleSeed, enemyCommanderId);
  const capturedBuildings = applyEnemyMapControlScaling(mapDefinition, difficultyTier);
  const enemyUnits = createEnemyBattleRoster(mapDefinition, battleSeed);
  const playerUnits = createPlayerBattleRoster(
    normalizedRunState,
    mapDefinition,
    getOccupiedTiles(enemyUnits)
  );
  const openingLog = [`${normalizedRunState.mapIndex + 1}/${normalizedRunState.targetMapCount}: ${mapDefinition.name}`];
  const rewardedPlayerUnits = applyRunRewardsToUnits(normalizedRunState, playerUnits);

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

  if ((normalizedRunState.selectedRewards ?? []).length > 0) {
    openingLog.push(`Run upgrades active: ${(normalizedRunState.selectedRewards ?? []).map((reward) => reward.name).join(", ")}.`);
  }

  const battleState = {
    id: createId("battle"),
    mode: BATTLE_MODES.RUN,
    seed: battleSeed,
    difficultyTier,
    map: mapDefinition,
    turn: {
      number: 1,
      activeSide: TURN_SIDES.PLAYER
    },
    player: {
      commanderId: normalizedRunState.commanderId,
      funds: 0,
      charge: 0,
      recruitDiscount: 0,
      units: rewardedPlayerUnits
    },
    enemy: {
      commanderId: enemyCommanderId,
      aiArchetype: enemyAiArchetype,
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
    rewardLedger: createEmptyBattleRewardLedger(),
    log: openingLog,
    victory: null
  };

  return normalizeBattleState(battleState);
}

export function createSkirmishBattleState({
  mapId,
  playerCommanderId,
  enemyCommanderId,
  startingFunds,
  fundsPerBuilding
}) {
  const mapDefinition = structuredClone(getMapById(mapId) ?? MAP_POOL[0]);
  const incomeByType = createIncomeTable(fundsPerBuilding);
  const battleSeed = stringToSeed(`skirmish-${mapDefinition.id}-${playerCommanderId}-${enemyCommanderId}`);
  const playerUnits = getPlacedBattleUnitsForSide(mapDefinition, TURN_SIDES.PLAYER, battleSeed);
  const enemyUnits = getPlacedBattleUnitsForSide(mapDefinition, TURN_SIDES.ENEMY, battleSeed);
  const enemyAiArchetype = pickEnemyAiArchetype(battleSeed, enemyCommanderId);

  const battleState = {
    id: createId("battle"),
    mode: BATTLE_MODES.SKIRMISH,
    seed: battleSeed,
    difficultyTier: 1,
    map: mapDefinition,
    turn: {
      number: 1,
      activeSide: TURN_SIDES.PLAYER
    },
    player: {
      commanderId: playerCommanderId,
      funds:
        startingFunds + getBuildingIncomeForSide(mapDefinition.buildings, TURN_SIDES.PLAYER, incomeByType),
      charge: 0,
      recruitDiscount: 0,
      units: playerUnits
    },
    enemy: {
      commanderId: enemyCommanderId,
      aiArchetype: enemyAiArchetype,
      funds: ENEMY_STARTING_FUNDS + startingFunds,
      charge: 0,
      recruitDiscount: 0,
      recruitsBuiltThisMap: 0,
      units: enemyUnits
    },
    economy: {
      incomeByType
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
    log: [`Skirmish: ${mapDefinition.name}`],
    victory: null
  };

  return normalizeBattleState(battleState);
}

export function createSlotRecord(runState, battleState) {
  const normalizedRunState = normalizeRunState(runState);
  const normalizedBattleState = normalizeBattleState(battleState);

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    summary: {
      commanderId: normalizedRunState.commanderId,
      mapIndex: normalizedRunState.mapIndex + 1,
      targetMapCount: normalizedRunState.targetMapCount,
      mapName: normalizedBattleState?.map?.name ?? "No active map",
      totalTurns: normalizedRunState.totalTurns ?? 0
    },
    runState: normalizedRunState,
    battleState: normalizedBattleState
  };
}

function extractRosterFromBattle(battleState) {
  return battleState.player.units
    .filter((unit) => unit.current.hp > 0 && !unit.temporary?.battleLocalOnly)
    .map((unit) => createPersistentUnitSnapshot(unit));
}

export function applyBattleVictoryToRun(runState, battleState) {
  const normalizedRunState = normalizeRunState(runState);
  const nextMapNumber = normalizedRunState.mapIndex + 1;
  const forcedType = getRunRewardTypeForMap(nextMapNumber);
  const rewardChoices = buildRunRewardChoices(normalizedRunState, battleState, forcedType);

  return {
    ...structuredClone(normalizedRunState),
    totalTurns: (normalizedRunState.totalTurns ?? 0) + battleState.turn.number,
    roster: extractRosterFromBattle(battleState),
    completedMaps: [...normalizedRunState.completedMaps, battleState.map.id],
    mapIndex: normalizedRunState.mapIndex + 1,
    pendingRewardChoices: rewardChoices,
    selectedRewards: [...(normalizedRunState.selectedRewards ?? [])]
  };
}

function buildRunRewardChoices(runState, battleState, forcedType) {
  if (forcedType === RUN_CARD_TYPES.UNIT) {
    return buildReinforcementDraftChoices(runState, battleState);
  }

  const selectedRewardIds = new Set((runState.selectedRewards ?? []).map((reward) => reward.id));
  const unlockedRewardIds = new Set(
    (runState.availableRunCardIds?.length ? runState.availableRunCardIds : RUN_UPGRADES.map((upgrade) => upgrade.id))
  );
  const eligibleUpgrades = RUN_UPGRADES.filter(
    (upgrade) =>
      unlockedRewardIds.has(upgrade.id) &&
      (isGearUpgrade(upgrade) || !selectedRewardIds.has(upgrade.id))
  );
  const shuffledEligible = shuffle(
    stringToSeed(`${runState.seed}-${battleState.id}-${runState.mapIndex + 1}-rewards`),
    eligibleUpgrades
  ).value;

  return shuffledEligible.slice(0, 3);
}

function nextUnitChoiceIdSeed(runState, battleState) {
  return `${runState.id}-${battleState.id}-${runState.mapIndex + 1}`;
}

function buildReinforcementDraftChoices(runState, battleState) {
  const availableUnitIds = runState.availableDraftUnitIds?.length
    ? runState.availableDraftUnitIds
    : Object.keys(UNIT_CATALOG);
  const unitChoices = availableUnitIds
    .map((unitTypeId) => UNIT_CATALOG[unitTypeId])
    .filter(Boolean);
  const shuffledUnits = shuffle(
    stringToSeed(`${runState.seed}-${battleState.id}-${runState.mapIndex + 1}-draft`),
    unitChoices
  ).value;

  return shuffledUnits.slice(0, 3).map((unitType, index) => ({
    id: `unit-choice-${unitType.id}-${nextUnitChoiceIdSeed(runState, battleState)}-${index}`,
    type: RUN_CARD_TYPES.UNIT,
    unitTypeId: unitType.id,
    name: unitType.name,
    summary: `Draft ${unitType.name} into your run roster for the next map.`
  }));
}

export function isRunComplete(runState) {
  return runState.mapIndex >= runState.targetMapCount;
}
