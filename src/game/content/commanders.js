import { UNIT_TAGS } from "../core/constants.js";

/**
 * Only the first three commanders are available from the start.
 * The others already exist in data so enemy armies can use them immediately.
 */
export const DEFAULT_UNLOCKED_COMMANDER_IDS = ["atlas", "viper", "rook"];

export const COMMANDERS = [
  {
    id: "atlas",
    name: "Atlas",
    title: "Armored Spearhead",
    accent: "#f3a55a",
    passive: {
      type: "turn-heal",
      value: 1,
      summary: "All units recover 1 HP at the start of each turn."
    },
    active: {
      type: "field-repair-push",
      healRatio: 0.5,
      attack: 2,
      movement: 1,
      summary: "Hyper Repair: all units recover 50% HP and gain +1 movement/+2 attack for 1 turn."
    }
  },
  {
    id: "viper",
    name: "Viper",
    title: "Linebreaker",
    accent: "#ec775e",
    passive: {
      type: "attack-group",
      group: "infantry-recon",
      value: 2,
      summary: "Infantry and recons gain +2 attack."
    },
    active: {
      type: "viper-infantry-push",
      attackGroup: "infantry-recon",
      attack: 5,
      movementGroup: "infantry",
      movement: 2,
      summary: "Overrun: infantry and recons gain +5 attack; infantry also gain +2 movement for 1 turn."
    }
  },
  {
    id: "rook",
    name: "Rook",
    title: "Logistics Chief",
    accent: "#d2bc62",
    passive: {
      type: "income-bonus",
      value: 200,
      summary: "Gain +200 income at the start of each turn."
    },
    active: {
      type: "supply-drop",
      summary: "Supply Drop: gain 600 funds and fully resupply allied units."
    }
  },
  {
    id: "echo",
    name: "Echo",
    title: "Signal Ghost",
    accent: "#70d3c5",
    passive: {
      type: "charge-dealt",
      multiplier: 1.5,
      summary: "Commander charge from damage dealt is 50% stronger."
    },
    active: {
      type: "team-resupply",
      summary: "Backfeed: allied units fully restore ammo and stamina."
    }
  },
  {
    id: "blaze",
    name: "Blaze",
    title: "Shock Doctrine",
    accent: "#ff8c42",
    passive: {
      type: "attack-all",
      value: 1,
      summary: "All units gain +1 attack while initiating combat."
    },
    active: {
      type: "team-mobility",
      summary: "Afterburn: allied units gain +2 movement until your next turn."
    }
  },
  {
    id: "knox",
    name: "Knox",
    title: "Iron Curtain",
    accent: "#95a7c7",
    passive: {
      type: "armor-all",
      value: 1,
      summary: "All units gain +1 armor on defense."
    },
    active: {
      type: "team-heal",
      summary: "Field Marshal: allied units recover 8 HP."
    }
  },
  {
    id: "falcon",
    name: "Falcon",
    title: "Air Supremacy",
    accent: "#71b5ff",
    passive: {
      type: "move-tag",
      tag: UNIT_TAGS.AIR,
      value: 1,
      summary: "Air units gain +1 movement."
    },
    active: {
      type: "orbital-strike",
      summary: "Skylance: deal 7 damage to up to 4 random enemy units."
    }
  },
  {
    id: "graves",
    name: "Graves",
    title: "Hard Country",
    accent: "#b68f6e",
    passive: {
      type: "move-tag",
      tag: UNIT_TAGS.INFANTRY,
      value: 1,
      summary: "Infantry gain +1 movement."
    },
    active: {
      type: "team-shield",
      summary: "Dust Wall: allied units gain +3 armor for 1 turn."
    }
  },
  {
    id: "nova",
    name: "Nova",
    title: "Glass Cannon",
    accent: "#f086d9",
    passive: {
      type: "range-tag",
      tag: UNIT_TAGS.AIR,
      value: 1,
      summary: "Air units gain +1 maximum attack range when possible."
    },
    active: {
      type: "team-assault",
      summary: "Brightside: allied units gain +3 attack until your next turn."
    }
  },
  {
    id: "sable",
    name: "Sable",
    title: "Silent Quartermaster",
    accent: "#8ac79b",
    passive: {
      type: "recruit-discount",
      value: 100,
      summary: "New recruits cost 100 less."
    },
    active: {
      type: "team-heal",
      summary: "Second Wind: allied units recover 8 HP."
    }
  }
];

export function getCommanderById(commanderId) {
  return COMMANDERS.find((commander) => commander.id === commanderId);
}
