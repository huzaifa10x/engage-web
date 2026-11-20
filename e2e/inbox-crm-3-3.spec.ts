import { expect, test } from '@playwright/test';

import { api, customerSays, signIn, unique } from './helpers';

/**
 * Inbox & CRM 3.3: the wait clock, the enquiry card (Booked needs a reference, Not booked a reason),
 * the deals board, and the contact record sliding in over the page and closing back to it.
 */
async function chatFor(page: Parameters<typeof signIn>[0], name: string): Promise<string> {
    let id = '';
    await expect
        .poll(async () => {
            const list = await api<{ data: { id: string; contact: { display_name: string } }[] }>(page, 'GET', 'conversations?per_page=50');
            id = list.data.find((c) => c.contact.display_name === name)?.id ?? '';
            return id;
        })
        .not.toBe('');

    return id;
}

test('inbox: the wait clock, Booked with a reference, and the contact record slides in over the chat', async ({ page }) => {
    await signIn(page);
    const stages = await api<{ data: unknown[] }>(page, 'GET', 'crm/stages');
    if (stages.data.length === 0) await api(page, 'POST', 'crm/stages/suggested');
    const name = unique('Promise');
    const from = `9715${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    customerSays('Is the SUV free on Friday?', from, name);
    const id = await chatFor(page, name);

    await page.goto(`/inbox?c=${id}`);
    await expect(
        page
            .getByRole('banner')
            .or(page.locator('header'))
            .getByText(/Waiting \d+:\d\d · (Unassigned|\w+)/)
            .first(),
    ).toBeVisible();

    const enquiry = page.getByRole('region', { name: 'Enquiry' }).last();
    await enquiry.getByRole('button', { name: /^Booked: move to/ }).click();
    const close = page.getByRole('dialog', { name: /Mark as/ });
    await close.getByRole('button', { name: /Move to/ }).click();
    await expect(close).toContainText('Add the invoice, receipt or contract number');
    await close.getByLabel('Reference').fill('INV-2209');
    await close.getByRole('button', { name: /Move to/ }).click();
    await expect(enquiry).toContainText('Reference INV-2209');

    // The contact record slides in; the chat stays behind it; closing returns to the chat.
    await enquiry.getByRole('button', { name: 'Open contact' }).click();
    const sheet = page.getByRole('dialog', { name });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('region', { name: 'Deals' })).toContainText('Reference INV-2209');
    await sheet.getByRole('button', { name: 'Close contact' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/inbox\\?c=${id}`));
});

test('pipeline: the board shows enquiries by stage and the contact opens over it', async ({ page }) => {
    await signIn(page);
    const name = unique('Board');
    const from = `9715${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    customerSays('Hi, quote for a website please', from, name);
    await chatFor(page, name);

    await page.goto('/contacts?view=pipeline');
    await expect(page.getByRole('heading', { name: 'Enquiries pipeline' })).toBeVisible();
    await expect(page.getByText('Paid (verified) · last 30 days')).toBeVisible();
    await page.getByLabel('Search enquiries').fill(name);
    await page.getByLabel('Search enquiries').press('Enter');
    await page.getByRole('region', { name: 'Stages' }).getByRole('button', { name }).first().click();
    await expect(page.getByRole('dialog', { name })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Enquiries pipeline' })).toBeVisible();
});
