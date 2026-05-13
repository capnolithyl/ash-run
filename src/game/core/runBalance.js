// One entry per run map number. Higher map numbers clamp to the last values.
// Each unit entry can either be:
// - "grunt"
// - { unitTypeId: "gunship", level: 3 }
export const RUN_ENEMY_STARTING_LEVEL_BY_MAP_NUMBER = [
  1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
];

// Tweak these arrays to rebalance how strong the enemy opening squad feels.
// The per-map default level above applies unless a unit entry overrides it.
export const RUN_ENEMY_STARTING_SQUADS_BY_MAP_NUMBER = [
  ["grunt", { unitTypeId: "grunt", level: 2 }, "medic"],
  ["grunt", "runner", { unitTypeId: "longshot", level: 2 }],
  ["grunt", "runner", "breaker", "medic"],
  [
    "grunt",
    "runner",
    "breaker",
    "longshot",
    { unitTypeId: "gunship", level: 3 },
  ],
  [
    "grunt",
    "runner",
    "breaker",
    { unitTypeId: "bruiser", level: 4 },
    "medic",
    "gunship",
  ],
  [
    "grunt",
    "runner",
    "breaker",
    "bruiser",
    "longshot",
    { unitTypeId: "gunship", level: 4 },
  ],
  ["grunt", "runner", "breaker", "bruiser", "longshot", "skyguard"],
  [
    "grunt",
    "runner",
    "breaker",
    "bruiser",
    "longshot",
    "skyguard",
    { unitTypeId: "siege-gun", level: 5 },
  ],
  [
    "grunt",
    "runner",
    "breaker",
    "bruiser",
    "longshot",
    "skyguard",
    "siege-gun",
    "juggernaut",
  ],
  [
    "grunt",
    "runner",
    "breaker",
    "bruiser",
    "longshot",
    "skyguard",
    "siege-gun",
    "juggernaut",
    "gunship",
  ],
];

function normalizeRunEnemyStartingSquadEntry(entry, defaultLevel) {
  if (typeof entry === "string") {
    return {
      unitTypeId: entry,
      level: defaultLevel,
    };
  }

  const normalizedLevel = Math.max(
    1,
    Math.floor(Number(entry?.level) || defaultLevel),
  );

  return {
    unitTypeId: String(entry?.unitTypeId ?? ""),
    level: normalizedLevel,
  };
}

export function getRunEnemyStartingSquad(mapNumber) {
  const normalizedMapNumber = Math.max(1, Number(mapNumber) || 1);
  const rosterIndex = Math.min(
    RUN_ENEMY_STARTING_SQUADS_BY_MAP_NUMBER.length - 1,
    normalizedMapNumber - 1,
  );
  const levelIndex = Math.min(
    RUN_ENEMY_STARTING_LEVEL_BY_MAP_NUMBER.length - 1,
    normalizedMapNumber - 1,
  );
  const defaultLevel = Math.max(
    1,
    RUN_ENEMY_STARTING_LEVEL_BY_MAP_NUMBER[levelIndex] ?? 1,
  );

  return RUN_ENEMY_STARTING_SQUADS_BY_MAP_NUMBER[rosterIndex]
    .map((entry) => normalizeRunEnemyStartingSquadEntry(entry, defaultLevel))
    .filter((entry) => entry.unitTypeId.length > 0);
}
