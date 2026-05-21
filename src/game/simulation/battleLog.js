import { TURN_SIDES } from "../core/constants.js";
import { LEVEL_UP_STAT_ORDER } from "./progression.js";

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
    const statSheet = levelUp.statSheet ?? LEVEL_UP_STAT_ORDER.map((stat) => {
      const gain = levelUp.statGains.find((candidate) => candidate.stat === stat);
      const nextValue = gain?.nextValue ?? unit.stats[stat];
      const delta = gain?.increment ?? 0;

      return {
        stat,
        beforeValue: nextValue - delta,
        afterValue: nextValue,
        delta
      };
    });

    state.levelUpQueue.push({
      unitId: unit.id,
      unitTypeId: unit.unitTypeId,
      owner: unit.owner,
      unitName: unit.name,
      previousLevel: levelUp.previousLevel,
      newLevel: levelUp.newLevel,
      statSheet: statSheet.map((entry) => ({
        stat: entry.stat,
        label: STAT_LABELS[entry.stat] ?? entry.stat,
        beforeValue: entry.beforeValue,
        afterValue: entry.afterValue,
        delta: entry.delta,
        changed: entry.delta > 0
      })),
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
