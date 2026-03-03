import { defineConfig } from "@playwright/test";

const SERVER_PORT = 4001;
const WEB_PORT = 4000;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,            // sequential across files — tests build on each other
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
  webServer: [
    {
      command: "rm -f /tmp/openkick-e2e.db && npm run dev",
      cwd: "../server",
      port: SERVER_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(SERVER_PORT),
        NODE_ENV: "test",
        DB_PATH: "/tmp/openkick-e2e.db",
      },
    },
    {
      command: `npx next dev --port ${WEB_PORT}`,
      cwd: "../web",
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        BACKEND_PORT: String(SERVER_PORT),
      },
    },
  ],
});
