import { expect, test } from '@playwright/test';

import { backendPhp, customerSays, signIn } from './helpers';

test('lead stages: Lost asks why, Won needs proof, and every change is on the history', async ({ page }) => {
    // The demo workspace's pipeline, with its Won and Lost groups (item 4).
    backendPhp(
        "app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { foreach (App\\Domain\\Tenancy\\Models\\Tenant::all() as $t) { app(App\\Domain\\Tenancy\\TenantContext::class)->run($t, function () { foreach ([['Lost', 'lost'], ['Won', 'won']] as [$n, $g]) { App\\Domain\\Crm\\Models\\CrmStage::query()->firstOrCreate(['name' => $n], ['color' => 'grey', 'group' => $g, 'position' => 90])->forceFill(['group' => $g, 'archived_at' => null])->save(); } }); } });",
    );
    await signIn(page);
    const name = `Stages ${Date.now().toString(36).slice(-5)}`;
    const phone = `97156${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    customerSays('Hi, do you have an SUV for the weekend?', phone, name);

    await page.goto('/contacts');
    await expect(async () => {
        await page.getByLabel('Search contacts').fill(name);
        await page.getByLabel('Search contacts').press('Enter');
        await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1, { timeout: 3000 });
    }).toPass({ timeout: 30_000 });

    // The contact panel (3.5) opens from the row; its stage is edited under Edit all details.
    const closeAll = async () => {
        while ((await page.getByRole('dialog').count()) > 0) await page.keyboard.press('Escape');
    };
    const openContact = async () => {
        await closeAll();
        await page.getByRole('row').filter({ hasText: name }).click();
        await page.getByRole('dialog').getByText('Custom fields', { exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Edit all details' }).click();
    };

    // Lost: the reason is asked for and saved with the change.
    await openContact();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('combobox', { name: 'Stage' }).click();
    await page.getByRole('option', { name: 'Lost' }).click();
    await dialog.getByLabel('Why was it lost?').fill('Chose another company');
    await dialog.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Contact updated')).toBeVisible();
    await page.keyboard.press('Escape');

    // Won without a verified payment: the Owner gives a reference.
    await openContact();
    await dialog.getByRole('combobox', { name: 'Stage' }).click();
    await page.getByRole('option', { name: 'Won' }).click();
    await expect(dialog.getByLabel('Reference')).toBeVisible();
    await dialog.getByLabel('Reference').fill('Receipt 4471');
    await dialog.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Contact updated').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // The full record keeps every change on its history.
    await closeAll();
    await page.getByRole('row').filter({ hasText: name }).click();
    await page
        .getByRole('dialog')
        .getByRole('link', { name: /Open full record/ })
        .click();
    await page.getByText('Full history and enquiries').click();
    const history = page.getByRole('region', { name: 'Enquiries and history' }).getByRole('region', { name: 'History' });
    await history.getByRole('button', { name: 'Stages' }).click();
    const events = history.getByRole('list', { name: 'Events' });
    await expect(events).toContainText('Stage: none → Lost (Chose another company)');
    await expect(events).toContainText('Stage: Lost → Won (Receipt 4471)');
});
