import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? 1);

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  workers,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: "node scripts/dev-server.mjs",
    url: baseURL,
    reuseExistingServer: true,
    env: {
      ...process.env,
      ASH_RUN_84_DEV_PORT: String(port)
    }
  },
  projects: [
    {
      name: "preset-1280x720-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 }
      }
    },
    {
      name: "preset-1366x768-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 }
      }
    },
    {
      name: "preset-1440x900-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "preset-1600x900-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 900 }
      }
    },
    {
      name: "preset-1920x1080-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 }
      }
    },
    {
      name: "preset-2560x1440-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 2560, height: 1440 }
      }
    }
  ]
});
