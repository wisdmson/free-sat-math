import { defineConfig, devices } from '@playwright/test';

// A dedicated port, and never reuse a running server: a leftover preview of a different build
// (for example one built with BASE_PATH) would make every test fail in confusing ways.
const PORT = Number(process.env['PLAYWRIGHT_PORT'] ?? 4322);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    // --ignore-lock keeps `astro preview` in the foreground. Astro 7 backgrounds it (and exits)
    // when it detects an AI agent, which makes Playwright report "exited early".
    command: `PUBLIC_TEST_HOOKS=1 npx astro build && npx astro preview --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 } },
    },
  ],
});
