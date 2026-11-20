import { expect, test } from '@playwright/test';

import { api, backendPhp, signIn, unique } from './helpers';

test('campaigns: consent counts, the confirmation tick before sending, and “Send only to opted-in contacts”', async ({ page }) => {
    await signIn(page);
    const tag = unique('Consent').replace(' ', '');
    const ids = [] as string[];
    for (const i of [1, 2, 3, 4, 5]) {
        const phone = `+97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
        ids.push((await api<{ data: { id: string } }>(page, 'POST', 'contacts', { phone, name: `${tag} ${i}`, tags: [tag] })).data.id);
    }
    // 2 opted in, 2 unknown, 1 opted out.
    await api(page, 'POST', `contacts/${ids[0]}/consent`, { method: 'form', state: 'opted_in', note: 'Signed up at the front desk', notify: false });
    await api(page, 'POST', `contacts/${ids[1]}/consent`, { method: 'form', state: 'opted_in', note: 'Signed up at the front desk', notify: false });
    await api(page, 'POST', `contacts/${ids[4]}/consent`, { method: 'form', state: 'opted_out', notify: false });
    backendPhp(
        `app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(function () { $t = App\\Domain\\Messaging\\Models\\Contact::query()->whereKey('${ids[0]}')->value('tenant_id'); foreach (App\\Domain\\WhatsApp\\Models\\PhoneNumber::query()->where('tenant_id', $t)->get() as $n) { Illuminate\\Support\\Facades\\Cache::put('templates:synced:' . $n->waba_account_id, now()->toIso8601String(), 600); App\\Domain\\Templates\\Models\\MessageTemplate::query()->updateOrCreate(['waba_account_id' => $n->waba_account_id, 'name' => 'e2e_consent_offer', 'language' => 'en'], ['tenant_id' => $n->tenant_id, 'status' => 'APPROVED', 'category' => 'MARKETING', 'components' => [['type' => 'BODY', 'text' => 'Hello there']]]); } });`,
    );

    await page.goto('/campaigns');
    await page
        .getByRole('button', { name: /New campaign/ })
        .first()
        .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Campaign name').fill(`${tag} offer`);
    await dialog.getByLabel('Only contacts tagged').click();
    await page.getByRole('option', { name: new RegExp(tag) }).click();
    await dialog.getByLabel('Template').click();
    await page.getByRole('option', { name: /e2e_consent_offer/ }).click();

    const consent = dialog.getByRole('region', { name: 'Marketing consent' });
    await expect(consent).toContainText('2 opted in · 2 unknown consent · 1 opted out (excluded)');
    const warning = consent.getByRole('alert');
    await expect(warning).toContainText('2 contacts have no consent record. Meta’s policy requires opt-in before you send marketing messages.');
    const send = dialog.getByRole('button', { name: /^Send to / });
    await expect(send).toBeDisabled();
    await warning.getByLabel('I confirm these contacts agreed to receive messages from my business').check();
    await expect(send).toBeEnabled();

    // Only opted-in contacts: no confirmation needed, two recipients.
    await consent.getByRole('switch', { name: 'Send only to opted-in contacts' }).click();
    await expect(consent.getByRole('alert')).toHaveCount(0);
    await expect(dialog).toContainText(/5\s*match\s*·\s*2\s*eligible/);

    // The consent history on the contact.
    await page.keyboard.press('Escape');
    const history = await api<{ data: { action: string; source_label: string }[] }>(page, 'GET', `contacts/${ids[0]}/consent-history`);
    expect(history.data[0]).toMatchObject({ action: 'opted_in', source_label: 'Manual' });
});
