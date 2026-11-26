/**
 * Installing the app (mobile brief): Android Chrome offers a one-tap install (beforeinstallprompt);
 * iPhone needs Safari's Share → Add to Home Screen; in-app browsers (WhatsApp, Instagram, Facebook)
 * can't install at all. Never offered on a computer or when already installed.
 */

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
let listening = false;

/** Call once, early: keeps Chrome's install offer for when the person taps Install. */
export function listenForInstall(): void {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferred = e as InstallPrompt;
        listeners.forEach((l) => l());
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        try {
            localStorage.setItem('engage.installed', '1');
        } catch {
            // fine
        }
        listeners.forEach((l) => l());
    });
}

export function onInstallChange(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

export const canPrompt = () => deferred !== null;

export async function promptInstall(): Promise<boolean> {
    if (!deferred) return false;
    const p = deferred;
    deferred = null;
    await p.prompt();
    const choice = await p.userChoice;
    listeners.forEach((l) => l());

    return choice.outcome === 'accepted';
}

export function isInstalled(): boolean {
    if (typeof window === 'undefined') return false;

    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type Platform = 'android' | 'ios-safari' | 'ios-other' | 'inapp' | 'desktop';

export function platform(): Platform {
    if (typeof navigator === 'undefined') return 'desktop';
    const ua = navigator.userAgent;
    if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua)) return 'inapp';
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
    if (/Android/.test(ua)) return 'android';

    return 'desktop';
}
