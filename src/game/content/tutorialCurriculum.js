import {
  BATTLE_MODES,
  BUILDING_KEYS,
  ENEMY_AI_ARCHETYPES,
  PROTOTYPE_RUN_GOAL,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../core/constants.js";
import {
  RUN_META_CURRENCY_CLEAR_BONUS,
  RUN_META_CURRENCY_MAP_REWARD
} from "../app/controllerShared.js";
import { stringToSeed } from "../core/random.js";
import { getCommanderPowerMax } from "./commanders.js";
import { MAP_GOAL_TYPES } from "./mapGoals.js";
import {
  TUTORIAL_LESSON_IDS,
  TUTORIAL_LESSON_ORDER
} from "./tutorialConstants.js";
import {
  TUTORIAL_IDS,
  TUTORIAL_STEPS,
  createTutorialBattleState,
  createTutorialMapDefinition
} from "./tutorial.js";
import { createUnitFromType } from "../simulation/unitFactory.js";
import { normalizeBattleState } from "../state/runFactory.js";

function withActionLabel(step) {
  const expected = step.expectedAction ?? {};
  const fallbackByType = {
    continue: "Continue",
    selectUnit: "Select the highlighted unit",
    moveUnit: "Move to the highlighted tile",
    attackTarget: "Attack the highlighted target",
    button: "Use the highlighted command",
    endTurn: "End Turn",
    activatePower: "Activate commander power",
    objective: "Complete the highlighted objective"
  };

  return {
    guidanceMode: expected.type === "objective" ? "objective" : "hard",
    actionLabel: fallbackByType[expected.type] ?? "Follow the highlighted action",
    ...step
  };
}

function buildBasicOrderSteps() {
  const steps = [];

  for (const sourceStep of TUTORIAL_STEPS) {
    steps.push(withActionLabel(sourceStep));

    if (sourceStep.id === "move-grunt-sector") {
      steps.push(withActionLabel({
        id: "redo-grunt-move",
        title: "Preview mistakes are reversible.",
        body: "Redo returns the unit to its starting tile and restores the stamina spent by the pending move.",
        uiSelectors: ['[data-action="redo-move"]'],
        expectedAction: { type: "button", action: "redo-move", nudge: "Choose Redo before committing another action." }
      }));
      steps.push(withActionLabel({
        id: "move-grunt-sector-again",
        title: "Move onto the sector again.",
        body: "Re-issue the legal movement order, then we will commit Capture.",
        battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.NEUTRAL_SECTOR, label: "Move here", tone: "goal" }],
        expectedAction: { type: "moveUnit", unitId: TUTORIAL_IDS.GRUNT, x: 3, y: 4 }
      }));
    }

    if (sourceStep.id === "skyguard-target") {
      steps.push(withActionLabel({
        id: "wait-select",
        title: "Select a unit that has no urgent order.",
        body: "Wait deliberately spends a ready unit without attacking, capturing, or supplying.",
        battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.CAPPER, label: "Select", tone: "ally" }],
        expectedAction: { type: "selectUnit", unitId: TUTORIAL_IDS.CAPPER }
      }));
      steps.push(withActionLabel({
        id: "wait-hold",
        title: "Hold position.",
        body: "Open the command prompt on the unit's current tile.",
        battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.CAPPER, label: "Hold", tone: "ally" }],
        expectedAction: { type: "holdUnit", unitId: TUTORIAL_IDS.CAPPER }
      }));
      steps.push(withActionLabel({
        id: "wait-command",
        title: "Choose Wait.",
        body: "Wait ends this unit's activity for the turn. It becomes ready again at the start of its next turn.",
        uiSelectors: ['[data-action="wait-unit"]'],
        expectedAction: { type: "button", action: "wait-unit" }
      }));
    }
  }

  return steps;
}

const BASIC_ORDER_STEPS = buildBasicOrderSteps();
const TUTORIAL_ENTRY_EFFECT_NAMES = new Set(["grant-player-power"]);
const TUTORIAL_COMPLETION_EFFECT_NAMES = new Set(["record-lesson-completion"]);
const TUTORIAL_STEP_COMPLETION_EFFECT_NAMES = new Set(["grant-training-level-up"]);
const TUTORIAL_EXPECTED_ACTION_TYPES = new Set([
  "continue",
  "selectUnit",
  "moveUnit",
  "holdUnit",
  "button",
  "attackTarget",
  "unloadTile",
  "endTurn",
  "activatePower",
  "objective"
]);
const TUTORIAL_BUTTON_ACTIONS = new Set([
  "redo-move",
  "capture-building",
  "begin-attack",
  "wait-unit",
  "use-supply",
  "use-support",
  "enter-transport",
  "begin-unload"
]);
function findTutorialUnit(state, unitId) {
  return [...(state?.player?.units ?? []), ...(state?.enemy?.units ?? [])]
    .find((unit) => unit.id === unitId) ?? null;
}

function findTutorialEnemyHq(state) {
  return state?.map?.buildings?.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.id?.includes("enemy")
  ) ?? state?.map?.buildings?.find(
    (building) => building.type === BUILDING_KEYS.COMMAND && building.owner !== TURN_SIDES.PLAYER
  ) ?? null;
}

const TUTORIAL_OBJECTIVE_PREDICATES = Object.freeze({
  "unit-supplied": (state, expected) => {
    const unit = findTutorialUnit(state, expected.unitId);
    const before = expected.resourceFloor ?? {};
    return Boolean(unit && (
      unit.current.hp > (before.hp ?? unit.current.hp) ||
      unit.current.ammo > (before.ammo ?? unit.current.ammo) ||
      unit.current.stamina > (before.stamina ?? unit.current.stamina)
    ));
  },
  "service-sites-complete": (state, expected) => (expected.unitIds ?? []).every((unitId) => {
    const unit = findTutorialUnit(state, unitId);
    return Boolean(unit && unit.current.hp === unit.stats.maxHealth &&
      unit.current.ammo === unit.stats.ammoMax && unit.current.stamina === unit.stats.staminaMax);
  }),
  "enemy-hq-captured": (state) => findTutorialEnemyHq(state)?.owner === TURN_SIDES.PLAYER,
  "rout-complete": (state) => (state?.enemy?.units ?? []).every((unit) => unit.current?.hp <= 0) ||
    state?.victory?.winner === TURN_SIDES.PLAYER,
  "hostage-picked-up": (state) => state?.mission?.rescue?.status === "carried",
  "rescue-complete": (state) => state?.mission?.rescue?.status === "delivered" ||
    state?.victory?.winner === TURN_SIDES.PLAYER,
  "player-victory": (state) => state?.victory?.winner === TURN_SIDES.PLAYER,
  "commander-charged": (state) => state?.player?.charge >= getCommanderPowerMax(state?.player?.commanderId),
  "level-up-cleared": (state, expected) => {
    const unit = findTutorialUnit(state, expected.unitId);
    return Boolean(unit?.level > 1 && (state?.levelUpQueue?.length ?? 0) === 0);
  }
});

export function evaluateTutorialObjective(state, expected) {
  return Boolean(TUTORIAL_OBJECTIVE_PREDICATES[expected?.predicate]?.(state, expected));
}
let tutorialSessionSequence = 0;

function unit(type, id, owner, x, y, overrides = {}) {
  const created = createUnitFromType(type, owner, overrides.level ?? 1);
  created.id = id;
  created.x = x;
  created.y = y;

  if (overrides.current) {
    created.current = { ...created.current, ...overrides.current };
  }

  if (overrides.stats) {
    created.stats = { ...created.stats, ...overrides.stats };
  }

  if (overrides.experience != null) {
    created.experience = overrides.experience;
  }

  if (overrides.statuses) {
    created.statuses = structuredClone(overrides.statuses);
  }

  return created;
}

function createLessonState({
  lessonId,
  mapName,
  goal = { type: MAP_GOAL_TYPES.ROUT },
  playerUnits,
  enemyUnits,
  tiles = null,
  buildings = null,
  playerCharge = 0
}) {
  const baseMap = createTutorialMapDefinition();
  const map = {
    ...baseMap,
    id: `tutorial-${lessonId}`,
    name: mapName,
    goal,
    tiles: tiles ?? baseMap.tiles,
    buildings: buildings ?? baseMap.buildings
  };
  const state = createTutorialBattleState();
  state.id = `battle-tutorial-${lessonId}`;
  state.seed = stringToSeed(`tutorial-${lessonId}`);
  state.map = map;
  state.player.units = playerUnits;
  state.player.charge = playerCharge;
  state.enemy.units = enemyUnits;
  state.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.BALANCED;
  state.selection = { type: null, id: null, x: null, y: null };
  state.pendingAction = null;
  state.victory = null;
  state.log = [`${mapName} training simulation online.`];
  return normalizeBattleState(state);
}

const roleIds = Object.freeze({
  BREAKER: "roles-breaker",
  LONGSHOT: "roles-longshot",
  SKYGUARD: "roles-skyguard",
  SIEGE: "roles-siege",
  EMPTY: "roles-empty-grunt",
  RUNNER: "roles-enemy-runner",
  INFANTRY: "roles-enemy-infantry",
  AIR: "roles-enemy-air",
  HEAVY: "roles-enemy-heavy",
  FALLBACK: "roles-enemy-fallback"
});

function createCombatRolesState() {
  const state = createLessonState({
    lessonId: TUTORIAL_LESSON_IDS.COMBAT_ROLES_TERRAIN,
    mapName: "Matchup Range",
    playerUnits: [
      unit("breaker", roleIds.BREAKER, TURN_SIDES.PLAYER, 1, 1),
      unit("longshot", roleIds.LONGSHOT, TURN_SIDES.PLAYER, 1, 3),
      unit("skyguard", roleIds.SKYGUARD, TURN_SIDES.PLAYER, 1, 5),
      unit("siege-gun", roleIds.SIEGE, TURN_SIDES.PLAYER, 6, 1),
      unit("grunt", roleIds.EMPTY, TURN_SIDES.PLAYER, 6, 5, { current: { ammo: 0 } })
    ],
    enemyUnits: [
      unit("runner", roleIds.RUNNER, TURN_SIDES.ENEMY, 2, 1, { current: { hp: 1 } }),
      unit("grunt", roleIds.INFANTRY, TURN_SIDES.ENEMY, 5, 3, { current: { hp: 1 } }),
      unit("gunship", roleIds.AIR, TURN_SIDES.ENEMY, 3, 5, { current: { hp: 1 } }),
      unit("juggernaut", roleIds.HEAVY, TURN_SIDES.ENEMY, 9, 1, { current: { hp: 1 } }),
      unit("grunt", roleIds.FALLBACK, TURN_SIDES.ENEMY, 7, 5, { current: { hp: 1 } })
    ]
  });
  state.map.tiles[3][1] = TERRAIN_KEYS.MOUNTAIN;
  state.map.tiles[4][4] = TERRAIN_KEYS.WATER;
  state.map.tiles[4][5] = TERRAIN_KEYS.RIDGE;
  return normalizeBattleState(state);
}

function attackDrill(prefix, actorId, targetId, copy) {
  return [
    withActionLabel({
      id: `${prefix}-select`,
      title: copy.title,
      body: copy.body,
      battlefieldHighlights: [
        { type: "unit", id: actorId, label: "Select", tone: "ally" },
        { type: "unit", id: targetId, label: copy.targetLabel, tone: "danger" }
      ],
      expectedAction: { type: "selectUnit", unitId: actorId, nudge: `Select the highlighted ${copy.unitName}.` }
    }),
    withActionLabel({
      id: `${prefix}-hold`,
      title: "Hold position and open orders.",
      body: "Select the unit's current tile to open its command prompt without spending movement.",
      battlefieldHighlights: [{ type: "unit", id: actorId, label: "Hold", tone: "ally" }],
      expectedAction: { type: "holdUnit", unitId: actorId, nudge: "Click the selected unit's own tile." }
    }),
    withActionLabel({
      id: `${prefix}-fire`,
      title: "Open the forecast.",
      body: copy.forecast,
      uiSelectors: ['[data-action="begin-attack"]'],
      battlefieldHighlights: [{ type: "unit", id: targetId, label: "Forecast", tone: "danger" }],
      expectedAction: { type: "button", action: "begin-attack", nudge: "Choose Fire from the command prompt." }
    }),
    withActionLabel({
      id: `${prefix}-target`,
      title: "Commit the attack.",
      body: copy.result,
      battlefieldHighlights: [{ type: "unit", id: targetId, label: "Attack", tone: "danger" }],
      expectedAction: { type: "attackTarget", unitId: actorId, targetUnitId: targetId, nudge: "Attack the highlighted target." }
    })
  ];
}

const COMBAT_ROLE_STEPS = [
  withActionLabel({
    id: "roles-intro",
    title: "Match weapons to targets.",
    body: "The forecast is the source of truth. Effective matchups, range bands, terrain, and ammo all change the trade.",
    expectedAction: { type: "continue" }
  }),
  ...attackDrill("breaker", roleIds.BREAKER, roleIds.RUNNER, {
    title: "Breaker versus light vehicle.", unitName: "Breaker", targetLabel: "Runner",
    body: "Breaker Charges are built to punch through vehicle armor.",
    forecast: "Effective markers come from the shared weapon profile—not a tutorial bonus.",
    result: "This one-hit target demonstrates the real anti-vehicle calculation."
  }),
  ...attackDrill("longshot", roleIds.LONGSHOT, roleIds.INFANTRY, {
    title: "Longshot from a Mountain.", unitName: "Longshot", targetLabel: "Range 4",
    body: "Longshots gain +1 maximum range on Mountain and punish infantry without a range-1 counter.",
    forecast: "The highlighted Grunt is four tiles away: legal only because the Longshot is on Mountain.",
    result: "The defender cannot counter outside its own legal range band."
  }),
  ...attackDrill("skyguard", roleIds.SKYGUARD, roleIds.AIR, {
    title: "Skyguard controls the air lane.", unitName: "Skyguard", targetLabel: "Aircraft",
    body: "Flak is the dedicated answer to aircraft and still consumes normal ammo.",
    forecast: "Check the anti-air effective marker and the target's air armor class.",
    result: "Aircraft ignore ground movement blockers, but they do not ignore anti-air."
  }),
  ...attackDrill("siege", roleIds.SIEGE, roleIds.HEAVY, {
    title: "Respect minimum range.", unitName: "Siege Gun", targetLabel: "Range 3",
    body: "Siege Guns fire at range 2-3 and cannot shoot adjacent targets.",
    forecast: "The heavy target is inside the legal artillery range band.",
    result: "Keep artillery screened; being caught at range 1 removes its primary shot."
  }),
  ...attackDrill("fallback", roleIds.EMPTY, roleIds.FALLBACK, {
    title: "Empty ammo uses secondary fire.", unitName: "Grunt", targetLabel: "Fallback",
    body: "A ground unit with no primary ammo uses a range-1 Rifle fallback at 55% base attack.",
    forecast: "The forecast labels secondary fire and does not spend ammo.",
    result: "Secondary fire is weaker, but the unit is not helpless."
  }).map((step, index, list) => index === list.length - 1 ? { ...step, completesLesson: true } : step)
];

const supportIds = Object.freeze({
  MEDIC: "support-medic",
  GRUNT: "support-grunt",
  MECHANIC: "support-mechanic",
  VEHICLE: "support-vehicle",
  PASSENGER: "support-passenger",
  TRANSPORT: "support-runner"
});

function createSupportTransportState() {
  return createLessonState({
    lessonId: TUTORIAL_LESSON_IDS.SUPPORT_TRANSPORT,
    mapName: "Service and Transport Bay",
    goal: { type: MAP_GOAL_TYPES.SURVIVE, turnLimit: 20 },
    playerUnits: [
      unit("medic", supportIds.MEDIC, TURN_SIDES.PLAYER, 1, 1),
      unit("grunt", supportIds.GRUNT, TURN_SIDES.PLAYER, 2, 1, { current: { hp: 35, ammo: 1, stamina: 12 } }),
      unit("mechanic", supportIds.MECHANIC, TURN_SIDES.PLAYER, 1, 3),
      unit("bruiser", supportIds.VEHICLE, TURN_SIDES.PLAYER, 2, 3, { current: { hp: 38, ammo: 1, stamina: 10 } }),
      unit("grunt", supportIds.PASSENGER, TURN_SIDES.PLAYER, 5, 5),
      unit("runner", supportIds.TRANSPORT, TURN_SIDES.PLAYER, 6, 5)
    ],
    enemyUnits: []
  });
}

const SUPPORT_STEPS = [
  withActionLabel({ id: "support-intro", title: "Restore the right unit family.", body: "Medics service adjacent infantry; Mechanics service adjacent vehicles. Support restores 50% max HP and fully resupplies ammo and stamina, then starts a cooldown.", expectedAction: { type: "continue" } }),
  withActionLabel({ id: "support-medic-select", title: "Select the Medic.", body: "The adjacent Grunt is damaged and depleted.", battlefieldHighlights: [{ type: "unit", id: supportIds.MEDIC, label: "Medic", tone: "ally" }], expectedAction: { type: "selectUnit", unitId: supportIds.MEDIC } }),
  withActionLabel({ id: "support-medic-hold", title: "Open Medic orders.", body: "Hold position to expose the Heal command.", battlefieldHighlights: [{ type: "unit", id: supportIds.MEDIC, label: "Hold", tone: "ally" }], expectedAction: { type: "holdUnit", unitId: supportIds.MEDIC } }),
  withActionLabel({ id: "support-medic-use", title: "Heal and resupply infantry.", body: "Use Heal. With one valid adjacent target, the normal support action resolves immediately.", uiSelectors: ['[data-action="use-support"]'], battlefieldHighlights: [{ type: "unit", id: supportIds.GRUNT, label: "Restore", tone: "goal" }], expectedAction: { type: "button", action: "use-support", targetUnitId: supportIds.GRUNT } }),
  withActionLabel({ id: "support-mechanic-select", title: "Select the Mechanic.", body: "Mechanics use the same action flow but only service vehicles.", battlefieldHighlights: [{ type: "unit", id: supportIds.MECHANIC, label: "Mechanic", tone: "ally" }], expectedAction: { type: "selectUnit", unitId: supportIds.MECHANIC } }),
  withActionLabel({ id: "support-mechanic-hold", title: "Open Mechanic orders.", body: "Hold position beside the damaged Bruiser.", battlefieldHighlights: [{ type: "unit", id: supportIds.MECHANIC, label: "Hold", tone: "ally" }], expectedAction: { type: "holdUnit", unitId: supportIds.MECHANIC } }),
  withActionLabel({ id: "support-mechanic-use", title: "Repair the vehicle.", body: "Repair restores the vehicle and starts the Mechanic's three-turn support cooldown.", uiSelectors: ['[data-action="use-support"]'], battlefieldHighlights: [{ type: "unit", id: supportIds.VEHICLE, label: "Repair", tone: "goal" }], expectedAction: { type: "button", action: "use-support", targetUnitId: supportIds.VEHICLE } }),
  withActionLabel({ id: "transport-select", title: "Select the passenger.", body: "Any non-hostage infantry can board an adjacent empty Runner.", battlefieldHighlights: [{ type: "unit", id: supportIds.PASSENGER, label: "Passenger", tone: "ally" }, { type: "unit", id: supportIds.TRANSPORT, label: "Runner", tone: "goal" }], expectedAction: { type: "selectUnit", unitId: supportIds.PASSENGER } }),
  withActionLabel({ id: "transport-hold", title: "Open passenger orders.", body: "Hold position while adjacent to the Runner.", battlefieldHighlights: [{ type: "unit", id: supportIds.PASSENGER, label: "Hold", tone: "ally" }], expectedAction: { type: "holdUnit", unitId: supportIds.PASSENGER } }),
  withActionLabel({ id: "transport-enter", title: "Board the Runner.", body: "Entering spends the passenger. If a loaded Runner is destroyed, its passenger is lost too.", uiSelectors: ['[data-action="enter-transport"]'], battlefieldHighlights: [{ type: "unit", id: supportIds.TRANSPORT, label: "Enter", tone: "goal" }], expectedAction: { type: "button", action: "enter-transport", targetUnitId: supportIds.TRANSPORT } }),
  withActionLabel({ id: "transport-move", title: "Move while loaded.", body: "A Runner may move before unloading. Move to the highlighted tile.", battlefieldHighlights: [{ type: "tile", x: 7, y: 5, label: "Move loaded", tone: "goal" }], expectedAction: { type: "moveUnit", unitId: supportIds.TRANSPORT, x: 7, y: 5 } }),
  withActionLabel({ id: "transport-unload-mode", title: "Choose Unload.", body: "Attacking with the Runner would lock unloading for this turn.", uiSelectors: ['[data-action="begin-unload"]'], expectedAction: { type: "button", action: "begin-unload" } }),
  { ...withActionLabel({ id: "transport-unload", title: "Place the passenger.", body: "Unload onto a legal adjacent tile. Both Runner and passenger are spent afterward.", battlefieldHighlights: [{ type: "tile", x: 8, y: 5, label: "Unload", tone: "goal" }], expectedAction: { type: "unloadTile", unitId: supportIds.TRANSPORT, x: 8, y: 5 } }), completesLesson: true }
];

function createBuildingsState() {
  const state = createTutorialBattleState();
  state.id = "battle-tutorial-buildings";
  state.map.id = "tutorial-buildings";
  state.map.name = "Capture and Supply Range";
  state.player.units = [
    unit("grunt", "buildings-capper", TURN_SIDES.PLAYER, 3, 4, { current: { hp: 55, ammo: 2, stamina: 20 } }),
    unit("grunt", "buildings-hospital-unit", TURN_SIDES.PLAYER, 4, 2, { current: { hp: 35, ammo: 1, stamina: 10 } }),
    unit("runner", "buildings-repair-unit", TURN_SIDES.PLAYER, 5, 4, { current: { hp: 35, ammo: 1, stamina: 10 } }),
    unit("grunt", "buildings-hq-capper", TURN_SIDES.PLAYER, 8, 3)
  ];
  const repair = { id: "tutorial-repair-station", type: BUILDING_KEYS.REPAIR_STATION, owner: TURN_SIDES.PLAYER, x: 5, y: 4 };
  state.map.buildings = state.map.buildings.filter((building) => building.id !== TUTORIAL_IDS.ENEMY_BARRACKS);
  const hospital = state.map.buildings.find((building) => building.id === TUTORIAL_IDS.HOSPITAL);
  if (hospital) hospital.owner = TURN_SIDES.PLAYER;
  state.map.buildings.push(repair);
  state.enemy.units = [];
  state.map.goal = { type: MAP_GOAL_TYPES.HQ_CAPTURE };
  return normalizeBattleState(state);
}

const BUILDING_STEPS = [
  withActionLabel({ id: "building-intro", title: "Ownership, armor, and service.", body: "Buildings replace terrain armor at their tile. Capture spends the unit's action; Supply is a separate action on a later turn.", expectedAction: { type: "continue" } }),
  withActionLabel({ id: "building-select-sector", title: "Select the Grunt on the neutral Sector.", body: "Combat infantry can capture; Medic and Mechanic cannot.", battlefieldHighlights: [{ type: "unit", id: "buildings-capper", label: "Select", tone: "ally" }], expectedAction: { type: "selectUnit", unitId: "buildings-capper" } }),
  withActionLabel({ id: "building-hold-sector", title: "Open capture orders.", body: "Hold position on the building.", battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.NEUTRAL_SECTOR, label: "Neutral", tone: "goal" }], expectedAction: { type: "holdUnit", unitId: "buildings-capper" } }),
  withActionLabel({ id: "building-capture-sector", title: "Capture the Sector.", body: "Tutorial captures award no Intel or EXP. In a Run, the first capture of each building pays 2 Intel and 20 EXP.", uiSelectors: ['[data-action="capture-building"]'], expectedAction: { type: "button", action: "capture-building", buildingId: TUTORIAL_IDS.NEUTRAL_SECTOR } }),
  withActionLabel({ id: "building-end-turn-for-supply", title: "Capture ends this unit's action.", body: "The Grunt cannot reopen orders or Supply this turn. End Turn; this empty drill will immediately return control to you.", uiSelectors: ['[data-action="end-turn"]'], battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.NEUTRAL_SECTOR, label: "Now owned", tone: "ally" }], expectedAction: { type: "endTurn", nudge: "The Grunt is spent after Capture. End Turn before trying to Supply." } }),
  withActionLabel({ id: "building-select-sector-for-supply", title: "New turn: select the Grunt again.", body: "Units become ready when their next turn begins. Select the Grunt standing on your Sector.", battlefieldHighlights: [{ type: "unit", id: "buildings-capper", label: "Ready", tone: "ally" }], expectedAction: { type: "selectUnit", unitId: "buildings-capper" } }),
  withActionLabel({ id: "building-hold-sector-for-supply", title: "Open the new turn's orders.", body: "Hold position on the owned Sector to open the command menu without leaving it.", battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.NEUTRAL_SECTOR, label: "Hold", tone: "goal" }], expectedAction: { type: "holdUnit", unitId: "buildings-capper" } }),
  withActionLabel({ id: "building-resupply-sector", title: "Choose Supply.", body: "Supply spends this turn's action. A Sector restores 10% HP and 25% ammo and stamina.", uiSelectors: ['[data-action="use-supply"]'], battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.NEUTRAL_SECTOR, label: "Supply", tone: "goal" }], expectedAction: { type: "button", action: "use-supply", nudge: "Choose Supply from the highlighted command menu." } }),
  withActionLabel({ id: "building-service-sites", title: "Use specialized service sites.", body: "Hospitals fully service infantry; Repair Stations fully service vehicles. Use Supply with both highlighted units.", battlefieldHighlights: [{ type: "unit", id: "buildings-hospital-unit", label: "Hospital", tone: "ally" }, { type: "unit", id: "buildings-repair-unit", label: "Repair Station", tone: "ally" }], expectedAction: { type: "objective", predicate: "service-sites-complete", unitIds: ["buildings-hospital-unit", "buildings-repair-unit"] } }),
  withActionLabel({ id: "building-hq-capture", title: "Capture the enemy HQ.", body: "HQ Capture is decided by ownership; routing every defender is unnecessary. Protect your own HQ while taking theirs.", battlefieldHighlights: [{ type: "unit", id: "buildings-hq-capper", label: "Capturer", tone: "ally" }, { type: "building", id: TUTORIAL_IDS.ENEMY_COMMAND, label: "Enemy HQ", tone: "danger" }], expectedAction: { type: "objective", predicate: "enemy-hq-captured" } })
];

function scenarioBuildings(goal) {
  const base = createTutorialMapDefinition();
  base.goal = goal;
  base.buildings = base.buildings.filter((building) => building.id !== TUTORIAL_IDS.ENEMY_BARRACKS);
  return base;
}

function createMissionScenario(scenarioId) {
  if (scenarioId === "hq") {
    return createLessonState({ lessonId: "mission-hq", mapName: "Objective Drill: HQ Capture", goal: { type: MAP_GOAL_TYPES.HQ_CAPTURE }, playerUnits: [unit("grunt", "mission-hq-unit", TURN_SIDES.PLAYER, 8, 3)], enemyUnits: [] });
  }

  if (scenarioId === "rescue-pickup" || scenarioId === "rescue-dropoff") {
    const goal = { type: MAP_GOAL_TYPES.RESCUE, target: { x: 4, y: 2 } };
    const carrier = unit("grunt", "mission-rescue-unit", TURN_SIDES.PLAYER, scenarioId === "rescue-pickup" ? 4 : 1, scenarioId === "rescue-pickup" ? 2 : 5);
    const state = createLessonState({ lessonId: `mission-${scenarioId}`, mapName: "Objective Drill: Rescue", goal, buildings: scenarioBuildings(goal).buildings, playerUnits: [carrier], enemyUnits: [] });
    if (scenarioId === "rescue-dropoff") {
      state.mission.rescue.status = "carried";
      state.mission.rescue.carrierUnitId = carrier.id;
      state.player.units[0].mission = { carryingHostage: true };
    }
    return normalizeBattleState(state);
  }

  if (scenarioId === "defend") {
    const goal = { type: MAP_GOAL_TYPES.DEFEND, target: { x: 3, y: 4 }, turnLimit: 1 };
    return createLessonState({ lessonId: "mission-defend", mapName: "Objective Drill: Defend", goal, buildings: scenarioBuildings(goal).buildings, playerUnits: [unit("grunt", "mission-defender", TURN_SIDES.PLAYER, 2, 4)], enemyUnits: [] });
  }

  if (scenarioId === "survive") {
    return createLessonState({ lessonId: "mission-survive", mapName: "Objective Drill: Survive", goal: { type: MAP_GOAL_TYPES.SURVIVE, turnLimit: 1 }, playerUnits: [unit("grunt", "mission-survivor", TURN_SIDES.PLAYER, 2, 4)], enemyUnits: [] });
  }

  return createLessonState({ lessonId: "mission-rout", mapName: "Objective Drill: Rout", playerUnits: [unit("grunt", "mission-router", TURN_SIDES.PLAYER, 2, 4)], enemyUnits: [unit("grunt", "mission-rout-target", TURN_SIDES.ENEMY, 3, 4, { current: { hp: 1 } })] });
}

function missionResultStep({ id, objective, title, body, actionLabel, kind = "victory", completesLesson = false }) {
  const step = withActionLabel({
    id,
    title,
    body,
    actionLabel,
    stageResult: {
      kind,
      label: kind === "victory" ? "Objective Secured" : "Objective Checkpoint",
      objective
    },
    expectedAction: {
      type: "continue",
      nudge: "Review the result, then Continue when you are ready."
    }
  });

  return completesLesson ? { ...step, completesLesson: true } : step;
}

const MISSION_STEPS = [
  withActionLabel({ id: "mission-rout", scenarioId: "rout", title: "Rout: defeat every enemy.", body: "Use normal selection, movement, forecast, and Fire to remove the marked enemy.", battlefieldHighlights: [{ type: "unit", id: "mission-rout-target", label: "Final enemy", tone: "danger" }], expectedAction: { type: "objective", predicate: "rout-complete" } }),
  missionResultStep({ id: "mission-rout-complete", objective: "Rout", title: "Victory: enemy force routed.", body: "Every enemy unit was defeated, so the real mission resolver declared a Rout victory.", actionLabel: "Continue to HQ Capture" }),
  withActionLabel({ id: "mission-hq", scenarioId: "hq", title: "HQ Capture: take command ownership.", body: "The Grunt begins on the enemy HQ. Select it, hold position, and Capture.", battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.ENEMY_COMMAND, label: "Capture", tone: "goal" }], expectedAction: { type: "objective", predicate: "enemy-hq-captured" } }),
  missionResultStep({ id: "mission-hq-complete", objective: "HQ Capture", title: "Victory: enemy HQ secured.", body: "Changing HQ ownership ended the mission immediately; defeating every enemy was unnecessary.", actionLabel: "Continue to Rescue" }),
  withActionLabel({ id: "mission-rescue-pickup", scenarioId: "rescue-pickup", title: "Rescue: pick up the hostage.", body: "Select the unit on the marked building, hold, and choose Rescue. Hostage carriers lose one movement, cannot attack, and cannot board.", battlefieldHighlights: [{ type: "unit", id: "mission-rescue-unit", label: "Rescue", tone: "ally" }], expectedAction: { type: "objective", predicate: "hostage-picked-up" } }),
  missionResultStep({ id: "mission-rescue-pickup-complete", objective: "Rescue", title: "Checkpoint: hostage secured.", body: "Pickup is only the first half of Rescue. The mission ends after the carrier reaches your HQ and chooses Drop Off.", actionLabel: "Continue to Drop Off", kind: "checkpoint" }),
  withActionLabel({ id: "mission-rescue-dropoff", scenarioId: "rescue-dropoff", title: "Rescue: deliver to your HQ.", body: "The carrier is now on your HQ. Select, hold, and choose Drop Off. Losing the carrier fails the mission.", battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.PLAYER_COMMAND, label: "Drop Off", tone: "goal" }], expectedAction: { type: "objective", predicate: "rescue-complete" } }),
  missionResultStep({ id: "mission-rescue-complete", objective: "Rescue", title: "Victory: hostage extracted.", body: "The hostage reached your HQ safely, so the Rescue mission is complete.", actionLabel: "Continue to Defend" }),
  withActionLabel({ id: "mission-defend", scenarioId: "defend", title: "Defend: hold the marked target.", body: "The target has two integrity points. Adjacent enemy sabotage removes one. End Turn and keep it intact until the timer expires.", uiSelectors: ['[data-action="end-turn"]'], expectedAction: { type: "objective", predicate: "player-victory", allowedActions: ["end-turn"] } }),
  missionResultStep({ id: "mission-defend-complete", objective: "Defend", title: "Victory: target held.", body: "The timer expired while the objective retained integrity, producing a Defend victory.", actionLabel: "Continue to Survive" }),
  withActionLabel({ id: "mission-survive", scenarioId: "survive", title: "Survive: keep at least one unit alive.", body: "Enemy elimination does not end Survive early. End Turn to reach the timer with the highlighted unit alive.", uiSelectors: ['[data-action="end-turn"]'], expectedAction: { type: "objective", predicate: "player-victory", allowedActions: ["end-turn"] } }),
  missionResultStep({ id: "mission-survive-complete", objective: "Survive", title: "Victory: survival timer cleared.", body: "At least one friendly unit remained when the timer expired. All five objective drills are complete.", actionLabel: "Finish Lesson", completesLesson: true })
];

function createCommanderState() {
  const state = createLessonState({
    lessonId: TUTORIAL_LESSON_IDS.COMMANDERS_STATUS_RUN,
    mapName: "Commander Systems Range",
    goal: { type: MAP_GOAL_TYPES.HQ_CAPTURE },
    playerCharge: getCommanderPowerMax("atlas") - 8,
    playerUnits: [
      unit("grunt", "commander-attacker", TURN_SIDES.PLAYER, 3, 3, { experience: 88, current: { hp: 55 } }),
      unit("breaker", "commander-burned", TURN_SIDES.PLAYER, 2, 4, { current: { hp: 45 }, statuses: [{ type: "burn", turnsRemaining: 1, tickSide: TURN_SIDES.PLAYER, tickDamageRatio: 0.1 }] }),
      unit("runner", "commander-corrupted", TURN_SIDES.PLAYER, 2, 2, { current: { hp: 50 }, statuses: [{ type: "corrupted", stat: "armor", turnsRemaining: 1, tickSide: TURN_SIDES.PLAYER }] })
    ],
    enemyUnits: [unit("grunt", "commander-target", TURN_SIDES.ENEMY, 4, 3, { current: { hp: 20 } })]
  });
  state.player.commanderId = "atlas";
  return normalizeBattleState(state);
}

const COMMANDER_STEPS = [
  withActionLabel({ id: "commander-intro", title: "Traits are passive; powers are timed.", body: "Atlas heals all friendly units for 10% max HP at the start of the player's turn. Combat fills the commander meter.", expectedAction: { type: "continue" } }),
  withActionLabel({ id: "commander-charge", title: "Fill the commander meter through combat.", body: "Defeat the marked enemy. Attackers gain half damage dealt as charge; defenders gain damage taken. This training drill then grants enough temporary EXP to demonstrate a real level-up.", onComplete: "grant-training-level-up", onCompletePayload: { unitId: "commander-attacker", experience: 12 }, battlefieldHighlights: [{ type: "unit", id: "commander-attacker", label: "Attacker", tone: "ally" }, { type: "unit", id: "commander-target", label: "Charge + EXP", tone: "danger" }], expectedAction: { type: "objective", predicate: "commander-charged" } }),
  withActionLabel({ id: "commander-level", title: "Acknowledge the level-up.", body: "Each stat rolls independently from shared growths plus unit modifiers; if none grow, one weighted fallback is guaranteed.", uiSelectors: ['[data-action="acknowledge-level-up"]'], expectedAction: { type: "objective", predicate: "level-up-cleared", unitId: "commander-attacker" } }),
  withActionLabel({ id: "commander-passive", title: "Start the next player turn.", body: "End Turn. Atlas will repair the squad when control returns; Burn also ticks on its owner's turn and cannot kill by itself.", uiSelectors: ['[data-action="end-turn"]'], expectedAction: { type: "endTurn" } }),
  withActionLabel({ id: "commander-power", title: "Activate Overhaul.", body: "Overhaul restores 33% HP, grants +3 armor for one turn, and cleanses Burned and Corrupted.", uiSelectors: ['[data-action="activate-power"]'], battlefieldHighlights: [{ type: "unit", id: "commander-burned", label: "Cleanse", tone: "ally" }, { type: "unit", id: "commander-corrupted", label: "Cleanse", tone: "ally" }], expectedAction: { type: "activatePower" } }),
  { ...withActionLabel({ id: "commander-run-summary", title: "Carry the squad through a Run.", body: `A Run targets ${PROTOTYPE_RUN_GOAL} maps, pays ${RUN_META_CURRENCY_MAP_REWARD} Intel per clear, and adds ${RUN_META_CURRENCY_CLEAR_BONUS} Intel for a full clear. Survivors keep identity, level, EXP, grown stats, and gear; HP, ammo, and stamina refresh between maps.`, expectedAction: { type: "continue" } }), completesLesson: true }
];

export const TUTORIAL_LESSONS = Object.freeze([
  { id: TUTORIAL_LESSON_IDS.BASIC_ORDERS, order: 1, title: "Basic Orders", duration: "10-12 min", summary: "Move, forecast, attack, wait, end turns, and finish a real objective.", topics: ["Movement", "Combat", "Turn Flow"], steps: BASIC_ORDER_STEPS, createBattleState: createTutorialBattleState },
  { id: TUTORIAL_LESSON_IDS.COMBAT_ROLES_TERRAIN, order: 2, title: "Combat Roles and Terrain", duration: "10 min", summary: "Practice target matchups, range bands, terrain, aircraft, artillery, and empty-ammo fallback.", topics: ["Matchups", "Terrain", "Range"], steps: COMBAT_ROLE_STEPS, createBattleState: createCombatRolesState },
  { id: TUTORIAL_LESSON_IDS.SUPPORT_TRANSPORT, order: 3, title: "Support and Transport", duration: "7 min", summary: "Heal infantry, repair vehicles, board a Runner, move loaded, and unload safely.", topics: ["Support", "Transport"], steps: SUPPORT_STEPS, createBattleState: createSupportTransportState },
  { id: TUTORIAL_LESSON_IDS.BUILDINGS_CAPTURE_SUPPLY, order: 4, title: "Buildings, Capture, and Supply", duration: "8 min", summary: "Capture territory, use explicit Supply, service unit families, and take an enemy HQ.", topics: ["Buildings", "Supply", "HQ Capture"], steps: BUILDING_STEPS, createBattleState: createBuildingsState },
  { id: TUTORIAL_LESSON_IDS.MISSION_OBJECTIVES, order: 5, title: "Mission Objectives", duration: "8 min", summary: "Play real Rout, HQ Capture, Rescue, Defend, and Survive rules in compact drills.", topics: ["Objectives", "Failure Rules"], steps: MISSION_STEPS, createBattleState: () => createMissionScenario("rout") },
  { id: TUTORIAL_LESSON_IDS.COMMANDERS_STATUS_RUN, order: 6, title: "Commanders, Status Effects, and Run Progression", duration: "8 min", summary: "Charge a power, level a unit, observe statuses, and learn what persists across a Run.", topics: ["Commanders", "Statuses", "Progression"], steps: COMMANDER_STEPS, createBattleState: createCommanderState }
].map((lesson) => Object.freeze({
  ...lesson,
  completionEffect: "record-lesson-completion"
})));

export function getTutorialLesson(lessonId) {
  return TUTORIAL_LESSONS.find((lesson) => lesson.id === lessonId) ?? null;
}

export function createTutorialHubSession(overrides = {}) {
  return {
    phase: "hub",
    activeTab: "guided",
    activeLessonId: null,
    stepIndex: 0,
    nudge: null,
    sessionId: null,
    appliedEffectKeys: [],
    currentScenarioId: null,
    returnIntent: null,
    ...overrides
  };
}

export function createTutorialLessonSession(lessonId, { returnIntent = null } = {}) {
  return createTutorialHubSession({
    phase: "battle",
    activeLessonId: lessonId,
    returnIntent,
    sessionId: `tutorial-session-${++tutorialSessionSequence}`,
    startedAt: Date.now()
  });
}

export function createTutorialLessonPresentation(session) {
  const lesson = getTutorialLesson(session?.activeLessonId);
  const step = getTutorialLessonStep(session?.activeLessonId, session?.stepIndex);

  if (!lesson || !step || !["battle", "lesson-complete"].includes(session?.phase)) {
    return null;
  }

  const complete = session.phase === "lesson-complete";
  return {
    phase: session.phase,
    returnIntent: session.returnIntent ?? null,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    stepId: step.id,
    title: complete ? `${lesson.title} complete.` : step.title,
    body: complete ? "Training record saved. Replay this lesson any time, or continue through the curriculum." : step.body,
    actionLabel: complete ? "Return to the Tutorial Hub" : step.actionLabel,
    progress: complete ? "Complete" : `${session.stepIndex + 1}/${lesson.steps.length}`,
    mascotName: "Pip",
    nudge: session.nudge?.message ?? null,
    canContinue: !complete && step.expectedAction?.type === "continue",
    canExit: !complete,
    uiSelectors: [...(step.uiSelectors ?? [])],
    battlefieldHighlights: structuredClone(step.battlefieldHighlights ?? []),
    stageResult: step.stageResult ? structuredClone(step.stageResult) : null,
    dimUnrelated:
      step.guidanceMode === "hard" &&
      ["selectUnit", "moveUnit", "holdUnit", "attackTarget", "unloadTile"].includes(step.expectedAction?.type)
  };
}

export function getTutorialLessonStep(lessonId, stepIndex = 0) {
  const lesson = getTutorialLesson(lessonId);
  const index = Math.max(0, Math.min((lesson?.steps.length ?? 1) - 1, Number(stepIndex) || 0));
  return lesson?.steps[index] ?? null;
}

export function createTutorialLessonBattleState(lessonId, scenarioId = null) {
  if (lessonId === TUTORIAL_LESSON_IDS.MISSION_OBJECTIVES && scenarioId) {
    return createMissionScenario(scenarioId);
  }

  const lesson = getTutorialLesson(lessonId);
  const state = lesson?.createBattleState?.() ?? null;

  if (state) {
    state.mode = BATTLE_MODES.TUTORIAL;
  }

  return state;
}

export function validateTutorialCurriculum() {
  const errors = [];
  const lessonIds = new Set(TUTORIAL_LESSONS.map((lesson) => lesson.id));

  for (const expectedId of TUTORIAL_LESSON_ORDER) {
    if (!lessonIds.has(expectedId)) {
      errors.push(`Missing lesson: ${expectedId}`);
    }
  }

  for (const lesson of TUTORIAL_LESSONS) {
    if (!lesson.steps.length) {
      errors.push(`${lesson.id} has no steps.`);
    }
    if (!TUTORIAL_COMPLETION_EFFECT_NAMES.has(lesson.completionEffect)) {
      errors.push(`${lesson.id} has an unknown completion effect: ${lesson.completionEffect ?? "none"}`);
    }

    const stepIds = new Set();
    for (const [stepIndex, step] of lesson.steps.entries()) {
      if (!step.id || stepIds.has(step.id)) {
        errors.push(`${lesson.id} has a missing or duplicate step id: ${step.id ?? "unknown"}`);
      }
      stepIds.add(step.id);
      if (step.completesLesson && stepIndex !== lesson.steps.length - 1) {
        errors.push(`${lesson.id}/${step.id} completes before the final registry step.`);
      }

      const expected = step.expectedAction;
      const state = createTutorialLessonBattleState(lesson.id, step.scenarioId);
      const units = [...(state?.player?.units ?? []), ...(state?.enemy?.units ?? [])];
      const unitIds = new Set(units.map((unit) => unit.id));
      const buildingIds = new Set((state?.map?.buildings ?? []).map((building) => building.id));
      const isValidTile = (candidate) => Number.isInteger(candidate?.x) &&
        Number.isInteger(candidate?.y) && candidate.x >= 0 && candidate.y >= 0 &&
        candidate.x < (state?.map?.width ?? 0) && candidate.y < (state?.map?.height ?? 0);

      if (!state || state.mode !== BATTLE_MODES.TUTORIAL) {
        errors.push(`${lesson.id}/${step.id} could not create a tutorial scenario.`);
        continue;
      }
      if (!TUTORIAL_EXPECTED_ACTION_TYPES.has(expected?.type)) {
        errors.push(`${lesson.id}/${step.id} has an unknown action type: ${expected?.type ?? "none"}`);
      }
      if (expected?.type === "button" && !TUTORIAL_BUTTON_ACTIONS.has(expected.action)) {
        errors.push(`${lesson.id}/${step.id} has an unknown button action: ${expected.action ?? "none"}`);
      }
      if (expected?.type === "objective" && !TUTORIAL_OBJECTIVE_PREDICATES[expected.predicate]) {
        errors.push(`${lesson.id}/${step.id} has an unknown objective predicate: ${expected.predicate ?? "none"}`);
      }
      if (step.onEnter && !TUTORIAL_ENTRY_EFFECT_NAMES.has(step.onEnter)) {
        errors.push(`${lesson.id}/${step.id} has an unknown entry effect: ${step.onEnter}`);
      }
      if (step.onComplete && !TUTORIAL_STEP_COMPLETION_EFFECT_NAMES.has(step.onComplete)) {
        errors.push(`${lesson.id}/${step.id} has an unknown completion effect: ${step.onComplete}`);
      }
      if (expected?.unitId && !unitIds.has(expected.unitId)) {
        errors.push(`${lesson.id}/${step.id} references an unknown unit: ${expected.unitId}`);
      }
      if (expected?.targetUnitId && !unitIds.has(expected.targetUnitId)) {
        errors.push(`${lesson.id}/${step.id} references an unknown target unit: ${expected.targetUnitId}`);
      }
      for (const unitId of expected?.unitIds ?? []) {
        if (!unitIds.has(unitId)) errors.push(`${lesson.id}/${step.id} references an unknown unit: ${unitId}`);
      }
      if (expected?.buildingId && !buildingIds.has(expected.buildingId)) {
        errors.push(`${lesson.id}/${step.id} references an unknown building: ${expected.buildingId}`);
      }
      if ((Number.isInteger(expected?.x) || Number.isInteger(expected?.y)) && !isValidTile(expected)) {
        errors.push(`${lesson.id}/${step.id} references an invalid tile.`);
      }
      for (const selector of step.uiSelectors ?? []) {
        if (typeof selector !== "string" || !selector.trim()) errors.push(`${lesson.id}/${step.id} has an invalid UI selector.`);
      }
      for (const highlight of step.battlefieldHighlights ?? []) {
        if (highlight.type === "unit" && !unitIds.has(highlight.id)) {
          errors.push(`${lesson.id}/${step.id} highlights an unknown unit: ${highlight.id}`);
        } else if (highlight.type === "building" && !buildingIds.has(highlight.id)) {
          errors.push(`${lesson.id}/${step.id} highlights an unknown building: ${highlight.id}`);
        } else if (highlight.type === "tile" && !isValidTile(highlight)) {
          errors.push(`${lesson.id}/${step.id} highlights an invalid tile.`);
        } else if (!["unit", "building", "tile"].includes(highlight.type)) {
          errors.push(`${lesson.id}/${step.id} has an unknown highlight type: ${highlight.type ?? "none"}`);
        }
      }
    }
  }

  return errors;
}
