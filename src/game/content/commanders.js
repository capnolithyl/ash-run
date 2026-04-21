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
      type: "armor-tag",
      tag: UNIT_TAGS.VEHICLE,
      value: 1,
      summary: "Vehicles gain +1 armor."
    },
    active: {
      type: "team-shield",
      summary: "Bulwark: allied units gain a temporary 2-point damage shield."
    }
  },
  {
    id: "viper",
    name: "Viper",
    title: "Linebreaker",
    accent: "#ec775e",
    passive: {
      type: "attack-tag",
      tag: UNIT_TAGS.INFANTRY,
      value: 1,
      summary: "Infantry gain +1 attack."
    },
    active: {
      type: "team-assault",
      summary: "Overrun: allied units gain +2 attack until your next turn."
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
      summary: "Supply Drop: gain 350 funds and fully resupply allied units."
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
      summary: "Afterburn: allied units gain +1 movement until your next turn."
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
      summary: "Field Marshal: allied units recover 4 HP."
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
      summary: "Skylance: deal 4 damage to up to 3 random enemy units."
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
      summary: "Dust Wall: allied units gain a temporary 2-point damage shield."
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
      summary: "Brightside: allied units gain +2 attack until your next turn."
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
      summary: "Second Wind: allied units recover 4 HP."
    }
  }
];

export function getCommanderById(commanderId) {
  return COMMANDERS.find((commander) => commander.id === commanderId);
}
