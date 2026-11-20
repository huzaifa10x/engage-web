import { expect, test } from '@playwright/test';

import { api, backendPhp, signIn, unique } from './helpers';

test('campaigns: an A/B test splits the audience, shows each variant’s results and “Not enough data yet” below the minimum', async ({ page }) => {
    await signIn(page);
    const tag = unique('Ab').replace(' ', '');
    for (const i of [1, 2, 3, 4]) {
        const phone = `+97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
        const id = (await api<{ data: { id: string } }>(page, 'POST', 'contacts', { phone, name: `${tag} ${i}`, tags: [tag] })).data.id;
        await api(page, 'POST', `contacts/${id}/consent`, { method: 'form', state: 'opted_in', note: 'Signed up at the front desk', notify: false });
    }
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { $t = App\\Domain\\Messaging\\Models\\Contact::query()->where('name', '${tag} 1')->value('tenant_id'); foreach (App\\Domain\\WhatsApp\\Models\\PhoneNumber::query()->where('tenant_id', $t)->get() as $n) { Illuminate\\Support\\Facades\\Cache::put('templates:synced:' . $n->waba_account_id, now()->toIso8601String(), 600); foreach (['e2e_ab_one' => 'Hello there', 'e2e_ab_two' => 'Hi, a deal for you'] as $name => $text) { App\\Domain\\Templates\\Models\\MessageTemplate::query()->updateOrCreate(['waba_account_id' => $n->waba_account_id, 'name' => $name, 'language' => 'en'], ['tenant_id' => $n->tenant_id, 'status' => 'APPROVED', 'category' => 'MARKETING', 'components' => [['type' => 'BODY', 'text' => $text]]]); } } });`,
    );

    await page.goto('/campaigns');
    await page
        .getByRole('button', { name: /New campaign/ })
        .first()
        .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Campaign name').fill(`${tag} test`);
    await dialog.getByLabel('Only contacts tagged').click();
    await page.getByRole('option', { name: new RegExp(tag) }).click();
    await dialog.getByLabel('Template').first().click();
    await page.getByRole('option', { name: /e2e_ab_one/ }).click();

    const ab = dialog.getByRole('region', { name: 'A/B test' });
    await ab.getByRole('switch', { name: 'A/B test' }).click();
    await ab.getByLabel('Template').click();
    await page.getByRole('option', { name: /e2e_ab_two/ }).click();
    await expect(ab).toContainText('Each variant goes to about 2 contacts');
    await expect(ab).toContainText('Below the minimum sample of 200 per variant: no winner can be declared.');

    await dialog.getByRole('button', { name: 'Send to 4' }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole('row', { name: new RegExp(`${tag} test`) }).click();
    const results = page.getByRole('dialog').getByRole('region', { name: 'A/B test results' });
    await expect(results).toContainText('A: e2e_ab_one · B: e2e_ab_two');
    await expect(results.getByRole('status')).toContainText('Not enough data yet.');
    await expect(results).toContainText(/Sent\s*2\s*2/);
});
