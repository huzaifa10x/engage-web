import { type Browser, expect, type Page, test } from '@playwright/test';

import { api, backendPhp, choose, signIn, unique } from './helpers';

type Detail = {
    id: string;
    name: string;
    draft_revision: number;
    engine_level: number;
    published_engine_level: number | null;
    settings: Record<string, unknown>;
    draft: { nodes: { id: string; config: Record<string, unknown> }[] };
};

const node = (id: string, type: string, config: Record<string, unknown>, outputs: Record<string, string | null> = {}, x = 0) => ({
    id,
    type,
    title: id[0].toUpperCase() + id.slice(1),
    x,
    y: 80,
    config,
    outputs: Object.entries(outputs).map(([o, to]) => ({ id: o, to })),
});

async function numberId(page: Page): Promise<string> {
    return (await api<{ data: { numbers: { id: string }[] } }>(page, 'GET', 'chatbots/options')).data.numbers[0].id;
}

/** Creates a flow through the API (as the signed-in owner), optionally published and live. */
async function makeFlow(page: Page, name: string, nodes: unknown[], live = false): Promise<string> {
    const id = (await api<{ data: { id: string } }>(page, 'POST', 'chatbots', { name, phone_number_id: await numberId(page), template: 'blank' })).data.id;
    await api(page, 'PATCH', `chatbots/${id}`, { draft: { nodes } });
    if (live) {
        await api(page, 'POST', `chatbots/${id}/publish`);
        await api(page, 'POST', `chatbots/${id}/activate`, { active: true });
    }

    return id;
}

async function openBuilder(browser: Browser, id: string): Promise<Page> {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await signIn(page);
    await page.goto(`/chatbots/builder?id=${id}`);
    await expect(page.getByText('All changes saved')).toBeVisible();

    return page;
}

test('two editors: the second save is refused, merged without losing either change', async ({ page, browser }) => {
    await signIn(page);
    const id = await makeFlow(page, unique('Merge'), [
        node('start', 'start', { any_message: true }, { next: 'first' }),
        node('first', 'message', { text: 'First message' }, { next: 'second' }, 320),
        node('second', 'message', { text: 'Second message' }, { next: 'team' }, 640),
        node('team', 'handoff', { text: 'A person will reply.' }, {}, 960),
    ]);
    const a = await openBuilder(browser, id);
    const b = await openBuilder(browser, id);

    await a.getByText('First message', { exact: true }).first().click();
    await a.getByLabel('Message', { exact: true }).fill('First, edited by A');
    await expect(a.getByText('All changes saved')).toBeVisible({ timeout: 20_000 });

    await b.getByText('Second message', { exact: true }).first().click();
    await b.getByLabel('Message', { exact: true }).fill('Second, edited by B');
    await expect(b.getByRole('dialog')).toContainText('saved this flow while you were editing');
    await expect(b.getByRole('dialog')).toContainText('both sets of changes fit together');
    await b.getByRole('button', { name: 'Merge and save' }).click();
    await expect(b.getByText('All changes saved')).toBeVisible({ timeout: 20_000 });

    const saved = (await api<{ data: Detail }>(page, 'GET', `chatbots/${id}`)).data;
    const texts = Object.fromEntries(saved.draft.nodes.map((n) => [n.id, n.config.text]));
    expect(texts.first).toBe('First, edited by A');
    expect(texts.second).toBe('Second, edited by B');
    const revisions = await api<{ data: { revision: number }[] }>(page, 'GET', `chatbots/${id}/revisions`);
    expect(revisions.data[0].revision).toBe(saved.draft_revision);
});

test('a flow from before the upgrade keeps its behaviour until someone upgrades it on purpose', async ({ page }) => {
    await signIn(page);
    const name = unique('Legacy');
    const id = await makeFlow(
        page,
        name,
        [node('start', 'start', { any_message: true }, { next: 'team' }), node('team', 'handoff', { text: 'A person will reply.' }, {}, 320)],
        true,
    );
    // What the deploy migration does to every flow that already exists.
    backendPhp(
        `$c=app(App\\Domain\\Tenancy\\TenantContext::class); $c->bypass(fn()=>Illuminate\\Support\\Facades\\DB::statement("UPDATE chatbot_flows SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb),'{engine_level}','1') WHERE id = '${id}'")); $c->bypass(fn()=>Illuminate\\Support\\Facades\\DB::statement("UPDATE chatbot_flow_versions SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb),'{engine_level}','1') WHERE flow_id = '${id}'"));`,
    );
    await page.goto(`/chatbots/builder?id=${id}`);
    await page.getByRole('button', { name: 'Flow settings' }).first().click();
    await expect(page.getByTestId('engine-level-1')).toBeVisible();

    // Editing other settings keeps level 1.
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 20_000 });
    expect((await api<{ data: Detail }>(page, 'GET', `chatbots/${id}`)).data.engine_level).toBe(1);

    // Upgrade: the draft moves to level 2; customers keep level 1 until it is published.
    await page.getByRole('button', { name: 'Flow settings' }).first().click();
    await page.getByRole('button', { name: 'Upgrade' }).click();
    await expect(page.getByTestId('engine-level-upgraded')).toBeVisible();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 20_000 });
    let detail = (await api<{ data: Detail }>(page, 'GET', `chatbots/${id}`)).data;
    expect(detail.engine_level).toBe(2);
    expect(detail.published_engine_level).toBe(1);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText(/Version 2 published/)).toBeVisible();
    detail = (await api<{ data: Detail }>(page, 'GET', `chatbots/${id}`)).data;
    expect(detail.published_engine_level).toBe(2);
});

test('the step settings, test conditions and live-call safeguards in the builder', async ({ page }) => {
    await signIn(page);
    const id = await makeFlow(page, unique('Settings'), [
        node('start', 'start', { any_message: true }, { next: 'day' }),
        node('day', 'question', { text: 'Which day?', validate: 'future_date', save_to: 'var:day' }, { next: 'crm' }, 320),
        node(
            'crm',
            'http',
            { method: 'POST', url: 'https://sandbox.example.com/leads', body: '{"day":"{{var.day}}"}' },
            { success: 'team', error: 'team' },
            640,
        ),
        node('team', 'handoff', { text: 'A person will reply.' }, {}, 960),
    ]);
    await page.goto(`/chatbots/builder?id=${id}`);

    // Booking window on a date question; sample answer on an API step; outcome on the handover.
    await page.getByText('Which day?', { exact: true }).first().click();
    await page.getByLabel('Booking window in days').fill('30');
    await page.getByText('Crm', { exact: true }).first().click();
    await page.getByLabel('Sample status code').fill('201');
    await page.getByLabel('Sample response body').fill('{"lead":{"id":"SAMPLE-1"}}');
    await page.getByText('Team', { exact: true }).first().click();
    await page.getByLabel('Outcome').fill('Qualified lead');
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 20_000 });
    const nodes = Object.fromEntries((await api<{ data: Detail }>(page, 'GET', `chatbots/${id}`)).data.draft.nodes.map((n) => [n.id, n.config]));
    expect(nodes.day.window_days).toBe(30);
    expect(nodes.crm.sample_status).toBe(201);
    expect(nodes.crm.sample_body).toBe('{"lead":{"id":"SAMPLE-1"}}');
    expect(nodes.team.outcome).toBe('Qualified lead');

    // Test chat: the API step is a dry run; a date beyond the window is refused.
    await page.getByRole('button', { name: 'Test', exact: true }).click();
    await expect(page.getByText('Which day?').last()).toBeVisible();
    await page.getByPlaceholder('Type a message').fill('31/04');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Sorry, that date doesn’t exist. Please check the day and month.')).toBeVisible();

    // Live calls: confirmation with a reason, and refused while the workspace has no test endpoints.
    await page.getByRole('button', { name: 'Test conditions' }).click();
    await choose(page, 'API and Sheets steps', 'Call test endpoints for real…');
    await expect(page.getByRole('button', { name: 'Call for real' })).toBeDisabled();
    await page.getByLabel('Reason').fill('Check the sandbox CRM');
    await page.getByRole('button', { name: 'Call for real' }).click();
    await expect(page.getByTestId('live-banner')).toBeVisible();
    await expect(page.getByText('Add test endpoints in Chatbot settings before testing with live integrations.')).toBeVisible();
});

test('start rules: overlaps, priority per number and the tester', async ({ page }) => {
    await signIn(page);
    const offers = unique('Offers');
    const prices = unique('Price list');
    const flow = (keywords: string[], match: string, text: string) => [
        node('start', 'start', { any_message: false, keywords, keyword_match: match }, { next: 'hi' }),
        node('hi', 'message', { text }, { next: 'team' }, 320),
        node('team', 'handoff', { text: 'A person will reply.' }, {}, 640),
    ];
    await makeFlow(page, offers, flow(['price'], 'contains', 'Our offers'), true);
    await makeFlow(page, prices, flow(['price list'], 'starts', 'Our price list'), true);

    await page.goto('/chatbots/start-rules');
    const overlaps = page.getByTestId('overlaps');
    await expect(overlaps).toContainText(`“${offers}” answers because it is higher in the list.`);

    await page.getByRole('button', { name: `Move ${prices} up` }).click();
    await expect(overlaps).toContainText(`“${prices}” answers because it is higher in the list.`);
    await page.reload();
    const list = await page.getByTestId('start-rules').innerText();
    expect(list.indexOf(prices)).toBeGreaterThan(-1);
    expect(list.indexOf(prices)).toBeLessThan(list.indexOf(offers));

    await page.getByLabel('Test message').fill('Price list please');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByTestId('tester-result')).toContainText(`“${prices}” starts: the message matches its keywords.`);
});

test('test endpoints are set in the workspace and unsafe addresses are refused', async ({ page }) => {
    await signIn(page);
    await page.goto('/chatbots');
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Test endpoints' }).click();
    await page.getByRole('button', { name: 'Add an address' }).click();
    await page.getByLabel('Test endpoint 1').fill('http://10.0.0.5/hook');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/must be an https address with a host name/)).toBeVisible();
    await page.getByLabel('Test endpoint 1').fill('https://sandbox.example.com/');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Test endpoints saved')).toBeVisible();
    expect((await api<{ data: { test_endpoints: string[] } }>(page, 'GET', 'chatbots/workspace')).data.test_endpoints).toEqual([
        'https://sandbox.example.com/',
    ]);
});
