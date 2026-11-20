import { expect, type Page, test } from '@playwright/test';

import { api, backendPhp, customerSays, signIn, unique } from './helpers';

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
    // Letters only: a search with digits also matches phone numbers.
    const prefix = `Bulk ${Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;
    await makeContacts(page, prefix, 3);
    await page.goto('/contacts');
    await expect(page.getByRole('row').nth(1)).toBeVisible(); // loaded and interactive before searching
    await expect(async () => {
        await page.getByLabel('Search contacts').fill(prefix);
        await page.getByLabel('Search contacts').press('Enter');
        await expect(page.getByRole('row')).toHaveCount(4, { timeout: 3000 }); // header + 3
    }).toPass({ timeout: 30_000 });

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
    await expect(rows.filter({ hasText: `${prefix} 1` })).toContainText('Opted in');
    await expect(rows.filter({ hasText: `${prefix} 3` })).not.toContainText('Opted in');
    // Tags show on the contact panel (the 3.5 table has no Tags column).
    await rows.filter({ hasText: `${prefix} 1` }).click();
    await expect(page.getByRole('dialog').getByText('Open day')).toBeVisible();
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

test('campaigns: before sending, the page says how many people won’t receive the marketing message and why', async ({ page }) => {
    await signIn(page);
    const tag = unique('Promo').replace(' ', '');
    const ids = [] as string[];
    for (const i of [1, 2, 3, 4]) {
        const phone = `+97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
        ids.push((await api<{ data: { id: string } }>(page, 'POST', 'contacts', { phone, name: `${tag} ${i}`, tags: [tag] })).data.id);
    }
    // One replied STOP, one stopped marketing in WhatsApp; the other two have Unknown consent. The two test
    // templates exist only here, so the templates are marked freshly synced: a background sync with the
    // Meta stand-in would otherwise mark them deleted halfway through the test.
    await api(page, 'POST', `contacts/${ids[0]}/consent`, { method: 'phone_call', state: 'opted_out', notify: false });
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { App\\Domain\\Messaging\\Models\\Contact::query()->whereKey('${ids[1]}')->update(['marketing_opted_out' => true]); $t = App\\Domain\\Messaging\\Models\\Contact::query()->whereKey('${ids[1]}')->value('tenant_id'); foreach (App\\Domain\\WhatsApp\\Models\\PhoneNumber::query()->where('tenant_id', $t)->get() as $n) { Illuminate\\Support\\Facades\\Cache::put('templates:synced:' . $n->waba_account_id, now()->toIso8601String(), 600); foreach (['e2e_offer' => 'MARKETING', 'e2e_order' => 'UTILITY'] as $name => $cat) { App\\Domain\\Templates\\Models\\MessageTemplate::query()->firstOrCreate(['waba_account_id' => $n->waba_account_id, 'name' => $name, 'language' => 'en'], ['tenant_id' => $n->tenant_id, 'status' => 'APPROVED', 'category' => $cat, 'components' => [['type' => 'BODY', 'text' => 'Hello there']]]); } } });`,
    );

    await page.goto('/campaigns');
    await page
        .getByRole('button', { name: /New campaign/ })
        .first()
        .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Only contacts tagged').click();
    await page.getByRole('option', { name: new RegExp(tag) }).click();
    await dialog.getByLabel('Template').click();
    await page.getByRole('option', { name: /e2e_offer/ }).click();

    const notice = dialog.getByRole('alert').filter({ hasText: 'won’t receive this marketing message' });
    await expect(notice).toContainText('2 people won’t receive this marketing message');
    await expect(notice).toContainText('1 opted out');
    await expect(notice).toContainText('1 stopped marketing messages');
    await expect(dialog).toContainText(/4\s*match\s*·\s*2\s*eligible/);

    // A utility template goes to all four.
    await dialog.getByLabel('Template').click();
    await page.getByRole('option', { name: /e2e_order/ }).click();
    await expect(notice).toBeHidden();
    await expect(dialog).toContainText(/4\s*match\s*·\s*4\s*eligible/);
});

test('inbox: ask for marketing consent sends Subscribe / Unsubscribe; only the customer’s answer is recorded', async ({ page }) => {
    await signIn(page);
    const name = unique('Consent');
    const from = `9715${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    customerSays('Hello, any offers?', from, name);
    let conversationId = '';
    await expect
        .poll(async () => {
            const list = await api<{ data: { id: string; contact: { display_name: string } }[] }>(page, 'GET', 'conversations?per_page=50');
            conversationId = list.data.find((c) => c.contact.display_name === name)?.id ?? '';
            return conversationId;
        })
        .not.toBe('');

    await page.goto(`/inbox?c=${conversationId}`);
    const panel = page.getByRole('complementary', { name: 'Customer context' });
    await panel.getByText('Marketing consent').click();
    await panel.getByRole('button', { name: 'Ask for marketing opt-in' }).click();
    await expect(page.getByText('Opt-in request sent · consent changes only if the customer taps Yes')).toBeVisible();
    await expect(panel).toContainText('Asked'); // nothing recorded yet
    await expect(panel).toContainText('Unknown');

    // The customer agrees: recorded as an opt-in.
    customerSays('Subscribe', from, name);
    await expect(panel).toContainText('Opted in', { timeout: 20_000 });
    await expect(panel.getByRole('button', { name: 'Ask for marketing opt-in' })).toBeHidden();

    // An opt-out recorded by the team sends nothing to the customer.
    const before = (await api<{ data: unknown[] }>(page, 'GET', `conversations/${conversationId}/messages`)).data.length;
    await panel.getByRole('button', { name: 'Record opt-out' }).click();
    // How it was obtained is required (3.3).
    const record = page.getByRole('dialog', { name: 'Record consent' });
    await record.getByRole('button', { name: 'Save consent' }).click();
    await expect(record).toContainText('Say how the consent was obtained.');
    await record.getByLabel(/How was it obtained/).click();
    await page.getByRole('option', { name: 'Phone call' }).click();
    await record.getByRole('button', { name: 'Save consent' }).click();
    await expect(page.getByText(/Consent saved · Opted out · Phone call\. Nothing was sent to the customer\./)).toBeVisible();
    await expect(panel).toContainText('Opted out');
    expect((await api<{ data: unknown[] }>(page, 'GET', `conversations/${conversationId}/messages`)).data.length).toBe(before);
    await expect(panel).toContainText('Only they can opt back in');
});

test('start rules: a rule can be deleted, keeping or deleting its flow; reviews show where they wait', async ({ page }) => {
    await signIn(page);
    const numberId = (await api<{ data: { numbers: { id: string }[] } }>(page, 'GET', 'chatbots/options')).data.numbers[0].id;
    const make = async (name: string, keyword: string) => {
        const id = (await api<{ data: { id: string } }>(page, 'POST', 'chatbots', { name, phone_number_id: numberId, template: 'blank' })).data.id;
        await api(page, 'PATCH', `chatbots/${id}`, {
            draft: {
                nodes: [
                    {
                        id: 'start',
                        type: 'start',
                        title: 'Start',
                        x: 0,
                        y: 80,
                        config: { any_message: false, keywords: [keyword], keyword_match: 'exact' },
                        outputs: [{ id: 'next', to: 'person' }],
                    },
                    { id: 'person', type: 'handoff', title: 'Person', x: 320, y: 80, config: { text: 'A person will reply.' }, outputs: [] },
                ],
            },
        });
        return id;
    };
    const keep = unique('Keep me');
    const gone = unique('Gone');
    const keepId = await make(keep, `k${Date.now()}`);
    await make(gone, `g${Date.now()}`);

    await page.goto('/chatbots/start-rules');
    await page.getByRole('button', { name: `Delete the start rule of ${keep}` }).click();
    await page.getByRole('button', { name: 'Delete rule', exact: true }).click();
    await expect(page.getByText(`Start rule deleted. “${keep}” is kept in My Flows, switched off.`)).toBeVisible();
    await expect(page.getByRole('button', { name: `Delete the start rule of ${keep}` })).toBeHidden();
    expect((await api<{ data: { phone_number_id: string | null } }>(page, 'GET', `chatbots/${keepId}`)).data.phone_number_id).toBeNull();

    await page.getByRole('button', { name: `Delete the start rule of ${gone}` }).click();
    await page.getByLabel('Also delete the flow').check();
    await page.getByRole('button', { name: 'Delete rule and flow' }).click();
    await expect(page.getByText(`“${gone}” and its start rule were deleted`)).toBeVisible();

    // A review request: My Flows tells publishers which flows wait, and the link opens the review.
    await api(page, 'PUT', 'chatbots/workspace', { approvals: true });
    await api(page, 'POST', `chatbots/${keepId}/review`, { action: 'request', note: 'Ready' });
    await page.goto('/chatbots');
    const banner = page.getByRole('status').filter({ hasText: 'waiting for your review' });
    await expect(banner).toContainText(keep);
    await banner.getByRole('link', { name: new RegExp(keep) }).click();
    await expect(page.getByRole('dialog', { name: 'Review before publishing' })).toContainText('asked for a review');
    await api(page, 'PUT', 'chatbots/workspace', { approvals: false });
});
