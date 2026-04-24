# Steam Release Readiness (April 2026)

## Current status in this repo

The project already has a desktop shell and packaging baseline:

- Electron main/preload process split for desktop APIs.
- `electron-builder` is configured in `package.json`.
- A Windows NSIS installer target is already defined.

## Gaps to close before shipping on Steam

1. **Code signing + identity**
   - Replace placeholder metadata (`author`, icon assets, legal identity fields).
   - Add signing configuration for the shipping build.
2. **Steam launch/build pipeline**
   - Add Steam depot/app build scripts (usually with `steamcmd` in CI).
   - Produce a stable build artifact layout for upload.
3. **Steamworks integration**
   - Add a Steamworks bridge in Electron main/preload.
   - Gate all Steam calls behind optional runtime checks so non-Steam builds still run.
4. **Cloud + save strategy**
   - Align save folder and filename policy with planned Steam Cloud config.
5. **Release operations**
   - Prepare crash/error logging, branch/channel conventions, and rollback steps.

## Achievement integration approach

### 1) Create achievement IDs in Steamworks

Define each achievement in Steamworks App Admin first (for example: `WIN_FIRST_BATTLE`, `CLEAR_MAP_10`, `UNLOCK_ALL_COMMANDERS`).

### 2) Add a desktop API bridge for Steam

Expose IPC methods from Electron preload such as:

- `steam:isAvailable`
- `steam:unlockAchievement`
- `steam:clearAchievement`
- `steam:storeStats`

Renderer/game code should not call Steam SDK directly.

### 3) Add an in-game achievement service

Create a small service that:

- maps game events to Steam IDs,
- deduplicates unlock attempts,
- no-ops when Steam is unavailable (web/dev builds).

### 4) Trigger from gameplay milestones

Good hook points in this codebase include:

- map clear / run clear flow,
- commander unlock flow,
- first battle completion,
- difficulty or challenge-specific wins.

### 5) Test matrix

- Steam client running + launched via Steam.
- Steam client closed (game should still run).
- Dev/web mode (no Steam SDK) should not crash.
- Achievement unlocks once and persists after relaunch.

## Suggested next implementation task

Implement a no-op `SteamService` interface first, wire it to run-completion events, then attach Steamworks-backed implementation in Electron.
