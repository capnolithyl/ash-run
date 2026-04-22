# Ash Run '84

Ash Run '84 is a Phaser + Electron prototype for a turn-based tactics roguelite with persistent run rosters.

## Current Prototype (April 2026)

- Full menu shell with:
  - Title
  - Interactive tutorial
  - New Run / Continue
  - Save-slot load screen (3 slots)
  - Options
  - Return To Windows
- Commander selection with:
  - 10 commanders defined in data
  - 3 commanders unlocked at start (`Atlas`, `Viper`, `Rook`)
  - Locked commanders still available to enemy armies
  - Slot selection before starting a run
  - Responsive commander carousel on small screens
- Tactical battles with:
  - Grid map rendering
  - 64px SVG unit, terrain, and building sprites with owner-color variants
  - Battlefield-only camera zoom and pan with mouse or touch gestures
  - Unit selection and next-ready-unit cycling
  - Tile-based movement and path previews
  - Attacks and counterattacks
  - Commander passives, charge, and active powers
  - Income economy from Command and Sector structures
  - Sector healing/resupply for units holding owned sector tiles
  - Recruitment at Barracks, Motor Pool, and Airfield
  - Infantry capture actions
  - Enemy turn automation
  - Persistent unit leveling and random stat growth
  - Level-up presentation queue in the HUD
  - Pause menu and save-slot flow
  - Responsive battle HUD drawers for compact screens
- Run flow with:
  - 10-map run goal
  - 20-map authored pool sampled into each run sequence
  - Surviving units persisting between maps
  - Unique redeployment tiles for carried survivors
  - Gradual enemy opening pressure across later maps
  - Clear records shown on the title screen
  - Defeat ending the run

## Tech Stack

- **Client/gameplay:** JavaScript + Phaser
- **Shell:** Electron
- **Tooling:** Vite
- **Package manager:** Yarn

## Project Structure

```text
electron/
  main.cjs
  preload.cjs
scripts/
  build.mjs
  dev-server.mjs
  dev.mjs
  full-playthrough-check.mjs
  start-electron.mjs
src/
  game/
    app/
    content/
    core/
    phaser/
    services/
    simulation/
    state/
  ui/
    views/
  styles/
tests/
  helpers/
docs/
  core/
  design/
  planning/
```

## Commands

- `yarn dev` -> Vite + Electron dev workflow
- `yarn start` -> packaged-style Electron launch
- `yarn build` -> production build
- `yarn check:unused` -> unused files/exports/dependencies sweep
- `yarn test` -> Node test suite
- `yarn test:playthrough` -> forced full-run smoke check
- `yarn package` -> production build plus Electron Builder package

The scripts in `scripts/` call Vite/Electron through Node APIs rather than shell wrappers to stay stable across Windows/network-share paths.

Set `ASH_RUN_84_DEV_PORT` before `yarn dev` when port `5173` is already taken.

## Known Prototype Limits

- Objectives are still command-post / elimination focused rather than fully authored scenario scripting.
- Capture is ownership-flip only, with no staged capture meter yet.
- Enemy AI scores short-term trades, capture priorities, staging ranges, and recruit composition, but does not plan around long-term economy or baiting yet.
- Enemy battle recruitment has per-turn throttles and a per-map total cap to keep small maps from becoming infinite slugfests.
- Rewards/meta loop exists as structure, but content depth is intentionally light.
- Audio is not implemented yet, so the options menu only exposes live visual/gameplay toggles.
- Visuals use first-pass SVG sprites and code-rendered effects; final art, animation, and audio polish are still future work.
