import { expect, test } from '@playwright/test';

import { backendPhp, OWNER, signIn } from './helpers';

/** Channels: "Reconnect webhooks" when Meta stops sending events, and the 14-day registration warning. */
test('channels: reconnect webhooks and register a number before Meta’s 14-day deadline', async ({ page }) => {
    // The owner's account lost its webhook subscription, and one number was connected 11 days ago without registering.
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { $m = App\\Domain\\Tenancy\\Models\\TenantMembership::whereHas('user', fn ($q) => $q->where('email', '${OWNER.email}'))->firstOrFail(); $w = App\\Domain\\WhatsApp\\Models\\WabaAccount::query()->where('tenant_id', $m->tenant_id)->where('status', 'connected')->firstOrFail(); $w->forceFill(['is_subscribed_to_webhooks' => false])->save(); Illuminate\\Support\\Facades\\DB::table('phone_numbers')->where('waba_account_id', $w->id)->limit(1)->update(['registered_at' => null, 'platform_type' => null, 'created_at' => now()->subDays(11)->subHour()]); });`,
    );
    await signIn(page);
    await page.goto('/channels');

    const events = page.getByRole('alert').filter({ hasText: 'Meta isn’t sending this account’s messages to 10X Engage' });
    await expect(events).toBeVisible();
    const registration = page.getByRole('alert').filter({ hasText: 'isn’t registered with Meta yet' });
    await expect(registration).toContainText('3 days left');

    await events.getByRole('button', { name: 'Reconnect webhooks' }).click();
    await expect(page.getByText('Webhooks reconnected')).toBeVisible();
    await expect(events).toHaveCount(0);

    await registration.getByRole('button', { name: 'Register now' }).click();
    await expect(page.getByText('Number registered with Meta')).toBeVisible();
    await expect(registration).toHaveCount(0);
});
