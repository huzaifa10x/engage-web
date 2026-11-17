import { expect, test } from '@playwright/test';

import { customerSays, signIn } from './helpers';

test('contacts: the enquiries and the whole history of a contact, with filters, and a new enquiry by hand', async ({ page }) => {
    await signIn(page);
    const name = `Timeline ${Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;
    const phone = `97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    customerSays('Hi, I need an SUV next week', phone, name);

    await page.goto('/contacts');
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    await expect(async () => {
        await page.getByLabel('Search contacts').fill(name);
        await page.getByLabel('Search contacts').press('Enter');
        await expect(page.getByRole('row')).toHaveCount(2, { timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    const section = page.getByRole('dialog').getByRole('region', { name: 'Enquiries and history' });
    const enquiries = section.getByRole('region', { name: 'Enquiries' });
    await expect(enquiries.getByRole('listitem', { name: 'Enquiry 1' })).toContainText('Enquiry 1 · current');
    await expect(enquiries.getByRole('listitem', { name: 'Enquiry 1' })).toContainText('Direct');
    await expect(enquiries.getByRole('listitem', { name: 'Enquiry 1' })).toContainText('Unknown');

    const history = section.getByRole('region', { name: 'History' });
    await expect(history.getByRole('list', { name: 'Events' })).toContainText('Wrote a message · Customer · enquiry 1');
    await expect(history.getByRole('list', { name: 'Events' })).toContainText('Enquiry 1 started (first message) · Direct, unknown');
    await history.getByRole('button', { name: 'Tags' }).click();
    await expect(history).toContainText('Nothing here yet.');
    await history.getByRole('button', { name: 'Messages' }).click();
    await expect(history.getByRole('list', { name: 'Events' }).getByRole('listitem')).toHaveCount(1);

    await enquiries.getByRole('button', { name: 'New enquiry' }).click();
    await enquiries.getByLabel('Note').fill('Called for a June rental');
    await enquiries.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('New enquiry started')).toBeVisible();
    await expect(enquiries.getByRole('listitem', { name: 'Enquiry 2' })).toContainText('started by hand');
    await history.getByRole('button', { name: 'Enquiries' }).click();
    await expect(history.getByRole('list', { name: 'Events' })).toContainText(/Enquiry 2 started \(started by hand\) · Direct, unknown · Demo/);
});
