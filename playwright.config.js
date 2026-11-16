import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const chrome = process.env.ProgramFiles + '/Google/Chrome/Application/chrome.exe';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: {
    baseURL: process.env.RENTAL_TEST_URL || 'http://127.0.0.1:8787',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: existsSync(chrome) ? chrome : undefined },
  },
});
