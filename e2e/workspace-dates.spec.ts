import { expect, test, type Page } from '@playwright/test';

import { signIn } from './helpers';

async function setFormat(page: Page, label: string) {
    await page.goto('/settings?tab=workspace');
    await page.getByRole('combobox', { name: 'Date format' }).click();
    await page.getByRole('option', { name: new RegExp(`^${label.replace(/\//g, '\\/')}`) }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
}

test('workspace dates: the date format setting, its warning, and date fields that follow it', async ({ page }) => {
    await signIn(page);
    try {
        await setFormat(page, 'MM/DD/YYYY');
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toContainText('Typed dates in live flows will be read in the new format from now on');
        await expect(dialog).toContainText('a customer typing 5/1 means May 1');
        await dialog.getByRole('button', { name: 'Change' }).click();
        await expect(page.getByText('Workspace settings saved')).toBeVisible();

        // A date field follows the format: typed month first, shown month first, calendar picks the same way.
        await page.goto('/contacts');
        await page.getByRole('button', { name: 'Export' }).click();
        const from = page.getByRole('textbox', { name: 'Added from' });
        await expect(from).toHaveAttribute('placeholder', 'MM/DD/YYYY');
        await from.fill('05/01/2026');
        await from.blur();
        await expect(from).toHaveValue('05/01/2026');
        await page.getByRole('button', { name: 'Choose added from from a calendar' }).click();
        await expect(page.getByRole('dialog', { name: 'Calendar' })).toContainText('May 2026');
        await page.getByRole('button', { name: '05/18/2026' }).click();
        await expect(from).toHaveValue('05/18/2026');
    } finally {
        await setFormat(page, 'DD/MM/YYYY');
        await page.getByRole('alertdialog').getByRole('button', { name: 'Change' }).click();
        await expect(page.getByText('Workspace settings saved').first()).toBeVisible();
    }

    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByRole('textbox', { name: 'Added from' })).toHaveAttribute('placeholder', 'DD/MM/YYYY');
});
