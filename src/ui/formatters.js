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
  return COMMANDERS.length - (unlockedCommanderIds?.length ?? 0);
}

export function formatTurnCount(turnCount) {
  if (!Number.isFinite(turnCount)) {
    return "No clears yet";
  }

  const turns = Math.max(0, Math.floor(turnCount));
  return `${turns} turn${turns === 1 ? "" : "s"}`;
}
