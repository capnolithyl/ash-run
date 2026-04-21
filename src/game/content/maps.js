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
    ridges: [{ x: 5, y: 1, width: 1, height: 3 }, { x: 8, y: 6, width: 1, height: 3 }],
    forests: [{ x: 2, y: 7, width: 2, height: 2 }, { x: 10, y: 1, width: 2, height: 2 }],
    playerProduction: BUILDING_KEYS.MOTOR_POOL
  }),
  createBattlefield({
    id: "afterglow-yard",
    name: "Afterglow Yard",
    theme: "dusk",
    roadSpurs: [4, 9],
    forests: [{ x: 4, y: 3, width: 2, height: 2 }, { x: 8, y: 5, width: 2, height: 2 }],
    neutralBuildings: [{ id: "afterglow-sector-a", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 3 }]
  }),
  createBattlefield({
    id: "meridian-flats",
    name: "Meridian Flats",
    theme: "ash",
    playerProduction: BUILDING_KEYS.AIRFIELD,
    forests: [{ x: 5, y: 1, width: 1, height: 2 }, { x: 8, y: 7, width: 1, height: 2 }],
    neutralBuildings: [{ id: "meridian-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 7, y: 5 }]
  }),
  createBattlefield({
    id: "coastfire-run",
    name: "Coastfire Run",
    theme: "storm",
    riverColumns: [4, 9],
    forests: [{ x: 1, y: 1, width: 2, height: 2 }, { x: 11, y: 7, width: 2, height: 2 }],
    ridges: [{ x: 6, y: 0, width: 2, height: 2 }]
  }),
  createBattlefield({
    id: "hinterworks",
    name: "Hinterworks",
    theme: "dusk",
    playerProduction: BUILDING_KEYS.MOTOR_POOL,
    forests: [{ x: 3, y: 2, width: 3, height: 1 }, { x: 8, y: 7, width: 3, height: 1 }],
    ridges: [{ x: 6, y: 4, width: 2, height: 2 }]
  }),
  createBattlefield({
    id: "cold-trace",
    name: "Cold Trace",
    theme: "frost",
    riverColumns: [6],
    roadGaps: [6],
    neutralBuildings: [{ id: "cold-sector-a", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 2 }],
    forests: [{ x: 9, y: 2, width: 2, height: 2 }]
  }),
  createBattlefield({
    id: "noonfire-basin",
    name: "Noonfire Basin",
    theme: "ash",
    playerProduction: BUILDING_KEYS.BARRACKS,
    roadSpurs: [3, 10],
    ridges: [{ x: 5, y: 2, width: 1, height: 5 }, { x: 8, y: 3, width: 1, height: 5 }]
  }),
  createBattlefield({
    id: "violet-approach",
    name: "Violet Approach",
    theme: "dusk",
    playerProduction: BUILDING_KEYS.AIRFIELD,
    forests: [{ x: 2, y: 1, width: 2, height: 3 }, { x: 10, y: 6, width: 2, height: 3 }],
    neutralBuildings: [{ id: "violet-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 7, y: 4 }]
  }),
  createBattlefield({
    id: "hollow-sector",
    name: "Hollow Sector",
    theme: "storm",
    roadSpurs: [5, 8],
    ridges: [{ x: 4, y: 0, width: 1, height: 3 }, { x: 9, y: 7, width: 1, height: 3 }],
    neutralBuildings: [{ id: "hollow-sector-a", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 5 }]
  }),
  createBattlefield({
    id: "ember-vault",
    name: "Ember Vault",
    theme: "ash",
    playerProduction: BUILDING_KEYS.MOTOR_POOL,
    forests: [{ x: 5, y: 1, width: 2, height: 1 }, { x: 7, y: 8, width: 2, height: 1 }],
    ridges: [{ x: 6, y: 3, width: 2, height: 3 }]
  }),
  createBattlefield({
    id: "breakwater-arc",
    name: "Breakwater Arc",
    theme: "frost",
    riverColumns: [5, 8],
    roadGaps: [5, 8],
    neutralBuildings: [{ id: "breakwater-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 7, y: 3 }],
    forests: [{ x: 2, y: 7, width: 2, height: 2 }]
  }),
  createBattlefield({
    id: "sunset-delta",
    name: "Sunset Delta",
    theme: "dusk",
    roadSpurs: [6],
    forests: [{ x: 4, y: 6, width: 2, height: 2 }, { x: 8, y: 1, width: 2, height: 2 }],
    playerProduction: BUILDING_KEYS.BARRACKS
  }),
  createBattlefield({
    id: "echo-spur",
    name: "Echo Spur",
    theme: "storm",
    ridges: [{ x: 3, y: 4, width: 3, height: 1 }, { x: 8, y: 5, width: 3, height: 1 }],
    neutralBuildings: [{ id: "echo-sector-a", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 4 }]
  }),
  createBattlefield({
    id: "tinder-fall",
    name: "Tinder Fall",
    theme: "ash",
    playerProduction: BUILDING_KEYS.AIRFIELD,
    forests: [{ x: 1, y: 6, width: 3, height: 2 }, { x: 10, y: 2, width: 3, height: 2 }],
    riverColumns: [7]
  }),
  createBattlefield({
    id: "white-signal",
    name: "White Signal",
    theme: "frost",
    ridges: [{ x: 6, y: 2, width: 2, height: 1 }, { x: 6, y: 7, width: 2, height: 1 }],
    forests: [{ x: 3, y: 2, width: 2, height: 2 }, { x: 9, y: 6, width: 2, height: 2 }]
  }),
  createBattlefield({
    id: "sable-proving",
    name: "Sable Proving",
    theme: "dusk",
    playerProduction: BUILDING_KEYS.MOTOR_POOL,
    roadSpurs: [2, 5, 11],
    neutralBuildings: [{ id: "sable-sector", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 6, y: 5 }]
  }),
  createBattlefield({
    id: "outpost-lattice",
    name: "Outpost Lattice",
    theme: "storm",
    playerProduction: BUILDING_KEYS.BARRACKS,
    ridges: [{ x: 4, y: 1, width: 1, height: 2 }, { x: 9, y: 7, width: 1, height: 2 }],
    riverColumns: [6, 7]
  }),
  createBattlefield({
    id: "iron-sunset",
    name: "Iron Sunset",
    theme: "ash",
    playerProduction: BUILDING_KEYS.AIRFIELD,
    forests: [{ x: 5, y: 4, width: 1, height: 2 }, { x: 8, y: 4, width: 1, height: 2 }],
    neutralBuildings: [{ id: "sunset-sector-b", type: BUILDING_KEYS.SECTOR, owner: "neutral", x: 7, y: 5 }]
  }),
  createBattlefield({
    id: "drift-command",
    name: "Drift Command",
    theme: "frost",
    playerProduction: BUILDING_KEYS.MOTOR_POOL,
    roadSpurs: [4, 9],
    ridges: [{ x: 6, y: 0, width: 2, height: 2 }, { x: 6, y: 8, width: 2, height: 2 }]
  })
];

export function getMapById(mapId) {
  return MAP_POOL.find((mapDefinition) => mapDefinition.id === mapId);
}
