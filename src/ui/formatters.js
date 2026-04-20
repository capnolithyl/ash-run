import { COMMANDERS, getCommanderById } from "../game/content/commanders.js";

export function titleCaseSlot(slotId) {
  return slotId.replace("slot-", "Slot ");
}

export function formatCommanderName(commanderId) {
  return getCommanderById(commanderId)?.name ?? commanderId;
}

export function formatRelativeTimestamp(timestamp) {
  if (!timestamp) {
    return "Empty";
  }

  const date = new Date(timestamp);
  return date.toLocaleString();
}

export function getCommanderAccent(commanderId) {
  return getCommanderById(commanderId)?.accent ?? "#f5a455";
}

export function getLockedCommanderCount(unlockedCommanderIds) {
  return COMMANDERS.length - unlockedCommanderIds.length;
}
