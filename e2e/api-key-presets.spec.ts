import { expect, test } from '@playwright/test';

import { backendPhp, signIn } from './helpers';

test('api keys: the Read only and Read and write presets tick the right permissions', async ({ page }) => {
    // API access needs a plan that includes it: put the demo workspace on Pro.
    backendPhp(
        "app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { foreach (App\\Domain\\Tenancy\\Models\\Tenant::all() as $t) { app(App\\Domain\\Billing\\SubscriptionService::class)->assign($t, App\\Domain\\Plans\\Models\\Plan::byKey('pro')->activeVersionOrFail()); } });",
    );
    await signIn(page);
    await page.goto('/developer');
    await page
        .getByRole('button', { name: /New API key|Create key|New key/ })
        .first()
        .click();
    const dialog = page.getByRole('dialog');

    await dialog.getByRole('button', { name: 'Read only' }).click();
    await expect(dialog.getByRole('checkbox', { name: 'Read enquiries, stages and the contact timeline' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: "Change an enquiry's stage" })).not.toBeChecked();

    await dialog.getByRole('button', { name: 'Read and write' }).click();
    await expect(dialog.getByRole('checkbox', { name: "Change an enquiry's stage" })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Start a published flow for a contact' })).toBeChecked();
    // Approving Won is never part of a preset.
    await expect(dialog.getByRole('checkbox', { name: /Mark an enquiry Won/ })).not.toBeChecked();
});
