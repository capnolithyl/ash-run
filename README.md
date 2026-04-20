# Ash Run

Initial Phaser + JavaScript + Electron prototype scaffold for a turn-based tactics roguelite.

## Current Prototype Slice

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
  - movement
  - attacks and counterattacks
  - simple enemy AI
  - recruitment from owned production buildings
  - commander charge and powers
  - battle-to-battle run progression
- 20 map definitions in the prototype pool

## Project Structure

```text
electron/
  main.js
  preload.js
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

## Architecture Notes

- `src/game/simulation/` owns the saveable battle rules and turn logic.
- `src/game/phaser/` renders the battlefield and animated backdrop.
- `src/ui/` owns menus, HUD, save slot UI, and options.
- `electron/` owns save storage and desktop integration.

## Commands

- `yarn dev`
- `yarn start`
- `yarn build`

The helper scripts in `scripts/` intentionally invoke Vite and Electron through Node APIs instead of shell wrappers. That makes the project more resilient on Windows network-share paths where plain CLI wrappers often fail.

## Known Prototype Limits

- Capture mechanics are not implemented yet.
- Objective types are still elimination-only.
- Meta unlock progression is intentionally light.
- Audio and art assets are still placeholder-free and code-drawn.
