'use client';

import { useEffect } from 'react';

/**
 * Pass the sheet's element (a callback ref's state: it only exists while open).
 * Phones: drag a bottom sheet down by its top edge (the grab handle and title area) to close it, as in
 * a native app. It follows the finger and closes past 110 px, otherwise springs back. Content below
 * the top edge scrolls normally.
 */
export function useSwipeToClose(el: HTMLElement | null, close: () => void, enabled = true): void {
    useEffect(() => {
        if (!el || !enabled) return;
        let startY = 0;
        let dy = 0;
        let active = false;
        const phone = () => window.matchMedia('(max-width: 639px)').matches;

        const start = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!t || !phone()) return;
            const top = el.getBoundingClientRect().top;
            // Only from the top edge, so lists and forms inside still scroll.
            if (t.clientY - top > 64) return;
            active = true;
            startY = t.clientY;
            dy = 0;
            el.style.transition = 'none';
        };
        const move = (e: TouchEvent) => {
            if (!active) return;
            const t = e.touches[0];
            if (!t) return;
            dy = Math.max(0, t.clientY - startY);
            el.style.transform = `translateY(${dy}px)`;
            if (dy > 0) e.preventDefault();
        };
        const end = () => {
            if (!active) return;
            active = false;
            el.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
            if (dy > 110) {
                el.style.transform = 'translateY(100%)';
                setTimeout(close, 180);
            } else {
                el.style.transform = '';
            }
        };
        el.addEventListener('touchstart', start, { passive: true });
        el.addEventListener('touchmove', move, { passive: false });
        el.addEventListener('touchend', end);
        el.addEventListener('touchcancel', end);

        return () => {
            el.removeEventListener('touchstart', start);
            el.removeEventListener('touchmove', move);
            el.removeEventListener('touchend', end);
            el.removeEventListener('touchcancel', end);
        };
    }, [el, close, enabled]);
}

/** The bottom sheet look on phones (below 640 px); tablets and computers keep the centred dialog. */
export const PHONE_SHEET = [
    'max-sm:top-auto! max-sm:bottom-0! max-sm:left-0! max-sm:right-0! max-sm:translate-x-0! max-sm:translate-y-0!',
    'max-sm:w-full! max-sm:max-w-none! max-sm:max-h-[92dvh]! max-sm:rounded-t-[20px]! max-sm:rounded-b-none! max-sm:border-x-0! max-sm:border-b-0!',
    'max-sm:pt-7 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-sm:shadow-[0_-12px_34px_rgba(13,17,9,.18)]',
    // Rise from the bottom instead of zooming in the middle.
    'max-sm:[--tw-enter-scale:1] max-sm:[--tw-exit-scale:1] max-sm:[--tw-enter-translate-y:100%] max-sm:[--tw-exit-translate-y:100%] max-sm:[--tw-enter-opacity:1] max-sm:duration-300',
].join(' ');

/** The grab handle at the top of a sheet (phones only). */
export const HANDLE = 'pointer-events-none absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-2 sm:hidden';
