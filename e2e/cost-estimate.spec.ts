import { expect, test } from '@playwright/test';

import { api, backendPhp, signIn, unique } from './helpers';

const templates = (contactId: string, changed: boolean) =>
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { $t = App\\Domain\\Messaging\\Models\\Contact::query()->whereKey('${contactId}')->value('tenant_id'); foreach (App\\Domain\\WhatsApp\\Models\\PhoneNumber::query()->where('tenant_id', $t)->get() as $n) { Illuminate\\Support\\Facades\\Cache::put('templates:synced:' . $n->waba_account_id, now()->toIso8601String(), 600); foreach (['e2e_cost_offer' => 'MARKETING', 'e2e_cost_order' => 'UTILITY'] as $name => $cat) { $m = App\\Domain\\Templates\\Models\\MessageTemplate::query()->updateOrCreate(['waba_account_id' => $n->waba_account_id, 'name' => $name, 'language' => 'en'], ['tenant_id' => $n->tenant_id, 'status' => 'APPROVED', 'category' => $cat, 'components' => [['type' => 'BODY', 'text' => 'Hello there']]]); $m->forceFill(['previous_category' => null, 'category_changed_at' => null])->save(); } if (${changed ? 'true' : 'false'}) { App\\Domain\\Templates\\Models\\MessageTemplate::query()->where('waba_account_id', $n->waba_account_id)->where('name', 'e2e_cost_order')->update(['category' => 'MARKETING', 'previous_category' => 'UTILITY', 'category_changed_at' => now()]); } } });`,
    );

test('campaigns and templates: Meta’s cost before sending, and a warning when Meta re-categorises a template', async ({ page }) => {
    await signIn(page);
    const tag = unique('Cost').replace(' ', '');
    const ids = [] as string[];
    for (const i of [1, 2, 3, 4]) {
        const phone = `+97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
        ids.push((await api<{ data: { id: string } }>(page, 'POST', 'contacts', { phone, name: `${tag} ${i}`, tags: [tag] })).data.id);
    }
    await api(page, 'POST', `contacts/${ids[0]}/consent`, { state: 'opted_out', notify: false });
    templates(ids[1], false);

    await page.goto('/campaigns');
    await page
        .getByRole('button', { name: /New campaign/ })
        .first()
        .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Only contacts tagged').click();
    await page.getByRole('option', { name: new RegExp(tag) }).click();
    await dialog.getByLabel('Template').click();
    await page.getByRole('option', { name: /e2e_cost_offer/ }).click();

    // Marketing: 3 UAE recipients × $0.0576; the one who opted out is left out.
    const cost = dialog.getByRole('region', { name: 'Estimated Meta cost' });
    await expect(cost).toContainText('$0.17');
    await expect(cost).toContainText('for 3 marketing messages');
    await expect(cost).toContainText('Estimate. Paid by you directly to Meta.');
    await expect(cost).toContainText('AE · United Arab Emirates');
    await expect(cost).toContainText('$0.0576');
    await expect(cost).toContainText('1 excluded (1 opted out)');
    await expect(cost).toContainText(/Meta’s rates from (1 Oct|Oct 1), 2026/);

    // Utility: all four, at the utility rate.
    await dialog.getByLabel('Template').click();
    await page.getByRole('option', { name: /e2e_cost_order/ }).click();
    await expect(cost).toContainText('for 4 utility messages');
    await expect(cost).toContainText('$0.06');

    // Meta re-categorises the utility template as marketing: warned, and priced again.
    templates(ids[1], true);
    await page.keyboard.press('Escape');
    await page.goto('/campaigns');
    await page
        .getByRole('button', { name: /New campaign/ })
        .first()
        .click();
    await dialog.getByLabel('Only contacts tagged').click();
    await page.getByRole('option', { name: new RegExp(tag) }).click();
    await dialog.getByLabel('Template').click();
    await page.getByRole('option', { name: /e2e_cost_order/ }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Meta re-categorised this template' })).toContainText('from Utility to Marketing');
    await expect(cost).toContainText('for 3 marketing messages');

    // The template page: the warning, and the cost per message by country.
    await page.goto('/templates');
    await page.getByRole('row').filter({ hasText: 'e2e_cost_order' }).first().click();
    const view = page.getByRole('dialog');
    await expect(view.getByRole('alert')).toContainText('from Utility to Marketing');
    const pricing = view.getByRole('region', { name: 'Cost per message by country' });
    await pricing.getByLabel('Find a country').fill('AE');
    await expect(pricing.getByRole('row')).toHaveCount(1);
    await expect(pricing).toContainText('United Arab Emirates');
    await expect(pricing).toContainText('$0.0576');

    templates(ids[1], false);
});
