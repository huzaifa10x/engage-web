'use client';

import { useSyncExternalStore } from 'react';

/** True while the CSS media query matches (false on the server). */
export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (notify) => {
            const m = window.matchMedia(query);
            m.addEventListener('change', notify);
            return () => m.removeEventListener('change', notify);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}
