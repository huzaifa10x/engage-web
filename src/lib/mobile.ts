import { toast } from 'sonner';

/**
 * Small phone touches shared by the mobile app (brief M1). Vibration works on Android only; iPhone
 * ignores it silently.
 */
export const HAPTIC = { tab: 5, send: 8, threshold: 12, error: [20, 40, 20] } as const;

export function buzz(pattern: number | readonly number[]): void {
    try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator && !document.documentElement.classList.contains('reduce-motion')) {
            navigator.vibrate(pattern as number | number[]);
        }
    } catch {
        // not allowed here (no user gesture yet): nothing to do
    }
}

/** Destructive or reversible actions get Undo for 5 seconds instead of a confirm box. */
export function undoToast(message: string, undo: () => void | Promise<unknown>): void {
    toast.success(message, {
        duration: 5000,
        action: {
            label: 'Undo',
            onClick: () => {
                buzz(10);
                void undo();
            },
        },
    });
}

const REDUCE_MOTION_KEY = 'engage.reduce-motion';

/** The person's own "Reduce motion" switch (the phone's setting is honoured by CSS as well). */
export function reduceMotion(): boolean {
    try {
        return localStorage.getItem(REDUCE_MOTION_KEY) === '1';
    } catch {
        return false;
    }
}

export function setReduceMotion(on: boolean): void {
    try {
        if (on) localStorage.setItem(REDUCE_MOTION_KEY, '1');
        else localStorage.removeItem(REDUCE_MOTION_KEY);
    } catch {
        // private window: applies to this visit only
    }
    document.documentElement.classList.toggle('reduce-motion', on);
}
