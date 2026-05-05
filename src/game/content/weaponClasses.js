export const ARMOR_CLASSES = {
  INFANTRY: "infantry",
  LIGHT: "light",
  MEDIUM: "medium",
  HEAVY: "heavy",
  AIR_LIGHT: "air_light",
  AIR_HEAVY: "air_heavy",
  AIR_FAST: "air_fast"
};

export const WEAPON_CLASSES = {
  RIFLE: "rifle",
  BREAKER_CHARGE: "breaker_charge",
  MARKSMAN_RIFLE: "marksman_rifle",
  SIDEARM: "sidearm",
  TOOL_RIFLE: "tool_rifle",
  AUTOCANNON: "autocannon",
  BRUISER_CANNON: "bruiser_cannon",
  HEAVY_CANNON: "heavy_cannon",
  SIEGE_ARTILLERY: "siege_artillery",
  FLAK_CANNON: "flak_cannon",
  ROCKET_PODS: "rocket_pods",
  PAYLOAD_BOMBS: "payload_bombs",
  INTERCEPTOR_CANNONS: "interceptor_cannons"
};

export const WEAPON_CLASS_PROFILES = {
  [WEAPON_CLASSES.RIFLE]: {
    role: "Baseline infantry weapon. Good into infantry, chips armor, cannot target air.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1, armorMultiplier: 1 },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 0.9, armorMultiplier: 1 },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 0.95, armorMultiplier: 1 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 1, armorMultiplier: 0.65 }
    }
  },

  [WEAPON_CLASSES.BREAKER_CHARGE]: {
    role: "Anti-vehicle infantry weapon. Ignores 75% light armor, 50% medium armor, and 33% heavy armor.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1, armorMultiplier: 1 },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1.2, armorMultiplier: 0.25, isEffective: true },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 1.05, armorMultiplier: 0.5, isEffective: true },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 1.1, armorMultiplier: 2 / 3, isEffective: true }
    }
  },

  [WEAPON_CLASSES.MARKSMAN_RIFLE]: {
    role: "Ranged anti-infantry weapon. Strong into infantry, weak into heavy armor, cannot target air.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1.2, armorMultiplier: 1, isEffective: true },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1, armorMultiplier: 0.75 },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 0.85, armorMultiplier: 0.8 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 0.65, armorMultiplier: 0.85 }
    }
  },

  [WEAPON_CLASSES.SIDEARM]: {
    role: "Low-power utility weapon for Medics.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 0.92, armorMultiplier: 1 },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 0.7, armorMultiplier: 1 },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 0.75, armorMultiplier: 1 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 0.6, armorMultiplier: 0.75 }
    }
  },

  [WEAPON_CLASSES.TOOL_RIFLE]: {
    role: "Low-power utility weapon for Mechanics, slightly better vehicle chip than Medic.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 0.88, armorMultiplier: 1 },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 0.75, armorMultiplier: 1 },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 0.8, armorMultiplier: 1 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 0.65, armorMultiplier: 0.75 }
    }
  },

  [WEAPON_CLASSES.AUTOCANNON]: {
    role: "Runner weapon. Shreds infantry and light armor, mostly loses into medium and heavy armor.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1.05, armorMultiplier: 0.8, isEffective: true },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1.15, armorMultiplier: 1, isEffective: true },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 0.85, armorMultiplier: 1 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 0.9, armorMultiplier: 0.65 }
    }
  },

  [WEAPON_CLASSES.BRUISER_CANNON]: {
    role: "Medium vehicle cannon. Good into infantry, light, and medium armor. Weak into heavy armor.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1, armorMultiplier: 0.8 },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1.2, armorMultiplier: 0.65, isEffective: true },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 1.05, armorMultiplier: 0.6, isEffective: true },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 0.95, armorMultiplier: 0.8 }
    }
  },

  [WEAPON_CLASSES.HEAVY_CANNON]: {
    role: "Juggernaut cannon. Deletes soft targets and wins heavy fights. Cannot target air.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1, armorMultiplier: 0.5 },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1.15, armorMultiplier: 0.55 },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 1.05, armorMultiplier: 0.7 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 1.25, armorMultiplier: 1, isEffective: true }
    }
  },

  [WEAPON_CLASSES.SIEGE_ARTILLERY]: {
    role: "Mobile ranged ground weapon. Huge first-strike power but vulnerable if caught. Cannot target air.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1, armorMultiplier: 1 },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1.08, armorMultiplier: 0.8 },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 1.05, armorMultiplier: 0.75 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 1.38, armorMultiplier: 0.9, isEffective: true }
    }
  },

  [WEAPON_CLASSES.FLAK_CANNON]: {
    role: "Skyguard weapon. Main job is anti-air, with modest ground damage.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 0.8, armorMultiplier: 1 },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1.05, armorMultiplier: 0.7 },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 0.85, armorMultiplier: 0.75 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 0.65, armorMultiplier: 1 },
      [ARMOR_CLASSES.AIR_LIGHT]: { powerMultiplier: 1.8, armorMultiplier: 0.5, isEffective: true },
      [ARMOR_CLASSES.AIR_HEAVY]: { powerMultiplier: 1.5, armorMultiplier: 0.75, isEffective: true },
      [ARMOR_CLASSES.AIR_FAST]: { powerMultiplier: 1.2, armorMultiplier: 0.5, isEffective: true }
    }
  },

  [WEAPON_CLASSES.ROCKET_PODS]: {
    role: "Gunship air-to-ground weapon. Strong into ground targets and other gunships, cannot target bombers or interceptors.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1, armorMultiplier: 0.5, isEffective: true },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1.05, armorMultiplier: 0.6 },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 1.1, armorMultiplier: 0.45 },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 1.2, armorMultiplier: 0.8 },
      [ARMOR_CLASSES.AIR_LIGHT]: { powerMultiplier: 1, armorMultiplier: 1 }
    }
  },

  [WEAPON_CLASSES.PAYLOAD_BOMBS]: {
    role: "Heavy air-to-ground weapon. Deletes ground units if not answered. Cannot target air.",
    targetProfiles: {
      [ARMOR_CLASSES.INFANTRY]: { powerMultiplier: 1, armorMultiplier: 0.6, isEffective: true },
      [ARMOR_CLASSES.LIGHT]: { powerMultiplier: 1, armorMultiplier: 0.35, isEffective: true },
      [ARMOR_CLASSES.MEDIUM]: { powerMultiplier: 1, armorMultiplier: 0.3, isEffective: true },
      [ARMOR_CLASSES.HEAVY]: { powerMultiplier: 1.2, armorMultiplier: 0.5, isEffective: true }
    }
  },

  [WEAPON_CLASSES.INTERCEPTOR_CANNONS]: {
    role: "Air-to-air weapon. Cannot target ground.",
    targetProfiles: {
      [ARMOR_CLASSES.AIR_LIGHT]: { powerMultiplier: 1.3, armorMultiplier: 0.5, isEffective: true },
      [ARMOR_CLASSES.AIR_HEAVY]: { powerMultiplier: 1.35, armorMultiplier: 0.5, isEffective: true },
      [ARMOR_CLASSES.AIR_FAST]: { powerMultiplier: 1, armorMultiplier: 0.9 }
    }
  }
};

export function getArmorClassForUnit(unit) {
  return unit?.stats?.armorClass ?? unit?.armorClass ?? null;
}

export function getWeaponClassForUnit(unit) {
  return unit?.stats?.weaponClass ?? unit?.weaponClass ?? null;
}

export function getWeaponClassProfile(weaponClass) {
  return WEAPON_CLASS_PROFILES[weaponClass] ?? null;
}

export function getTargetProfileForAttack(attacker, defender, attackProfile = null) {
  if (attackProfile?.type === "gear-aa" && defender?.family === "air") {
    return {
      powerMultiplier: 1,
      armorMultiplier: 1,
      isEffective: false
    };
  }

  const weaponClass = attackProfile?.weaponClass ?? getWeaponClassForUnit(attacker);
  const armorClass = getArmorClassForUnit(defender);
  return WEAPON_CLASS_PROFILES[weaponClass]?.targetProfiles?.[armorClass] ?? null;
}
