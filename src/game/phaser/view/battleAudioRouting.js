import { UNIT_CATALOG } from "../../content/unitCatalog.js";
import {
  getMovementSfxCueId,
  getServiceSfxCueId,
  getWeaponSfxCueId
} from "../audio/SfxCatalog.js";

const MAX_BATTLEFIELD_PAN = 0.35;

const MISSION_CUES = {
  capture: "world.capture",
  rescue: "world.rescue",
  "drop-off": "world.drop-off",
  sabotage: "world.sabotage"
};

export function getBattlefieldPan(x, mapWidth) {
  if (!Number.isFinite(x) || !Number.isFinite(mapWidth) || mapWidth <= 1) {
    return 0;
  }

  const normalized = (x / (mapWidth - 1)) * 2 - 1;
  return Math.max(-MAX_BATTLEFIELD_PAN, Math.min(MAX_BATTLEFIELD_PAN, normalized * MAX_BATTLEFIELD_PAN));
}

export function getNewBattlePresentationEvents(previousSnapshot, nextSnapshot) {
  if (
    !previousSnapshot ||
    !nextSnapshot ||
    previousSnapshot.id !== nextSnapshot.id ||
    previousSnapshot.map?.id !== nextSnapshot.map?.id
  ) {
    return [];
  }

  const previousIds = new Set(
    (previousSnapshot?.presentation?.events ?? []).map((event) => event.id)
  );

  return (nextSnapshot?.presentation?.events ?? []).filter(
    (event) => Number.isInteger(event.id) && !previousIds.has(event.id)
  );
}

export function getMovementCueId(unitTypeId) {
  const family = UNIT_CATALOG[unitTypeId]?.family;
  return getMovementSfxCueId(unitTypeId, family);
}

export function getWeaponCueId(attackEvent) {
  return getWeaponSfxCueId(
    attackEvent?.weaponClass,
    attackEvent?.profile ?? attackEvent?.weaponType ?? "primary"
  );
}

export function getImpactCueIds(attackEvent) {
  if ((attackEvent?.damage ?? 0) <= 0) {
    return ["impact.miss"];
  }

  const cues = ["impact.hit"];

  if (attackEvent?.isCrit) {
    cues.push("impact.crit");
  } else if (attackEvent?.isGlance) {
    cues.push("impact.glance");
  } else if (attackEvent?.isEffective) {
    cues.push("impact.effective");
  }

  return cues;
}

export function getServiceCueId(event) {
  if (event?.sourceKind === "building") {
    return getServiceSfxCueId(event.buildingType);
  }

  return getServiceSfxCueId(event?.sourceKind);
}

export function getPresentationEventCueId(event) {
  if (event?.type === "service") {
    return getServiceCueId(event);
  }

  if (event?.type === "transport") {
    return event.action === "unload" ? "transport.unload" : "transport.board";
  }

  if (event?.type === "status") {
    if (event.action === "extinguish") {
      return "world.extinguish";
    }

    return event.action === "apply" && event.statusType === "burn"
      ? "world.burn"
      : "world.status-damage";
  }

  if (event?.type === "mission") {
    return MISSION_CUES[event.action] ?? null;
  }

  return null;
}

export function createBattleCueContext(event, snapshot, source) {
  const x = source === "weapon"
    ? event?.fromX ?? event?.x
    : event?.toX ?? event?.x ?? event?.path?.at?.(-1)?.x;
  const eventId = event?.id ?? event?.eventId;

  return {
    dedupeKey: eventId
      ? `${snapshot?.id ?? "battle"}:${source ?? event.type}:${eventId}`
      : undefined,
    eventId,
    pan: getBattlefieldPan(x, snapshot?.map?.width),
    source: source ?? event?.type
  };
}
