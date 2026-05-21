import { BUILDING_KEYS, PROTOTYPE_ROSTER_CAP, TURN_SIDES } from "../../core/constants.js";
import { BUILDING_RECRUITMENT, UNIT_CATALOG } from "../../content/unitCatalog.js";
import { appendLog } from "../battleLog.js";
import { activateCommanderPower } from "../commanderEffects.js";
import { getLivingUnits, getSelectedBuilding, getUnitAt } from "../selectors.js";
import { createUnitFromType } from "../unitFactory.js";

const INFANTRY_RECRUIT_TYPES = new Set(["grunt", "breaker", "longshot", "medic", "mechanic"]);

export function getPlayerUnitLimitStatus(system) {
  const count = getLivingUnits(system.state, TURN_SIDES.PLAYER).length;

  return {
    count,
    limit: PROTOTYPE_ROSTER_CAP,
    isAtLimit: count >= PROTOTYPE_ROSTER_CAP
  };
}

export function recruitUnit(system, unitTypeId) {
  const building = getSelectedBuilding(system.state);
  const turnKey = `${system.state.turn.activeSide}-${system.state.turn.number}`;

  if (
    !building ||
    system.state.turn.activeSide !== TURN_SIDES.PLAYER ||
    building.owner !== TURN_SIDES.PLAYER ||
    building.recruitLockedTurnKey === turnKey ||
    getUnitAt(system.state, building.x, building.y)
  ) {
    return false;
  }

  const canRecruitFromBuilding = (BUILDING_RECRUITMENT[building.type] ?? []).includes(unitTypeId);
  const unitType = canRecruitFromBuilding ? UNIT_CATALOG[unitTypeId] : null;

  if (!unitType) {
    return false;
  }

  const adjustedCost = Math.max(100, unitType.cost - system.state.player.recruitDiscount);

  if (
    system.state.player.funds < adjustedCost ||
    getLivingUnits(system.state, TURN_SIDES.PLAYER).length >= PROTOTYPE_ROSTER_CAP
  ) {
    return false;
  }

  const recruit = createUnitFromType(unitTypeId, TURN_SIDES.PLAYER);
  recruit.x = building.x;
  recruit.y = building.y;
  const isBarracksInfantry =
    building.type === BUILDING_KEYS.BARRACKS && INFANTRY_RECRUIT_TYPES.has(unitTypeId);
  recruit.hasMoved = !isBarracksInfantry;
  recruit.hasAttacked = !isBarracksInfantry;
  if (isBarracksInfantry) {
    building.recruitLockedTurnKey = turnKey;
  }

  system.state.player.units.push(recruit);
  system.state.player.funds -= adjustedCost;
  appendLog(system.state, `${recruit.name} deployed from ${building.type}.`);
  return true;
}

export function activatePower(system) {
  const result = activateCommanderPower(system.state, system.state.turn.activeSide, system.state.seed);

  system.state.lastPowerResult = structuredClone(result);
  system.state.seed = result.seed;
  result.notes.forEach((note) => appendLog(system.state, note));
  system.updateVictoryState();
  return result.changed;
}
