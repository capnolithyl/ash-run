# Ash Run

Ash Run is a Phaser + Electron prototype for a turn-based tactics roguelite with persistent run rosters.

## Current Prototype (April 2026)

<<<<<<< ours
<<<<<<< ours
- Title screen with:
  - `New Run`
  - `Continue`
  - `Options`
  - `Return To Windows`
- Commander selection with:
  - 10 total commanders in data
  - 3 commanders unlocked by default
  - slot selection before starting a run
- Save slot flow with 3 slots
- Tactical battle scene with:
  - grid map rendering
  - unit selection
  - next-ready-unit cycling
  - movement
  - path previews
  - attacks and counterattacks
  - unit experience gain and level ups
  - capture actions
  - simple enemy AI
  - recruitment from owned production buildings
  - commander charge and powers
  - battle-to-battle run progression
  - pause menu and save-slot flow
- 20 map definitions in the prototype pool
=======
=======
>>>>>>> theirs
- Full menu shell with:
  - Title
  - New Run / Continue
  - Save-slot load screen (3 slots)
  - Options
- Commander selection:
  - 10 commanders defined in data
  - 3 commanders unlocked at start (`Atlas`, `Viper`, `Rook`)
  - Locked commanders can still appear as enemy commanders
- Tactical battles with:
  - Tile-based movement and attack flow
  - Counterattacks
  - Commander passives and active powers
  - Income economy from Command + Sector structures
  - Recruitment at Barracks / Motor Pool / Airfield
  - Capture action (infantry only)
  - Enemy turn automation
  - Persistent unit leveling and random stat growth
  - Level-up presentation queue in HUD
- Run flow:
  - 10-map run goal
  - 20-map authored pool sampled into run sequence
  - Surviving units persist between maps
  - Defeat ends run

## Tech Stack

- **Client/gameplay:** JavaScript + Phaser
- **Shell:** Electron
- **Tooling:** Vite
- **Package manager:** Yarn
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs

## Project Structure

```text
electron/
<<<<<<< ours
  main.cjs
  preload.cjs
tests/
  helpers/
=======
  main.js
  preload.cjs
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
scripts/
  build.mjs
  dev-server.mjs
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
docs/
  core/
  design/
  planning/
```

## Commands

<<<<<<< ours
<<<<<<< ours
- `yarn dev`
- `yarn start`
- `yarn build`
- `yarn test`
- `yarn package`
=======
- `yarn dev` → Vite + Electron dev workflow
- `yarn start` → packaged-style Electron launch
- `yarn build` → production build
>>>>>>> theirs

The scripts in `scripts/` call Vite/Electron through Node APIs rather than shell wrappers to stay stable across Windows/network-share paths.

Set `ASH_RUN_DEV_PORT` before `yarn dev` when port `5173` is already taken.

## Known Prototype Limits

<<<<<<< ours
- Objectives are still command-post / elimination focused rather than fully authored scenario scripting.
- Enemy AI is tactical-prototype level and does not plan around long-term economy or baiting.
- Audio is not implemented yet, so the options menu only exposes live visual/gameplay toggles.
- Visuals are still primarily code-drawn placeholders rather than final authored art.
=======
=======
- `yarn dev` → Vite + Electron dev workflow
- `yarn start` → packaged-style Electron launch
- `yarn build` → production build

The scripts in `scripts/` call Vite/Electron through Node APIs rather than shell wrappers to stay stable across Windows/network-share paths.

## Known Prototype Limits

>>>>>>> theirs
- No multi-objective mission types yet (currently elimination-centric).
- Capture is ownership-flip only (no staged capture meter).
- Rewards/meta loop exists as structure, but content depth is intentionally light.
- Presentation remains code-drawn and placeholder-oriented.
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
