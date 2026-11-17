import { execFileSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

import { api, backendPhp, customerSays, signIn, unique } from './helpers';

const BACKEND = process.env.E2E_BACKEND_DIR ?? '';
const PHP = process.env.E2E_PHP ?? 'php';
const runQueue = () =>
    backendPhp(
        `Illuminate\\Support\\Facades\\Artisan::call('queue:work', ['--stop-when-empty' => true, '--queue' => 'default,messaging', '--max-time' => 60]);`,
    );

test('whatsapp forms: a lead form is made, published, sent by a flow, and its answers and consent land on the contact', async ({ page }) => {
    await signIn(page);
    const name = unique('Lead form');
    await page.goto('/chatbots/settings');
    await page.getByRole('tab', { name: 'WhatsApp forms' }).click();
    const panel = page.getByRole('region', { name: 'WhatsApp forms' });
    await panel.getByLabel('Form name').fill(name);
    await panel.getByRole('button', { name: 'New form' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('list', { name: 'Questions' }).getByRole('listitem')).toHaveCount(5);
    await expect(dialog.getByLabel('What the customer sees')).toContainText('Tell us what you need');
    // A question longer than WhatsApp allows cannot be typed.
    await expect(dialog.getByLabel('Question 3 text')).toHaveAttribute('maxlength', '20');
    await dialog.getByRole('button', { name: 'Publish on WhatsApp' }).click();
    await expect(page.getByText('Published on WhatsApp. Flows that send this form use it now.')).toBeVisible();
    await expect(dialog).toContainText('Version 1 · Published');
    await page.keyboard.press('Escape');

    // A flow sends it.
    const forms = (await api<{ data: { id: string; name: string }[] }>(page, 'GET', 'chatbots/forms')).data;
    const formId = forms.find((f) => f.name === name)!.id;
    const numberId = (await api<{ data: { numbers: { id: string }[] } }>(page, 'GET', 'chatbots/options')).data.numbers[0].id;
    const keyword = `lead${Date.now().toString(36)}`;
    const flowId = (
        await api<{ data: { id: string } }>(page, 'POST', 'chatbots', { name: unique('Lead capture'), phone_number_id: numberId, template: 'blank' })
    ).data.id;
    await api(page, 'PATCH', `chatbots/${flowId}`, {
        draft: {
            nodes: [
                {
                    id: 'start',
                    type: 'start',
                    title: 'Start',
                    x: 0,
                    y: 80,
                    config: { any_message: false, keywords: [keyword], keyword_match: 'exact' },
                    outputs: [{ id: 'next', to: 'form' }],
                },
                {
                    id: 'form',
                    type: 'form',
                    title: 'Form',
                    x: 320,
                    y: 80,
                    config: { form_id: formId, text: 'Tell us what you need', cta: 'Open form' },
                    outputs: [{ id: 'next', to: 'end' }],
                },
                { id: 'end', type: 'handoff', title: 'Thanks', x: 640, y: 80, config: { text: 'Thanks, an agent will call you.' }, outputs: [] },
            ],
        },
    });
    await api(page, 'POST', `chatbots/${flowId}/publish`, {});
    await api(page, 'POST', `chatbots/${flowId}/activate`, { active: true });

    const phone = `97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    customerSays(keyword, phone, 'Form Customer');
    runQueue();
    // The customer fills the form in on the phone and taps Send.
    execFileSync(
        PHP,
        [
            'artisan',
            'engage:demo:inbound',
            'form',
            `--from=${phone}`,
            '--name=Form Customer',
            `--form=${JSON.stringify({ flow_token: 'bot:form', name: 'Layla Haddad', budget: '5k_20k', location: 'Dubai Marina', requirement: '2-bedroom flat', marketing_consent: true })}`,
        ],
        { cwd: BACKEND, stdio: 'pipe' },
    );
    runQueue();

    const contacts = (
        await api<{ data: { id: string; name: string | null; consent_state: string; phone: string | null }[] }>(page, 'GET', `contacts?q=${phone}`)
    ).data;
    const contact = contacts.find((c) => c.phone === `+${phone}`)!;
    expect(contact.name).toBe('Layla Haddad');
    expect(contact.consent_state).toBe('opted_in');
    const history = (await api<{ data: { source_label: string }[] }>(page, 'GET', `contacts/${contact.id}/consent-history`)).data;
    expect(history[0].source_label).toBe('WhatsApp form');

    await page.goto('/chatbots/settings');
    await page.getByRole('tab', { name: 'WhatsApp forms' }).click();
    await page
        .getByRole('region', { name: 'WhatsApp forms' })
        .getByRole('button', { name: new RegExp(`^${name}`) })
        .click();
    await page
        .getByRole('dialog')
        .getByRole('tab', { name: /Answers/ })
        .click();
    const answers = page.getByRole('dialog').getByRole('list', { name: 'Answers' });
    await expect(answers).toContainText('Layla Haddad');
    await expect(answers).toContainText('AED 5,000 to 20,000');
    await expect(answers).toContainText('opted in');
});
