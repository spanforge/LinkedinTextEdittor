import config from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...config,
  use: { ...config.use, baseURL: 'http://127.0.0.1:3001' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3001', reuseExistingServer: true },
});
