import {
  SKIRMISH_DEFAULT_FUNDS_PER_BUILDING,
  SKIRMISH_DEFAULT_STARTING_FUNDS,
  SLOT_IDS,
  TURN_SIDES
} from "../core/constants.js";
import { COMMANDERS } from "../content/commanders.js";

export const BATTLE_CONTEXT_ACTION_DEDUPE_MS = 180;
export const RUN_META_CURRENCY_MAP_REWARD = 5;
export const RUN_META_CURRENCY_CLEAR_BONUS = 30;
export const RUN_CAPTURE_INTEL_REWARD = 2;
export const RUN_CAPTURE_EXPERIENCE_REWARD = 20;

export function pickFirstAvailableSlot(slots) {
  return slots.find((slot) => !slot.exists)?.slotId ?? SLOT_IDS[0];
}

export function unlockNextCommander(metaState) {
  const lockedCommander = COMMANDERS.find(
    (commander) => !metaState.unlockedCommanderIds.includes(commander.id)
  );

  if (!lockedCommander) {
    return null;
  }

  metaState.unlockedCommanderIds.push(lockedCommander.id);
  return lockedCommander;
}

export function createBattleUiState() {
  return {
    pauseMenuOpen: false,
    confirmAbandon: false,
    fundsGain: null,
    notice: null,
    powerOverlay: null,
    hoveredTile: null,
    playerFocus: null,
    enemyFocus: null
  };
}

export function createDefaultSkirmishSetupState(unlockedCommanderIds = []) {
  const defaultCommanderId = unlockedCommanderIds[0] ?? COMMANDERS[0]?.id ?? null;
  const defaultEnemyCommanderId =
    COMMANDERS.find((commander) => commander.id !== defaultCommanderId)?.id ?? defaultCommanderId;

  return {
    step: "commanders",
    playerCommanderId: defaultCommanderId,
    enemyCommanderId: defaultEnemyCommanderId,
    mapId: "ashline-crossing",
    startingFunds: SKIRMISH_DEFAULT_STARTING_FUNDS,
    fundsPerBuilding: SKIRMISH_DEFAULT_FUNDS_PER_BUILDING
  };
}

export function createDefaultRunLoadoutState() {
  return {
    budget: 1000,
    fundsRemaining: 1000,
    units: []
  };
}

export function cloneFocusSelection(selection) {
  if (!selection?.type) {
    return null;
  }

  return {
    type: selection.type,
    id: selection.id ?? null,
    x: selection.x ?? null,
    y: selection.y ?? null
  };
}

export function getFocusSideForSelection(snapshot, selection) {
  if (!snapshot || !selection?.type) {
    return null;
  }

  if (selection.type === "unit") {
    if (snapshot.player.units.some((unit) => unit.id === selection.id && unit.current.hp > 0)) {
      return TURN_SIDES.PLAYER;
    }

    if (snapshot.enemy.units.some((unit) => unit.id === selection.id && unit.current.hp > 0)) {
      return TURN_SIDES.ENEMY;
    }

    return null;
  }

  if (selection.type === "building") {
    const building = snapshot.map.buildings.find((candidate) => candidate.id === selection.id);

    if (building?.owner === TURN_SIDES.PLAYER || building?.owner === TURN_SIDES.ENEMY) {
      return building.owner;
    }
  }

  return snapshot.turn.activeSide === TURN_SIDES.ENEMY ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
}

export function getCommanderPowerTitle(commander) {
  return commander?.active?.name ?? "Commander Power";
}

export function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getFundsGainFromSnapshots(previousSnapshot, nextSnapshot) {
  if (
    !previousSnapshot ||
    !nextSnapshot ||
    previousSnapshot.id !== nextSnapshot.id ||
    previousSnapshot.map?.id !== nextSnapshot.map?.id
  ) {
    return null;
  }

  for (const side of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
    const previousFunds = Number(previousSnapshot[side]?.funds);
    const nextFunds = Number(nextSnapshot[side]?.funds);

    if (!Number.isFinite(previousFunds) || !Number.isFinite(nextFunds)) {
      continue;
    }

    const amount = nextFunds - previousFunds;

    if (amount > 0) {
      return {
        side,
        amount,
        previousFunds,
        nextFunds
      };
    }
  }

  return null;
}
