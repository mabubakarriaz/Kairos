import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright runs the local app on http://localhost:3000. If the dev server
 * isn't already running, Playwright starts it and waits for the port.
 * `reuseExistingServer: true` keeps a hot dev session warm across runs.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  fullyParallel: false, // tests write to the same Supabase project; serialize.
  workers: 1,
  // One retry — the dev server's first request after a recompile can be slow
  // enough that hydration races a snappy spec. CI shouldn't lean on this.
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
