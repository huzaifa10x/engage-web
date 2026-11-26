'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';

import { HAPTIC, buzz } from '@/lib/mobile';

/** How far the list must be pulled (px, after resistance) before letting go refreshes it. */
const THRESHOLD = 56;

/**
 * Pull to refresh on a scrolling list (brief M2): pull down while it is at the top, let go past the
 * threshold, and `refresh` runs. Returns how far it is pulled (0 when idle) and whether it is refreshing.
 * Touch only; a mouse never triggers it.
 */
export function usePullToRefresh(ref: RefObject<HTMLElement | null>, refresh: () => Promise<unknown>): { pull: number; refreshing: boolean } {
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    // The latest callback and state, read by listeners attached once (re-attaching mid-gesture would lose it).
    const refreshRef = useRef(refresh);
    const busy = useRef(false);
    useEffect(() => {
        refreshRef.current = refresh;
    });

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let start: number | null = null;
        let distance = 0;
        let armed = false;

        const down = (e: TouchEvent) => {
            start = el.scrollTop <= 0 && !busy.current ? (e.touches[0]?.clientY ?? null) : null;
            distance = 0;
            armed = false;
        };
        const move = (e: TouchEvent) => {
            if (start === null) return;
            const dy = (e.touches[0]?.clientY ?? start) - start;
            if (dy <= 0) {
                setPull(0);
                return;
            }
            distance = Math.min(90, dy / 2); // resistance: the list moves half as far as the finger
            if (distance >= THRESHOLD && !armed) {
                armed = true;
                buzz(HAPTIC.threshold);
            }
            setPull(distance);
        };
        const up = () => {
            if (start === null) return;
            start = null;
            if (distance >= THRESHOLD) {
                busy.current = true;
                setRefreshing(true);
                setPull(THRESHOLD);
                void refreshRef.current().finally(() => {
                    busy.current = false;
                    setRefreshing(false);
                    setPull(0);
                });
            } else {
                setPull(0);
            }
        };
        el.addEventListener('touchstart', down, { passive: true });
        el.addEventListener('touchmove', move, { passive: true });
        el.addEventListener('touchend', up);
        el.addEventListener('touchcancel', up);

        return () => {
            el.removeEventListener('touchstart', down);
            el.removeEventListener('touchmove', move);
            el.removeEventListener('touchend', up);
            el.removeEventListener('touchcancel', up);
        };
    }, [ref]);

    return { pull, refreshing };
}
