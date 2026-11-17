import { expect, test } from '@playwright/test';

import { api, backendPhp, customerSays, signIn, unique } from './helpers';

const runQueue = () =>
    backendPhp(
        `Illuminate\\Support\\Facades\\Artisan::call('queue:work', ['--stop-when-empty' => true, '--queue' => 'default,messaging', '--max-time' => 60]);`,
    );

test('bot settings: ice breakers are saved on WhatsApp per number and tapping one starts its flow', async ({ page }) => {
    await signIn(page);
    const numberId = (await api<{ data: { numbers: { id: string }[] } }>(page, 'GET', 'chatbots/options')).data.numbers[0].id;
    const name = unique('Prices');
    const reply = `Here are our prices ${Date.now()}`;
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
                    config: { any_message: false, keywords: [`never${Date.now()}`], keyword_match: 'exact' },
                    outputs: [{ id: 'next', to: 'person' }],
                },
                { id: 'person', type: 'handoff', title: 'Person', x: 320, y: 80, config: { text: reply }, outputs: [] },
            ],
        },
    });
    await api(page, 'POST', `chatbots/${id}/publish`, {});
    await api(page, 'POST', `chatbots/${id}/activate`, { active: true });

    await page.goto('/chatbots/settings');
    await page.getByRole('tab', { name: 'Welcome & ice breakers' }).click();
    const section = page.getByRole('region', { name: 'Welcome and ice breakers' }).locator('section').first();
    const breaker = `See prices ${Date.now().toString(36)}`;
    await section.getByRole('textbox', { name: 'Ice breaker 1' }).fill(breaker);
    await section.getByLabel('Flow for ice breaker 1').click();
    await page.getByRole('option', { name }).click();
    await section.getByRole('button', { name: 'Save on WhatsApp' }).click();
    await expect(page.getByText('Saved on WhatsApp. New chats show them right away.')).toBeVisible();

    const saved = (await api<{ data: { settings: { ice_breakers: { text: string; flow_id: string }[] } }[] }>(page, 'GET', 'chatbots/welcome?check=1')).data[0];
    expect(saved.settings.ice_breakers[0]).toEqual({ text: breaker, flow_id: id });

    // The customer taps the ice breaker in a new chat: WhatsApp sends its words.
    const phone = `97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    customerSays(breaker, phone, 'Ice Breaker');
    runQueue();
    const sent = backendPhp(
        `echo app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(fn () => App\\Domain\\Messaging\\Models\\Message::query()->where('direction', 'outbound')->where('body', '${reply}')->count());`,
    ).trim();
    expect(sent).toBe('1');
});
