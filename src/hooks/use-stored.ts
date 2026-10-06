'use client';

import { useCallback, useSyncExternalStore } from 'react';

const EVENT = 'engage:stored';

function subscribe(onChange: () => void): () => void {
    window.addEventListener('storage', onChange);
    window.addEventListener(EVENT, onChange);

    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(EVENT, onChange);
    };
}

/**
 * A small value remembered in this browser (layout choices such as a collapsed sidebar or panel
 * widths). Server rendering always uses `fallback`, so there is no hydration mismatch; the stored
 * value takes over as soon as the page is interactive, and other tabs stay in step.
 */
export function useStored<T extends string | number | boolean>(key: string, fallback: T): [T, (value: T) => void] {
    const raw = useSyncExternalStore(
        subscribe,
        () => {
            try {
                return window.localStorage.getItem(key);
            } catch {
                return null;
            }
        },
        () => null,
    );

    let value: T = fallback;
    if (raw !== null) {
        if (typeof fallback === 'number') value = (Number.isFinite(Number(raw)) ? Number(raw) : fallback) as T;
        else if (typeof fallback === 'boolean') value = (raw === '1') as T;
        else value = raw as T;
    }

    const set = useCallback(
        (next: T) => {
            try {
                window.localStorage.setItem(key, typeof next === 'boolean' ? (next ? '1' : '0') : String(next));
            } catch {
                // Private mode: the choice lasts for this page only.
            }
            window.dispatchEvent(new Event(EVENT));
        },
        [key],
    );

    return [value, set];
}
