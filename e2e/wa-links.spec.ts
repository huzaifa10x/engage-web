import { expect, test } from '@playwright/test';

import { api, backendPhp, customerSays, signIn, unique } from './helpers';

/** The background jobs of the local backend (the link chat is recorded after the message is saved). */
const runQueue = () =>
    backendPhp(`Illuminate\\Support\\Facades\\Artisan::call('queue:work', ['--stop-when-empty' => true, '--queue' => 'default', '--max-time' => 60]);`);

type Link = { id: string; name: string; url: string; prefilled_text: string; snippet: string | null };

test('channels: a QR code link with a source tags the chat, and the website button snippet opens the same kind of link', async ({ page, context }) => {
    await signIn(page);
    // The number the local stand-in delivers customer messages to.
    const numberId = backendPhp(
        `echo app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(fn () => App\\Domain\\WhatsApp\\Models\\PhoneNumber::query()->where('status', 'connected')->oldest()->value('id'));`,
    ).trim();
    const name = unique('Shop window');

    const link = (await api<{ data: Link }>(page, 'POST', 'wa-links', { phone_number_id: numberId, name, message: 'Hi! I saw your shop window.' })).data;
    expect(link.prefilled_text).toMatch(/^Hi! I saw your shop window\. \(Ref: EX-[A-Z2-9]{6}\)$/);
    expect(link.url).toMatch(/^https:\/\/wa\.me\/\d+\?text=Hi%21%20I%20saw/);

    // The customer scans it and sends the pre-filled message.
    const phone = `97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    customerSays(link.prefilled_text, phone, 'Window Shopper');
    runQueue();

    const links = (await api<{ data: (Link & { chats: number; new_contacts: number })[] }>(page, 'GET', `wa-links?phone_number_id=${numberId}`)).data;
    expect(links.find((l) => l.id === link.id)).toMatchObject({ chats: 1, new_contacts: 1 });

    // The contact shows the link as its source.
    await page.goto('/contacts');
    await page.getByLabel('Search contacts').fill(phone);
    await page.getByLabel('Search contacts').press('Enter');
    await expect(page.getByRole('row').filter({ hasText: 'Window Shopper' })).toContainText(`WhatsApp link · ${name}`);

    // QR code downloads from the panel of the demo number.
    await page.goto('/channels');
    await page.getByRole('button', { name: 'Links and QR codes' }).first().click();
    const item = page.getByRole('list', { name: 'Links' }).getByRole('listitem').filter({ hasText: name });
    await expect(item).toContainText('1 chats');
    await item.getByRole('button', { name: 'QR code' }).click();
    const qr = page.getByRole('region', { name: `QR code for ${name}` });
    const [png] = await Promise.all([page.waitForEvent('download'), qr.getByRole('button', { name: 'PNG' }).click()]);
    expect(png.suggestedFilename()).toMatch(/-qr\.png$/);
    const [svg] = await Promise.all([page.waitForEvent('download'), qr.getByRole('button', { name: 'SVG' }).click()]);
    expect(svg.suggestedFilename()).toMatch(/-qr\.svg$/);

    // The website button: its snippet works on a plain test page.
    const button = (
        await api<{ data: Link }>(page, 'POST', 'wa-links', {
            phone_number_id: numberId,
            kind: 'website_button',
            message: 'Hi, I have a question',
            button: { position: 'bottom_left', label: 'Chat with us' },
        })
    ).data;
    const site = await context.newPage();
    await site.setContent(`<!doctype html><html><body><h1>Clinic</h1>${button.snippet}</body></html>`);
    const a = site.getByRole('link', { name: 'Chat with us' });
    await expect(a).toBeVisible();
    await expect(a).toHaveAttribute('href', button.url);
    const box = await a.boundingBox();
    expect(box && box.x).toBeLessThan(100);
    await site.close();

    const visitor = `97155${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    customerSays(button.prefilled_text, visitor, 'Site Visitor');
    runQueue();
    await page.goto('/contacts');
    await page.getByLabel('Search contacts').fill(visitor);
    await page.getByLabel('Search contacts').press('Enter');
    await expect(page.getByRole('row').filter({ hasText: 'Site Visitor' })).toContainText('WhatsApp link · Website button');
});
