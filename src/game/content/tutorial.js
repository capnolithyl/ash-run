import {
  BATTLE_MODES,
  BUILDING_KEYS,
  ENEMY_AI_ARCHETYPES,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../core/constants.js";
import { stringToSeed } from "../core/random.js";
import { getCommanderPowerMax } from "./commanders.js";
import { MAP_GOAL_TYPES } from "./mapGoals.js";
import { createUnitFromType } from "../simulation/unitFactory.js";
import { normalizeBattleState } from "../state/runFactory.js";

export const TUTORIAL_IDS = {
  MAP: "tutorial-training-yard",
  GRUNT: "tutorial-grunt",
  BREAKER: "tutorial-breaker",
  LONGSHOT: "tutorial-longshot",
  SKYGUARD: "tutorial-skyguard",
  CAPPER: "tutorial-capper",
  RUNNER: "tutorial-enemy-runner",
  ENEMY_GRUNT: "tutorial-enemy-grunt",
  GUNSHIP: "tutorial-enemy-gunship",
  WATCHMAN: "tutorial-enemy-watchman",
  PLAYER_COMMAND: "tutorial-player-command",
  NEUTRAL_SECTOR: "tutorial-neutral-sector",
  HOSPITAL: "tutorial-neutral-hospital",
  ENEMY_COMMAND: "tutorial-enemy-command",
  ENEMY_BARRACKS: "tutorial-enemy-barracks"
};

function createTutorialTiles() {
  return [
    [
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.FOREST,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN
    ],
    [
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.FOREST,
      TERRAIN_KEYS.PLAIN
    ],
    [
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN
    ],
    [
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN
    ],
    [
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN
    ],
    [
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.ROAD,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN
    ],
    [
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN,
      TERRAIN_KEYS.PLAIN
    ]
  ];
}

export function createTutorialMapDefinition() {
  return {
    id: TUTORIAL_IDS.MAP,
    name: "Pip's Training Yard",
    theme: "ash",
    width: 10,
    height: 7,
    tiles: createTutorialTiles(),
    buildings: [
      {
        id: TUTORIAL_IDS.PLAYER_COMMAND,
        type: BUILDING_KEYS.COMMAND,
        owner: TURN_SIDES.PLAYER,
        x: 1,
        y: 5
      },
      {
        id: TUTORIAL_IDS.NEUTRAL_SECTOR,
        type: BUILDING_KEYS.SECTOR,
        owner: "neutral",
        x: 3,
        y: 4
      },
      {
        id: TUTORIAL_IDS.HOSPITAL,
        type: BUILDING_KEYS.HOSPITAL,
        owner: "neutral",
        x: 4,
        y: 2
      },
      {
        id: TUTORIAL_IDS.ENEMY_COMMAND,
        type: BUILDING_KEYS.COMMAND,
        owner: TURN_SIDES.ENEMY,
        x: 8,
        y: 3
      },
      {
        id: TUTORIAL_IDS.ENEMY_BARRACKS,
        type: BUILDING_KEYS.BARRACKS,
        owner: TURN_SIDES.ENEMY,
        x: 8,
        y: 4,
        canCapture: false
      }
    ],
    units: [],
    playerSpawns: [
      { x: 1, y: 4 },
      { x: 2, y: 5 },
      { x: 3, y: 3 },
      { x: 2, y: 2 }
    ],
    enemySpawns: [
      { x: 8, y: 3 },
      { x: 8, y: 4 }
    ],
    goal: {
      type: MAP_GOAL_TYPES.HQ_CAPTURE
    }
  };
}

function createTutorialUnit(unitTypeId, owner, id, x, y, overrides = {}) {
  const unit = createUnitFromType(unitTypeId, owner, overrides.level ?? 1);
  unit.id = id;
  unit.x = x;
  unit.y = y;

  if (overrides.current) {
    unit.current = {
      ...unit.current,
      ...overrides.current
    };
  }

  if (overrides.stats) {
    unit.stats = {
      ...unit.stats,
      ...overrides.stats
    };
  }

  return unit;
}

function createTutorialPlayerUnits() {
  return [
    createTutorialUnit("grunt", TURN_SIDES.PLAYER, TUTORIAL_IDS.GRUNT, 1, 4),
    createTutorialUnit("breaker", TURN_SIDES.PLAYER, TUTORIAL_IDS.BREAKER, 2, 5),
    createTutorialUnit("longshot", TURN_SIDES.PLAYER, TUTORIAL_IDS.LONGSHOT, 3, 3),
    createTutorialUnit("skyguard", TURN_SIDES.PLAYER, TUTORIAL_IDS.SKYGUARD, 2, 2),
    createTutorialUnit("grunt", TURN_SIDES.PLAYER, TUTORIAL_IDS.CAPPER, 6, 2)
  ];
}

function createTutorialEnemyUnits() {
  return [
    createTutorialUnit("runner", TURN_SIDES.ENEMY, TUTORIAL_IDS.RUNNER, 5, 5, {
      current: { hp: 72 }
    }),
    createTutorialUnit("grunt", TURN_SIDES.ENEMY, TUTORIAL_IDS.ENEMY_GRUNT, 5, 3, {
      current: { hp: 68 }
    }),
    createTutorialUnit("gunship", TURN_SIDES.ENEMY, TUTORIAL_IDS.GUNSHIP, 5, 2, {
      current: { hp: 82 }
    }),
    createTutorialUnit("grunt", TURN_SIDES.ENEMY, TUTORIAL_IDS.WATCHMAN, 8, 6, {
      current: { hp: 70 }
    })
  ];
}

function createTutorialIncomeTable() {
  return {
    [BUILDING_KEYS.SECTOR]: 0,
    [BUILDING_KEYS.COMMAND]: 0,
    [BUILDING_KEYS.BARRACKS]: 0,
    [BUILDING_KEYS.MOTOR_POOL]: 0,
    [BUILDING_KEYS.AIRFIELD]: 0,
    [BUILDING_KEYS.HOSPITAL]: 0,
    [BUILDING_KEYS.REPAIR_STATION]: 0
  };
}

export function createTutorialBattleState() {
  const battleState = {
    id: "battle-tutorial-training-yard",
    mode: BATTLE_MODES.TUTORIAL,
    seed: stringToSeed("tutorial-training-yard"),
    difficultyTier: 1,
    map: createTutorialMapDefinition(),
    turn: {
      number: 1,
      activeSide: TURN_SIDES.PLAYER
    },
    player: {
      commanderId: "atlas",
      funds: 0,
      charge: 0,
      recruitDiscount: 0,
      units: createTutorialPlayerUnits()
    },
    enemy: {
      commanderId: "rook",
      aiArchetype: ENEMY_AI_ARCHETYPES.BALANCED,
      funds: 0,
      charge: 0,
      recruitDiscount: 0,
      recruitsBuiltThisMap: 0,
      units: createTutorialEnemyUnits()
    },
    economy: {
      incomeByType: createTutorialIncomeTable()
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
    log: ["Training sim online. Pip is watching the comms."],
    victory: null
  };

  return normalizeBattleState(battleState);
}

export const TUTORIAL_STEPS = [
  {
    id: "mission-goal",
    title: "Read the mission first.",
    body:
      "Every match has a goal. This one is HQ Capture: take the enemy command post and the sim ends.",
    uiSelectors: [".battle-footer-meta"],
    battlefieldHighlights: [
      { type: "building", id: TUTORIAL_IDS.PLAYER_COMMAND, label: "Your HQ", tone: "ally" },
      { type: "building", id: TUTORIAL_IDS.ENEMY_COMMAND, label: "Enemy HQ", tone: "danger" }
    ],
    expectedAction: {
      type: "continue",
      nudge: "Hit Next in my guide panel first. Tiny briefing, then we move."
    }
  },
  {
    id: "select-grunt",
    title: "Select your Grunt.",
    body:
      "Grunts are combat infantry: cheap, flexible, and able to capture buildings. Click the highlighted Grunt.",
    uiSelectors: [".battle-side-panel--selected"],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.GRUNT, label: "Select", tone: "ally" }],
    expectedAction: {
      type: "selectUnit",
      unitId: TUTORIAL_IDS.GRUNT,
      nudge: "That is not our Grunt. Pick the highlighted infantry first."
    }
  },
  {
    id: "move-grunt-sector",
    title: "Move onto the sector.",
    body:
      "Movement previews show where a unit can go this turn. Move your Grunt onto the neutral sector.",
    uiSelectors: [".battle-side-panel--selected"],
    battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.NEUTRAL_SECTOR, label: "Move here", tone: "goal" }],
    expectedAction: {
      type: "moveUnit",
      unitId: TUTORIAL_IDS.GRUNT,
      x: 3,
      y: 4,
      nudge: "Scoot the Grunt onto the glowing sector so the Capture command appears."
    }
  },
  {
    id: "capture-sector",
    title: "Capture the building.",
    body:
      "Buildings change ownership when combat infantry capture them. In run mode, first captures also pay Intel and EXP.",
    uiSelectors: ['[data-action="capture-building"]', ".battle-command-prompt"],
    battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.NEUTRAL_SECTOR, label: "Capture", tone: "goal" }],
    expectedAction: {
      type: "button",
      action: "capture-building",
      buildingId: TUTORIAL_IDS.NEUTRAL_SECTOR,
      nudge: "Use Capture here. Pip promises the paperwork is very small."
    }
  },
  {
    id: "building-brief",
    title: "Buildings matter.",
    body:
      "Owned buildings create map pressure: income in skirmish, service points, armor from positions, and enemy production lanes.",
    uiSelectors: [".battle-footer-meta", ".battle-side-panel--selected"],
    battlefieldHighlights: [
      { type: "building", id: TUTORIAL_IDS.NEUTRAL_SECTOR, label: "Owned", tone: "ally" },
      { type: "building", id: TUTORIAL_IDS.ENEMY_BARRACKS, label: "Factory", tone: "danger" }
    ],
    expectedAction: {
      type: "continue",
      nudge: "Press Next when you have seen the sector and the enemy barracks."
    }
  },
  {
    id: "select-breaker",
    title: "Breaker beats vehicles.",
    body:
      "Breakers are infantry with anti-vehicle weapons. Select the Breaker and we will crack that Runner.",
    uiSelectors: [".battle-side-panel--selected"],
    battlefieldHighlights: [
      { type: "unit", id: TUTORIAL_IDS.BREAKER, label: "Breaker", tone: "ally" },
      { type: "unit", id: TUTORIAL_IDS.RUNNER, label: "Vehicle", tone: "danger" }
    ],
    expectedAction: {
      type: "selectUnit",
      unitId: TUTORIAL_IDS.BREAKER,
      nudge: "We want the Breaker for the vehicle lesson. Big can-opener energy."
    }
  },
  {
    id: "move-breaker",
    title: "Set up the hit.",
    body:
      "Range matters. Move the Breaker next to the Runner so Fire becomes available.",
    uiSelectors: [".battle-command-prompt"],
    battlefieldHighlights: [
      { type: "tile", x: 4, y: 5, label: "Attack tile", tone: "goal" },
      { type: "unit", id: TUTORIAL_IDS.RUNNER, label: "Target", tone: "danger" }
    ],
    expectedAction: {
      type: "moveUnit",
      unitId: TUTORIAL_IDS.BREAKER,
      x: 4,
      y: 5,
      nudge: "Put the Breaker on the highlighted tile beside the Runner."
    }
  },
  {
    id: "breaker-fire",
    title: "Open the forecast.",
    body:
      "Fire switches to targeting mode. The target intel and hover forecast show damage, counters, ammo, and matchup clues.",
    uiSelectors: ['[data-action="begin-attack"]', ".battle-side-panel--target"],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.RUNNER, label: "Forecast", tone: "danger" }],
    expectedAction: {
      type: "button",
      action: "begin-attack",
      nudge: "Use Fire so the forecast can do its little math dance."
    }
  },
  {
    id: "breaker-target",
    title: "Attack the Runner.",
    body:
      "Breaker weapons are effective into light vehicles. Select the highlighted Runner to commit the attack.",
    uiSelectors: [".battle-targeting-hint", ".battle-side-panel--target"],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.RUNNER, label: "Attack", tone: "danger" }],
    expectedAction: {
      type: "attackTarget",
      unitId: TUTORIAL_IDS.BREAKER,
      targetUnitId: TUTORIAL_IDS.RUNNER,
      nudge: "Target the Runner. Breaker versus vehicle is the lesson."
    }
  },
  {
    id: "select-longshot",
    title: "Longshots punish infantry.",
    body:
      "Longshots fire from 2-3 tiles away, hit infantry hard, and avoid most range-1 counters.",
    uiSelectors: [".battle-side-panel--selected", ".battle-side-panel--target"],
    battlefieldHighlights: [
      { type: "unit", id: TUTORIAL_IDS.LONGSHOT, label: "Longshot", tone: "ally" },
      { type: "unit", id: TUTORIAL_IDS.ENEMY_GRUNT, label: "Infantry", tone: "danger" }
    ],
    expectedAction: {
      type: "selectUnit",
      unitId: TUTORIAL_IDS.LONGSHOT,
      nudge: "Grab the Longshot next. Range is about to become your friend."
    }
  },
  {
    id: "brace-longshot",
    title: "Hold position.",
    body:
      "To fire without moving, click the Longshot's current tile. That opens the order prompt while spending no movement.",
    uiSelectors: [".battle-side-panel--selected"],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.LONGSHOT, label: "Hold", tone: "ally" }],
    expectedAction: {
      type: "moveUnit",
      unitId: TUTORIAL_IDS.LONGSHOT,
      x: 3,
      y: 3,
      nudge: "Click the Longshot's own tile to hold position and open orders."
    }
  },
  {
    id: "longshot-fire",
    title: "Use range.",
    body:
      "The Grunt is already inside your range band, so you can fire without moving.",
    uiSelectors: ['[data-action="begin-attack"]', ".battle-side-panel--target"],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.ENEMY_GRUNT, label: "Range 2", tone: "danger" }],
    expectedAction: {
      type: "button",
      action: "begin-attack",
      nudge: "Tap Fire. No need to move the Longshot first."
    }
  },
  {
    id: "longshot-target",
    title: "Attack the Grunt.",
    body:
      "Because the defender cannot counter at this range, the trade is cleaner. Pick the highlighted Grunt.",
    uiSelectors: [".battle-targeting-hint", ".battle-side-panel--target"],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.ENEMY_GRUNT, label: "Attack", tone: "danger" }],
    expectedAction: {
      type: "attackTarget",
      unitId: TUTORIAL_IDS.LONGSHOT,
      targetUnitId: TUTORIAL_IDS.ENEMY_GRUNT,
      nudge: "Target the enemy Grunt so you can see safe ranged pressure."
    }
  },
  {
    id: "select-skyguard",
    title: "Skyguards answer air.",
    body:
      "Aircraft hit hard, but anti-air keeps them honest. Select the Skyguard.",
    uiSelectors: [".battle-side-panel--selected"],
    battlefieldHighlights: [
      { type: "unit", id: TUTORIAL_IDS.SKYGUARD, label: "Skyguard", tone: "ally" },
      { type: "unit", id: TUTORIAL_IDS.GUNSHIP, label: "Air", tone: "danger" }
    ],
    expectedAction: {
      type: "selectUnit",
      unitId: TUTORIAL_IDS.SKYGUARD,
      nudge: "Pick the Skyguard for the anti-air lesson."
    }
  },
  {
    id: "move-skyguard",
    title: "Cover the sky lane.",
    body:
      "Skyguards can fire at range 1-2. Move to the highlighted road tile to line up the Gunship.",
    uiSelectors: [".battle-command-prompt"],
    battlefieldHighlights: [
      { type: "tile", x: 3, y: 2, label: "Cover tile", tone: "goal" },
      { type: "unit", id: TUTORIAL_IDS.GUNSHIP, label: "Gunship", tone: "danger" }
    ],
    expectedAction: {
      type: "moveUnit",
      unitId: TUTORIAL_IDS.SKYGUARD,
      x: 3,
      y: 2,
      nudge: "Move the Skyguard to the highlighted road tile first."
    }
  },
  {
    id: "skyguard-fire",
    title: "Check the anti-air forecast.",
    body:
      "Effective attacks add a clear damage edge, but ammo still matters. Open Fire on the Gunship.",
    uiSelectors: ['[data-action="begin-attack"]', ".battle-side-panel--target"],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.GUNSHIP, label: "Forecast", tone: "danger" }],
    expectedAction: {
      type: "button",
      action: "begin-attack",
      nudge: "Use Fire with the Skyguard."
    }
  },
  {
    id: "skyguard-target",
    title: "Shoot down the Gunship.",
    body:
      "Anti-air is the cleanest answer to aircraft. Select the Gunship and listen for the satisfying crunch.",
    uiSelectors: [".battle-targeting-hint", ".battle-side-panel--target"],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.GUNSHIP, label: "Attack", tone: "danger" }],
    expectedAction: {
      type: "attackTarget",
      unitId: TUTORIAL_IDS.SKYGUARD,
      targetUnitId: TUTORIAL_IDS.GUNSHIP,
      nudge: "Target the Gunship. Skyguard wants sky problems."
    }
  },
  {
    id: "end-turn",
    title: "Hand the field to the AI.",
    body:
      "End Turn passes control to the enemy. You will see the AI move, attack if it can, then return control.",
    uiSelectors: ['[data-action="end-turn"]'],
    battlefieldHighlights: [{ type: "unit", id: TUTORIAL_IDS.WATCHMAN, label: "AI turn", tone: "danger" }],
    expectedAction: {
      type: "endTurn",
      nudge: "Press End Turn so the AI gets a go."
    }
  },
  {
    id: "commander-trait",
    title: "Commander traits are passive.",
    body:
      "Atlas constantly repairs your army at the start of your turns. Traits are always on; abilities are charged and timed.",
    uiSelectors: [".commander-panel-shell--player", '[data-tooltip-trigger="trait"]'],
    battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.PLAYER_COMMAND, label: "Atlas", tone: "ally" }],
    expectedAction: {
      type: "continue",
      nudge: "Tap Next after checking Atlas' trait."
    }
  },
  {
    id: "activate-power",
    title: "Use the active ability.",
    body:
      "I topped off your charge for the sim. Activate Overhaul to heal, armor up, and cleanse the squad.",
    uiSelectors: ['[data-action="activate-power"]', ".commander-panel-shell--player"],
    battlefieldHighlights: [
      { type: "unit", id: TUTORIAL_IDS.BREAKER, label: "Heal", tone: "ally" },
      { type: "unit", id: TUTORIAL_IDS.SKYGUARD, label: "Armor", tone: "ally" }
    ],
    onEnter: "grant-player-power",
    expectedAction: {
      type: "activatePower",
      nudge: "Hit the glowing commander meter to activate Overhaul."
    }
  },
  {
    id: "finish-select",
    title: "Capture wins this match.",
    body:
      "Final drill: select the forward Grunt. We will use real HQ capture rules to end the sim.",
    uiSelectors: [".battle-footer-meta", ".battle-side-panel--selected"],
    battlefieldHighlights: [
      { type: "unit", id: TUTORIAL_IDS.CAPPER, label: "Select", tone: "ally" },
      { type: "building", id: TUTORIAL_IDS.ENEMY_COMMAND, label: "Enemy HQ", tone: "danger" }
    ],
    expectedAction: {
      type: "selectUnit",
      unitId: TUTORIAL_IDS.CAPPER,
      nudge: "Select the forward Grunt near the enemy HQ."
    }
  },
  {
    id: "finish-move",
    title: "Move onto the enemy HQ.",
    body:
      "HQ Capture does not require routing every defender. If you can safely take the command post, you win.",
    uiSelectors: [".battle-command-prompt", ".battle-footer-meta"],
    battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.ENEMY_COMMAND, label: "Move here", tone: "goal" }],
    expectedAction: {
      type: "moveUnit",
      unitId: TUTORIAL_IDS.CAPPER,
      x: 8,
      y: 3,
      nudge: "Move the forward Grunt onto the enemy HQ."
    }
  },
  {
    id: "finish-capture",
    title: "Capture the HQ.",
    body:
      "Use Capture and the match ends. Nicely done, commander.",
    uiSelectors: ['[data-action="capture-building"]', ".battle-command-prompt"],
    battlefieldHighlights: [{ type: "building", id: TUTORIAL_IDS.ENEMY_COMMAND, label: "Capture", tone: "goal" }],
    expectedAction: {
      type: "button",
      action: "capture-building",
      buildingId: TUTORIAL_IDS.ENEMY_COMMAND,
      nudge: "Use Capture on the enemy HQ to finish the tutorial."
    }
  }
];

export const TUTORIAL_EPILOGUE_CARDS = [
  {
    title: "Run Mode",
    body:
      "A run is 10 maps. Survivors persist with XP, levels, and gear; defeated units are gone from that run."
  },
  {
    title: "Mission Goals",
    body:
      "Maps can ask for Rout, HQ Capture, Rescue, Defend, or Survive. Read the mission strip before spending actions."
  },
  {
    title: "Upgrades",
    body:
      "After wins, choose upgrades, reinforcement drafts, or gear. Gear is equipped to a survivor before the next map."
  },
  {
    title: "Intel & Unlocks",
    body:
      "Captures and clears pay Intel Credits. Spend Intel to unlock units, run cards, and new commanders."
  },
  {
    title: "Commanders",
    body:
      "Traits are passive powers. Abilities charge through combat, reset after use, and should solve the current map."
  },
  {
    title: "Skirmish",
    body:
      "Skirmish uses the same battle rules with recruitment and custom setup, but it does not progress a run save."
  }
];

export function createTutorialIntroState(overrides = {}) {
  return {
    phase: "intro",
    stepIndex: 0,
    completed: false,
    nudge: null,
    ...overrides
  };
}

export function createTutorialBattleSession() {
  return createTutorialIntroState({
    phase: "battle",
    startedAt: Date.now()
  });
}

export function getTutorialStep(session) {
  const index = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Number(session?.stepIndex) || 0));
  return TUTORIAL_STEPS[index] ?? TUTORIAL_STEPS[0];
}

export function getTutorialStepProgress(session) {
  const index = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Number(session?.stepIndex) || 0));
  return `${index + 1}/${TUTORIAL_STEPS.length}`;
}

export function createTutorialPresentation(session) {
  if (!session || !["battle", "complete"].includes(session.phase)) {
    return null;
  }

  const step = getTutorialStep(session);

  return {
    phase: session.phase,
    completed: session.completed === true,
    stepId: step.id,
    title: session.phase === "complete" ? "Training complete." : step.title,
    body:
      session.phase === "complete"
        ? "That was the whole loop: mission, move, capture, matchup, enemy turn, commander power, and HQ capture."
        : step.body,
    progress: session.phase === "complete" ? "Complete" : getTutorialStepProgress(session),
    mascotName: "Pip",
    nudge: session.nudge?.message ?? null,
    canContinue: step.expectedAction?.type === "continue",
    canSkip: session.phase !== "complete",
    uiSelectors: [...(step.uiSelectors ?? [])],
    battlefieldHighlights: structuredClone(step.battlefieldHighlights ?? [])
  };
}

export function applyTutorialStepEntryEffects(battleState, step) {
  if (!battleState || step?.onEnter !== "grant-player-power") {
    return false;
  }

  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);

  for (const unit of battleState.player.units ?? []) {
    if ([TUTORIAL_IDS.BREAKER, TUTORIAL_IDS.SKYGUARD, TUTORIAL_IDS.CAPPER].includes(unit.id)) {
      unit.current.hp = Math.min(unit.current.hp, Math.max(1, Math.floor(unit.stats.maxHealth * 0.62)));
    }
  }

  battleState.pendingAction = null;
  battleState.selection = {
    type: null,
    id: null,
    x: null,
    y: null
  };
  return true;
}
