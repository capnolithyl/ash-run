import {
  COMMANDER_POWER_MAX,
  ENEMY_AI_ARCHETYPES,
  ENEMY_AI_ARCHETYPE_ORDER
} from "../core/constants.js";

/**
 * Only the first three commanders are available from the start.
 * The others already exist in data so enemy armies can use them immediately.
 */
export const DEFAULT_UNLOCKED_COMMANDER_IDS = ["atlas", "viper", "rook"];
const DEFAULT_ENEMY_AI_WEIGHTS = [100, 0, 0, 0, 0];

export const COMMANDERS = [
  {
    id: "atlas",
    name: "Atlas",
    title: "The Mechanic",
    quote: "\"If it still rolls, it can still win.\"",
    accent: "#f3a55a",
    powerMax: 300,
    enemyAiWeights: [25, 5, 45, 20, 5],
    passive: {
      name: "Field Repairs",
      type: "atlas-field-repairs",
      healRatio: 0.1,
      summary: "All units heal 10% max HP at the start of your turn.",
    },
    active: {
      name: "Overhaul",
      type: "atlas-overhaul",
      healRatio: 0.33,
      armor: 3,
      cleanseNegativeStatuses: true,
      summary: "All units recover 33% HP, gain +3 armor for 1 turn, and cleanse statuses.",
    },
  },
  {
    id: "viper",
    name: "Viper",
    title: "Femme Fatale",
    quote: "\"Hit first, smile last, leave them guessing in between.\"",
    accent: "#ec775e",
    powerMax: 250,
    enemyAiWeights: [25, 40, 5, 15, 15],
    passive: {
      name: "Shock Doctrine",
      type: "viper-shock-doctrine",
      group: "infantry-recon",
      attackPercent: 0.2,
      otherAttackPercent: -0.2,
      summary: "Infantry and Runners gain 20% attack; other units lose 20% attack.",
    },
    active: {
      name: "Blitz Surge",
      type: "viper-blitz-surge",
      attackGroup: "infantry-recon",
      attackPercent: 0.3,
      movementGroup: "infantry",
      movement: 2,
      summary: "Infantry and Runners gain 30% attack; Infantry also gain +2 movement for 1 turn.",
    },
  },
  {
    id: "rook",
    name: "Rook",
    title: "The Inheritor",
    quote: "\"A clean ledger wins dirtier wars.\"",
    accent: "#d2bc62",
    powerMax: 325,
    enemyAiWeights: [20, 5, 20, 40, 15],
    passive: {
      name: "Estate Claim",
      type: "rook-estate-claim",
      attackPercent: 0.3,
      summary: "Units gain 30% attack while standing on an owned property.",
    },
    active: {
      name: "Hostile Takeover",
      type: "rook-hostile-takeover",
      attackPercentPerProperty: 0.05,
      armorPercentPerProperty: 0.05,
      summary: "For 1 turn, units gain 5% attack and armor per owned property.",
    },
  },
  {
    id: "echo",
    name: "Echo",
    title: "The Control Freak",
    quote: "\"The battle is over the moment I decide where you stand.\"",
    accent: "#70d3c5",
    powerMax: 325,
    enemyAiWeights: [35, 20, 20, 5, 20],
    passive: {
      name: "Slipstream",
      type: "echo-slipstream",
      summary: "Units can move 1 tile after attacking.",
    },
    active: {
      name: "Disruption",
      type: "echo-disruption",
      movementPenalty: 1,
      appliesCorrupted: true,
      summary: "All enemy units get -1 movement and become Corrupted for 1 turn.",
    },
  },
  {
    id: "blaze",
    name: "Blaze",
    title: "The Pyromaniac",
    quote: "\"If they wanted mercy, they should've brought rain.\"",
    accent: "#ff8c42",
    powerMax: 350,
    enemyAiWeights: [20, 45, 5, 5, 25],
    passive: {
      name: "Scorched Earth",
      type: "blaze-scorched-earth",
      damageMultiplier: 1.1,
      summary: "Deal 10% more damage to damaged units.",
    },
    active: {
      name: "Ignition",
      type: "blaze-ignition",
      damageRatio: 0.1,
      appliesBurn: true,
      summary: "All enemies take 10% damage and Burn for 1 turn.",
    },
  },
  {
    id: "knox",
    name: "Knox",
    title: "The Bulwark",
    quote: "\"Let them break themselves on the wall.\"",
    accent: "#95a7c7",
    powerMax: 275,
    enemyAiWeights: [25, 5, 50, 15, 5],
    passive: {
      name: "Shield Wall",
      type: "knox-shield-wall",
      positionalArmorMultiplier: 2,
      summary: "Units that do not move double terrain bonuses.",
    },
    active: {
      name: "Fortress Protocol",
      type: "knox-fortress-protocol",
      positionalArmorMultiplier: 2,
      summary: "For 1 turn, terrain bonuses are doubled and the first enemy combat deals no damage.",
    },
  },
  {
    id: "falcon",
    name: "Falcon",
    title: "The Ace",
    quote: "\"Own the sky and the ground starts asking permission.\"",
    accent: "#71b5ff",
    powerMax: 350,
    enemyAiWeights: [25, 25, 5, 5, 40],
    passive: {
      name: "Air Superiority",
      type: "falcon-air-superiority",
      attackPercent: 0.2,
      armorPercent: 0.1,
      summary: "Aircraft gain 20% attack and 10% armor.",
    },
    active: {
      name: "Reinforcements",
      type: "falcon-reinforcements",
      summonUnitTypeId: "gunship",
      summary: "Spawn a Gunship at or near HQ. That Gunship can act immediately.",
    },
  },
  {
    id: "graves",
    name: "Graves",
    title: "The Reaper",
    quote: "\"Make it count. Then make sure they stay down.\"",
    accent: "#b68f6e",
    powerMax: 250,
    enemyAiWeights: [20, 40, 5, 5, 30],
    passive: {
      name: "Kill Confirm",
      type: "graves-kill-confirm",
      summary: "Units gain 50% extra combat EXP.",
    },
    active: {
      name: "Execution Window",
      type: "graves-execution-window",
      summary: "Units counterattack before being attacked for 1 turn.",
    },
  },
  {
    id: "nova",
    name: "Nova",
    title: "The Glass Cannon",
    quote: "\"If you're going to burn bright, make sure they have to look away.\"",
    accent: "#f086d9",
    powerMax: 300,
    enemyAiWeights: [20, 45, 5, 5, 25],
    passive: {
      name: "Full Magazine",
      type: "nova-full-magazine",
      attackPercent: 0.2,
      summary: "Units gain 20% attack when at full ammo.",
    },
    active: {
      name: "Overload",
      type: "nova-overload",
      attackPercentPerAmmo: 0.1,
      summary: "Units expend all ammo and gain 10% attack per ammo spent this turn.",
    },
  },
  {
    id: "sable",
    name: "Sable",
    title: "Lady Luck",
    quote: "\"Chance is just another weapon if you know how to hold it.\"",
    accent: "#8ac79b",
    powerMax: 300,
    enemyAiWeights: [40, 20, 15, 15, 10],
    passive: {
      name: "Loaded Dice",
      type: "sable-loaded-dice",
      summary: "Friendly attacks may Crit and incoming hits may Glance based on Luck%.",
    },
    active: {
      name: "Lucky Seven",
      type: "sable-lucky-seven",
      summary: "Until your next turn, Crit and Glance chances use Luck x 10%.",
    },
  },
];

export function getCommanderById(commanderId) {
  return COMMANDERS.find((commander) => commander.id === commanderId);
}

export function getCommanderPowerMax(commanderId) {
  return getCommanderById(commanderId)?.powerMax ?? COMMANDER_POWER_MAX;
}

export function getCommanderEnemyAiWeights(commanderId) {
  const commander = getCommanderById(commanderId);
  const weights = Array.isArray(commander?.enemyAiWeights)
    ? commander.enemyAiWeights
    : DEFAULT_ENEMY_AI_WEIGHTS;

  return ENEMY_AI_ARCHETYPE_ORDER.map((_, index) => Math.max(0, Number(weights[index]) || 0));
}

export function getEnemyAiArchetypeLabel(archetype) {
  switch (archetype) {
    case ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE:
      return "Hyper Aggressive";
    case ENEMY_AI_ARCHETYPES.TURTLE:
      return "Turtle";
    case ENEMY_AI_ARCHETYPES.CAPTURE:
      return "Capture";
    case ENEMY_AI_ARCHETYPES.HQ_RUSH:
      return "HQ Rush";
    case ENEMY_AI_ARCHETYPES.BALANCED:
    default:
      return "Balanced";
  }
}
