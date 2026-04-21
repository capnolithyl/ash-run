import { TURN_SIDES } from "../core/constants.js";
import { createPersistentUnitSnapshot, createUnitFromType } from "../simulation/unitFactory.js";

const COMMANDER_STARTER_ROSTER_UNIT_IDS = {
  atlas: ["grunt", "runner", "longshot"],
  viper: ["grunt", "breaker", "longshot"],
  rook: ["grunt", "grunt", "bruiser"],
  echo: ["grunt", "longshot", "runner"],
  blaze: ["grunt", "runner", "runner"],
  knox: ["grunt", "breaker", "bruiser"],
  falcon: ["grunt", "gunship", "longshot"],
  graves: ["grunt", "grunt", "breaker"],
  nova: ["longshot", "runner", "gunship"],
  sable: ["grunt", "breaker", "runner"]
};

export function getCommanderStarterUnitIds(commanderId) {
  return COMMANDER_STARTER_ROSTER_UNIT_IDS[commanderId] ?? COMMANDER_STARTER_ROSTER_UNIT_IDS.viper;
}

export function buildPersistentStarterRoster(commanderId) {
  return getCommanderStarterUnitIds(commanderId).map((unitTypeId) =>
    createPersistentUnitSnapshot(createUnitFromType(unitTypeId, TURN_SIDES.PLAYER))
  );
}
