/**
 * The installed phone app (mobile brief): opened from the home screen, it identifies itself with its
 * own random device key, kept in the app's storage. The server keeps the app signed in for 90 days on
 * one phone at a time; uninstalling removes the key, so a fresh install signs in again.
 */

const KEY = 'engage.app-device';

/** Running as the installed app (home screen), not in a browser tab. */
export function isInstalledApp(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    } catch {
        return false;
    }
}

/** The installed app's device key (created on first use); null in a browser tab. */
export function appDeviceId(): string | null {
    if (!isInstalledApp()) return null;
    try {
        let id = localStorage.getItem(KEY);
        if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
            id = crypto.randomUUID();
            localStorage.setItem(KEY, id);
        }

        return id;
    } catch {
        return null; // storage blocked: behaves like a browser tab
    }
}
