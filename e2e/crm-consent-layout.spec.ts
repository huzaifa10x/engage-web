import { expect, type Page, test } from '@playwright/test';

import { api, backendPhp, signIn, unique } from './helpers';

/** Bulk edit in Contacts, the Leads date range, and the Chatbots layout at every width. */

async function makeContacts(page: Page, prefix: string, n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
        const phone = `+97150${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
        ids.push((await api<{ data: { id: string } }>(page, 'POST', 'contacts', { phone, name: `${prefix} ${i + 1}` })).data.id);
    }

    return ids;
}

test('contacts: select several, edit them together after a review step', async ({ page }) => {
    await signIn(page);
    const prefix = unique('Bulk');
    await makeContacts(page, prefix, 3);
    await page.goto('/contacts');
    await page.getByLabel('Search contacts').fill(prefix);
    await page.getByLabel('Search contacts').press('Enter');
    await expect(page.getByRole('row')).toHaveCount(4); // header + 3

    await page.getByLabel(`Select ${prefix} 1`).check();
    await page.getByLabel(`Select ${prefix} 2`).check();
    const bar = page.getByRole('region', { name: 'Selected contacts' });
    await expect(bar).toContainText('2 selected');
    await bar.getByRole('button', { name: 'Edit 2' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Review changes' })).toBeDisabled(); // nothing chosen yet
    await dialog.getByLabel('Add tags').fill('Open day');
    await dialog.getByLabel('Add tags').press('Enter');
    // A bulk opt-in needs where they agreed.
    await dialog.getByRole('combobox', { name: 'Consent' }).click();
    await page.getByRole('option', { name: 'Record an opt-in' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Say where these contacts agreed');
    await expect(dialog.getByRole('button', { name: 'Review changes' })).toBeDisabled();
    await dialog.getByLabel('Where did they agree?').fill('Signed the form at the open day');
    await dialog.getByRole('button', { name: 'Review changes' }).click();

    await expect(dialog).toContainText('Add the tag Open day');
    await expect(dialog).toContainText('Record an opt-in: “Signed the form at the open day”');
    await dialog.getByRole('button', { name: 'Apply to 2 contacts' }).click();
    await expect(page.getByText('2 of 2 contacts updated')).toBeVisible();
    await expect(bar).toBeHidden(); // selection cleared

    const rows = page.getByRole('row');
    await expect(rows.filter({ hasText: `${prefix} 1` })).toContainText('Open day');
    await expect(rows.filter({ hasText: `${prefix} 1` })).toContainText('Opted in');
    await expect(rows.filter({ hasText: `${prefix} 3` })).not.toContainText('Open day');
});

test('leads: a custom date range is checked and applied', async ({ page }) => {
    // Growth Hub is switched on per workspace by the platform team: on for the demo workspace here.
    backendPhp(
        "app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { foreach (App\\Domain\\Tenancy\\Models\\Tenant::all() as $t) { $s = (array) $t->settings; $s['growth'] = ['enabled' => true, 'started_at' => now()->subDay()->toIso8601String()]; $t->forceFill(['settings' => $s])->save(); } });",
    );
    await signIn(page);
    await page.goto('/growth/leads');

    await page.getByRole('combobox', { name: 'Date range' }).click();
    await page.getByRole('option', { name: 'Custom range…' }).click();
    await page.getByLabel('From', { exact: true }).fill('2026-03-10');
    await page.getByLabel('To', { exact: true }).fill('2026-03-01');
    await expect(page.getByText('The start date is after the end date.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await page.getByLabel('To', { exact: true }).fill('2026-03-31');
    const listed = page.waitForRequest(
        (r) => r.url().includes('/api/v1/growth/leads?') && r.url().includes('since=2026-03-10') && r.url().includes('until=2026-03-31'),
    );
    await page.getByRole('button', { name: 'Apply' }).click();
    await listed;
    await expect(page.getByRole('combobox', { name: 'Date range' })).toContainText(/Mar 10, 2026|10 Mar 2026/);
    await expect(page.getByRole('link', { name: /Export/ })).toHaveAttribute('href', /since=2026-03-10&until=2026-03-31/);
});

test('chatbots: the main menu folds to icons while the section menu stays open', async ({ page }) => {
    await signIn(page);
    await page.goto('/contacts');
    const main = page.getByRole('navigation', { name: 'Main' });
    expect((await main.boundingBox())?.width).toBeGreaterThan(200);

    await main.getByRole('link', { name: 'Chatbots & Flows' }).click();
    await page.waitForURL('**/chatbots');
    await expect(page.getByRole('navigation', { name: 'Chatbots & Flows' })).toBeVisible();
    await expect.poll(async () => (await main.boundingBox())?.width).toBeLessThan(80);
    await expect(main.getByRole('link', { name: 'Contacts' })).toBeVisible(); // still one click away

    // The toggle shows the full menu for this visit; leaving and coming back folds it again.
    await page.getByRole('button', { name: 'Show the full menu' }).click();
    await expect.poll(async () => (await main.boundingBox())?.width).toBeGreaterThan(200);
    await page.getByRole('navigation', { name: 'Chatbots & Flows' }).getByRole('link', { name: 'Templates' }).click();
    await expect.poll(async () => (await main.boundingBox())?.width).toBeGreaterThan(200);
    await main.getByRole('link', { name: 'Contacts' }).click();
    await page.waitForURL('**/contacts');
    await main.getByRole('link', { name: 'Chatbots & Flows' }).click();
    await page.waitForURL('**/chatbots');
    await expect.poll(async () => (await main.boundingBox())?.width).toBeLessThan(80);
});

test('chatbots builder: panels become drawers on smaller screens and nothing is cut off', async ({ page }) => {
    await signIn(page);
    const numbers = (await api<{ data: { numbers: { id: string }[] } }>(page, 'GET', 'chatbots/options')).data.numbers;
    const id = (await api<{ data: { id: string } }>(page, 'POST', 'chatbots', { name: unique('Layout'), phone_number_id: numbers[0].id, template: 'blank' }))
        .data.id;
    await api(page, 'PATCH', `chatbots/${id}`, {
        draft: {
            nodes: [
                { id: 'start', type: 'start', title: 'Start', x: 0, y: 80, config: { any_message: true }, outputs: [{ id: 'next', to: 'hello' }] },
                { id: 'hello', type: 'message', title: 'Hello', x: 320, y: 80, config: { text: 'Hi there' }, outputs: [{ id: 'next', to: null }] },
            ],
        },
    });

    const panel = page.getByRole('complementary', { name: 'Step, test, flow settings and history' });
    const palette = page.getByRole('complementary', { name: 'Add a step' });
    const center = page.getByTestId('builder-center');

    for (const width of [1440, 1100, 820, 390]) {
        await page.setViewportSize({ width, height: 860 });
        await page.goto(`/chatbots/builder?id=${id}`);
        await expect(page.getByText('All changes saved')).toBeVisible();
        const box = await center.boundingBox();
        // The flow always has the room: at least half of a narrow screen, never squeezed.
        expect(box!.width, `flow width at ${width}px`).toBeGreaterThanOrEqual(Math.min(width - 250 - 420, width) * 0.9);

        if (width >= 1280) {
            await expect(panel).toBeVisible();
            await expect(palette).toBeVisible();
            await expect(page.getByRole('button', { name: /^Panel$|Hide panel/ })).toBeHidden();
            continue;
        }

        // Narrower: the panel opens with a step and closes with its own button.
        await expect(panel).toBeHidden();
        await page.getByRole('button', { name: 'Hello', exact: true }).last().click();
        await expect(panel).toBeVisible();
        const p = await panel.boundingBox();
        expect(p!.x + p!.width, 'the panel fits the screen').toBeLessThanOrEqual(width + 1);
        await expect(panel.getByText('Step name')).toBeVisible();
        await panel.getByRole('button', { name: 'Close the panel' }).click();
        await expect(panel).toBeHidden();
        await page.getByRole('button', { name: 'Panel', exact: true }).click();
        await expect(panel).toBeVisible();
        await panel.getByRole('button', { name: 'Close the panel' }).click();

        if (width < 1024) {
            await expect(palette).toBeHidden();
            await page.getByRole('button', { name: 'Add step' }).click();
            await expect(palette).toBeVisible();
            await palette.getByRole('button', { name: 'Close the step list' }).click();
            await expect(palette).toBeHidden();
        } else {
            await expect(palette).toBeVisible();
        }
        // No sideways scrolling of the page.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
});
