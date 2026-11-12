import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { type APIRequestContext, expect, type Page } from '@playwright/test';

/** The Laravel checkout the web app talks to (local environment, META_FAKE=true, demo data). */
const BACKEND = process.env.E2E_BACKEND_DIR ?? '';
if (BACKEND === '') throw new Error('Set E2E_BACKEND_DIR to the engage-backend checkout the web app talks to (local environment, META_FAKE=true).');
const PHP = process.env.E2E_PHP ?? 'php';

export const OWNER = { email: 'owner@engage.test', password: 'Password123!' };

/**
 * Signs in through the login page. When the backend asks for the emailed code (LOGIN_OTP_ENABLED),
 * the code is read from the backend's mail log (MAIL_MAILER=log) and typed in.
 */
export async function signIn(page: Page, who = OWNER, options: { rememberDevice?: boolean } = {}) {
    await page.goto('/login');
    await page.fill('#email', who.email);
    await page.fill('#password', who.password);
    if (options.rememberDevice) await page.getByLabel('Remember this device for 30 days').check();
    await page.click('button:has-text("Sign in")');
    const codeStep = page.getByText('Enter your sign-in code');
    await Promise.race([page.waitForURL(/\/(dashboard|select-workspace)/), codeStep.waitFor()]);
    if (await codeStep.isVisible()) await enterLoginCode(page, who.email);
    await page.waitForURL(/\/(dashboard|select-workspace)/);
}

/** The latest sign-in code emailed to this address (the backend's mail log). */
export function lastLoginCode(email: string): string {
    const log = readFileSync(`${BACKEND}/storage/logs/laravel.log`, 'utf8');
    const codes = [...log.matchAll(/^To: (.+)\r?\nSubject: (\d{6}) is your 10X Engage sign-in code/gm)].filter((m) => m[1].trim() === email);
    if (codes.length === 0) throw new Error(`No sign-in code was emailed to ${email}`);

    return codes[codes.length - 1][2];
}

export async function enterLoginCode(page: Page, email: string) {
    const latest = () => {
        try {
            return lastLoginCode(email);
        } catch {
            return null;
        }
    };
    await expect.poll(latest).not.toBeNull();
    await page.getByLabel('Digit 1').click();
    await page.keyboard.type(lastLoginCode(email)); // the sixth digit submits the code
}

/** Emails written to the backend's mail log so far (subjects, with the address they went to). */
export function mailLog(): { to: string; subject: string }[] {
    const log = readFileSync(`${BACKEND}/storage/logs/laravel.log`, 'utf8');

    return [...log.matchAll(/^To: (.+)\r?\nSubject: (.+)$/gm)].map((m) => ({ to: m[1].trim(), subject: m[2].trim() }));
}

/** Changes one setting in the backend's .env (php artisan serve reads it on every request). Local harness only. */
export function setBackendEnv(key: string, value: string) {
    const file = `${BACKEND}/.env`;
    const env = readFileSync(file, 'utf8');
    writeFileSync(file, env.match(new RegExp(`^${key}=`, 'm')) ? env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`) : `${env}\n${key}=${value}\n`);
}

/** Calls the API as the signed-in browser (same session cookie, Sanctum's XSRF header). */
export async function api<T = unknown>(page: Page, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: unknown): Promise<T> {
    const cookies = await page.context().cookies();
    const xsrf = decodeURIComponent(cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '');
    const req: APIRequestContext = page.request;
    const res = await req.fetch(`/api/v1/${path}`, {
        method,
        data,
        headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf, 'X-Requested-With': 'XMLHttpRequest', Referer: new URL('/', page.url()).toString() },
    });
    const body = res.status() === 204 ? null : await res.json();
    expect(res.ok(), `${method} ${path} → ${res.status()} ${JSON.stringify(body)?.slice(0, 400)}`).toBeTruthy();

    return body as T;
}

/** A customer sends a WhatsApp message to the demo number, through the inbound pipeline (fake Meta). */
export function customerSays(text: string, from: string, name: string) {
    execFileSync(PHP, ['artisan', 'engage:demo:inbound', text, `--from=${from}`, `--name=${name}`], { cwd: BACKEND, stdio: 'pipe' });
}

/** Runs PHP in the backend (tinker), for test setup that has no screen (e.g. making a flow look pre-upgrade). */
export function backendPhp(code: string): string {
    return execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, stdio: 'pipe' }).toString();
}

/** Picks an option in a Radix select by its trigger's accessible name. */
export async function choose(page: Page, label: string, option: string | RegExp) {
    await page.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option }).click();
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36).slice(-5)}`;
