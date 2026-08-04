import {
  BUILDING_KEYS,
  PROTOTYPE_RUN_GOAL,
  UNIT_TAGS
} from "../core/constants.js";
import {
  RUN_CAPTURE_EXPERIENCE_REWARD,
  RUN_CAPTURE_INTEL_REWARD,
  RUN_META_CURRENCY_CLEAR_BONUS,
  RUN_META_CURRENCY_MAP_REWARD
} from "../app/controllerShared.js";
import { COMMANDERS } from "./commanders.js";
import {
  getBuildingArmorBonusForType,
  getBuildingTypeMetadata
} from "./buildings.js";
import {
  MAP_GOAL_ORDER,
  MAP_GOAL_TYPES,
  DEFEND_OBJECTIVE_MAX_HP,
  getMapGoalLabel
} from "./mapGoals.js";
import {
  REINFORCEMENT_TRIGGER_ORDER,
  getReinforcementTriggerLabel,
  isIntervalReinforcementTrigger,
  isOneShotReinforcementTrigger
} from "./reinforcements.js";
import {
  RUN_CARD_TYPES,
  RUN_UPGRADES,
  UNIT_UNLOCK_TIERS
} from "./runUpgrades.js";
import { TERRAIN_LIBRARY } from "./terrain.js";
import { UNIT_CATALOG } from "./unitCatalog.js";
import {
  ARMOR_CLASSES,
  WEAPON_CLASSES,
  getWeaponClassProfile
} from "./weaponClasses.js";
import {
  DEFAULT_LEVEL_UP_GROWTHS,
  getEffectiveLevelUpGrowths,
  getXpThreshold
} from "../simulation/progression.js";
import { SECONDARY_ATTACK_RATIO } from "../simulation/selectors.js";
import {
  SUPPORT_COOLDOWN_BY_UNIT_TYPE,
  SUPPORT_HEAL_RATIO
} from "../simulation/playerActions/supportActions.js";
import {
  ATTACKER_CHARGE_PER_DAMAGE,
  DEFENDER_CHARGE_PER_DAMAGE
} from "../simulation/commanderEffects.js";

const FAMILY_LABELS = {
  [UNIT_TAGS.INFANTRY]: "Infantry",
  [UNIT_TAGS.VEHICLE]: "Vehicle",
  [UNIT_TAGS.AIR]: "Aircraft"
};

const ARMOR_LABELS = Object.fromEntries(
  Object.entries(ARMOR_CLASSES).map(([key, value]) => [value, key.replaceAll("_", " ")])
);

const PLAYER_UNIT_IDS = new Set(UNIT_UNLOCK_TIERS.flatMap((tier) => tier.unitIds));
const UNIT_TIER_BY_ID = new Map(
  UNIT_UNLOCK_TIERS.flatMap((tier, index) => tier.unitIds.map((unitId) => [unitId, index + 1]))
);

function percent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function entry(id, title, summary, details = [], tags = [], aliases = []) {
  return { id, title, summary, details, tags, aliases };
}

function section(id, title, summary, entries, filters = []) {
  return { id, title, summary, entries, filters };
}

function describeUnitCapabilities(unitId) {
  const capabilities = [];

  if (!["medic", "mechanic"].includes(unitId) && UNIT_CATALOG[unitId]?.family === UNIT_TAGS.INFANTRY) {
    capabilities.push("Can capture buildings");
  }
  if (unitId === "medic") capabilities.push("Heals adjacent infantry");
  if (unitId === "mechanic") capabilities.push("Repairs adjacent vehicles");
  if (unitId === "runner") capabilities.push("Carries one non-hostage infantry passenger");
  if (UNIT_CATALOG[unitId]?.family === UNIT_TAGS.INFANTRY) capabilities.push("Can Extinguish an adjacent burned ally");
  if (unitId === "longshot") capabilities.push("Gains +1 maximum range on Mountain");
  if (unitId === "carrier") capabilities.push("Unarmed scenario aircraft; not a troop transport");

  return capabilities;
}

function buildUnitEntries() {
  return Object.values(UNIT_CATALOG).map((unit) => {
    const playerAvailable = PLAYER_UNIT_IDS.has(unit.id);
    const weapon = unit.weaponClass ? getWeaponClassProfile(unit.weaponClass) : null;
    const growths = getEffectiveLevelUpGrowths(unit.id);
    const availability = playerAvailable
      ? `Player roster: unlock tier ${UNIT_TIER_BY_ID.get(unit.id)}`
      : "Scenario/enemy-only; not currently player-recruitable";

    return entry(
      `unit-${unit.id}`,
      unit.name,
      `${FAMILY_LABELS[unit.family] ?? unit.family} · ${availability}.`,
      [
        `HP ${unit.maxHealth} · Attack ${unit.attack} · Armor ${unit.armor} · Move ${unit.movement}`,
        `Range ${unit.minRange}-${unit.maxRange} · Stamina ${unit.staminaMax} · Ammo ${unit.ammoMax} · Luck ${unit.luck}`,
        `Armor class: ${ARMOR_LABELS[unit.armorClass] ?? unit.armorClass}`,
        weapon ? weapon.role : "No weapon profile; this unit cannot attack.",
        ...describeUnitCapabilities(unit.id),
        `Effective level growth chances: ${growths.map((growth) => `${growth.stat} ${growth.chance}%`).join(", ")}`
      ],
      ["units", unit.family, playerAvailable ? "player" : "scenario"],
      [unit.id, unit.weaponClass, unit.armorClass].filter(Boolean)
    );
  });
}

function buildWeaponEntries() {
  return Object.values(WEAPON_CLASSES).map((weaponClass) => {
    const profile = getWeaponClassProfile(weaponClass);
    const targets = Object.entries(profile?.targetProfiles ?? {}).map(([armorClass, target]) => {
      const effective = target.isEffective ? " · Effective" : "";
      return `${ARMOR_LABELS[armorClass] ?? armorClass}: ${percent(target.powerMultiplier)} power, ${percent(target.armorMultiplier)} armor applied${effective}`;
    });

    return entry(
      `weapon-${weaponClass}`,
      weaponClass.replaceAll("_", " "),
      profile?.role ?? "No current weapon profile.",
      targets,
      ["weapons", ...Object.keys(profile?.targetProfiles ?? {})],
      [weaponClass]
    );
  });
}

function buildTerrainEntries() {
  return Object.entries(TERRAIN_LIBRARY).map(([id, terrain]) => entry(
    `terrain-${id}`,
    terrain.label,
    `Armor +${terrain.armorBonus}; infantry cost ${terrain.moveCost}; vehicle cost ${terrain.vehicleMoveCost}.`,
    [
      terrain.blockedFamilies.length
        ? `Blocked for: ${terrain.blockedFamilies.map((family) => FAMILY_LABELS[family] ?? family).join(", ")}.`
        : "Open to ground units.",
      "Aircraft spend 1 movement and receive no terrain armor.",
      id === "mountain" ? "Longshots gain +1 maximum range while standing here." : ""
    ].filter(Boolean),
    ["terrain", id]
  ));
}

function buildBuildingEntries() {
  return Object.values(BUILDING_KEYS).map((buildingType) => {
    const metadata = getBuildingTypeMetadata(buildingType);
    const service = metadata.serviceProfile;
    const isProduction = metadata.canRecruit;
    const details = [
      `Position armor: +${getBuildingArmorBonusForType(buildingType)}. Building armor replaces terrain armor and does not stack.`,
      service
        ? `Supply restores ${percent(service.hpRatio)} HP, ${percent(service.ammoRatio)} ammo, and ${percent(service.staminaRatio)} stamina${service.unitFamily ? ` for ${FAMILY_LABELS[service.unitFamily].toLowerCase()} only` : ""}.`
        : "This building has no Supply service profile.",
      isProduction
        ? `Other modes/enemy infrastructure: recruits ${metadata.recruitmentFamilies.map((unitId) => UNIT_CATALOG[unitId]?.name ?? unitId).join(", ")}. Normal Run battles do not expose player recruitment.`
        : "Capture availability follows normal infantry capture rules."
    ];

    return entry(`building-${buildingType}`, metadata.name, metadata.summary, details, ["buildings", isProduction ? "production" : "service"], [metadata.shortLabel, buildingType]);
  });
}

function missionEntry(goalType) {
  const detailsByType = {
    [MAP_GOAL_TYPES.ROUT]: ["Defeat every enemy unit. Empty-start sides must take a turn before elimination can resolve."],
    [MAP_GOAL_TYPES.HQ_CAPTURE]: ["Capture the enemy Command Post. Unit wipes do not replace the ownership objective."],
    [MAP_GOAL_TYPES.RESCUE]: ["Any non-air unit may pick up the hostage. The carrier loses 1 movement, cannot attack or board, and must reach the player HQ. Carrier death fails the mission."],
    [MAP_GOAL_TYPES.DEFEND]: [`The target begins with ${DEFEND_OBJECTIVE_MAX_HP} integrity. Adjacent enemy sabotage removes 1; survive the configured timer with integrity remaining.`],
    [MAP_GOAL_TYPES.SURVIVE]: ["Keep at least one player unit alive until the timer expires. Routing the enemy does not win early."]
  };
  return entry(`mission-${goalType}`, getMapGoalLabel(goalType), detailsByType[goalType][0], detailsByType[goalType], ["missions", goalType]);
}

function commanderEntry(commander) {
  return entry(
    `commander-${commander.id}`,
    `${commander.name} — ${commander.title}`,
    `${commander.passive.name}: ${commander.passive.summary}`,
    [
      `Power meter: ${commander.powerMax}`,
      `${commander.active.name}: ${commander.active.summary}`,
      `Combat charge: attacker gains ${ATTACKER_CHARGE_PER_DAMAGE} per damage dealt; defender gains ${DEFENDER_CHARGE_PER_DAMAGE} per damage taken. Charge is locked after that side uses its power for the turn.`
    ],
    ["commanders"],
    [commander.id, commander.passive.name, commander.active.name]
  );
}

function buildRunUpgradeEntries() {
  return RUN_UPGRADES
    .filter((upgrade) => !upgrade.hidden && [RUN_CARD_TYPES.PASSIVE, RUN_CARD_TYPES.GEAR].includes(upgrade.type))
    .map((upgrade) => entry(
      `upgrade-${upgrade.id}`,
      upgrade.name,
      upgrade.summary,
      [
        ...(upgrade.detailLines ?? []),
        Object.keys(upgrade.values ?? {}).length
          ? `Current values: ${Object.entries(upgrade.values).map(([key, value]) => `${key} ${value}`).join(", ")}`
          : ""
      ].filter(Boolean),
      ["run-upgrades", upgrade.type],
      [upgrade.id, upgrade.rarity, upgrade.eligibleFamily].filter(Boolean)
    ));
}

export function buildFieldManual() {
  const blaze = COMMANDERS.find((commander) => commander.id === "blaze");

  return [
    section("quick-start", "Quick Start", "The shortest path from deployment to a clean turn.", [
      entry("quick-start-loop", "Read, select, preview, commit", "Read the objective and failure condition, inspect unit readiness, preview movement and combat, then commit orders.", ["Capture and mission progress matter more than routing enemies on non-Rout maps.", "End Turn only after every useful order is spent."], ["basics"])
    ]),
    section("controls", "Controls", "Mouse, touch, keyboard-focus, and controller navigation.", [
      entry("controls-pointer", "Pointer and touch", "Select units and tiles directly; use the command prompt to commit actions.", ["Right-click or the contextual cancel action backs out of targeting where supported."], ["controls"]),
      entry("controls-controller", "Controller", "D-pad or left stick moves focus/cursor; A confirms; B uses the contextual action or cancel; LB/RB selects the next ready unit; Start pauses.", ["Menus, search, filters, and collapsible manual entries use the same controller focus system."], ["controls", "controller"])
    ]),
    section("turn-flow", "Turn Flow and Actions", "Orders are previewed first and become spent when committed.", [
      entry("turn-flow-actions", "Move, act, wait, redo", "Movement spends stamina equal to path cost. The command prompt then offers legal actions such as Fire, Capture, Supply, Support, Transport, Wait, or Redo.", ["Redo is available before a committed action.", "Wait spends the unit without another action."], ["turn-flow"]),
      entry("turn-flow-supply", "Supply is explicit", "Standing on an owned service building does not restore resources automatically.", ["Capturing a building does not service the capturing unit immediately; use a later action."], ["turn-flow", "supply"])
    ]),
    section("units", "Units", "Current roster and scenario unit catalog.", buildUnitEntries(), ["infantry", "vehicle", "air", "player", "scenario"]),
    section("weapons", "Weapons and Matchups", "Shared weapon profiles and armor-class matchups.", [
      ...buildWeaponEntries(),
      entry("weapon-secondary", "Secondary fire", `Ground units at zero primary ammo use a range-1 Rifle profile at ${percent(SECONDARY_ATTACK_RATIO)} base attack.`, ["Secondary fire consumes no ammo. Nova's Overload follows its own power rules."], ["weapons", "ammo"])
    ]),
    section("terrain", "Terrain", "Movement cost, access, and positional armor.", buildTerrainEntries(), ["plain", "road", "forest", "mountain", "water", "ridge"]),
    section("buildings", "Buildings, Capture, and Supply", "Ownership, armor, service, and mode-specific production.", [
      entry("capture-rules", "Capture rules", "Eligible infantry capture immediately; Medic and Mechanic cannot capture.", [`In Run mode, the first capture of each building awards ${RUN_CAPTURE_INTEL_REWARD} Intel and ${RUN_CAPTURE_EXPERIENCE_REWARD} EXP. Tutorial captures award neither.`], ["buildings", "capture"]),
      ...buildBuildingEntries()
    ]),
    section("combat-math", "Combat Math", "The forecast resolves the current authoritative modifiers.", [
      entry("combat-damage", "Damage sequence", "Weapon power and armor-profile multipliers resolve first, followed by positional armor, attacker HP scaling, and a flat Luck roll from 0 to Luck.", ["Counters require a legal defender attack profile and the attacker's distance inside the defender's own range band.", "Aircraft receive no terrain or building armor."], ["combat", "forecast"])
    ]),
    section("support-transport", "Support and Transport", "Service units and Runner passenger rules.", [
      entry("support-medic", "Medic support", `Restore ${percent(SUPPORT_HEAL_RATIO)} max HP and fully refill ammo/stamina for adjacent infantry.`, [`Cooldown: ${SUPPORT_COOLDOWN_BY_UNIT_TYPE.medic} turns. The Medic and target cannot be the same unit.`], ["support", "infantry"]),
      entry("support-mechanic", "Mechanic support", `Restore ${percent(SUPPORT_HEAL_RATIO)} max HP and fully refill ammo/stamina for an adjacent vehicle.`, [`Cooldown: ${SUPPORT_COOLDOWN_BY_UNIT_TYPE.mechanic} turns.`], ["support", "vehicle"]),
      entry("transport-runner", "Runner transport", "A non-hostage infantry unit may board an adjacent empty Runner. A loaded Runner may move before unloading.", ["Unloading spends both Runner and passenger.", "Attacking locks unloading for that turn.", "Destroying a loaded Runner also kills its passenger."], ["transport"])
    ]),
    section("missions", "Mission Types", "Victory, progress, and failure rules.", MAP_GOAL_ORDER.map(missionEntry), MAP_GOAL_ORDER),
    section("commanders", "Commanders", "All current commander traits, power thresholds, and active abilities.", COMMANDERS.map(commanderEntry), COMMANDERS.map((commander) => commander.id)),
    section("statuses", "Status Effects", "Temporary and persistent battlefield conditions.", [
      entry("status-burned", "Burned", `${blaze.active.name} immediately deals ${percent(blaze.active.damageRatio)} max HP and applies Burn. Burn ticks for ${percent(blaze.active.damageRatio)} max HP on the burned side's turn, cannot kill by itself, and halves attack while active.`, ["Adjacent infantry can spend an action to Extinguish a burned ally. Flamethrower gear also applies Burn."], ["statuses", "burn"]),
      entry("status-corrupted", "Corrupted", "One of attack, armor, range, ammo, or stamina is halved, rounded up, for one turn.", ["Echo's Disruption and Toolkit-related effects are current sources. Atlas Overhaul cleanses it."], ["statuses", "corrupted"]),
      entry("status-zombified", "Zombified", "Patient Zero gear can permanently zombify a defeated unit, causing it to count as defeated and lash out at former allies.", ["This is a Run gear effect rather than a standard timed status."], ["statuses", "gear"]),
      entry("status-modifiers", "Other modifiers", "Shield, attack %, armor %, mobility, range, and Luck modifiers appear in the unit breakdown with their current source and duration.", [], ["statuses", "modifiers"])
    ]),
    section("progression", "Leveling and Run Progression", "Experience, growths, rewards, and between-map persistence.", [
      entry("leveling-threshold", "Level thresholds", `Level 1 requires ${getXpThreshold(1)} EXP; each later threshold adds 30.`, [`Shared growth chances: ${Object.entries(DEFAULT_LEVEL_UP_GROWTHS).map(([stat, growth]) => `${stat} ${growth.chance}%`).join(", ")}.`, "Each stat rolls independently; when none grow, one eligible weighted fallback is guaranteed."], ["progression", "leveling"]),
      entry("run-structure", "Run structure", `A Run targets ${PROTOTYPE_RUN_GOAL} maps. Each map clear awards ${RUN_META_CURRENCY_MAP_REWARD} Intel and a full clear adds ${RUN_META_CURRENCY_CLEAR_BONUS}.`, ["Survivors retain identity, name, level, EXP, grown stats, and gear.", "HP, ammo, and stamina refresh when deploying the next map.", "Defeated units are removed from that Run."], ["progression", "run"])
    ]),
    section("run-upgrades", "Run Cards, Gear, and Reinforcements", "Current upgrade definitions and authored reinforcement triggers.", [
      ...buildRunUpgradeEntries(),
      ...REINFORCEMENT_TRIGGER_ORDER.map((triggerType) => entry(
        `reinforcement-${triggerType}`,
        getReinforcementTriggerLabel(triggerType),
        isOneShotReinforcementTrigger(triggerType)
          ? "One-shot authored reinforcement trigger."
          : isIntervalReinforcementTrigger(triggerType)
            ? "Repeatable interval trigger with authored activation limits."
            : "Authored map trigger.",
        [],
        ["reinforcements", triggerType]
      ))
    ], ["passive", "gear", "reinforcements"])
  ];
}

export function searchFieldManual(sections, query = "", activeFilter = "all") {
  const normalizedQuery = String(query).trim().toLowerCase();
  const normalizedFilter = String(activeFilter || "all").toLowerCase();

  return sections.map((manualSection) => ({
    ...manualSection,
    entries: manualSection.entries.filter((manualEntry) => {
      const matchesFilter = normalizedFilter === "all" || manualEntry.tags.some((tag) => String(tag).toLowerCase() === normalizedFilter);
      const haystack = [manualSection.title, manualEntry.title, manualEntry.summary, ...manualEntry.details, ...manualEntry.tags, ...manualEntry.aliases].join(" ").toLowerCase();
      return matchesFilter && (!normalizedQuery || haystack.includes(normalizedQuery));
    })
  })).filter((manualSection) => manualSection.entries.length > 0);
}
