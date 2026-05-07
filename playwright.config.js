import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: true,
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
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 }
      }
    },
    {
      name: "compact-laptop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 }
      }
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"]
      }
    }
  ]
});
