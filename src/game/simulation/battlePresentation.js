import { BATTLE_MODES, TERRAIN_KEYS, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { getRunUpgradeById } from "../content/runUpgrades.js";
import { getCommanderById } from "../content/commanders.js";
import { describeBuilding, getBuildingArmorBonusForType } from "../content/buildings.js";
import { DEFEND_OBJECTIVE_MAX_HP } from "../content/mapGoals.js";
import { getArmorClassForUnit, getWeaponClassForUnit } from "../content/weaponClasses.js";
import {
  canResupplyUnit,
  getDisplayedUnitAttack,
  getDisplayedUnitArmor,
  getDisplayedUnitLuck,
  getDisplayedUnitMovement,
  getDisplayedUnitRangeCap,
  getPositionArmorMultiplier
} from "./commanderEffects.js";
import { getLevelProgress } from "./progression.js";
import { canCaptureBuilding } from "./captureRules.js";
import { getBuildingSupplyPreview } from "./battleServicing.js";
import {
  getAttackForecast,
  getAttackRangeCap,
  getAttackableUnitIds,
  getElevationRangeBonus,
  getPositionArmorBonus
} from "./combatResolver.js";
import { findUnitById } from "./battleUnits.js";
import {
  canUnitDropOffHostage,
  canUnitRescueHostage,
  getMissionFailureConditionText,
  getMissionMarkers,
  getMissionObjectiveText,
  getMissionProgressText
} from "./missionRules.js";
import {
  getBuildingAt,
  getAntiAirGearAmmo,
  getAttackProfileForTarget,
  getEffectiveCurrentAmmo,
  getEffectiveCurrentStamina,
  getReachableTiles,
  getRecruitmentOptions,
  getLivingUnits,
  getSelectionCoordinates,
  getSelectedBuilding,
  getSelectedUnit,
  getValidUnloadTiles,
  getTerrainAt,
  getUnitMovementAllowance,
  getTilesInRange,
  getUnitAt,
  getUnitAttackProfile
} from "./selectors.js";
import {
  getRunCardArmorModifierSources,
  getRunCardAttackModifierSources,
  getRunCardMovementModifierSources,
  getRunCardPositionArmorBonusSources,
  getRunCardRangeModifierSources,
  isUnitZombified
} from "./runCardEffects.js";

const RECON_UNIT_IDS = new Set(["runner"]);

function formatRangeLabel(minimumRange, maximumRange) {
  return minimumRange === maximumRange
    ? `${maximumRange}`
    : `${minimumRange}-${maximumRange}`;
}

function getLivingUnitsForSide(state, side) {
  return getLivingUnits(state, side).filter((unit) => !unit.transport?.carriedByUnitId);
}

function getSupportNeedScore(state, unit) {
  const canResupply = canResupplyUnit(state, unit);

  return (
    Math.max(0, unit.stats.maxHealth - unit.current.hp) * 2 +
    (canResupply ? Math.max(0, unit.stats.ammoMax - unit.current.ammo) * 3 : 0) +
    (canResupply ? Math.max(0, unit.stats.staminaMax - unit.current.stamina) * 2 : 0)
  );
}

function createEmptyPresentation(spentUnitIds = []) {
  return {
    mission: null,
    selectedTile: null,
    pendingAction: null,
    spentUnitIds,
    reachableTiles: [],
    movePreviewTiles: [],
    attackPreviewTiles: [],
    unloadPreviewTiles: [],
    transportTargetUnitIds: [],
    supportTargetUnitIds: [],
    medpackTargetUnitIds: [],
    extinguishTargetUnitIds: [],
    attackableUnitIds: [],
    movementBudget: null,
    recruitOptions: []
  };
}

export function getSpentUnitIds(state) {
  const activeSide = state.turn?.activeSide;

  if (!activeSide || (activeSide === TURN_SIDES.ENEMY && state.enemyTurn?.started !== true)) {
    return [];
  }

  const pendingUnitIds = new Set([
    state.pendingAction?.unitId,
    state.enemyTurn?.pendingAttack?.attackerId,
    state.enemyTurn?.pendingSlipstream?.unitId,
  ].filter(Boolean));

  return (state[activeSide]?.units ?? [])
    .filter(
      (unit) =>
        unit.current.hp > 0 &&
        unit.hasMoved &&
        unit.hasAttacked &&
        !pendingUnitIds.has(unit.id),
    )
    .map((unit) => unit.id);
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

function describeEditableUnit(unit) {
  if (!unit) {
    return null;
  }

  return {
    hp: unit.current.hp,
    maxHealth: unit.stats.maxHealth,
    attack: unit.stats.attack,
    armor: unit.stats.armor,
    movement: unit.stats.movement,
    minRange: unit.stats.minRange,
    maxRange: unit.stats.maxRange,
    stamina: unit.current.stamina,
    staminaMax: unit.stats.staminaMax,
    ammo: unit.current.ammo,
    ammoMax: unit.stats.ammoMax,
    luck: unit.stats.luck,
    level: unit.level,
    experience: unit.experience,
    gearSlot: unit.gear?.slot ?? null
  };
}

function formatSignedNumber(value) {
  const roundedValue = Math.round(Number(value) || 0);
  return `${roundedValue >= 0 ? "+" : ""}${roundedValue}`;
}

function formatSignedPercent(value) {
  const percent = Math.round((Number(value) || 0) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function formatMultiplier(value) {
  return `x${Number(value).toFixed(2).replace(/\.?0+$/, "")}`;
}

function createModifierSource(type, name, amount, detail = null) {
  return {
    type,
    name,
    amount,
    detail
  };
}

function formatFlatModifierSources(sources) {
  return sources
    .filter((source) => (Number(source.value) || 0) !== 0)
    .map((source) =>
      createModifierSource(source.type, source.name, formatSignedNumber(source.value), source.detail)
    );
}

function getFlatSourceValue(source) {
  const match = String(source?.amount ?? "").match(/^([+-])(\d+)$/);

  if (!match) {
    return null;
  }

  return (match[1] === "-" ? -1 : 1) * Number(match[2]);
}

function addReconciliationSourceIfNeeded(sources, modifier) {
  if (!sources.length) {
    return sources;
  }

  const flatValues = sources.map(getFlatSourceValue);

  if (flatValues.some((value) => value === null)) {
    return sources;
  }

  const flatSum = flatValues.reduce((sum, value) => sum + value, 0);
  const difference = modifier - flatSum;

  if (difference === 0) {
    return sources;
  }

  return [
    ...sources,
    createModifierSource("system", "Rounding/cap", formatSignedNumber(difference), "Final displayed modifier.")
  ];
}

function getCommanderForUnit(state, unit) {
  return getCommanderById(state?.[unit?.owner]?.commanderId);
}

function getSideEffects(state, side, type) {
  return (state?.[side]?.effects ?? []).filter((effect) => effect.type === type);
}

function unitMatchesGroup(unit, group) {
  switch (group) {
    case "infantry":
      return unit.family === UNIT_TAGS.INFANTRY;
    case "recon":
      return RECON_UNIT_IDS.has(unit.unitTypeId);
    case "infantry-recon":
      return unit.family === UNIT_TAGS.INFANTRY || RECON_UNIT_IDS.has(unit.unitTypeId);
    default:
      return false;
  }
}

function getOwnedPropertyCount(state, side) {
  return (state.map?.buildings ?? []).filter((building) => building.owner === side).length;
}

function isStandingOnOwnedProperty(state, unit) {
  const building = getBuildingAt(state, unit.x, unit.y);
  return Boolean(building && building.owner === unit.owner);
}

function isAircraft(unit) {
  return unit?.family === UNIT_TAGS.AIR;
}

function getStatusSourceName(status, fallback) {
  if (status?.sourceName) {
    return status.sourceName;
  }

  if (status?.source === "nova-overload") {
    return "Overload";
  }

  return fallback;
}

function getStatusSourceType(status, fallback = "status") {
  return status?.sourceType ?? fallback;
}

function getCorruptedStatPenalty(unit, stat, baseValue) {
  return (unit?.statuses ?? [])
    .filter((status) => status.type === "corrupted" && status.stat === stat)
    .reduce((sum) => sum + (Math.max(0, Math.ceil(baseValue * 0.5)) - baseValue), 0);
}

function getCommanderAttackSources(state, unit) {
  const commander = getCommanderForUnit(state, unit);
  const passive = commander?.passive;
  const active = commander?.active;
  const sources = [];

  if (passive?.type === "viper-shock-doctrine") {
    const value = unitMatchesGroup(unit, passive.group)
      ? passive.attackPercent ?? 0
      : passive.otherAttackPercent ?? 0;
    sources.push(createModifierSource("commander-passive", passive.name, formatSignedPercent(value), passive.summary));
  }

  if (passive?.type === "rook-estate-claim" && isStandingOnOwnedProperty(state, unit)) {
    sources.push(
      createModifierSource(
        "commander-passive",
        passive.name,
        formatSignedPercent(passive.attackPercent ?? 0),
        passive.summary
      )
    );
  }

  if (passive?.type === "falcon-air-superiority" && isAircraft(unit)) {
    sources.push(
      createModifierSource(
        "commander-passive",
        passive.name,
        formatSignedPercent(passive.attackPercent ?? 0),
        passive.summary
      )
    );
  }

  if (
    passive?.type === "nova-full-magazine" &&
    unit.current.ammo === unit.stats.ammoMax &&
    unit.stats.ammoMax > 0
  ) {
    sources.push(
      createModifierSource(
        "commander-passive",
        passive.name,
        formatSignedPercent(passive.attackPercent ?? 0),
        passive.summary
      )
    );
  }

  if (getSideEffects(state, unit.owner, "rook-hostile-takeover").length > 0) {
    const propertyCount = getOwnedPropertyCount(state, unit.owner);
    const value = propertyCount * (active?.attackPercentPerProperty ?? 0);

    if (value !== 0) {
      sources.push(
        createModifierSource(
          "commander-active",
          active?.name ?? "Hostile Takeover",
          formatSignedPercent(value),
          `${propertyCount} owned properties.`
        )
      );
    }
  }

  return sources;
}

function getCommanderArmorSources(state, unit) {
  const commander = getCommanderForUnit(state, unit);
  const passive = commander?.passive;
  const active = commander?.active;
  const sources = [];

  if (passive?.type === "falcon-air-superiority" && isAircraft(unit)) {
    sources.push(
      createModifierSource(
        "commander-passive",
        passive.name,
        formatSignedPercent(passive.armorPercent ?? 0),
        passive.summary
      )
    );
  }

  if (getSideEffects(state, unit.owner, "rook-hostile-takeover").length > 0) {
    const propertyCount = getOwnedPropertyCount(state, unit.owner);
    const value = propertyCount * (active?.armorPercentPerProperty ?? 0);

    if (value !== 0) {
      sources.push(
        createModifierSource(
          "commander-active",
          active?.name ?? "Hostile Takeover",
          formatSignedPercent(value),
          `${propertyCount} owned properties.`
        )
      );
    }
  }

  return sources;
}

function getAttackStatusSources(unit) {
  const sources = [];

  for (const status of unit.statuses ?? []) {
    if (status.type === "attackPercent" && (Number(status.value) || 0) !== 0) {
      sources.push(
        createModifierSource(
          getStatusSourceType(status),
          getStatusSourceName(status, "Attack Status"),
          formatSignedPercent(status.value),
          status.sourceName ? null : "Temporary attack modifier."
        )
      );
    }

    if (status.type === "burn") {
      sources.push(
        createModifierSource(
          getStatusSourceType(status),
          getStatusSourceName(status, "Burn"),
          formatMultiplier(0.5),
          "Attack is halved while burning."
        )
      );
    }

    if (status.type === "corrupted" && status.stat === "attack") {
      sources.push(
        createModifierSource(
          getStatusSourceType(status),
          getStatusSourceName(status, "Corrupted"),
          formatMultiplier(0.5),
          "Attack is halved while corrupted."
        )
      );
    }
  }

  return sources;
}

function getFlatStatusSources(unit, statusType, fallbackName) {
  return (unit.statuses ?? [])
    .filter((status) => status.type === statusType && (Number(status.value) || 0) !== 0)
    .map((status) =>
      createModifierSource(
        getStatusSourceType(status),
        getStatusSourceName(status, fallbackName),
        formatSignedNumber(status.value),
        status.sourceName ? null : `${fallbackName} modifier.`
      )
    );
}

function getPercentStatusSources(unit, statusType, fallbackName) {
  return (unit.statuses ?? [])
    .filter((status) => status.type === statusType && (Number(status.value) || 0) !== 0)
    .map((status) =>
      createModifierSource(
        getStatusSourceType(status),
        getStatusSourceName(status, fallbackName),
        formatSignedPercent(status.value),
        status.sourceName ? null : `${fallbackName} modifier.`
      )
    );
}

function getCorruptedFlatSources(unit, stat, baseValue, detail) {
  const value = getCorruptedStatPenalty(unit, stat, baseValue);

  if (value === 0) {
    return [];
  }

  return [
    createModifierSource("status", "Corrupted", formatSignedNumber(value), detail)
  ];
}

function getPositionArmorRawSource(state, unit) {
  if (unit.family === UNIT_TAGS.AIR) {
    return null;
  }

  const building = getBuildingAt(state, unit.x, unit.y);
  const buildingBonus = building ? getBuildingArmorBonusForType(building.type) : 0;

  if (buildingBonus > 0) {
    return {
      rawBonus: buildingBonus,
      source: createModifierSource(
        "building",
        describeBuilding(building).name,
        formatSignedNumber(buildingBonus),
        "Buildings override terrain armor."
      )
    };
  }

  const terrain = getTerrainAt(state, unit.x, unit.y);
  const rawBonus = terrain?.armorBonus ?? 0;

  if (rawBonus <= 0) {
    return null;
  }

  return {
    rawBonus,
    source: createModifierSource("terrain", terrain.label, formatSignedNumber(rawBonus), "Current tile armor.")
  };
}

function getPositionArmorSources(state, unit, positionArmorBonus) {
  if (positionArmorBonus <= 0) {
    return [];
  }

  const rawSource = getPositionArmorRawSource(state, unit);

  if (!rawSource) {
    return [];
  }

  const sources = [
    rawSource.source,
    ...formatFlatModifierSources(getRunCardPositionArmorBonusSources(state, unit, rawSource.rawBonus))
  ];
  const multiplier = getPositionArmorMultiplier(state, unit);

  if (multiplier > 1) {
    const commander = getCommanderForUnit(state, unit);
    const hasFortress = getSideEffects(state, unit.owner, "knox-fortress-protocol").length > 0;

    sources.push(
      createModifierSource(
        hasFortress ? "commander-active" : "commander-passive",
        hasFortress ? commander?.active?.name ?? "Fortress Protocol" : commander?.passive?.name ?? "Shield Wall",
        formatMultiplier(multiplier),
        "Multiplies positional armor."
      )
    );
  }

  return sources;
}

function getMovementCapSources(unit, requestedMovement, totalMovement) {
  const sources = [];
  const requestedBudget = Math.max(0, Math.floor(requestedMovement ?? 0));
  const currentStamina = Math.max(0, Math.floor(getEffectiveCurrentStamina(unit) ?? requestedBudget));
  const hostagePenalty = unit?.temporary?.hostageCarrier ? 1 : 0;
  const afterHostage = Math.max(0, requestedBudget - hostagePenalty);

  if (hostagePenalty > 0 && requestedBudget > afterHostage) {
    sources.push(createModifierSource("mission", "Hostage Carrier", formatSignedNumber(afterHostage - requestedBudget), "Carrying a hostage reduces movement."));
  }

  if (totalMovement < afterHostage) {
    sources.push(
      createModifierSource(
        "resource",
        "Current Stamina",
        formatSignedNumber(totalMovement - afterHostage),
        "Movement cannot exceed current stamina."
      )
    );
  }

  return sources;
}

function getElevationRangeSources(state, unit) {
  if (unit.unitTypeId !== "longshot") {
    return [];
  }

  if (state.map.tiles[unit.y]?.[unit.x] !== TERRAIN_KEYS.MOUNTAIN) {
    return [];
  }

  return [
    createModifierSource("terrain", "Mountain Elevation", formatSignedNumber(1), "Longshots gain range from mountains.")
  ];
}

function createStatBreakdown(base, total, sources, options = {}) {
  const safeBase = Math.max(0, Math.round(Number(base) || 0));
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  const modifier = safeTotal - safeBase;
  const baseLabel = options.baseLabel ?? `${safeBase}`;
  const reconciledSources = addReconciliationSourceIfNeeded(sources, modifier);

  return {
    base: safeBase,
    total: safeTotal,
    modifier,
    label: modifier === 0 ? baseLabel : `${baseLabel} (${formatSignedNumber(modifier)})`,
    sources: reconciledSources
  };
}

function buildStatBreakdowns(state, unit, positionArmorBonus) {
  const displayedAttack = getDisplayedUnitAttack(state, unit);
  const displayedArmor = getDisplayedUnitArmor(state, unit);
  const displayedMovement = getDisplayedUnitMovement(state, unit);
  const movementAllowance = getUnitMovementAllowance(unit, displayedMovement);
  const displayedRangeCap = getDisplayedUnitRangeCap(state, unit);
  const elevationRangeBonus = getElevationRangeBonus(state, unit);
  const totalRangeCap = displayedRangeCap + elevationRangeBonus;

  return {
    attack: createStatBreakdown(
      unit.stats.attack,
      displayedAttack,
      [
        ...getCommanderAttackSources(state, unit),
        ...getAttackStatusSources(unit),
        ...formatFlatModifierSources(getRunCardAttackModifierSources(state, unit))
      ]
    ),
    armor: createStatBreakdown(
      unit.stats.armor,
      displayedArmor + positionArmorBonus,
      [
        ...getCommanderArmorSources(state, unit),
        ...getFlatStatusSources(unit, "shield", "Shield"),
        ...getPercentStatusSources(unit, "armorPercent", "Armor Status"),
        ...getCorruptedFlatSources(unit, "armor", unit.stats.armor, "Armor is halved while corrupted."),
        ...formatFlatModifierSources(getRunCardArmorModifierSources(state, unit)),
        ...getPositionArmorSources(state, unit, positionArmorBonus)
      ]
    ),
    movement: createStatBreakdown(
      unit.stats.movement,
      movementAllowance,
      [
        ...getFlatStatusSources(unit, "mobility", "Mobility Status"),
        ...getCorruptedFlatSources(unit, "movement", unit.stats.movement, "Movement is halved while corrupted."),
        ...formatFlatModifierSources(getRunCardMovementModifierSources(state, unit)),
        ...getMovementCapSources(unit, displayedMovement, movementAllowance)
      ]
    ),
    range: createStatBreakdown(
      unit.stats.maxRange,
      totalRangeCap,
      [
        ...getFlatStatusSources(unit, "range", "Range Status"),
        ...getCorruptedFlatSources(unit, "range", unit.stats.maxRange, "Range is halved while corrupted."),
        ...formatFlatModifierSources(getRunCardRangeModifierSources(state, unit)),
        ...getElevationRangeSources(state, unit)
      ],
      {
        baseLabel: formatRangeLabel(unit.stats.minRange, unit.stats.maxRange)
      }
    )
  };
}

export function describeUnit(state, unit) {
  if (!unit) {
    return null;
  }

  const experience = getLevelProgress(unit);
  const positionArmorBonus = getPositionArmorBonus(state, unit);
  const gearUpgrade = unit.gear?.slot ? getRunUpgradeById(unit.gear.slot) : null;
  const statBreakdowns = buildStatBreakdowns(state, unit, positionArmorBonus);

  return {
    id: unit.id,
    unitTypeId: unit.unitTypeId,
    owner: unit.owner,
    ownerLabel: formatSelectionOwner(unit.owner),
    name: unit.name,
    family: unit.family,
    armorClass: getArmorClassForUnit(unit),
    weaponClass: getWeaponClassForUnit(unit),
    level: unit.level,
    hp: unit.current.hp,
    maxHealth: unit.stats.maxHealth,
    attack: getDisplayedUnitAttack(state, unit),
    armor: getDisplayedUnitArmor(state, unit),
    positionArmorBonus,
    movement: getUnitMovementAllowance(unit, getDisplayedUnitMovement(state, unit)),
    minRange: unit.stats.minRange,
    maxRange: getDisplayedUnitRangeCap(state, unit) + getElevationRangeBonus(state, unit),
    experience: experience.current,
    experienceToNextLevel: experience.threshold,
    experienceRatio: experience.ratio,
    stamina: getEffectiveCurrentStamina(unit),
    staminaMax: unit.stats.staminaMax,
    ammo: getEffectiveCurrentAmmo(unit),
    ammoMax: unit.stats.ammoMax,
    luck: getDisplayedUnitLuck(state, unit),
    statBreakdowns,
    corruptedStat:
      (unit.statuses ?? []).find((status) => status.type === "corrupted")?.stat ?? null,
    isBurned: (unit.statuses ?? []).some((status) => status.type === "burn"),
    isSlowed: (unit.statuses ?? []).some(
      (status) => status.type === "mobility" && (Number(status.value) || 0) < 0
    ),
    isHostageCarrier: Boolean(unit.temporary?.hostageCarrier),
    hasMoved: unit.hasMoved,
    hasAttacked: unit.hasAttacked,
    editable: describeEditableUnit(unit),
    gear: gearUpgrade
      ? {
          slot: gearUpgrade.id,
          name: gearUpgrade.name,
          detailLines: [...(gearUpgrade.detailLines ?? [])],
          ammo: gearUpgrade.id === "gear-aa-kit" ? getAntiAirGearAmmo(unit) : null
        }
      : null
  };
}

function buildMissionPresentation(state) {
  const mission = state.mission;

  if (!mission) {
    return null;
  }

  return {
    type: mission.type,
    label: mission.label,
    objective: getMissionObjectiveText(state),
    status: getMissionProgressText(state),
    failureCondition: getMissionFailureConditionText(state),
    turnsRemaining: mission.turnsRemaining ?? null,
    turnLimit: mission.turnLimit ?? null,
    targetHp: mission.defend?.targetHp ?? null,
    maxTargetHp: mission.defend?.maxHp ?? DEFEND_OBJECTIVE_MAX_HP,
    rescueStatus: mission.rescue?.status ?? null,
    hostageCarrierUnitId: mission.rescue?.carrierUnitId ?? null,
    markers: getMissionMarkers(state)
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

  if (
    pendingAction.type === "commander-power" &&
    pendingAction.mode === "air-strike"
  ) {
    const commander = getCommanderById(pendingAction.commanderId);

    return {
      ...pendingAction,
      powerName: commander?.active?.name ?? pendingAction.powerName ?? "Air Strike",
      centerDamage: Math.max(0, Number(commander?.active?.centerDamage) || 0),
      adjacentDamage: Math.max(0, Number(commander?.active?.adjacentDamage) || 0),
      isAirStrikeTargeting: true
    };
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
  const isSlipstream = mode === "slipstream";
  const supportTargetFamily = unit.unitTypeId === "medic" ? "infantry" : unit.unitTypeId === "mechanic" ? "vehicle" : null;
  const canAct = !isUnitZombified(unit);
  const canSupport =
    Boolean(supportTargetFamily) &&
    (unit.cooldowns?.support ?? 0) <= 0 &&
    !isSlipstream &&
    canAct;
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
          needScore: getSupportNeedScore(state, target)
        }))
        .filter((option) => option.needScore > 0)
        .sort((left, right) => right.needScore - left.needScore || left.target.id.localeCompare(right.target.id))
    : [];
  const medpackTargets =
    unit.gear?.slot === "gear-field-meds" && !isSlipstream && canAct
      ? getLivingUnitsForSide(state, unit.owner)
          .filter((candidate) => {
            if (candidate.family !== "infantry" || candidate.transport?.carriedByUnitId) {
              return false;
            }

            if (candidate.id === unit.id) {
              return true;
            }

            return Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1;
          })
          .map((target) => ({
            target,
            needScore: Math.max(0, target.stats.maxHealth - target.current.hp)
          }))
          .filter((option) => option.needScore > 0)
          .sort((left, right) => right.needScore - left.needScore || left.target.id.localeCompare(right.target.id))
      : [];
  const adjacentRunners = !isSlipstream && canAct && unit.family === "infantry" && !unit.temporary?.hostageCarrier
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
  const medpackTargetUnitIds = mode === "medpack"
    ? medpackTargets.map((option) => option.target.id)
    : [];
  const extinguishTargets = !isSlipstream && canAct && unit.family === "infantry"
    ? getLivingUnitsForSide(state, unit.owner)
        .filter(
          (candidate) =>
            candidate.id !== unit.id &&
            (candidate.statuses ?? []).some((status) => status.type === "burn") &&
            Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1
        )
        .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id))
    : [];
  const extinguishTargetUnitIds = mode === "extinguish"
    ? extinguishTargets.map((target) => target.id)
    : [];
  const canUnloadTransport =
    unit.unitTypeId === "runner" &&
    Boolean(unit.transport?.carryingUnitId) &&
    !unit.transport?.hasLockedUnload &&
    (unit.transport?.canUnloadAfterMove || unit.hasMoved) &&
    validUnloadTiles.length > 0;
  const canRescue = !isSlipstream && canAct && canUnitRescueHostage(state, unit);
  const canDropOff = !isSlipstream && canAct && canUnitDropOffHostage(state, unit);
  const supplyPreview =
    !isSlipstream && canAct
      ? getBuildingSupplyPreview(state, unit, building)
      : { changed: false };

  return {
    ...pendingAction,
    mode,
    unitName: unit.name,
    canCapture: !isSlipstream && canAct && canCaptureBuilding(unit, building),
    canFire: !isSlipstream && canAct && attackableUnitIds.length > 0,
    canSupport: supportTargets.length > 0,
    canSupply: supplyPreview.changed,
    supportActionLabel: unit.unitTypeId === "medic" ? "Heal" : "Support",
    supportCooldown: unit.cooldowns?.support ?? 0,
    canRescue,
    canDropOff,
    canUseMedpack: medpackTargets.length > 0,
    canExtinguish: extinguishTargets.length > 0,
    canEnterTransport,
    canUnloadTransport,
    canRedoMove: !isSlipstream && !pendingAction.reinforcementLocked,
    isSlipstream,
    isTargeting: mode === "fire",
    isChoosingTransport: mode === "transport",
    isChoosingSupport: mode === "support",
    isChoosingMedpack: mode === "medpack",
    isChoosingExtinguish: mode === "extinguish",
    isUnloading: mode === "unload",
    unloadPreviewTiles,
    transportTargetUnitIds,
    supportTargetUnitIds,
    medpackTargetUnitIds,
    extinguishTargetUnitIds,
    attackableUnitIds,
    building: building ? describeBuilding(building) : null
  };
}

export function buildBattlePresentation(snapshot) {
  const selectedUnit = getSelectedUnit(snapshot);
  const selectedBuilding = getSelectedBuilding(snapshot);
  const selectedTile = buildSelectedTile(snapshot, getSelectionCoordinates(snapshot));
  const pendingAction = createPendingActionView(snapshot);
  const mission = buildMissionPresentation(snapshot);
  const spentUnitIds = getSpentUnitIds(snapshot);

  if (selectedUnit) {
    const attackProfile = getUnitAttackProfile(selectedUnit);
    const isSlipstream = pendingAction?.unitId === selectedUnit.id && pendingAction?.isSlipstream;
    const requestedMovementBudget =
      isSlipstream ? 1 : getDisplayedUnitMovement(snapshot, selectedUnit);
    const movementBudget = getUnitMovementAllowance(selectedUnit, requestedMovementBudget);
    const aaAttackProfile =
      selectedUnit.gear?.slot === "gear-aa-kit"
        ? getAttackProfileForTarget(selectedUnit, { family: "air" })
        : null;
    const rangeCap = Math.max(
      getAttackRangeCap(snapshot, selectedUnit, attackProfile),
      aaAttackProfile ? getAttackRangeCap(snapshot, selectedUnit, aaAttackProfile) : 0
    );
    const attackableUnitIds = getAttackableUnitIds(snapshot, selectedUnit);
    const shouldRevealAttackTargets =
      !pendingAction ||
      pendingAction.unitId !== selectedUnit.id ||
      pendingAction.isTargeting;
    const movePreviewTiles =
      pendingAction?.unitId === selectedUnit.id && !isSlipstream
        ? []
        : getReachableTiles(snapshot, selectedUnit, movementBudget).filter(
            (tile) => !isSlipstream || tile.x !== selectedUnit.x || tile.y !== selectedUnit.y
          );
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
      ...createEmptyPresentation(spentUnitIds),
      mission,
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
      medpackTargetUnitIds:
        pendingAction?.unitId === selectedUnit.id ? pendingAction.medpackTargetUnitIds ?? [] : [],
      reachableTiles:
        selectedUnit.owner === TURN_SIDES.PLAYER &&
        snapshot.turn.activeSide === TURN_SIDES.PLAYER &&
        (
          isSlipstream ||
          (pendingAction?.unitId !== selectedUnit.id && !selectedUnit.hasMoved)
        )
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
      ...createEmptyPresentation(spentUnitIds),
      mission,
      selectedBuildingId: selectedBuilding.id,
      selectedTile,
      pendingAction,
      recruitOptions:
        snapshot.mode !== BATTLE_MODES.RUN &&
        snapshot.turn.activeSide === TURN_SIDES.PLAYER &&
        selectedBuilding.owner === TURN_SIDES.PLAYER
          ? getRecruitmentOptions(snapshot, selectedBuilding, snapshot.player)
          : []
    };
  }

  if (selectedTile) {
    return {
      ...createEmptyPresentation(spentUnitIds),
      mission,
      selectedTile,
      pendingAction
    };
  }

  return {
    ...createEmptyPresentation(spentUnitIds),
    mission,
    pendingAction
  };
}
