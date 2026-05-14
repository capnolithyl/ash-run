# Game Structure

## Run Structure

- Runs target **10 maps** by default.
- A run samples from a **20-map authored pool**.
- Difficulty scales by map index (enemy roster pressure increases over time).
- Run ends immediately on battle defeat.

## Battle Structure

- Turn-based, two sides: player and enemy.
- Player roster is deployed from persistent snapshots.
- Enemy roster is generated from commander-based templates plus scaling additions.
- Every map has exactly one mission goal.
- Current goal types are `rout`, `hq-capture`, `rescue`, `defend`, and `survive`.
- Mission rules, not a global fallback, decide victory and defeat for the current battle.

## Persistence Rules

- Surviving player units carry to the next battle.
- Dead units are removed from run roster.
- Unit XP/level/stats persist across the run.
- Commander charge resets per map. Skirmish funds are battle-local, while run mode pays out Intel Credits and keeps battlefield funds as an enemy-only reinforcement resource.

## Save Structure

- 3 manual save slots.
- Slot records include:
  - run state
  - active battle state
  - summary (commander, map progress, map name)
- Meta state stores unlocked commanders, options, and last played slot.
- Audio options store master volume and mute state.

## Code Boundaries

- `src/game/content` owns static gameplay data: maps, terrain, buildings, commanders, and unit catalog entries.
- `src/game/state/runFactory.js` assembles runs and battles, delegating roster templates, deployment placement, and enemy scaling to focused state modules.
- `src/game/simulation/battleSystem.js` is the battle facade: it owns battle state, snapshots, selection helpers, and stable public method names while delegating rules to focused modules.
- `src/game/simulation/playerActions.js` owns player-facing commands such as movement, attacks, capture, support, transport prompts, recruitment, and commander activation.
- `src/game/simulation/turnFlow.js` owns turn lifecycle, income, action refresh, temporary status expiration, enemy turn stepping, enemy end-turn recruitment, and victory checks.
- `src/game/simulation/transportRules.js` owns Runner load/unload validation and cargo position rules.
- `src/game/simulation/debugActions.js` owns debug-only spawning, stat patching, charge, and action refresh tools.
- `src/game/simulation/combatResolver.js` owns attack range, damage resolution, target restrictions, counter forecasts, combat-XP formulas, and casualty removal.
- `src/game/simulation/enemyAi.js` owns enemy recruitment scoring, favorable-trade evaluation, repair mode, capture plans, and fallback/staging movement choices.
- `src/game/simulation/battlePresentation.js` converts battle state into HUD/render-friendly presentation data without mutating the battle.
- `src/game/simulation/battleServicing.js`, `captureRules.js`, `battleLog.js`, and `battleUnits.js` hold small shared battle helpers that keep the orchestrator lean.
- `src/game/simulation/selectors.js`, `commanderEffects.js`, `unitFactory.js`, and `progression.js` own read helpers, commander modifiers, unit creation, and leveling.
- `src/game/phaser` adapts simulation snapshots into canvas rendering, animation, effects, and compact board layout sizing.
- `src/game/phaser/audio` owns music playback, fades, and state-driven track selection.
- `src/ui` owns DOM menus and HUD surfaces.
- `src/ui/AppShell.js` coordinates the DOM render lifecycle, responsive commander carousel controls, and persistent battle drawer state across rerenders.
