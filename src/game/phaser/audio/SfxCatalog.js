const SFX_ROOT = "./assets/audio/sfx";
const SFX_WARNING_KEYS = new Set();

export const SFX_CUE_IDS = Object.freeze({
  UI_HOVER: "ui.hover",
  UI_CONFIRM: "ui.confirm",
  UI_CANCEL: "ui.cancel",
  UI_DANGER: "ui.danger",
  UI_ADJUST: "ui.adjust",
  GRID_CURSOR: "battle.cursor",
  UNIT_SELECT: "battle.select",
  UNIT_DESELECT: "battle.deselect",
  MOVE_CONFIRM: "battle.move-confirm",
  TARGET_MODE: "battle.targeting",
  TARGET_VALID: "battle.target-confirm",
  TARGET_INVALID: "battle.invalid",

  MOVE_INFANTRY: "movement.infantry",
  MOVE_WHEELED: "movement.vehicle",
  MOVE_TRACKED: "movement.tracked",
  MOVE_AIR: "movement.air",
  TELEPORT_DEPART: "movement.teleport-depart",
  TELEPORT_ARRIVE: "movement.teleport-arrive",

  WEAPON_RIFLE: "weapon.rifle",
  WEAPON_BREAKER_CHARGE: "weapon.breaker_charge",
  WEAPON_MARKSMAN_RIFLE: "weapon.marksman_rifle",
  WEAPON_SIDEARM: "weapon.sidearm",
  WEAPON_TOOL_RIFLE: "weapon.tool_rifle",
  WEAPON_AUTOCANNON: "weapon.autocannon",
  WEAPON_BRUISER_CANNON: "weapon.bruiser_cannon",
  WEAPON_HEAVY_CANNON: "weapon.heavy_cannon",
  WEAPON_SIEGE_ARTILLERY: "weapon.siege_artillery",
  WEAPON_FLAK_CANNON: "weapon.flak_cannon",
  WEAPON_ROCKET_PODS: "weapon.rocket_pods",
  WEAPON_PAYLOAD_BOMBS: "weapon.payload_bombs",
  WEAPON_INTERCEPTOR_CANNONS: "weapon.interceptor_cannons",
  WEAPON_SECONDARY: "weapon.secondary",
  WEAPON_AA_GEAR: "weapon.aa",

  IMPACT_HIT: "impact.hit",
  IMPACT_CRITICAL: "impact.crit",
  IMPACT_GLANCE: "impact.glance",
  IMPACT_EFFECTIVE: "impact.effective",
  IMPACT_MISS: "impact.miss",
  IMPACT_DESTROYED: "impact.destroy",

  SUPPORT_MEDIC: "support.medic",
  SUPPORT_MECHANIC: "support.mechanic",
  SUPPORT_FIELD_MEDPACK: "support.field-medpack",
  SUPPORT_HQ: "support.command",
  SUPPORT_SECTOR: "support.sector",
  SUPPORT_HOSPITAL: "support.hospital",
  SUPPORT_REPAIR_STATION: "support.repair-station",
  SUPPORT_PASSIVE: "support.passive",
  SUPPORT_RUN_CARD: "support.run-card",
  SUPPORT_RESUPPLY: "support.resupply",

  RUNNER_BOARD: "transport.board",
  RUNNER_UNLOAD: "transport.unload",

  COMMANDER_ATLAS: "commander.atlas",
  COMMANDER_VIPER: "commander.viper",
  COMMANDER_ROOK: "commander.rook",
  COMMANDER_ECHO: "commander.echo",
  COMMANDER_BLAZE: "commander.blaze",
  COMMANDER_KNOX: "commander.knox",
  COMMANDER_FALCON: "commander.falcon",
  COMMANDER_GRAVES: "commander.graves",
  COMMANDER_NOVA: "commander.nova",
  COMMANDER_SABLE: "commander.sable",

  XP_GAIN: "progression.xp",
  XP_THRESHOLD: "progression.threshold",
  LEVEL_UP: "progression.level-up",
  STAT_GAIN: "progression.stat-up",
  REWARD: "progression.reward",

  TURN_PLAYER: "world.turn-player",
  TURN_ENEMY: "world.turn-enemy",
  TURN_END: "battle.turn-end",
  CAPTURE: "world.capture",
  DEPLOYMENT: "world.deploy",
  REINFORCEMENTS: "world.reinforcement",
  OBJECTIVE: "world.objective",
  RESCUE: "world.rescue",
  DROP_OFF: "world.drop-off",
  SABOTAGE: "world.sabotage",
  EXTINGUISH: "world.extinguish",
  BURN: "world.burn",
  STATUS_DAMAGE: "world.status-damage",

  VICTORY: "outcome.victory",
  DEFEAT: "outcome.defeat",
  RUN_COMPLETE: "outcome.run-complete",
});

function cue(id, group, filename, use, mix = {}) {
  return Object.freeze({
    id,
    group,
    key: `sfx:${id}`,
    url: `${SFX_ROOT}/${group}/${filename}.wav`,
    use,
    gain: mix.gain ?? 0.72,
    pitchVariation: mix.pitchVariation ?? 0.025,
    cooldownMs: mix.cooldownMs ?? 35,
    maxVoices: mix.maxVoices ?? 3,
    pan: mix.pan !== false,
    loop: mix.loop === true,
    duckMusic: mix.duckMusic === true,
    durationMs: mix.durationMs ?? 260,
    synthesis: Object.freeze({
      family: mix.family ?? group,
      durationMs: mix.durationMs ?? 260,
      toneHz: mix.toneHz ?? null,
    }),
  });
}

const C = SFX_CUE_IDS;

export const SFX_ASSETS = Object.freeze([
  cue(C.UI_HOVER, "ui", "hover", "Enabled menu control hover or manual focus navigation", { gain: 0.32, cooldownMs: 45, maxVoices: 1, durationMs: 70, toneHz: 980 }),
  cue(C.UI_CONFIRM, "ui", "confirm", "Accept or ordinary enabled menu action", { gain: 0.54, durationMs: 150, toneHz: 740 }),
  cue(C.UI_CANCEL, "ui", "cancel", "Back, cancel, close, resume, revert, redo, or discard", { gain: 0.5, durationMs: 160, toneHz: 390 }),
  cue(C.UI_DANGER, "ui", "danger", "Delete, quit, forfeit, or destructive confirmation", { gain: 0.62, durationMs: 230, toneHz: 185 }),
  cue(C.UI_ADJUST, "ui", "adjust", "Selector, slider, toggle, drawer, tab, or carousel adjustment", { gain: 0.38, cooldownMs: 28, maxVoices: 1, durationMs: 90, toneHz: 610 }),
  cue(C.GRID_CURSOR, "ui", "grid-cursor", "Restrained gamepad battlefield cursor step", { gain: 0.26, cooldownMs: 25, maxVoices: 1, durationMs: 55, toneHz: 520 }),
  cue(C.UNIT_SELECT, "ui", "unit-select", "Unit selected", { gain: 0.48, durationMs: 135, toneHz: 680 }),
  cue(C.UNIT_DESELECT, "ui", "unit-deselect", "Unit deselected", { gain: 0.4, durationMs: 120, toneHz: 430 }),
  cue(C.MOVE_CONFIRM, "ui", "move-confirm", "Validated movement destination selected", { gain: 0.5, durationMs: 145, toneHz: 560 }),
  cue(C.TARGET_MODE, "ui", "target-mode", "Attack or support targeting mode entered", { gain: 0.45, durationMs: 150, toneHz: 470 }),
  cue(C.TARGET_VALID, "ui", "target-valid", "Validated movement, attack, or support target chosen", { gain: 0.52, durationMs: 145, toneHz: 790 }),
  cue(C.TARGET_INVALID, "ui", "target-invalid", "Invalid battlefield target rejected", { gain: 0.46, cooldownMs: 90, maxVoices: 1, durationMs: 180, toneHz: 160 }),

  cue(C.MOVE_INFANTRY, "movement", "infantry-loop", "Infantry movement loop", { gain: 0.34, cooldownMs: 0, maxVoices: 4, loop: true, durationMs: 430, toneHz: 150 }),
  cue(C.MOVE_WHEELED, "movement", "wheeled-loop", "Runner and wheeled vehicle movement loop", { gain: 0.42, cooldownMs: 0, maxVoices: 3, loop: true, durationMs: 520, toneHz: 105 }),
  cue(C.MOVE_TRACKED, "movement", "tracked-loop", "Tracked vehicle movement loop", { gain: 0.46, cooldownMs: 0, maxVoices: 3, loop: true, durationMs: 600, toneHz: 82 }),
  cue(C.MOVE_AIR, "movement", "air-loop", "Aircraft movement loop", { gain: 0.4, cooldownMs: 0, maxVoices: 4, loop: true, durationMs: 640, toneHz: 125 }),
  cue(C.TELEPORT_DEPART, "movement", "teleport-depart", "Infantry teleport departure", { gain: 0.5, durationMs: 210, toneHz: 310 }),
  cue(C.TELEPORT_ARRIVE, "movement", "teleport-arrive", "Infantry teleport arrival", { gain: 0.55, durationMs: 230, toneHz: 880 }),

  cue(C.WEAPON_RIFLE, "weapons", "rifle", "Rifle-class primary fire", { gain: 0.68, cooldownMs: 22, maxVoices: 5, durationMs: 170, toneHz: 155 }),
  cue(C.WEAPON_BREAKER_CHARGE, "weapons", "breaker-charge", "Breaker charge detonation", { gain: 0.82, durationMs: 520, toneHz: 72 }),
  cue(C.WEAPON_MARKSMAN_RIFLE, "weapons", "marksman-rifle", "Marksman rifle fire", { gain: 0.78, durationMs: 330, toneHz: 112 }),
  cue(C.WEAPON_SIDEARM, "weapons", "sidearm", "Sidearm fire", { gain: 0.58, durationMs: 145, toneHz: 190 }),
  cue(C.WEAPON_TOOL_RIFLE, "weapons", "tool-rifle", "Mechanic tool-rifle fire", { gain: 0.6, durationMs: 190, toneHz: 245 }),
  cue(C.WEAPON_AUTOCANNON, "weapons", "autocannon", "Autocannon burst", { gain: 0.75, maxVoices: 4, durationMs: 310, toneHz: 125 }),
  cue(C.WEAPON_BRUISER_CANNON, "weapons", "bruiser-cannon", "Bruiser cannon fire", { gain: 0.82, durationMs: 410, toneHz: 78 }),
  cue(C.WEAPON_HEAVY_CANNON, "weapons", "heavy-cannon", "Heavy cannon fire", { gain: 0.88, durationMs: 520, toneHz: 62 }),
  cue(C.WEAPON_SIEGE_ARTILLERY, "weapons", "siege-artillery", "Siege artillery launch", { gain: 0.9, durationMs: 720, toneHz: 54 }),
  cue(C.WEAPON_FLAK_CANNON, "weapons", "flak-cannon", "Flak cannon burst", { gain: 0.78, durationMs: 380, toneHz: 138 }),
  cue(C.WEAPON_ROCKET_PODS, "weapons", "rocket-pods", "Rocket-pod salvo", { gain: 0.8, durationMs: 620, toneHz: 96 }),
  cue(C.WEAPON_PAYLOAD_BOMBS, "weapons", "payload-bombs", "Payload bomb release", { gain: 0.9, durationMs: 900, toneHz: 48 }),
  cue(C.WEAPON_INTERCEPTOR_CANNONS, "weapons", "interceptor-cannons", "Interceptor cannon burst", { gain: 0.76, durationMs: 280, toneHz: 175 }),
  cue(C.WEAPON_SECONDARY, "weapons", "secondary-fire", "Secondary weapon fire", { gain: 0.64, durationMs: 225, toneHz: 205 }),
  cue(C.WEAPON_AA_GEAR, "weapons", "aa-gear", "Anti-air gear attack", { gain: 0.74, durationMs: 480, toneHz: 126 }),

  cue(C.IMPACT_HIT, "impact", "hit", "Normal weapon impact", { gain: 0.66, cooldownMs: 15, maxVoices: 6, durationMs: 270, toneHz: 90 }),
  cue(C.IMPACT_CRITICAL, "impact", "critical", "Critical impact accent", { gain: 0.78, durationMs: 420, toneHz: 62 }),
  cue(C.IMPACT_GLANCE, "impact", "glance", "Glancing impact accent", { gain: 0.48, durationMs: 190, toneHz: 330 }),
  cue(C.IMPACT_EFFECTIVE, "impact", "effective", "Super-effective impact accent", { gain: 0.72, durationMs: 360, toneHz: 120 }),
  cue(C.IMPACT_MISS, "impact", "miss", "Attack misses or deals no damage", { gain: 0.4, durationMs: 210, toneHz: 530 }),
  cue(C.IMPACT_DESTROYED, "impact", "destroyed", "Unit destruction after impact", { gain: 0.82, cooldownMs: 40, maxVoices: 4, durationMs: 650, toneHz: 48 }),

  cue(C.SUPPORT_MEDIC, "support", "medic", "Medic service", { gain: 0.58, durationMs: 520, toneHz: 630 }),
  cue(C.SUPPORT_MECHANIC, "support", "mechanic", "Mechanic service", { gain: 0.58, durationMs: 540, toneHz: 340 }),
  cue(C.SUPPORT_FIELD_MEDPACK, "support", "field-medpack", "Field Medpack service", { gain: 0.56, durationMs: 470, toneHz: 720 }),
  cue(C.SUPPORT_HQ, "support", "hq", "Headquarters service", { gain: 0.62, durationMs: 610, toneHz: 440 }),
  cue(C.SUPPORT_SECTOR, "support", "sector", "Sector building service", { gain: 0.54, durationMs: 450, toneHz: 510 }),
  cue(C.SUPPORT_HOSPITAL, "support", "hospital", "Hospital service", { gain: 0.62, durationMs: 660, toneHz: 760 }),
  cue(C.SUPPORT_REPAIR_STATION, "support", "repair-station", "Repair Station service", { gain: 0.62, durationMs: 680, toneHz: 290 }),
  cue(C.SUPPORT_PASSIVE, "support", "passive", "Passive end-turn service", { gain: 0.44, durationMs: 380, toneHz: 590 }),
  cue(C.SUPPORT_RUN_CARD, "support", "run-card", "Run-card service effect", { gain: 0.52, durationMs: 520, toneHz: 670 }),
  cue(C.SUPPORT_RESUPPLY, "support", "resupply", "Generic ammunition or fuel resupply", { gain: 0.5, durationMs: 460, toneHz: 385 }),

  cue(C.RUNNER_BOARD, "transport", "runner-board", "Unit boards a Runner", { gain: 0.58, durationMs: 410, toneHz: 210 }),
  cue(C.RUNNER_UNLOAD, "transport", "runner-unload", "Unit unloads from a Runner", { gain: 0.58, durationMs: 440, toneHz: 470 }),

  cue(C.COMMANDER_ATLAS, "commander", "atlas", "Atlas commander ability", { gain: 0.76, durationMs: 950, toneHz: 180, duckMusic: true }),
  cue(C.COMMANDER_VIPER, "commander", "viper", "Viper commander ability", { gain: 0.76, durationMs: 930, toneHz: 390, duckMusic: true }),
  cue(C.COMMANDER_ROOK, "commander", "rook", "Rook commander ability", { gain: 0.78, durationMs: 980, toneHz: 120, duckMusic: true }),
  cue(C.COMMANDER_ECHO, "commander", "echo", "Echo commander ability", { gain: 0.74, durationMs: 900, toneHz: 540, duckMusic: true }),
  cue(C.COMMANDER_BLAZE, "commander", "blaze", "Blaze commander ability", { gain: 0.8, durationMs: 1020, toneHz: 100, duckMusic: true }),
  cue(C.COMMANDER_KNOX, "commander", "knox", "Knox commander ability", { gain: 0.78, durationMs: 960, toneHz: 145, duckMusic: true }),
  cue(C.COMMANDER_FALCON, "commander", "falcon", "Falcon commander ability", { gain: 0.76, durationMs: 940, toneHz: 620, duckMusic: true }),
  cue(C.COMMANDER_GRAVES, "commander", "graves", "Graves commander ability", { gain: 0.8, durationMs: 1010, toneHz: 84, duckMusic: true }),
  cue(C.COMMANDER_NOVA, "commander", "nova", "Nova commander ability", { gain: 0.78, durationMs: 980, toneHz: 760, duckMusic: true }),
  cue(C.COMMANDER_SABLE, "commander", "sable", "Sable commander ability", { gain: 0.76, durationMs: 920, toneHz: 260, duckMusic: true }),

  cue(C.XP_GAIN, "progression", "xp-gain", "Experience bar sweep", { gain: 0.38, cooldownMs: 30, maxVoices: 2, durationMs: 210, toneHz: 720 }),
  cue(C.XP_THRESHOLD, "progression", "xp-threshold", "Experience threshold crossed", { gain: 0.56, durationMs: 300, toneHz: 980 }),
  cue(C.LEVEL_UP, "progression", "level-up", "Level-up fanfare", { gain: 0.72, durationMs: 1050, toneHz: 440 }),
  cue(C.STAT_GAIN, "progression", "stat-gain", "One changed level-up stat", { gain: 0.46, cooldownMs: 55, maxVoices: 2, durationMs: 160, toneHz: 840 }),
  cue(C.REWARD, "progression", "reward", "Reward or unlock revealed", { gain: 0.64, durationMs: 720, toneHz: 610 }),

  cue(C.TURN_PLAYER, "world", "turn-player", "Player turn begins", { gain: 0.56, durationMs: 620, toneHz: 520 }),
  cue(C.TURN_ENEMY, "world", "turn-enemy", "Enemy turn begins", { gain: 0.56, durationMs: 620, toneHz: 210 }),
  cue(C.TURN_END, "world", "turn-end", "Turn ends", { gain: 0.44, durationMs: 380, toneHz: 350 }),
  cue(C.CAPTURE, "world", "capture", "Building capture completes", { gain: 0.62, durationMs: 750, toneHz: 460 }),
  cue(C.DEPLOYMENT, "world", "deployment", "Unit deployment", { gain: 0.6, durationMs: 560, toneHz: 380 }),
  cue(C.REINFORCEMENTS, "world", "reinforcements", "Reinforcements arrive", { gain: 0.66, durationMs: 820, toneHz: 470 }),
  cue(C.OBJECTIVE, "world", "objective", "Objective state changes", { gain: 0.62, durationMs: 690, toneHz: 570 }),
  cue(C.RESCUE, "world", "rescue", "Rescue target picked up", { gain: 0.62, durationMs: 700, toneHz: 690 }),
  cue(C.DROP_OFF, "world", "drop-off", "Rescue target delivered", { gain: 0.68, durationMs: 840, toneHz: 760 }),
  cue(C.SABOTAGE, "world", "sabotage", "Sabotage action completes", { gain: 0.66, durationMs: 690, toneHz: 150 }),
  cue(C.EXTINGUISH, "world", "extinguish", "Burning status extinguished", { gain: 0.54, durationMs: 580, toneHz: 310 }),
  cue(C.BURN, "world", "burn", "Burning status applied", { gain: 0.58, durationMs: 560, toneHz: 95 }),
  cue(C.STATUS_DAMAGE, "world", "status-damage", "Burn or other status damage tick", { gain: 0.52, durationMs: 360, toneHz: 105 }),

  cue(C.VICTORY, "outcome", "victory", "Victory overlay reveal", { gain: 0.84, durationMs: 1800, toneHz: 440, duckMusic: true }),
  cue(C.DEFEAT, "outcome", "defeat", "Defeat overlay reveal", { gain: 0.82, durationMs: 1700, toneHz: 150, duckMusic: true }),
  cue(C.RUN_COMPLETE, "outcome", "run-complete", "Full run completion fanfare", { gain: 0.88, durationMs: 2300, toneHz: 520, duckMusic: true }),
]);

const SFX_BY_ID = new Map(SFX_ASSETS.map((asset) => [asset.id, asset]));

export const WEAPON_SFX_CUE_BY_CLASS = Object.freeze({
  rifle: C.WEAPON_RIFLE,
  breaker_charge: C.WEAPON_BREAKER_CHARGE,
  marksman_rifle: C.WEAPON_MARKSMAN_RIFLE,
  sidearm: C.WEAPON_SIDEARM,
  tool_rifle: C.WEAPON_TOOL_RIFLE,
  autocannon: C.WEAPON_AUTOCANNON,
  bruiser_cannon: C.WEAPON_BRUISER_CANNON,
  heavy_cannon: C.WEAPON_HEAVY_CANNON,
  siege_artillery: C.WEAPON_SIEGE_ARTILLERY,
  flak_cannon: C.WEAPON_FLAK_CANNON,
  rocket_pods: C.WEAPON_ROCKET_PODS,
  payload_bombs: C.WEAPON_PAYLOAD_BOMBS,
  interceptor_cannons: C.WEAPON_INTERCEPTOR_CANNONS,
});

export const ATTACK_PROFILE_SFX_CUE_BY_TYPE = Object.freeze({
  primary: null,
  secondary: C.WEAPON_SECONDARY,
  "gear-aa": C.WEAPON_AA_GEAR,
  aa: C.WEAPON_AA_GEAR,
});

export const MOVEMENT_SFX_CUE_BY_FAMILY = Object.freeze({
  infantry: C.MOVE_INFANTRY,
  vehicle: C.MOVE_WHEELED,
  wheeled: C.MOVE_WHEELED,
  tracked: C.MOVE_TRACKED,
  air: C.MOVE_AIR,
  teleport: C.MOVE_INFANTRY,
});

export const UNIT_MOVEMENT_SFX_CUE = Object.freeze({
  grunt: C.MOVE_INFANTRY,
  breaker: C.MOVE_INFANTRY,
  longshot: C.MOVE_INFANTRY,
  medic: C.MOVE_INFANTRY,
  mechanic: C.MOVE_INFANTRY,
  runner: C.MOVE_WHEELED,
  bruiser: C.MOVE_TRACKED,
  juggernaut: C.MOVE_TRACKED,
  "siege-gun": C.MOVE_TRACKED,
  skyguard: C.MOVE_TRACKED,
  gunship: C.MOVE_AIR,
  payload: C.MOVE_AIR,
  interceptor: C.MOVE_AIR,
  carrier: C.MOVE_AIR,
});

export const SERVICE_SFX_CUE_BY_SOURCE = Object.freeze({
  medic: C.SUPPORT_MEDIC,
  mechanic: C.SUPPORT_MECHANIC,
  "field-medpack": C.SUPPORT_FIELD_MEDPACK,
  medpack: C.SUPPORT_FIELD_MEDPACK,
  hq: C.SUPPORT_HQ,
  command: C.SUPPORT_HQ,
  sector: C.SUPPORT_SECTOR,
  hospital: C.SUPPORT_HOSPITAL,
  "repair-station": C.SUPPORT_REPAIR_STATION,
  "commander-passive": C.SUPPORT_PASSIVE,
  passive: C.SUPPORT_PASSIVE,
  "run-card": C.SUPPORT_RUN_CARD,
  resupply: C.SUPPORT_RESUPPLY,
});

export const COMMANDER_SFX_CUE_BY_ID = Object.freeze({
  atlas: C.COMMANDER_ATLAS,
  viper: C.COMMANDER_VIPER,
  rook: C.COMMANDER_ROOK,
  echo: C.COMMANDER_ECHO,
  blaze: C.COMMANDER_BLAZE,
  knox: C.COMMANDER_KNOX,
  falcon: C.COMMANDER_FALCON,
  graves: C.COMMANDER_GRAVES,
  nova: C.COMMANDER_NOVA,
  sable: C.COMMANDER_SABLE,
});

export function getSfxCueDefinition(cueId) {
  return SFX_BY_ID.get(cueId) ?? null;
}

export function warnSfxOnce(identity, message, error = null, logger = console) {
  if (SFX_WARNING_KEYS.has(identity)) {
    return;
  }

  SFX_WARNING_KEYS.add(identity);
  logger?.warn?.(`[audio] ${message}`, ...(error ? [error] : []));
}

export function getSfxAssetKey(cueId) {
  return getSfxCueDefinition(cueId)?.key ?? null;
}

export function getWeaponSfxCueId(weaponClass, attackProfile = "primary") {
  return ATTACK_PROFILE_SFX_CUE_BY_TYPE[attackProfile]
    ?? WEAPON_SFX_CUE_BY_CLASS[weaponClass]
    ?? C.WEAPON_RIFLE;
}

export function getMovementSfxCueId(unitTypeId, movementFamily = null) {
  return UNIT_MOVEMENT_SFX_CUE[unitTypeId]
    ?? MOVEMENT_SFX_CUE_BY_FAMILY[movementFamily]
    ?? C.MOVE_INFANTRY;
}

export function getServiceSfxCueId(source) {
  return SERVICE_SFX_CUE_BY_SOURCE[source] ?? C.SUPPORT_RESUPPLY;
}

export function getCommanderSfxCueId(commanderId) {
  return COMMANDER_SFX_CUE_BY_ID[commanderId] ?? null;
}
