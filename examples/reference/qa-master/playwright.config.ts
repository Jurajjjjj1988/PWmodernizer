import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

import { URLS } from './helper/test-data/urls';

dotenv.config({ path: '.env' });

/**
 * Per-surface projects (desktop / mobile / api). Tests target a deployed environment
 * (www-master staging by default, production via IS_PRODUCTION=true) — no local webServer.
 *
 * Auth is handled per-test via the API (each test creates its own user — see base.fixture),
 * so there is no shared storageState / setup project.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 4 : undefined,

    reporter: [
        ['list'],
        ['html', { open: 'never' }],
        ...(process.env.CI ? [['github'] as const] : [])
    ],

    timeout: 180_000,
    expect: { timeout: 20_000 },

    use: {
        baseURL: URLS.baseUrl,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        actionTimeout: 20_000,
        navigationTimeout: 25_000
    },

    projects: [
        {
            name: 'desktop',
            testDir: './tests/desktop',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1000 } }
        },
        {
            name: 'mobile',
            testDir: './tests/mobile',
            use: { ...devices['iPhone 15 Pro Max'], isMobile: true }
        },
        {
            name: 'api',
            testDir: './tests/api',
            use: { baseURL: URLS.baseUrl }
        }
    ]
});
