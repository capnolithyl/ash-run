import assert from "node:assert/strict";
import path from "node:path";
import { _electron as electron } from "playwright";

const root = process.cwd();
const electronEnvironment = { ...process.env };
delete electronEnvironment.ELECTRON_RUN_AS_NODE;
const profiles = [
  {
    id: "production",
    executablePath: path.join(
      root,
      "release/prod/win-unpacked/Ash Run '84 Alpha.exe"
    ),
    expectedActions: [
      "open-new-run",
      "open-continue",
      "open-progression",
      "open-tutorial",
      "open-options",
      "quit-game"
    ],
    restrictedActions: [
      "open-skirmish",
      "open-map-editor",
      "open-debug-run"
    ],
    mapToolsEnabled: false
  },
  {
    id: "development",
    executablePath: path.join(
      root,
      "release/dev/win-unpacked/Ash Run '84 Dev.exe"
    ),
    expectedActions: [
      "open-new-run",
      "open-continue",
      "open-progression",
      "open-options",
      "quit-game",
      "open-skirmish",
      "open-map-editor",
      "open-tutorial",
      "open-debug-run"
    ],
    restrictedActions: [],
    mapToolsEnabled: true
  }
];
const requestedProfile = process.argv[2] ?? null;

for (const profile of profiles.filter(
  (profile) => !requestedProfile || profile.id === requestedProfile
)) {
  const application = await electron.launch({
    executablePath: profile.executablePath,
    env: electronEnvironment
  });

  try {
    const page = await application.firstWindow({ timeout: 30_000 });
    await page.locator(".screen--title").waitFor({ state: "visible", timeout: 45_000 });

    const actions = await page.locator("[data-action]").evaluateAll((elements) =>
      elements.map((element) => element.dataset.action)
    );

    for (const action of profile.expectedActions) {
      assert.ok(actions.includes(action), `${profile.id} is missing ${action}.`);
    }

    for (const action of profile.restrictedActions) {
      assert.ok(!actions.includes(action), `${profile.id} unexpectedly exposes ${action}.`);
    }

    const mapToolResult = await page.evaluate(async () => {
      try {
        const result = await globalThis.ashRun84Api.listMapFiles();
        return { available: true, entryCount: result.entries?.length ?? 0 };
      } catch (error) {
        return { available: false, message: String(error?.message ?? error) };
      }
    });

    assert.equal(
      mapToolResult.available,
      profile.mapToolsEnabled,
      JSON.stringify(mapToolResult)
    );
    if (profile.mapToolsEnabled) {
      assert.ok(mapToolResult.entryCount > 0, "development package should list bundled maps");
    }

    console.log(`${profile.id} packaged smoke passed.`, {
      executablePath: profile.executablePath,
      mapToolResult
    });
  } finally {
    await application.close();
  }
}
