import { expect, test } from '@playwright/test';

import { api, backendPhp, customerSays, signIn } from './helpers';

test('follow-ups: the rating after a closed support chat is switched on, sent, and its answer shows in Messages & Team', async ({ page }) => {
    await signIn(page);
    await page.goto('/follow-ups');
    const card = page.getByRole('region', { name: 'Satisfaction and feedback' });
    const toggle = card.getByRole('switch', { name: 'Rating after a support chat' });
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
    await expect(card.getByLabel('Question')).toHaveValue('How was your chat with us today?');
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Feedback settings saved')).toBeVisible();

    // A customer writes, an agent answers and closes the chat: one rating request goes out.
    const phone = `97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    customerSays('My booking failed', phone, 'Rated Customer');
    const conversations = (await api<{ data: { id: string; contact: { phone: string | null } }[] }>(page, 'GET', 'conversations?per_page=50')).data;
    const c = conversations.find((x) => x.contact.phone === `+${phone}`)!;
    await api(page, 'POST', `conversations/${c.id}/messages`, { type: 'text', body: 'All fixed now.' });
    await api(page, 'PATCH', `conversations/${c.id}`, { status: 'closed' });
    const asked = backendPhp(
        `echo app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(fn () => App\\Domain\\Feedback\\FeedbackRequest::query()->where('conversation_id', '${c.id}')->value('status'));`,
    ).trim();
    expect(asked).toBe('sent');

    // The customer taps Good (set here directly: the local stand-in has no buttons to tap).
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(fn () => App\\Domain\\Feedback\\FeedbackRequest::query()->where('conversation_id', '${c.id}')->update(['status' => 'answered', 'rating' => 'good', 'answered_at' => now()]));`,
    );
    await page.goto('/insights');
    const csat = page.getByRole('region', { name: 'Customer satisfaction' });
    await expect(csat).toContainText('CSAT');
    await expect(
        csat
            .getByRole('row')
            .filter({ hasText: /Demo|Owner/ })
            .first(),
    ).toContainText(/\d+%/);
});
