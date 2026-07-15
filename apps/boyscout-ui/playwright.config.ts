import { defineConfig } from "@playwright/test";

// The specs spawn the daemon themselves in beforeAll (no webServer block).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
