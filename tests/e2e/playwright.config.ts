import { defineConfig, devices } from "@playwright/test";

// CI sets KAIROS_BASE_URL to the running app (Caddy HTTPS in compose, or the dev URL).
const baseURL = process.env.KAIROS_BASE_URL ?? "http://localhost:5080";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",      // perf + debugging traces (drop→DB budget correlation)
    ignoreHTTPSErrors: true,      // Caddy's local cert
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
