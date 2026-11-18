import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test('settings › data: the Owner exports contacts, sets retention, and schedules then cancels deletion', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings?tab=data');

    // An export is made in the background and can be downloaded.
    await page.getByRole('combobox', { name: 'What to export' }).click();
    await page.getByRole('option', { name: 'Contacts' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByText('Export started')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' }).first()).toBeVisible({ timeout: 30_000 });

    // Retention: asks first, then saves.
    await page.getByRole('combobox', { name: 'Message retention' }).click();
    await page.getByRole('option', { name: '2 years' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove old message text' }).click();
    await expect(page.getByText('Message retention saved')).toBeVisible();
    await page.getByRole('combobox', { name: 'Message retention' }).click();
    await page.getByRole('option', { name: 'Keep' }).click();
    await expect(page.getByText('Message retention saved').first()).toBeVisible();

    // Deleting the workspace needs its name, waits 30 days and can be cancelled.
    await page.getByRole('button', { name: 'Delete workspace…' }).click();
    const dialog = page.getByRole('dialog');
    const schedule = dialog.getByRole('button', { name: 'Schedule deletion' });
    await expect(schedule).toBeDisabled();
    const name = (await dialog.getByRole('heading').textContent())!.replace(/^Delete /, '').replace(/\?$/, '');
    await dialog.getByLabel(/to confirm/).fill(name);
    await schedule.click();
    await expect(page.getByText('Workspace deletion scheduled')).toBeVisible();
    await expect(page.getByText(/will be deleted on/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel deletion' }).click();
    await expect(page.getByText('Deletion cancelled')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete workspace…' })).toBeVisible();
});
