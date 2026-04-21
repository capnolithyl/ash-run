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
      statGains: [
        {
          stat: levelUp.stat,
          label: STAT_LABELS[levelUp.stat] ?? levelUp.stat,
          delta: levelUp.increment,
          previousValue: levelUp.previousValue,
          nextValue: levelUp.nextValue
        }
      ]
    });
  }
}
