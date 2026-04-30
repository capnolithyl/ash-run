# UI Regression Testing

Ash Run now has Playwright coverage for both live flows and deterministic screenshot scenes.

## What exists now

- `tests/ui/visual-regression.spec.js`
  - screenshot baselines for high-value menu, setup, and battle overlay states
- `tests/ui/live-flow.spec.js`
  - live click-through smoke tests for run flow, skirmish flow, and title utility screens
- `ui-harness.html`
  - a deterministic scene host for visual snapshots
- `src/dev/uiHarnessFixtures.js`
  - the single source of truth for harness scenes and their fixture states

## Main commands

- `npm run test:ui`
  - compare screenshots against committed baselines
- `npm run test:ui:update`
  - refresh baselines after an intentional visual change

## Adding a new screenshot scene

1. Add a new fixture builder in `src/dev/uiHarnessFixtures.js`.
2. Register the scene in `UI_HARNESS_SCENES` with:
   - a stable `id`
   - a readable `label`
   - the correct `locator` for the screenshot root
3. Wire the scene into `renderSceneMarkup()` in `src/dev/uiHarnessMain.js`.
4. Run `npm run test:ui:update`.
5. Review the new baseline images under `tests/ui/visual-regression.spec.js-snapshots/`.

## Good scene targets

- title and top-level menus
- commander select and loadout
- skirmish setup
- battle targeting and pause
- reward, level-up, victory, defeat, and progression overlays

## Snapshot rules

- Keep fixture data deterministic. Avoid `Date.now()` and random seeds unless they are fixed.
- Prefer states that highlight layout, readability, and missing-art regressions.
- If a scene includes animation, the snapshot should still be meaningful when Playwright disables motion.

## CI expectation

The GitHub Actions workflow runs the Playwright suite on Windows so the committed `win32` baselines stay authoritative.
