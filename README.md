# Ash Run '84

Ash Run '84 is a single-player turn-based tactics roguelite built with Phaser, Electron, and Vite. The project mixes Advance Wars-style map control and economy pressure with Fire Emblem-style unit persistence, permadeath, and stat growth across a run.

## Current State

Snapshot: April 30, 2026

The prototype already supports a full desktop play loop:

- Title shell with `New Run`, `Continue`, `Skirmish`, `Sandbox`, `Tutorial`, `Progression`, `Options`, and `Quit`
- 3 manual save slots with slot summaries and last-played metadata
- Commander selection, slot assignment, and opening-squad drafting before run start
- 10-map runs sampled from a 20-map authored pool
- Map-based mission goals: Rout, HQ Capture, Rescue, Defend, and Survive
- Persistent survivor rosters with XP, levels, rolled stat growth, and permadeath
- Standalone skirmish setup with commander picks, map selection, and economy sliders
- Sandbox/debug battle entry with live spawn tools and commander overrides
- Electron packaging and Windows desktop launch flow

## Core Modes

### Run Mode

Run mode is the main roguelite structure.

- Pick a commander, choose a save slot, and build an opening squad from unlocked units
- Enter a 10-map run where surviving units persist between battles
- Earn Intel Credits from map clears and first-time building captures
- Carry XP, levels, and stat rolls forward between maps
- Lose a battle and the run ends immediately
- Clear the full run to unlock the next commander and earn extra meta currency

Important current rule: in run mode, the player no longer recruits during battle. Your squad is bought before the map. Enemy forces can still use buildings and hidden funds for reinforcements during the battle.

### Skirmish

Skirmish is the quick-play ruleset.

- Choose both player and enemy commanders
- Pick from the authored map pool
- Tune starting funds and funds-per-building
- Use the classic in-battle economy and production-building recruitment flow

### Sandbox / Debug

Sandbox is the testing seam for combat and commander work.

- Spawn units for either side
- Prefill spawn stats from `UNIT_CATALOG`
- Patch selected-unit stats in place
- Override player and enemy commanders without touching run saves
- Refresh actions or charge for rapid scenario testing

## Tactical Systems In The Prototype

- Grid-based turn combat with movement previews, attack previews, and counterattacks
- Mission-driven win conditions with HUD and map markers
- Mouse, touch, and controller support for battle navigation
- Battlefield zoom and pan
- Commander passives, charge, and active powers
- Infantry capture flow for buildings
- Sector servicing and command-post resupply
- Support actions:
  - Medics service adjacent infantry
  - Mechanics service adjacent vehicles
- Runner transport load/unload rules
- Enemy AI for combat trades, captures, staging, repair behavior, and reinforcements
- Battle HUD with selection details, armor breakdown, level-up feedback, and pause/debug panels

## Combat Snapshot

The current combat model is intentionally readable:

- Damage uses attack, flat effectiveness, HP scaling, luck, and defender armor
- Effectiveness is a flat `+6` bonus instead of hidden multipliers
- Final damage floors at `0`
- Breaker has a special anti-vehicle rule that halves base vehicle armor before cover is added
- Buildings override terrain armor instead of stacking with it
- Empty-ammo units can still use weaker secondary attacks when allowed
- Movement spends stamina based on actual path cost
- Command posts restore ammo and stamina; sectors restore ammo, stamina, and `10%` max HP

See [docs/core/combat.md](docs/core/combat.md) for the full rule breakdown.

## Commanders

The game currently defines 10 commanders in data.

- Starting player roster: `Atlas`, `Viper`, `Rook`
- Locked commanders can still appear as enemies
- Full-run clears unlock additional commanders one at a time
- Charge is battle-local and resets each map

Current implementation status:

- `Atlas`, `Viper`, and `Echo` have live simulation support for their current passive/active designs
- `Rook` has been intentionally rolled back to a future placeholder
- `Blaze`, `Knox`, `Falcon`, `Graves`, `Nova`, and `Sable` are present in data but currently routed through explicit no-op future effect IDs

See [docs/core/commanders.md](docs/core/commanders.md) for the current commander briefs.

## Progression And Unlocks

- Units gain XP from real combat impact, not just raw damage totals
- Higher-level targets and tougher matchups award better XP
- Level-ups can grant multiple stats at once
- If every growth roll misses, a weighted fallback forces at least one stat gain
- Survivor snapshots keep level, XP, and rolled stats between battles
- The title-screen `Progression` menu supports unit unlock tiers and run-card unlocks using Intel Credits
- Title screen stores latest and best low-turn-count clear records

See [docs/core/progression.md](docs/core/progression.md) for the current growth tables and reward structure.

## Units, Buildings, And Economy

- 14 unit types are defined across infantry, vehicle, and air families
- Carrier remains in data as future content and is not part of recruitment
- Run mode uses pre-battle squad buying plus Intel Credit rewards
- Skirmish keeps in-battle production-building recruitment
- Buildings currently include command posts, sectors, barracks, motor pools, airfields, hospitals, and repair stations

More detail:

- [docs/core/units.md](docs/core/units.md)
- [docs/core/buildings.md](docs/core/buildings.md)
- [docs/core/maps.md](docs/core/maps.md)

## Presentation, Audio, And Input

- Phaser handles battlefield rendering and effects, while the DOM shell owns menus and most HUD surfaces
- State-driven music now swaps between menu, player-turn, and enemy-turn tracks
- Options menu includes:
  - grid highlight toggle
  - screen shake toggle
  - master volume slider
  - mute toggle
- Audio defaults are intentionally quiet at `40%`
- Controller mode only activates after real controller input and drops back to mouse mode on pointer activity, which keeps controller focus states from showing up during normal mouse use

## Tech Stack

- Gameplay/runtime: JavaScript + Phaser 3
- Desktop shell: Electron
- Bundling/dev server: Vite
- Packaging: electron-builder
- Tests: Node test runner + Playwright
- Package manager: Yarn

## Project Structure

```text
electron/                 Electron main/preload process files
scripts/                  Dev/build/test helper scripts
src/game/content/         Static data: units, maps, commanders, buildings
src/game/state/           Run assembly, defaults, scaling, deployment
src/game/simulation/      Battle rules, AI, progression, debug actions
src/game/phaser/          Rendering, animation, scenes, music
src/ui/                   DOM shell, menus, HUD views
src/styles/               App-wide styling
tests/                    Node tests and UI coverage
docs/                     Core design, systems, and planning docs
```

Architecturally, `src/game/simulation/battleSystem.js` now acts as the battle facade/orchestrator, while focused modules own combat math, turn flow, AI, transport rules, progression, debug actions, and presentation shaping.

## Commands

- `yarn dev` - start the Vite + Electron development workflow
- `yarn start` - launch the Electron app against the built output
- `yarn build` - create a production build in `dist/`
- `yarn test` - run the Node test suite
- `yarn test:playthrough` - run the forced full-run smoke check
- `yarn test:ui` - run Playwright UI and visual regression coverage
- `yarn test:ui:update` - refresh approved Playwright snapshots
- `yarn package` - build and package the Electron app
- `node scripts/damage-formula-test.mjs` - focused combat-math validation

Set `ASH_RUN_84_DEV_PORT` before `yarn dev` if port `5173` is already taken.

In this repo, `yarn check:unused` may need a Node flag in PowerShell because `knip` can trip over `ERR_REQUIRE_ESM` in `oxc-parser`:

```powershell
$env:NODE_OPTIONS="--experimental-require-module"
yarn check:unused
```

## UI Regression Workflow

- Visual baselines live in `tests/ui/visual-regression.spec.js-snapshots/`
- The deterministic browser harness lives at `ui-harness.html`
- Harness fixtures are provided by `src/dev/uiHarnessFixtures.js`
- See [docs/planning/ui-regression-testing.md](docs/planning/ui-regression-testing.md) for the full workflow

## Windows / Electron Notes

- This project is happiest on a local drive; network-share and UNC paths have been brittle with Electron tooling
- If Electron suddenly behaves like plain Node and exits immediately, check whether `ELECTRON_RUN_AS_NODE` is set in your shell
- `scripts/build.mjs` handles the asset-copying needed for desktop builds, including sprite and audio assets

## Current Prototype Limits

- Victory is still mainly elimination-focused; richer mission objectives are still future work
- Commander implementation is intentionally partial; several commanders are present in data but parked as safe placeholders
- The reward/meta layer exists, but it still needs more depth and content variety
- Final art, animation polish, and broader audio coverage are still in progress
- Balance tuning remains active across units, commanders, map pacing, and economy pressure

## Further Reading

- [docs/core/overview.md](docs/core/overview.md)
- [docs/core/gameplay-loop.md](docs/core/gameplay-loop.md)
- [docs/core/game-structure.md](docs/core/game-structure.md)
- [docs/planning/roadmap.md](docs/planning/roadmap.md)
- [docs/planning/steam-release.md](docs/planning/steam-release.md)
