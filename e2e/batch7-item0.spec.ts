import { expect, test } from '@playwright/test';

import { api, backendPhp, signIn, unique } from './helpers';

/** Batch 7 · item 0 fixes: what an Owner sees after the audit fixes. */

test('fields & sync: HubSpot only, no Zoho', async ({ page }) => {
    await signIn(page);
    await page.goto('/contacts?tab=sync');
    await expect(page.getByText('Deal stage mapping')).toBeVisible();
    await expect(page.getByText('HubSpot dealstage')).toBeVisible();
    await expect(page.getByText(/Zoho/)).toHaveCount(0);
});

test('reply promise: needs business hours first; the weekly report opens in Growth Hub', async ({ page }) => {
    await signIn(page);
    const hours = await api<{ data: { business_hours: { enabled: boolean; days: unknown } } }>(page, 'GET', 'tenant/inbox-settings');
    const days = hours.data.business_hours.days;
    try {
        await api(page, 'PUT', 'tenant/inbox-settings', { business_hours: { enabled: false, days } });
        await page.goto('/settings?tab=hours');
        await expect(page.getByText('Set your business hours first (above).')).toBeVisible();
        await expect(page.getByRole('switch', { name: 'Use the reply promise' })).toBeDisabled();
    } finally {
        await api(page, 'PUT', 'tenant/inbox-settings', { business_hours: { enabled: hours.data.business_hours.enabled, days } });
    }

    // The Monday email links to Growth Hub › Leads › Missed leads; Insights no longer has it.
    await page.goto('/growth/leads?tab=missed');
    await expect(page.getByText('Weekly missed-leads report')).toBeVisible();
    await page.goto('/insights');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByText('Weekly missed-leads report')).toHaveCount(0);
});

test('contacts are deleted only through the legal deletion request in Settings › Data', async ({ page }) => {
    await signIn(page);
    const name = unique('Erase me');
    const phone = `+97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const id = (await api<{ data: { id: string } }>(page, 'POST', 'contacts', { phone, name })).data.id;

    // No delete route.
    const res = await page.request.delete(`/api/v1/contacts/${id}`, { failOnStatusCode: false });
    expect([404, 405]).toContain(res.status());

    await page.goto('/settings?tab=data');
    await page.getByLabel('Find the person to erase').fill(name);
    const match = page.getByRole('list', { name: 'Matching contacts' });
    await match.getByRole('button', { name: 'Erase…' }).click();
    const dialog = page.getByRole('dialog');
    const erase = dialog.getByRole('button', { name: 'Erase for good' });
    await dialog.getByLabel('Why are they being erased?').fill('They asked us to delete their data');
    await expect(erase).toBeDisabled();
    await dialog.getByLabel('Type ERASE to confirm').fill('ERASE');
    await erase.click();
    await expect(page.getByText(`${name} was erased`)).toBeVisible();
    const left = backendPhp(
        `echo app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(fn () => App\\Domain\\Messaging\\Models\\Contact::withTrashed()->whereKey('${id}')->count());`,
    );
    expect(left.trim()).toBe('0');
});
