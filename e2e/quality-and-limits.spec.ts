import { expect, test } from '@playwright/test';

import { backendPhp, signIn } from './helpers';

const php = (code: string) =>
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { $n = App\\Domain\\WhatsApp\\Models\\PhoneNumber::query()->where('status', 'connected')->orderBy('created_at')->firstOrFail(); ${code} });`,
    );

const event = (type: string, oldValue: string | null, newValue: string | null) =>
    `App\\Domain\\WhatsApp\\Models\\QualityEvent::query()->create(['tenant_id' => $n->tenant_id, 'waba_account_id' => $n->waba_account_id, 'phone_number_id' => $n->id, 'event_type' => '${type}', 'old_value' => ${oldValue === null ? 'null' : `'${oldValue}'`}, 'new_value' => ${newValue === null ? 'null' : `'${newValue}'`}, 'payload' => [], 'occurred_at' => now()]);`;

test('channels: quality and limits per number, updated by itself within a minute', async ({ page }) => {
    test.setTimeout(120_000);
    php(
        `App\\Domain\\WhatsApp\\Models\\QualityEvent::query()->where('phone_number_id', $n->id)->delete(); $n->forceFill(['quality_rating' => 'GREEN', 'messaging_limit_tier' => 'TIER_1K'])->save();`,
    );
    await signIn(page);
    await page.goto('/channels');

    await page.getByRole('button', { name: 'Quality and limits' }).first().click();
    const panel = page.getByRole('region', { name: 'Quality and limits' });
    await expect(panel.getByText('High quality', { exact: true })).toBeVisible();
    await expect(panel.getByText('/ 1,000')).toBeVisible();
    await expect(panel.getByText('up to 250')).toBeVisible();
    await expect(panel.getByText('No changes.', { exact: false })).toBeVisible();

    // Meta flags the number and the rating falls to Red (what the webhook and the re-read record).
    php(
        `$n->forceFill(['quality_rating' => 'RED', 'messaging_limit_tier' => 'TIER_250'])->save(); ${event('rating.changed', 'GREEN', 'RED')} ${event('quality.flagged', 'TIER_1K', 'TIER_250')}`,
    );
    await expect(panel.getByText('Low quality', { exact: true })).toBeVisible({ timeout: 40_000 });
    await expect(panel.getByRole('alert')).toContainText('Meta flagged the number for low quality');
    await expect(panel.getByRole('list', { name: 'Quality changes' })).toContainText('Quality rating: Green → Red');
    await expect(panel.getByText('up to 63')).toBeVisible();

    php(
        `App\\Domain\\WhatsApp\\Models\\QualityEvent::query()->where('phone_number_id', $n->id)->delete(); $n->forceFill(['quality_rating' => 'GREEN', 'messaging_limit_tier' => 'TIER_1K'])->save();`,
    );
});

test('consent & privacy: the share of the daily limit one campaign may use per hour', async ({ page }) => {
    await signIn(page);
    await page.goto('/consent');
    await page.getByRole('tab', { name: 'Keywords, safeguards & retention' }).click();
    const field = page.getByLabel('Most of the daily messaging limit one campaign may use per hour (%)');
    await expect(field).toHaveValue('25');
    await field.fill('40');
    await page.getByRole('button', { name: 'Save changes' }).first().click();
    await expect(page.getByText('Consent & Privacy settings saved')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Keywords, safeguards & retention' }).click();
    await expect(page.getByLabel('Most of the daily messaging limit one campaign may use per hour (%)')).toHaveValue('40');
    await page.getByLabel('Most of the daily messaging limit one campaign may use per hour (%)').fill('25');
    await page.getByRole('button', { name: 'Save changes' }).first().click();
    await expect(page.getByText('Consent & Privacy settings saved')).toBeVisible();
});
