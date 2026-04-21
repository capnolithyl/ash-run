# Ash Run

Ash Run is a Phaser + Electron prototype for a turn-based tactics roguelite with persistent run rosters.

## Current Prototype (April 2026)

- Full menu shell with:
  - Title
  - New Run / Continue
  - Save-slot load screen (3 slots)
  - Options
  - Return To Windows
- Commander selection with:
  - 10 commanders defined in data
  - 3 commanders unlocked at start (`Atlas`, `Viper`, `Rook`)
  - Locked commanders still available to enemy armies
  - Slot selection before starting a run
- Tactical battles with:
  - Grid map rendering
  - Unit selection and next-ready-unit cycling
  - Tile-based movement and path previews
  - Attacks and counterattacks
  - Commander passives, charge, and active powers
  - Income economy from Command and Sector structures
  - Recruitment at Barracks, Motor Pool, and Airfield
  - Infantry capture actions
  - Enemy turn automation
  - Persistent unit leveling and random stat growth
  - Level-up presentation queue in the HUD
  - Pause menu and save-slot flow
- Run flow with:
  - 10-map run goal
  - 20-map authored pool sampled into each run sequence
  - Surviving units persisting between maps
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
- `yarn test` -> Node test suite
- `yarn test:playthrough` -> forced full-run smoke check
- `yarn package` -> production build plus Electron Builder package

The scripts in `scripts/` call Vite/Electron through Node APIs rather than shell wrappers to stay stable across Windows/network-share paths.

Set `ASH_RUN_DEV_PORT` before `yarn dev` when port `5173` is already taken.

## Known Prototype Limits

- Objectives are still command-post / elimination focused rather than fully authored scenario scripting.
- Capture is ownership-flip only, with no staged capture meter yet.
- Enemy AI is tactical-prototype level and does not plan around long-term economy or baiting.
- Rewards/meta loop exists as structure, but content depth is intentionally light.
- Audio is not implemented yet, so the options menu only exposes live visual/gameplay toggles.
- Visuals are still primarily code-drawn placeholders rather than final authored art.
