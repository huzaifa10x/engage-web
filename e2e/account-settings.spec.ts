import { type Browser, expect, type Page, test } from '@playwright/test';

import { api, backendPhp, enterLoginCode, mailLog, OWNER, setBackendEnv, signIn } from './helpers';

/**
 * Remember this device for 30 days, and Settings › Email notifications, in the real web app against
 * the real API. Sign-in codes are on for this file (they are off for the other journeys).
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(() => setBackendEnv('LOGIN_OTP_ENABLED', 'true'));
test.afterAll(() => setBackendEnv('LOGIN_OTP_ENABLED', 'false'));
// One code a minute per account: start each step with the limits cleared, as if a minute had passed.
test.beforeEach(() => clearCodeLimits());

function clearCodeLimits() {
    // The sign-in code limits for the demo owner, and the per-IP sign-in route limit (10 a minute), as if a minute had passed.
    backendPhp(
        `$u=App\\Domain\\Identity\\Models\\User::where('email','${OWNER.email}')->first(); foreach (['login-otp-send:','login-otp-send-hour:','login-otp-verify:'] as $k) { Illuminate\\Support\\Facades\\RateLimiter::clear($k.$u->id); } foreach (['ip:127.0.0.1','ip:::1','email:','email:${OWNER.email}'] as $k) { Illuminate\\Support\\Facades\\RateLimiter::clear(md5('auth'.$k)); } Illuminate\\Support\\Facades\\RateLimiter::clear('login-otp-verify-ip:127.0.0.1');`,
    );
}

async function browser(b: Browser): Promise<Page> {
    return (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
}

async function signOut(page: Page) {
    await api(page, 'POST', 'auth/logout');
    await page.context().clearCookies({ name: 'engage_session' });
}

/** Signs in on this page and reports whether the code was asked for. */
async function signInAsksForCode(page: Page): Promise<boolean> {
    clearCodeLimits();
    await page.goto('/login');
    await page.fill('#email', OWNER.email);
    await page.fill('#password', OWNER.password);
    await page.click('button:has-text("Sign in")');
    const codeStep = page.getByText('Enter your sign-in code');
    await Promise.race([page.waitForURL(/\/(dashboard|select-workspace)/), codeStep.waitFor()]);
    const asked = await codeStep.isVisible();
    if (asked) await enterLoginCode(page, OWNER.email);
    await page.waitForURL(/\/(dashboard|select-workspace)/);

    return asked;
}

test('remember this device: no code for 30 days on that browser only, until the devices are forgotten', async ({ browser: b }) => {
    // Browser A: ticks "Remember this device for 30 days" and enters the code once.
    const a = await browser(b);
    await a.goto('/login');
    await a.fill('#email', OWNER.email);
    await a.fill('#password', OWNER.password);
    await a.getByLabel('Remember this device for 30 days').check();
    await a.click('button:has-text("Sign in")');
    await expect(a.getByText('Enter your sign-in code')).toBeVisible();
    await expect(a.getByLabel('Remember this device for 30 days')).toBeChecked();
    await expect(a.getByText('signs in without a code for 30 days')).toBeVisible();
    await enterLoginCode(a, OWNER.email);
    await a.waitForURL(/\/(dashboard|select-workspace)/);

    const trust = (await a.context().cookies()).find((c) => c.name === 'engage_trusted');
    expect(trust?.httpOnly).toBe(true);
    const days = ((trust?.expires ?? 0) * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    await a.goto('/settings?tab=security');
    await expect(a.getByTestId('remembered-devices')).toContainText('This browser is remembered until');

    // Signed out and back in on A: password only.
    await signOut(a);
    expect(await signInAsksForCode(a)).toBe(false);

    // Browser B, not ticked: asked for a code, and not remembered.
    const p = await browser(b);
    expect(await signInAsksForCode(p)).toBe(true);
    await p.goto('/settings?tab=security');
    await expect(p.getByTestId('remembered-devices')).toContainText('This browser is not remembered.');

    // From B: forget remembered devices. B stays signed in.
    await p.getByRole('button', { name: 'Forget remembered devices' }).click();
    await p.getByRole('button', { name: 'Forget devices' }).click();
    await expect(p.getByText('Remembered devices forgotten.')).toBeVisible();
    await expect(p.getByTestId('remembered-devices')).toContainText('Devices last forgotten');
    await p.reload();
    await expect(p.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // A: its open session is over, and the next sign-in asks for a code again.
    await a.goto('/settings?tab=security');
    await a.waitForURL(/\/login/);
    expect(await signInAsksForCode(a)).toBe(true);
});

test('email notifications: all on, each can be switched off, sign-in codes always on', async ({ page }) => {
    await signIn(page);
    // A clean start (a previous run may have left a switch off).
    const keys = ['inbox_assigned', 'inbox_mentions', 'inbox_alerts', 'whatsapp_numbers', 'templates', 'developer', 'billing'];
    await api(page, 'PUT', 'me/email-preferences', { preferences: Object.fromEntries(keys.map((k) => [k, true])) });
    await page.goto('/settings?tab=notifications');
    const prefs = page.getByTestId('email-preferences');
    await expect(prefs).toContainText('Sign-in and security');
    await expect(prefs).toContainText('Always on');

    const security = page.getByRole('switch', { name: 'Sign-in and security emails' });
    await expect(security).toBeChecked();
    await expect(security).toBeDisabled();
    for (const name of ['Conversations assigned to me', 'Mentions', 'Reply-time alerts', 'WhatsApp numbers', 'Template reviews', 'Webhook alerts', 'Billing']) {
        await expect(page.getByRole('switch', { name: `${name} emails` })).toBeChecked();
    }

    // Mentions off: saved, and still off after a reload.
    await page.getByRole('switch', { name: 'Mentions emails' }).click();
    await expect(page.getByText('Mentions emails turned off')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Mentions emails' })).not.toBeChecked();
    const stored = await api<{ data: { key: string; enabled: boolean }[] }>(page, 'GET', 'me/email-preferences');
    expect(Object.fromEntries(stored.data.map((r) => [r.key, r.enabled]))).toMatchObject({ inbox_mentions: false, inbox_assigned: true, security: true });

    // A mention and an assignment for this person: only the assignment is emailed.
    const before = mailLog().length;
    const tag = Date.now().toString(36);
    backendPhp(
        `$m=app(App\\Domain\\Tenancy\\TenantContext::class)->bypass(fn()=>App\\Domain\\Tenancy\\Models\\TenantMembership::whereHas('user',fn($q)=>$q->where('email','${OWNER.email}'))->with('tenant')->first()); app(App\\Domain\\Tenancy\\TenantContext::class)->set($m->tenant,$m); $t=app(App\\Domain\\Messaging\\Services\\InboxTools::class); $t->notify($m,'mention','E2E ${tag} mentioned you in a note',null,'/inbox',email:true); $t->notify($m,'assigned','E2E ${tag} conversation assigned to you',null,'/inbox',email:true);`,
    );
    await expect
        .poll(
            () =>
                mailLog()
                    .slice(before)
                    .some((m) => m.subject.includes(`E2E ${tag} conversation assigned`)),
            { timeout: 20_000 },
        )
        .toBe(true);
    expect(
        mailLog()
            .slice(before)
            .some((m) => m.subject.includes(`E2E ${tag} mentioned you`)),
    ).toBe(false);

    // The API refuses to switch off sign-in codes.
    const cookies = await page.context().cookies();
    const xsrf = decodeURIComponent(cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '');
    const refused = await page.request.put('/api/v1/me/email-preferences', {
        data: { preferences: { security: false } },
        headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf, Referer: new URL('/', page.url()).toString() },
    });
    expect(refused.status()).toBe(422);

    // Back on.
    await page.getByRole('switch', { name: 'Mentions emails' }).click();
    await expect(page.getByText('Mentions emails turned on')).toBeVisible();
});
