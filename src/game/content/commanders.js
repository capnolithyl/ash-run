import { COMMANDER_POWER_MAX } from "../core/constants.js";

/**
 * Only the first three commanders are available from the start.
 * The others already exist in data so enemy armies can use them immediately.
 */
export const DEFAULT_UNLOCKED_COMMANDER_IDS = ["atlas", "viper", "rook"];

export const COMMANDERS = [
  {
    id: "atlas",
    name: "Atlas",
    title: "The Mechanic",
    quote: "\"If it still rolls, it can still win.\"",
    accent: "#f3a55a",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Field Repairs",
      type: "atlas-field-repairs",
      value: 1,
      summary: "All units heal +1 HP at the start of your turn.",
    },
    active: {
      name: "Overhaul",
      type: "atlas-overhaul",
      healRatio: 0.5,
      armor: 2,
      summary: "All units recover 50% HP and gain +2 armor for 1 turn.",
    },
  },
  {
    id: "viper",
    name: "Viper",
    title: "Femme Fatale",
    quote: "\"Hit first, smile last, leave them guessing in between.\"",
    accent: "#ec775e",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Shock Doctrine",
      type: "viper-shock-doctrine",
      group: "infantry-recon",
      value: 2,
      penalty: -2,
      summary: "Infantry and Runners gain +2 attack; other units gain -2 attack.",
    },
    active: {
      name: "Blitz Surge",
      type: "viper-blitz-surge",
      attackGroup: "infantry-recon",
      attack: 3,
      movementGroup: "infantry",
      movement: 2,
      summary: "Infantry and Runners gain +3 attack; Infantry also gain +2 movement for 1 turn.",
    },
  },
  {
    id: "rook",
    name: "Rook",
    title: "The Inheritor",
    quote: "\"A clean ledger wins dirtier wars.\"",
    accent: "#d2bc62",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "War Budget",
      type: "rook-war-budget",
      value: 200,
      summary: "+200 funds per turn; cannot resupply units.",
    },
    active: {
      name: "Liquidation",
      type: "rook-liquidation",
      fundsPerAttack: 300,
      summary: "Spend all funds. All units gain +1 attack per 300 funds spent.",
    },
  },
  {
    id: "echo",
    name: "Echo",
    title: "The Control Freak",
    quote: "\"The battle is over the moment I decide where you stand.\"",
    accent: "#70d3c5",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Slipstream",
      type: "echo-slipstream",
      summary: "Units can move 1 tile after attacking.",
    },
    active: {
      name: "Disruption",
      type: "echo-disruption",
      movementPenalty: 1,
      summary: "All enemy units get -1 movement for 1 turn.",
    },
  },
  {
    id: "blaze",
    name: "Blaze",
    title: "The Pyromaniac",
    quote: "\"If they wanted mercy, they should've brought rain.\"",
    accent: "#ff8c42",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Scorched Earth",
      type: "blaze-scorched-earth",
      summary: "Deal +1 damage to damaged units.",
    },
    active: {
      name: "Ignition",
      type: "blaze-ignition",
      summary: "All enemies take 10% damage and Burn is applied for 1 turn.",
    },
  },
  {
    id: "knox",
    name: "Knox",
    title: "The Bulwark",
    quote: "\"Let them break themselves on the wall.\"",
    accent: "#95a7c7",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Shield Wall",
      type: "knox-shield-wall",
      summary: "Units that do not move double terrain bonuses.",
    },
    active: {
      name: "Fortress Protocol",
      type: "knox-fortress-protocol",
      summary: "For 1 turn, terrain bonuses are doubled regardless of movement and the first combat deals no damage.",
    },
  },
  {
    id: "falcon",
    name: "Falcon",
    title: "The Ace",
    quote: "\"Own the sky and the ground starts asking permission.\"",
    accent: "#71b5ff",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Air Superiority",
      type: "falcon-air-superiority",
      summary: "Aircraft gain +2 attack and +1 armor.",
    },
    active: {
      name: "Reinforcements",
      type: "falcon-reinforcements",
      summary: "Spawn a Gunship at or near HQ. That Gunship can act immediately.",
    },
  },
  {
    id: "graves",
    name: "Graves",
    title: "The Reaper",
    quote: "\"Make it count. Then make sure they stay down.\"",
    accent: "#b68f6e",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Kill Confirm",
      type: "graves-kill-confirm",
      summary: "Units gain 50% extra EXP when killing an enemy.",
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
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Full Magazine",
      type: "nova-full-magazine",
      summary: "Units gain +2 attack when at full ammo.",
    },
    active: {
      name: "Overload",
      type: "nova-overload",
      summary: "Units expend all ammo and gain +1 attack per ammo spent this turn.",
    },
  },
  {
    id: "sable",
    name: "Sable",
    title: "Lady Luck",
    quote: "\"Chance is just another weapon if you know how to hold it.\"",
    accent: "#8ac79b",
    powerMax: COMMANDER_POWER_MAX,
    passive: {
      name: "Loaded Dice",
      type: "sable-loaded-dice",
      summary: "All units gain +1 luck.",
    },
    active: {
      name: "Lucky Seven",
      type: "sable-lucky-seven",
      summary: "Luck range is doubled for 1 turn.",
    },
  },
];

export function getCommanderById(commanderId) {
  return COMMANDERS.find((commander) => commander.id === commanderId);
}

export function getCommanderPowerMax(commanderId) {
  return getCommanderById(commanderId)?.powerMax ?? COMMANDER_POWER_MAX;
}
