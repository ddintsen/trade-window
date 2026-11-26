import { defineConfig, devices } from "@playwright/test";

// End-to-end checks in a real browser.
//
//   E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/practice.spec.ts
//
// e2e/chain.spec.ts also needs a local chain with the realms deployed and the
// app built against it; see e2e/README.md.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Without E2E_BASE_URL, serve the production build (run `npm run build` first).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /practice\.spec\.ts/ },
  ],
});
