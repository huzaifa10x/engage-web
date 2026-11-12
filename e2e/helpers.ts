import { execFileSync } from 'node:child_process';

import { type APIRequestContext, expect, type Page } from '@playwright/test';

/** The Laravel checkout the web app talks to (local environment, META_FAKE=true, demo data). */
const BACKEND = process.env.E2E_BACKEND_DIR ?? '';
if (BACKEND === '') throw new Error('Set E2E_BACKEND_DIR to the engage-backend checkout the web app talks to (local environment, META_FAKE=true).');
const PHP = process.env.E2E_PHP ?? 'php';

export const OWNER = { email: 'owner@engage.test', password: 'Password123!' };

export async function signIn(page: Page, who = OWNER) {
    await page.goto('/login');
    await page.fill('#email', who.email);
    await page.fill('#password', who.password);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/\/(dashboard|select-workspace)/);
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
