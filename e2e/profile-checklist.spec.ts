import { expect, test } from '@playwright/test';

import { backendPhp, signIn } from './helpers';

test('channels: the business profile checklist per number, with links to fix each item', async ({ page }) => {
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { $n = App\\Domain\\WhatsApp\\Models\\PhoneNumber::query()->where('status', 'connected')->orderBy('created_at')->firstOrFail(); $n->forceFill(['name_status' => 'APPROVED', 'verified_name' => 'Demo Store', 'registered_at' => now()->subDays(10), 'platform_type' => 'CLOUD_API'])->save(); Illuminate\\Support\\Facades\\Cache::forget('wa-profile-checklist:' . $n->id); });`,
    );
    await signIn(page);
    await page.goto('/channels');
    await page.getByRole('button', { name: 'Profile checklist' }).first().click();

    const panel = page.getByRole('region', { name: 'Business profile checklist' });
    const items = panel.getByRole('list', { name: 'Checklist' }).getByRole('listitem');
    await expect(items).toHaveCount(7);
    await expect(items.filter({ hasText: 'Display name approved' })).toContainText('Done');
    await expect(items.filter({ hasText: 'Two-step verification' })).toContainText('Done');
    const days = items.filter({ hasText: 'At least 30 days on the API' });
    await expect(days).toContainText('Missing');
    await expect(days).toContainText('10 of 30 days');
    // Read from Meta (the local stand-in): photo, description and verification done, no website.
    await expect(items.filter({ hasText: 'Profile photo' })).toContainText('Done');
    await expect(items.filter({ hasText: 'Business verification' })).toContainText('Done');
    const website = items.filter({ hasText: 'Website' });
    await expect(website).toContainText('Missing');
    await expect(website.getByRole('link', { name: 'Fix in WhatsApp Manager' })).toHaveAttribute('href', /business\.facebook\.com\/wa\/manage\/phone-numbers/);
    await expect(panel.getByText('Ready to apply for the blue tick')).toHaveCount(0);
});
