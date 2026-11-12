import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests of the real web app against a real Laravel backend (local environment, fake Meta,
 * demo data). They are not part of `npm run build`; see e2e/README.md for how to run them.
 */
export default defineConfig({
    testDir: './e2e',
    timeout: 120_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: 'e2e-results/results.json' }]],
    outputDir: 'e2e-results/artifacts',
    use: {
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
        viewport: { width: 1440, height: 900 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
});
