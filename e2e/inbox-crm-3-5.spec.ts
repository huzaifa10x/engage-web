import { expect, test } from '@playwright/test';

import { api, customerSays, signIn, unique } from './helpers';

/**
 * Inbox & CRM 3.5, as in the prototype: the queue tabs and status bar, Resolve with a reason (toast with
 * Undo, the Resolved tab), internal notes in the timeline, the Sales card (stage dots, quick next step,
 * Won asks for a reference), search-first start conversation, Contacts & CRM (funnel, contact panel with
 * inline edit and history, full record, deals pipeline, Fields & sync).
 */
const phone = () => `9715${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

async function chatFor(page: Parameters<typeof signIn>[0], name: string): Promise<string> {
    let id = '';
    await expect
        .poll(async () => {
            const list = await api<{ data: { id: string; contact: { display_name: string } }[] }>(page, 'GET', 'conversations?per_page=50&tab=all');
            id = list.data.find((c) => c.contact.display_name === name)?.id ?? '';
            return id;
        })
        .not.toBe('');

    return id;
}

test('inbox: tabs, status bar, a note in the timeline, resolve with a reason, undo and the Resolved tab', async ({ page }) => {
    await signIn(page);
    const name = unique('Resolve');
    customerSays('Do you deliver to Sharjah?', phone(), name);
    const id = await chatFor(page, name);

    await page.goto(`/inbox?c=${id}`);
    const tabs = page.getByRole('tablist', { name: 'Inbox views' });
    for (const t of ['Needs reply', 'Mine', 'Unassigned', 'All', 'Resolved']) await expect(tabs.getByRole('tab', { name: new RegExp(`^${t}`) })).toBeVisible();
    await expect(page.getByText(/Window open · \d+h/).first()).toBeVisible();
    await expect(page.getByText(/^Needs reply ·/)).toBeVisible();
    await expect(page.getByText('No automation running').or(page.getByRole('button', { name: 'Stop flow' }))).toBeVisible();

    // A note goes into the timeline, not to the customer.
    await page.getByRole('radio', { name: 'Internal note' }).click();
    await page.getByLabel('Internal note').fill('Check stock before quoting');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Check stock before quoting')).toBeVisible();
    await expect(page.getByText(/Internal note · You · Team only/)).toBeVisible();

    // Resolve asks why; the toast offers Undo.
    await page.getByRole('button', { name: 'Resolve this chat' }).click();
    await page.getByRole('menuitem', { name: /No action needed/ }).click();
    await expect(page.getByText(`${name} · No action needed · moved to the Resolved tab`)).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(`${name} is open again`)).toBeVisible();

    // In Needs reply the next chat opens after resolving; the resolved one shows its closure.
    await page.goto(`/inbox?c=${id}`);
    await page.getByRole('button', { name: 'Resolve this chat' }).click();
    await page.getByRole('menuitem', { name: /^Resolved/ }).click();
    await expect(page.getByText(`${name} · Resolved · moved to the Resolved tab`)).toBeVisible();
    await page.goto(`/inbox?c=${id}`);
    await expect(page.getByText(/Viewing doesn’t change its status/)).toBeVisible();
    await tabs.getByRole('tab', { name: /^Resolved/ }).click();
    const row = page.getByRole('listbox', { name: 'Resolved chats' }).getByRole('option').filter({ hasText: name });
    await expect(row).toHaveCount(1);
});

test('sales card: move the deal by its stage dots, add a quick next step, Won asks for a reference', async ({ page }) => {
    await signIn(page);
    const stages = await api<{ data: unknown[] }>(page, 'GET', 'crm/stages');
    if (stages.data.length === 0) await api(page, 'POST', 'crm/stages/suggested');
    const name = unique('Sales');
    customerSays('Is the SUV free on Friday?', phone(), name);
    const id = await chatFor(page, name);

    await page.goto(`/inbox?c=${id}`);
    const panel = page.getByRole('complementary', { name: 'Customer context' });
    await panel.getByRole('button', { name: 'Follow up · tomorrow' }).click();
    await expect(page.getByText(/Follow up · .* · saved to Follow-ups & Alerts/)).toBeVisible();
    await expect(panel.getByText('Next step', { exact: true })).toBeVisible();

    await panel.getByRole('button', { name: /^Move to Won/ }).click();
    const close = page.getByRole('dialog', { name: /Mark as/ });
    await close.getByRole('button', { name: /Move to/ }).click();
    await expect(close).toContainText('Add the invoice, receipt or contract number');
});

test('start conversation: search first, then a new contact needs a name and how they agreed', async ({ page }) => {
    await signIn(page);
    await page.goto('/inbox');
    await page.getByRole('button', { name: 'Start a new conversation' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Recent contacts')).toBeVisible();
    await dialog.getByLabel('Search contacts').fill('050 777 1234');
    await expect(dialog.getByText('Start a new contact with')).toBeVisible();
    await page.keyboard.press('ArrowUp'); // the last option: a new contact
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('heading', { name: 'New contact' })).toBeVisible();
    await expect(dialog.getByLabel(/WhatsApp number/)).toHaveValue('+971 50 777 1234');
    await dialog.getByLabel(/^Name/).fill('R2');
    await dialog.getByRole('button', { name: 'Send template' }).click();
    await expect(dialog.getByText('Enter the customer’s name: at least two letters, no numbers')).toBeVisible();
    await dialog.getByLabel(/^Name/).fill('Rania');
    await dialog.getByRole('button', { name: 'Send template' }).click();
    await expect(dialog.getByText('Choose how they agreed to be contacted')).toBeVisible();
    await dialog.getByLabel(/How did they agree/).selectOption('other');
    await expect(dialog.getByPlaceholder('Say how, e.g. asked at the exhibition stand')).toBeVisible();
    await dialog.getByRole('button', { name: '‹ Back to search' }).click();
    await expect(dialog.getByRole('heading', { name: 'Start a conversation' })).toBeVisible();
});

test('contacts & CRM: funnel, contact panel edit with history, Esc cancels first, full record, pipeline and sync', async ({ page }) => {
    await signIn(page);
    const name = unique('Record');
    customerSays('Hello', phone(), name);
    await chatFor(page, name);

    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts & CRM' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Possible duplicates/ })).toBeVisible();
    const row = page.getByRole('row', { name: new RegExp(`${name}: press Enter to open`) });
    await row.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name })).toBeVisible();
    await expect(sheet.getByText(/\d+ of \d+/)).toBeVisible();
    await expect(sheet.getByText('Not connected')).toBeVisible();

    await sheet.getByRole('button', { name: 'Edit Company' }).click();
    await page.keyboard.type('Gulf Interiors');
    await page.keyboard.press('Escape'); // cancels the edit, keeps the panel
    await expect(sheet.getByRole('link', { name: /Open full record/ })).toBeVisible();
    await sheet.getByRole('button', { name: 'Edit Company' }).click();
    await page.keyboard.type('Gulf Interiors');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Company saved · recorded in change history')).toBeVisible();
    await expect(sheet.getByText('Change history')).toBeVisible();

    await page.keyboard.press('Escape'); // closes the panel; focus back on the row
    await expect(sheet).toBeHidden();
    await expect(row).toBeFocused();

    await row.click();
    await page
        .getByRole('dialog')
        .getByRole('link', { name: /Open full record/ })
        .click();
    await expect(page.getByRole('link', { name: '‹ All contacts' })).toBeVisible();
    await expect(page.getByText('Automatic from deals · never moves backwards')).toBeVisible();

    await page.getByRole('link', { name: /Deals pipeline/ }).click();
    await expect(page.getByText('Open deals with no next step')).toBeVisible();
    await page.getByRole('link', { name: 'Fields & sync' }).click();
    await expect(page.getByText('How contacts are matched')).toBeVisible();
    await expect(page.getByText('Meta policy guardrails')).toBeVisible();
});
