import { expect, test } from '@playwright/test';

import { api, choose, customerSays, signIn, unique } from './helpers';

type Flow = {
    id: string;
    published_version: number | null;
    draft: { nodes: { id: string; type: string; title: string; config: Record<string, unknown> }[] };
    draft_revision: number;
};
type Run = { id: string; status: string; contact: { name: string } | null; current_node: string | null };

/**
 * The whole journey in the real web app against the real API, with fake Meta:
 * Create flow → Add step → Configure → Test → Fix → Publish → Receive WhatsApp message → CRM update
 * → Handover to an inbox team → Runs & Activity → Flow insights.
 */
test('create, configure, test, fix, publish, run and review a flow', async ({ page }) => {
    await signIn(page);
    const team = unique('Leasing');
    const flowName = unique('E2E Property');
    const customer = { from: `9715${Date.now().toString().slice(-8)}`, name: 'Sara E2E' };

    // An inbox team, created on Team & Roles → Inbox teams.
    await page.goto('/team');
    await page.getByRole('tab', { name: 'Inbox teams' }).click();
    await page.getByRole('button', { name: 'New team' }).click();
    await page.getByLabel('Name').fill(team);
    await page.getByRole('dialog').getByRole('checkbox').first().check(); // the owner
    await page.getByRole('button', { name: 'Save team' }).click();
    await expect(page.getByTestId('inbox-teams')).toContainText(team);

    // A CRM field the flow will fill.
    await api(page, 'POST', 'contact-fields', { label: 'Area', type: 'text' }).catch(() => undefined);

    // Create flow (from the real-estate template).
    await page.goto('/chatbots');
    await page.getByRole('button', { name: '+ Create flow' }).click();
    await page.getByRole('button', { name: /Start from a template/ }).click();
    await page.waitForURL(/\/chatbots\/templates/);
    await page.getByRole('button', { name: /^Use Real estate/ }).click();
    await page.fill('#tg-name', flowName);
    // One question at a time; the template's own answers are fine as they are.
    const create = page.getByRole('button', { name: 'Create and open the builder' });
    for (let i = 0; i < 12 && !(await create.isVisible()); i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
    await create.click();
    await page.waitForURL(/\/chatbots\/builder\?id=/);
    const flowId = new URL(page.url()).searchParams.get('id') as string;
    await expect(page.getByText('All changes saved')).toBeVisible();

    // Add step: a message step from “Add a step”, on its own (not connected yet).
    await expect(page.getByTestId('simple-view')).toBeVisible();
    await page.getByRole('button', { name: 'Add Message' }).click();
    await page.getByLabel('Message', { exact: true }).fill('Thanks, one moment please.');
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 20_000 });

    // Test → the publish checks find the unconnected block, and publishing is refused.
    await expect(page.getByTestId('checks')).toHaveText(/2 to fix/);
    await page.getByRole('button', { name: /^Publish · 2 to fix/ }).click();
    await expect(page.getByText('Fix the problems listed below before publishing.')).toBeVisible();
    await expect(page.getByText('Can never be reached.').first()).toBeVisible();
    let flow = await api<{ data: Flow }>(page, 'GET', `chatbots/${flowId}`);
    expect(flow.data.published_version ?? null).toBeNull();

    // Fix: delete the block; the flow is ready again.
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('checks')).toHaveText(/Ready|No errors/);

    // Configure: the Area menu also saves the chosen option to the Area field (new step setting),
    // and the agent handover goes to the inbox team.
    await page.getByRole('button', { name: 'Area', exact: true }).first().click();
    await page.getByRole('switch', { name: 'Save the chosen option' }).click();
    await choose(page, 'Save the option to', /Area \(custom field\)|Area/);
    await page.getByRole('button', { name: 'Assign an agent', exact: true }).first().click();
    await choose(page, 'Assign the conversation', 'An inbox team');
    await choose(page, 'Inbox team', team);
    await page.getByLabel('Outcome').fill('Qualified buyer');
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 20_000 });

    // Test in the test chat: nothing is sent, the flow answers.
    await page.getByRole('button', { name: 'Test', exact: true }).click();
    await expect(page.getByText('Test mode.')).toBeVisible();
    await page.getByText('Test settings').click();
    await expect(page.getByTestId('test-conditions')).toBeVisible();
    await page.getByRole('button', { name: 'Close the test' }).click();

    // Publish and switch on.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText(/Version 1 published/)).toBeVisible();
    await page.getByRole('button', { name: 'More publish options' }).click();
    await page.getByRole('menuitem', { name: /Switch on/ }).click();
    // Another flow may already be the number's default ("any message") flow: replacing it is asked first.
    const live = page.getByText(/Live: the bot answers on this number now/);
    const replace = page.getByRole('button', { name: 'Switch this flow on' });
    await expect(live.or(replace)).toBeVisible();
    if (await replace.isVisible()) await replace.click();
    await expect(live).toBeVisible();

    flow = await api<{ data: Flow }>(page, 'GET', `chatbots/${flowId}`);
    const nodes = new Map(flow.data.draft.nodes.map((n) => [n.id, n]));

    // Receive WhatsApp messages: answer whatever the bot asks, as a customer would type it. Each
    // message goes through the inbound pipeline and the queue, like a webhook from Meta.
    const latest = async () => (await api<{ data: Run[] }>(page, 'GET', `chatbots/runs?flow=${flowId}`)).data[0];
    const settle = async (before: string | null) => {
        await expect
            .poll(
                async () => {
                    const run = await latest();

                    return run ? `${run.status}:${run.current_node}` : null;
                },
                { timeout: 20_000 },
            )
            .not.toBe(before);
    };
    customerSays('hi', customer.from, customer.name);
    await settle(null);
    const answers: Record<string, string> = { budget: '1.2m', name: 'Sara E2E', phone: '+971501234567' };
    for (let i = 0; i < 12; i++) {
        const run = await latest();
        if (!run || !['active', 'waiting'].includes(run.status)) break;
        const node = nodes.get(run.current_node ?? '');
        const c = node?.config ?? {};
        const rows = (c.sections as { rows: { title: string }[] }[] | undefined)?.[0]?.rows;
        const choice = (c.buttons as { title: string }[] | undefined)?.[0]?.title ?? rows?.[Math.min(2, rows.length - 1)]?.title;
        customerSays(answers[node?.id ?? ''] ?? choice ?? 'ok', customer.from, customer.name);
        await settle(`${run.status}:${run.current_node}`);
    }

    // CRM update + handover: the contact has the name, the Area field and the tag; the chat is with the team.
    const runs = await api<{ data: (Run & { outcome: string | null })[] }>(page, 'GET', `chatbots/runs?flow=${flowId}`);
    expect(runs.data[0].status).toBe('handed_off');
    expect(runs.data[0].outcome).toBe('Qualified buyer');
    const contacts = await api<{ data: { id: string; name: string; attributes?: Record<string, unknown>; tags?: string[] }[] }>(
        page,
        'GET',
        `contacts?q=${customer.from}`,
    );
    expect(contacts.data[0].name).toBe('Sara E2E');
    expect(contacts.data[0].attributes?.area).toBe('JVC');

    await page.goto('/inbox');
    await choose(page, 'Team', team);
    await expect(page.getByRole('list', { name: 'Conversations' })).toContainText('Sara E2E');

    // Runs & Activity: the run and its replay.
    await page.goto(`/chatbots/runs?flow=${flowId}`);
    await expect(page.getByTestId('runs-table')).toContainText('Sara E2E');
    await expect(page.getByTestId('runs-table')).toContainText('Qualified buyer');
    await page.getByTestId('runs-table').getByText('Sara E2E').click();
    const timeline = page.getByTestId('run-timeline');
    await expect(timeline).toContainText('1.2m');
    await expect(timeline).toContainText('→ JVC');
    await expect(timeline).toContainText('Handed over · Qualified buyer');
    await page.keyboard.press('Escape');

    // Flow insights: the live version's numbers.
    await page.goto(`/chatbots?analytics=${flowId}`);
    await page.waitForURL(/\/chatbots\/insights\?flow=/);
    await expect(page.getByText('Chats started', { exact: true })).toBeVisible();
    await expect(page.getByTestId('insights-scope')).toBeVisible();
    await expect(page.getByTestId('insights-steps')).toContainText('Area');
    await page.getByRole('tab', { name: 'Outcomes' }).click();
    await expect(page.getByTestId('outcomes')).toContainText('Qualified buyer');

    // My Flows lists it as live, with its 30-day figures.
    await page.goto('/chatbots');
    await expect(page.getByTestId('my-flows')).toContainText(flowName);

    // Its menu opens what was picked, not the builder.
    await page.getByRole('button', { name: `Actions for ${flowName}` }).click();
    await page.getByRole('menuitem', { name: 'Runs & Activity' }).click();
    await page.waitForURL(/\/chatbots\/runs\?flow=/);
    await expect(page.getByTestId('runs-table')).toContainText('Sara E2E');
    void nodes;
});
