import { expect, test } from '@playwright/test';

import { backendPhp, signIn } from './helpers';

test('webhooks: events from the timeline are offered by group', async ({ page }) => {
    // Webhooks need a plan that includes them: put the demo workspace on Pro.
    backendPhp(
        "app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { foreach (App\\Domain\\Tenancy\\Models\\Tenant::all() as $t) { app(App\\Domain\\Billing\\SubscriptionService::class)->assign($t, App\\Domain\\Plans\\Models\\Plan::byKey('pro')->activeVersionOrFail()); } });",
    );
    await signIn(page);
    await page.goto('/developer');
    await page.getByRole('tab', { name: 'Webhooks' }).click();
    await page.getByRole('button', { name: 'Add endpoint' }).first().click();

    const dialog = page.getByRole('dialog');
    for (const group of ['Messages', 'Contacts', 'Enquiries', 'Payments', 'Conversations', 'Forms']) {
        await expect(dialog.getByText(group, { exact: true })).toBeVisible();
    }
    for (const label of ['A tag was added to a contact', 'An enquiry moved to another stage', 'A WhatsApp form was submitted']) {
        await expect(dialog.getByRole('checkbox', { name: label })).toBeVisible();
    }
});
