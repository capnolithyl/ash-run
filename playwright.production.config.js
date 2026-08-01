import { defineConfig, devices } from "@playwright/test";

const port = 4174;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/ui-production",
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 15_000
  },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: "node scripts/dev-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      ASH_RUN_84_BUILD_PROFILE: "production",
      ASH_RUN_84_DEV_PORT: String(port)
    }
  },
  projects: [
    {
      name: "alpha-1280x720-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 }
      }
    }
  ]
});
