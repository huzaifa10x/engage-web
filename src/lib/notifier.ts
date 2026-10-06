/**
 * Desktop notifications and the notification sound.
 *
 * Browser rules this file works within:
 *  • a desktop notification needs the user's permission, asked from a click (never on page load);
 *  • sound may only start after the user has interacted with the page once, so the audio engine
 *    is "unlocked" on the first click or key press and reused from then on;
 *  • timers in a background tab are throttled, so the poll tick comes from a Web Worker.
 */

const SOUND_KEY = 'engage.notify.sound';
const DESKTOP_KEY = 'engage.notify.desktop';

export type DesktopState = 'unsupported' | 'blocked' | 'ask' | 'off' | 'on';

const read = (key: string, fallback: boolean): boolean => {
    try {
        const value = window.localStorage.getItem(key);

        return value === null ? fallback : value === '1';
    } catch {
        return fallback;
    }
};

const write = (key: string, value: boolean): void => {
    try {
        window.localStorage.setItem(key, value ? '1' : '0');
    } catch {
        // Private mode: the choice simply lasts for this page only.
    }
};

export const soundEnabled = (): boolean => read(SOUND_KEY, true);
export const setSoundEnabled = (on: boolean): void => write(SOUND_KEY, on);

export function desktopState(): DesktopState {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'default') return 'ask';

    return read(DESKTOP_KEY, true) ? 'on' : 'off';
}

/** Must be called from a click. Returns the resulting state. */
export async function enableDesktop(): Promise<DesktopState> {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') write(DESKTOP_KEY, true);

    return desktopState();
}

export function disableDesktop(): DesktopState {
    write(DESKTOP_KEY, false);

    return desktopState();
}

// ── Sound ──────────────────────────────────────────────────────────────────────────────────

type AudioCtor = typeof AudioContext;
let audio: AudioContext | null = null;

function context(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    audio ??= new Ctor();

    return audio;
}

/** Call once on mount: the first click or key press makes sound possible for the rest of the visit. */
export function unlockSoundOnFirstInteraction(): () => void {
    const unlock = () => {
        const ctx = context();
        if (ctx && ctx.state === 'suspended') void ctx.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });

    return () => {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
    };
}

/** A short, soft two-note chime, generated in the browser (no audio file to load or block). */
export function playChime(force = false): void {
    if (!force && !soundEnabled()) return;
    const ctx = context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime + 0.01;
    [
        { frequency: 880, at: 0, length: 0.16 },
        { frequency: 1174.66, at: 0.13, length: 0.26 },
    ].forEach(({ frequency, at, length }) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + at);
        gain.gain.exponentialRampToValueAtTime(0.22, start + at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start + at);
        oscillator.stop(start + at + length + 0.02);
    });
}

// ── Desktop notification ───────────────────────────────────────────────────────────────────

export function showDesktop(title: string, body: string, tag: string, onClick: () => void): boolean {
    if (desktopState() !== 'on') return false;
    try {
        const notification = new Notification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg' });
        notification.onclick = () => {
            window.focus();
            onClick();
            notification.close();
        };

        return true;
    } catch {
        return false; // some mobile browsers only allow notifications from a service worker
    }
}

// ── Background-safe ticker ─────────────────────────────────────────────────────────────────

/** Calls `onTick` every `ms`, also while the tab is in the background. Returns a stop function. */
export function startTicker(ms: number, onTick: () => void): () => void {
    try {
        const source = `let t=setInterval(()=>postMessage(0),${ms});onmessage=()=>{clearInterval(t);close();};`;
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        const worker = new Worker(url);
        worker.onmessage = onTick;

        return () => {
            worker.postMessage(0);
            worker.terminate();
            URL.revokeObjectURL(url);
        };
    } catch {
        const timer = setInterval(onTick, ms);

        return () => clearInterval(timer);
    }
}
