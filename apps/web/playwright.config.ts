import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;
const AUTH_FILE = "./e2e/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: "**/auth.setup.ts",
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: "**/auth.setup.ts",
    },
    {
      name: "chromium-auth",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
      testMatch: "**/*.auth.spec.ts",
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
