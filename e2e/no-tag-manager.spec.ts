import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

/** Google Tag Manager never loads in the app: not on the sign-in page, not on any logged-in page. */
test('the app loads no Google Tag Manager or Google tag', async ({ page }) => {
    const google: string[] = [];
    page.on('request', (r) => {
        if (/googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net/.test(r.url())) google.push(r.url());
    });

    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
    expect(await page.evaluate(() => 'dataLayer' in window || 'gtag' in window)).toBe(false);

    await signIn(page);
    for (const path of ['/dashboard', '/inbox', '/contacts', '/campaigns', '/chatbots', '/growth/setup', '/settings']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await page.evaluate(() => 'dataLayer' in window || 'gtag' in window), path).toBe(false);
    }
    expect(google).toEqual([]);
});
