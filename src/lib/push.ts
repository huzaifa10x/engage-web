import { api } from './api';

/**
 * Phone notifications (Web Push). The browser keeps the subscription; the server stores its public
 * keys for this person and workspace. iPhone: only from the installed (home-screen) app, iOS 16.4+.
 */

export type PushDevice = {
    id: string;
    label: string | null;
    app: boolean;
    test_sent_at: string | null;
    test_tapped_at: string | null;
    last_sent_at: string | null;
    created_at: string | null;
};
export type PushCategory = { key: string; label: string; hint: string; enabled: boolean; locked: boolean };
export type PushState = {
    enabled: boolean;
    public_key: string | null;
    this_device: PushDevice | null;
    devices: PushDevice[];
    preferences: { categories: PushCategory[]; message_text: boolean };
};

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export function pushSupport(): PushSupport {
    if (typeof window === 'undefined') return 'unsupported';
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
        return ios && !standalone ? 'needs-install' : 'unsupported';

    return 'supported';
}

export const permission = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

async function registration(): Promise<ServiceWorkerRegistration> {
    const existing = await navigator.serviceWorker.getRegistration('/');

    return existing ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function currentSubscription(): Promise<PushSubscription | null> {
    if (pushSupport() !== 'supported') return null;
    const reg = await navigator.serviceWorker.getRegistration('/');

    return (await reg?.pushManager.getSubscription()) ?? null;
}

function key(b64: string): Uint8Array<ArrayBuffer> {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));

    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function label(): string {
    const ua = navigator.userAgent;
    const device = /iPhone/.test(ua)
        ? 'iPhone'
        : /iPad/.test(ua)
          ? 'iPad'
          : /Android/.test(ua)
            ? 'Android'
            : /Mac/.test(ua)
              ? 'Mac'
              : /Windows/.test(ua)
                ? 'Windows'
                : 'Computer';
    const browser = /EdgA?\//.test(ua)
        ? 'Edge'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /CriOS|Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser';
    const app = window.matchMedia('(display-mode: standalone)').matches ? ' · app' : '';

    return `${device} · ${browser}${app}`;
}

/** Asks the phone for permission (only ever after a tap), subscribes and tells the server. */
export async function enablePush(publicKey: string): Promise<PushDevice> {
    const answer = await Notification.requestPermission();
    if (answer !== 'granted')
        throw new Error(
            answer === 'denied'
                ? 'Notifications are blocked for engageX. Allow them in your phone’s settings, then try again.'
                : 'Notifications were not turned on.',
        );
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with another server key cannot be used: start again.
    if (sub && sub.options.applicationServerKey) {
        const current = new Uint8Array(sub.options.applicationServerKey);
        const wanted = key(publicKey);
        if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
            await sub.unsubscribe();
            sub = null;
        }
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) });
    const json = sub.toJSON();

    return (await api<{ data: PushDevice }>('push/subscriptions', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys, label: label() } })).data;
}

/** Turns notifications off on this phone (also at sign-out). Never throws. */
export async function disablePush(): Promise<void> {
    try {
        const sub = await currentSubscription();
        if (!sub) return;
        await api('push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
        await sub.unsubscribe();
    } catch {
        // nothing more to do
    }
}

/** The number on the app icon: customers waiting for a reply. */
export function setBadge(count: number): void {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
        if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined);
        else void nav.clearAppBadge?.().catch(() => undefined);
    } catch {
        // not supported here
    }
}
