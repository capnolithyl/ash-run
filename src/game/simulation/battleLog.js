import { TURN_SIDES } from "../core/constants.js";

const STAT_LABELS = {
  attack: "Attack",
  armor: "Armor",
  maxHealth: "Max HP",
  movement: "Movement",
  maxRange: "Range",
  staminaMax: "Stamina",
  ammoMax: "Ammo",
  luck: "Luck"
};

export function appendLog(state, message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 10);
}

export function pushLevelUpEvents(state, unit, levelUps) {
  if (unit.owner !== TURN_SIDES.PLAYER || levelUps.length === 0) {
    return;
  }

  for (const levelUp of levelUps) {
    state.levelUpQueue.push({
      unitId: unit.id,
      unitName: unit.name,
      previousLevel: levelUp.previousLevel,
      newLevel: levelUp.newLevel,
      statGains: levelUp.statGains.map((gain) => ({
        stat: gain.stat,
        label: STAT_LABELS[gain.stat] ?? gain.stat,
        delta: gain.increment,
        previousValue: gain.previousValue,
        nextValue: gain.nextValue
      }))
    });
  }
}
