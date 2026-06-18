import { describeBuilding, getBuildingServiceProfile } from "../content/buildings.js";
import { appendLog } from "./battleLog.js";
import { canReceiveService, canResupplyUnit, resupplyUnitIfAllowed } from "./commanderEffects.js";

export function restoreUnitServiceResources(
  state,
  unit,
  { healAmount = 0, healToFull = false, resupply = true } = {}
) {
  const previousHp = unit.current.hp;
  const previousAmmo = unit.current.ammo;
  const previousStamina = unit.current.stamina;

  if (healToFull) {
    unit.current.hp = unit.stats.maxHealth;
  } else if (healAmount > 0) {
    unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + healAmount);
  }

  if (resupply) {
    resupplyUnitIfAllowed(state, unit);
  }

  return {
    hpChanged: unit.current.hp !== previousHp,
    resupplied: unit.current.ammo !== previousAmmo || unit.current.stamina !== previousStamina,
    changed:
      unit.current.hp !== previousHp ||
      unit.current.ammo !== previousAmmo ||
      unit.current.stamina !== previousStamina
  };
}

function getPartialRestoreAmount(current, maximum, ratio) {
  if (!ratio || maximum <= 0 || current >= maximum) {
    return 0;
  }

  return Math.min(maximum - current, Math.ceil(maximum * ratio));
}

export function getBuildingSupplyPreview(state, unit, building) {
  const serviceProfile = getBuildingServiceProfile(building?.type);
  const canResupply = canResupplyUnit(state, unit);
  const valid =
    Boolean(unit) &&
    Boolean(building) &&
    Boolean(serviceProfile) &&
    building.owner === unit.owner &&
    !unit.transport?.carriedByUnitId &&
    canReceiveService(state, unit) &&
    (!serviceProfile.unitFamily || unit.family === serviceProfile.unitFamily);

  if (!valid) {
    return {
      valid: false,
      changed: false,
      building,
      serviceProfile,
      hpRecovered: 0,
      ammoRecovered: 0,
      staminaRecovered: 0,
      needScore: 0
    };
  }

  const hpRecovered = getPartialRestoreAmount(
    unit.current.hp,
    unit.stats.maxHealth,
    serviceProfile.hpRatio ?? 0
  );
  const ammoRecovered = canResupply
    ? getPartialRestoreAmount(unit.current.ammo, unit.stats.ammoMax, serviceProfile.ammoRatio ?? 0)
    : 0;
  const staminaRecovered = canResupply
    ? getPartialRestoreAmount(
        unit.current.stamina,
        unit.stats.staminaMax,
        serviceProfile.staminaRatio ?? 0
      )
    : 0;
  const changed = hpRecovered > 0 || ammoRecovered > 0 || staminaRecovered > 0;

  return {
    valid: true,
    changed,
    building,
    serviceProfile,
    hpRecovered,
    ammoRecovered,
    staminaRecovered,
    needScore: hpRecovered * 2 + ammoRecovered * 3 + staminaRecovered * 2
  };
}

export function applyBuildingSupply(
  state,
  unit,
  building,
  { spendAction = true, log = true } = {}
) {
  const preview = getBuildingSupplyPreview(state, unit, building);

  if (!preview.changed) {
    return preview;
  }

  unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + preview.hpRecovered);

  if (preview.ammoRecovered > 0 || preview.staminaRecovered > 0) {
    if (
      preview.ammoRecovered === Math.max(0, unit.stats.ammoMax - unit.current.ammo) &&
      preview.staminaRecovered === Math.max(0, unit.stats.staminaMax - unit.current.stamina)
    ) {
      resupplyUnitIfAllowed(state, unit);
    } else {
      unit.current.ammo = Math.min(unit.stats.ammoMax, unit.current.ammo + preview.ammoRecovered);
      unit.current.stamina = Math.min(unit.stats.staminaMax, unit.current.stamina + preview.staminaRecovered);
    }
  }

  if (spendAction) {
    unit.hasMoved = true;
    unit.hasAttacked = true;
  }

  if (log) {
    appendLog(state, `${unit.name} used Supply at ${describeBuilding(building).name}.`);
  }

  return {
    ...preview,
    changed: true
  };
}
