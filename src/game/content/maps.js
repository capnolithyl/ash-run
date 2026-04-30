import { BUILDING_KEYS } from "../core/constants.js";
import { createBattlefield } from "./mapFactory.js";

/**
 * The prototype ships with a 20-map pool built from hand-tuned blueprints.
 * The shared generator now layers in asymmetric terrain and objective pressure.
 */
export const MAP_POOL = [
  createBattlefield({
    id: "ashline-crossing",
    name: "Ashline Crossing",
    theme: "ash",
    width: 18,
    height: 12,
    layout: "east-west",
    riverColumns: [6, 7],
    roadGaps: [6, 7],
    roadSpurs: [2, 11],
    forests: [{ x: 3, y: 1, width: 2, height: 2 }, { x: 9, y: 7, width: 2, height: 2 }],
    neutralBuildings: [{ id: "ashline-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 5 }]
  }),
  createBattlefield({
    id: "signal-ridge",
    name: "Signal Ridge",
    theme: "storm",
    width: 20,
    height: 16,
    layout: "north-south",
    ridges: [{ x: 5, y: 1, width: 1, height: 3 }, { x: 8, y: 6, width: 1, height: 3 }],
    forests: [{ x: 2, y: 7, width: 2, height: 2 }, { x: 10, y: 1, width: 2, height: 2 }],
    mountains: [{ x: 13, y: 3, width: 2, height: 2 }],
    playerProduction: BUILDING_KEYS.MOTOR_POOL
  }),
  createBattlefield({
    id: "afterglow-yard",
    name: "Afterglow Yard",
    theme: "dusk",
    width: 16,
    height: 10,
    layout: "corner",
    roadSpurs: [4, 9],
    forests: [{ x: 4, y: 3, width: 2, height: 2 }, { x: 8, y: 5, width: 2, height: 2 }],
    mountains: [{ x: 11, y: 1, width: 2, height: 2 }],
    ridges: [{ x: 12, y: 6, width: 1, height: 2 }],
    neutralBuildings: [{ id: "afterglow-sector-a", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 3 }]
  }),
  createBattlefield({
    id: "meridian-flats",
    name: "Meridian Flats",
    theme: "ash",
    width: 18,
    height: 12,
    layout: "center-ring",
    playerProduction: BUILDING_KEYS.AIRFIELD,
    forests: [{ x: 5, y: 1, width: 1, height: 2 }, { x: 8, y: 7, width: 1, height: 2 }],
    mountains: [{ x: 13, y: 2, width: 2, height: 1 }],
    ridges: [{ x: 14, y: 7, width: 1, height: 2 }],
    neutralBuildings: [{ id: "meridian-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 7, y: 5 }]
  }),
  createBattlefield({
    id: "coastfire-run",
    name: "Coastfire Run",
    theme: "storm",
    width: 24,
    height: 14,
    layout: "corner",
    riverColumns: [4, 9],
    forests: [{ x: 1, y: 1, width: 2, height: 2 }, { x: 11, y: 7, width: 2, height: 2 }],
    ridges: [{ x: 6, y: 0, width: 2, height: 2 }],
    mountains: [{ x: 15, y: 3, width: 2, height: 2 }],
    bridgeRows: [2, 7, 12]
  }),
  createBattlefield({
    id: "hinterworks",
    name: "Hinterworks",
    theme: "dusk",
    width: 22,
    height: 18,
    layout: "north-south",
    playerProduction: BUILDING_KEYS.MOTOR_POOL,
    forests: [{ x: 3, y: 2, width: 3, height: 1 }, { x: 8, y: 7, width: 3, height: 1 }],
    ridges: [{ x: 6, y: 4, width: 2, height: 2 }]
  }),
  createBattlefield({
    id: "cold-trace",
    name: "Cold Trace",
    theme: "frost",
    width: 16,
    height: 12,
    layout: "east-west",
    riverColumns: [6],
    roadGaps: [6],
    neutralBuildings: [{ id: "cold-sector-a", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 2 }],
    forests: [{ x: 9, y: 2, width: 2, height: 2 }, { x: 2, y: 7, width: 2, height: 2 }],
    mountains: [{ x: 4, y: 8, width: 2, height: 1 }]
  }),
  createBattlefield({
    id: "noonfire-basin",
    name: "Noonfire Basin",
    theme: "ash",
    width: 20,
    height: 14,
    layout: "center-ring",
    playerProduction: BUILDING_KEYS.BARRACKS,
    roadSpurs: [3, 10],
    ridges: [{ x: 5, y: 2, width: 1, height: 5 }, { x: 8, y: 3, width: 1, height: 5 }],
    forests: [{ x: 13, y: 2, width: 2, height: 2 }, { x: 13, y: 9, width: 2, height: 2 }],
    mountains: [{ x: 2, y: 10, width: 2, height: 1 }]
  }),
  createBattlefield({
    id: "violet-approach",
    name: "Violet Approach",
    theme: "dusk",
    width: 18,
    height: 16,
    layout: "north-south",
    playerProduction: BUILDING_KEYS.AIRFIELD,
    forests: [{ x: 2, y: 1, width: 2, height: 3 }, { x: 10, y: 6, width: 2, height: 3 }],
    neutralBuildings: [{ id: "violet-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 7, y: 4 }]
  }),
  createBattlefield({
    id: "hollow-sector",
    name: "Hollow Sector",
    theme: "storm",
    width: 26,
    height: 16,
    layout: "corner",
    roadSpurs: [5, 8],
    ridges: [{ x: 4, y: 0, width: 1, height: 3 }, { x: 9, y: 7, width: 1, height: 3 }],
    neutralBuildings: [{ id: "hollow-sector-a", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 5 }]
  }),
  createBattlefield({
    id: "ember-vault",
    name: "Ember Vault",
    theme: "ash",
    width: 22,
    height: 14,
    layout: "center-ring",
    playerProduction: BUILDING_KEYS.MOTOR_POOL,
    forests: [{ x: 5, y: 1, width: 2, height: 1 }, { x: 7, y: 8, width: 2, height: 1 }],
    ridges: [{ x: 6, y: 3, width: 2, height: 3 }]
  }),
  createBattlefield({
    id: "breakwater-arc",
    name: "Breakwater Arc",
    theme: "frost",
    width: 18,
    height: 12,
    layout: "east-west",
    riverColumns: [5, 8],
    roadGaps: [5, 8],
    neutralBuildings: [{ id: "breakwater-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 7, y: 3 }],
    forests: [{ x: 2, y: 7, width: 2, height: 2 }, { x: 11, y: 1, width: 2, height: 2 }],
    mountains: [{ x: 12, y: 8, width: 2, height: 1 }],
    ridges: [{ x: 14, y: 4, width: 1, height: 2 }]
  }),
  createBattlefield({
    id: "sunset-delta",
    name: "Sunset Delta",
    theme: "dusk",
    width: 20,
    height: 18,
    layout: "north-south",
    roadSpurs: [6],
    forests: [{ x: 4, y: 6, width: 2, height: 2 }, { x: 8, y: 1, width: 2, height: 2 }],
    mountains: [{ x: 13, y: 5, width: 2, height: 2 }],
    ridges: [{ x: 14, y: 11, width: 1, height: 3 }],
    playerProduction: BUILDING_KEYS.BARRACKS
  }),
  createBattlefield({
    id: "echo-spur",
    name: "Echo Spur",
    theme: "storm",
    width: 24,
    height: 14,
    layout: "corner",
    ridges: [{ x: 3, y: 4, width: 3, height: 1 }, { x: 8, y: 5, width: 3, height: 1 }],
    forests: [{ x: 4, y: 1, width: 2, height: 2 }, { x: 15, y: 8, width: 2, height: 2 }],
    mountains: [{ x: 11, y: 2, width: 2, height: 2 }],
    neutralBuildings: [{ id: "echo-sector-a", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 4 }]
  }),
  createBattlefield({
    id: "tinder-fall",
    name: "Tinder Fall",
    theme: "ash",
    width: 22,
    height: 12,
    layout: "east-west",
    playerProduction: BUILDING_KEYS.AIRFIELD,
    forests: [{ x: 1, y: 6, width: 3, height: 2 }, { x: 10, y: 2, width: 3, height: 2 }],
    riverColumns: [7]
  }),
  createBattlefield({
    id: "white-signal",
    name: "White Signal",
    theme: "frost",
    width: 18,
    height: 18,
    layout: "north-south",
    ridges: [{ x: 6, y: 2, width: 2, height: 1 }, { x: 6, y: 7, width: 2, height: 1 }],
    forests: [{ x: 3, y: 2, width: 2, height: 2 }, { x: 9, y: 6, width: 2, height: 2 }]
  }),
  createBattlefield({
    id: "sable-proving",
    name: "Sable Proving",
    theme: "dusk",
    width: 26,
    height: 16,
    layout: "center-ring",
    playerProduction: BUILDING_KEYS.MOTOR_POOL,
    roadSpurs: [2, 5, 11],
    forests: [{ x: 16, y: 2, width: 3, height: 2 }, { x: 16, y: 10, width: 3, height: 2 }],
    mountains: [{ x: 20, y: 5, width: 2, height: 2 }],
    neutralBuildings: [{ id: "sable-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 5 }]
  }),
  createBattlefield({
    id: "outpost-lattice",
    name: "Outpost Lattice",
    theme: "storm",
    width: 28,
    height: 16,
    layout: "corner",
    playerProduction: BUILDING_KEYS.BARRACKS,
    ridges: [{ x: 4, y: 1, width: 1, height: 2 }, { x: 9, y: 7, width: 1, height: 2 }],
    riverColumns: [6, 7]
  }),
  createBattlefield({
    id: "iron-sunset",
    name: "Iron Sunset",
    theme: "ash",
    width: 16,
    height: 10,
    layout: "east-west",
    playerProduction: BUILDING_KEYS.AIRFIELD,
    forests: [{ x: 5, y: 4, width: 1, height: 2 }, { x: 8, y: 4, width: 1, height: 2 }],
    neutralBuildings: [{ id: "sunset-sector-b", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 7, y: 5 }]
  }),
  createBattlefield({
    id: "drift-command",
    name: "Drift Command",
    theme: "frost",
    width: 24,
    height: 18,
    layout: "center-ring",
    playerProduction: BUILDING_KEYS.MOTOR_POOL,
    roadSpurs: [4, 9],
    ridges: [{ x: 6, y: 0, width: 2, height: 2 }, { x: 6, y: 8, width: 2, height: 2 }],
    forests: [{ x: 15, y: 2, width: 2, height: 2 }, { x: 15, y: 11, width: 2, height: 2 }],
    mountains: [{ x: 18, y: 6, width: 2, height: 2 }]
  })
];

const PRODUCTION_BUILDINGS = new Set([BUILDING_KEYS.BARRACKS, BUILDING_KEYS.MOTOR_POOL, BUILDING_KEYS.AIRFIELD]);

export const RUN_MAP_POOL = MAP_POOL.map((mapDefinition) => {
  const runMap = structuredClone(mapDefinition);
  runMap.id = `${mapDefinition.id}-run`;
  runMap.name = `${mapDefinition.name} (Run)`;
  runMap.buildings = runMap.buildings.filter(
    (building) => !(building.owner === "player" && PRODUCTION_BUILDINGS.has(building.type))
  );
  runMap.buildings = runMap.buildings.map((building) =>
    PRODUCTION_BUILDINGS.has(building.type)
      ? {
          ...building,
          canCapture: false
        }
      : building
  );
  return runMap;
});

export function getMapById(mapId) {
  return MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId)
    ?? RUN_MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId);
}
