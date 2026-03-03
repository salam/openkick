import { defineConfig } from "@playwright/test";

const SERVER_PORT = 3001;
const WEB_PORT = 3000;

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
      command: "npm run dev",
      cwd: "../server",
      port: SERVER_PORT,
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        PORT: String(SERVER_PORT),
        NODE_ENV: "test",
        DATABASE_PATH: ":memory:",
      },
    },
    {
      command: "npm run dev",
      cwd: "../web",
      port: WEB_PORT,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
