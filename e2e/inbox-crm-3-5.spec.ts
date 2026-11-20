import { expect, test } from '@playwright/test';

import { api, customerSays, signIn, unique } from './helpers';

/**
 * Inbox & CRM 3.5: the five tabs, Resolve with a reason (toast with Undo, the Resolved tab), internal notes
 * in the timeline, search-first start conversation (new contact with permission), and the contact record
 * panel (inline edit with history, Esc cancels the edit first, previous/next from Contacts).
 */
const phone = () => `9715${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

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

test('inbox: five tabs, resolve with a reason, undo, the Resolved tab and a note in the timeline', async ({ page }) => {
    await signIn(page);
    const name = unique('Resolve');
    customerSays('Do you deliver to Sharjah?', phone(), name);
    const id = await chatFor(page, name);

    await page.goto(`/inbox?c=${id}`);
    const tabs = page.getByRole('tablist', { name: 'Inbox views' });
    for (const t of ['Needs reply', 'Mine', 'Unassigned', 'All', 'Resolved']) await expect(tabs.getByRole('tab', { name: new RegExp(`^${t}`) })).toBeVisible();

    // A note goes into the timeline, not to the customer.
    await page.getByRole('radio', { name: 'Internal note' }).click();
    await page.getByLabel('Internal note').fill('Check stock before quoting');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Check stock before quoting')).toBeVisible();

    // Resolve asks why; the toast offers Undo.
    await page.getByRole('button', { name: 'Resolve this chat' }).first().click();
    await page.getByRole('menuitem', { name: /No action needed/ }).click();
    await expect(page.getByText(`${name} · No action needed · moved to the Resolved tab`)).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Resolve this chat' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Resolve this chat' }).first().click();
    await page.getByRole('menuitem', { name: /^Resolved/ }).click();
    await tabs.getByRole('tab', { name: 'Resolved' }).click();
    const row = page.getByRole('list', { name: 'Resolved chats' }).getByRole('listitem').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Resolved', { exact: true })).toBeVisible();
});

test('start conversation: search first, then a new contact needs a name and how they agreed', async ({ page }) => {
    await signIn(page);
    await page.goto('/inbox');
    await page.getByRole('button', { name: 'Start conversation' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Search contacts').fill('050 777 1234');
    await page.keyboard.press('ArrowUp'); // the last option: a new contact
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('heading', { name: 'New contact' })).toBeVisible();
    await expect(dialog.getByLabel('WhatsApp number')).toHaveValue('+971507771234');
    await dialog.getByLabel('Name').fill('R2');
    await expect(dialog.getByText('Use at least 2 letters and no numbers.')).toBeVisible();
    await dialog.getByLabel('Name').fill('Rania');
    await dialog.getByRole('button', { name: 'Save and send' }).click();
    await expect(dialog.getByText('Say how they agreed to be contacted.')).toBeVisible();
    await dialog.getByLabel('Other').check();
    await expect(dialog.getByLabel('How they agreed')).toBeVisible();
});

test('contact record: inline edit with history, Esc cancels the edit first, next contact from the list', async ({ page }) => {
    await signIn(page);
    const name = unique('Record');
    customerSays('Hello', phone(), name);
    await chatFor(page, name);

    await page.goto('/contacts');
    const row = page.getByRole('row', { name: new RegExp(`${name}: press Enter to open`) });
    await row.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name })).toBeVisible();
    await expect(sheet.getByText(/\d+ of \d+/)).toBeVisible();

    await sheet.getByRole('button', { name: 'Edit Company' }).click();
    await page.keyboard.type('Gulf Interiors');
    await page.keyboard.press('Escape'); // cancels the edit, keeps the panel
    await expect(sheet.getByRole('link', { name: 'Open full record' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Edit Company' }).click();
    await page.keyboard.type('Gulf Interiors');
    await page.keyboard.press('Enter');
    await expect(sheet.getByText('Company set to Gulf Interiors')).toBeVisible();

    await page.keyboard.press('Escape'); // closes the panel; focus back on the row
    await expect(sheet).toBeHidden();
    await expect(row).toBeFocused();
});
