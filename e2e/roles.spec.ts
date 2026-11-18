import { expect, test } from '@playwright/test';

import { backendPhp, signIn, unique } from './helpers';

test('roles: Manager is built in, a custom role is made by area, and phone numbers can be hidden from Agents', async ({ page }) => {
    // Custom roles need full role-based access: put the demo workspace on Pro.
    backendPhp(
        "app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { foreach (App\\Domain\\Tenancy\\Models\\Tenant::all() as $t) { app(App\\Domain\\Billing\\SubscriptionService::class)->assign($t, App\\Domain\\Plans\\Models\\Plan::byKey('pro')->activeVersionOrFail()); } });",
    );
    await signIn(page);

    await page.goto('/team');
    await page.getByRole('tab', { name: 'Roles' }).click();
    await expect(page.getByText('Manager', { exact: true })).toBeVisible();

    // A custom role, started from Agent with one more permission ticked.
    const role = unique('Front desk');
    await page.getByRole('button', { name: 'New role' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Role name').fill(role);
    await dialog.getByRole('combobox', { name: 'Start from' }).click();
    await page.getByRole('option', { name: 'Agent' }).click();
    await dialog.getByRole('checkbox', { name: 'Export contacts' }).click();
    await dialog.getByRole('button', { name: 'Create role' }).click();
    await expect(page.getByText('Role created')).toBeVisible();
    await expect(page.getByText(role)).toBeVisible();

    // Hiding phone numbers is a workspace switch, recorded in the Audit log.
    const hide = page.getByRole('switch', { name: 'Hide contact phone numbers from Agents' });
    await hide.click();
    await expect(page.getByText('Agents no longer see phone numbers')).toBeVisible();
    await expect(hide).toBeChecked();
    await hide.click();
    await expect(page.getByText('Agents see phone numbers again')).toBeVisible();

    await page.getByRole('button', { name: `Delete ${role}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete role' }).click();
    await expect(page.getByText('Role deleted')).toBeVisible();
});
