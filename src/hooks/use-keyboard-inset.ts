'use client';

import { useEffect } from 'react';

/**
 * Keeps --kb on <html> equal to the height the on-screen keyboard covers (brief M2). Android resizes the
 * page by itself (viewport interactive-widget=resizes-content), so --kb stays 0 there; iPhone Safari does
 * not, so the open chat is padded by --kb and the composer stays above the keyboard.
 */
export function useKeyboardInset(active: boolean): void {
    useEffect(() => {
        const vv = window.visualViewport;
        const root = document.documentElement;
        if (!active || !vv) {
            root.style.removeProperty('--kb');
            return;
        }
        const update = () => {
            const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            root.style.setProperty('--kb', `${covered > 80 ? Math.round(covered) : 0}px`); // ignore toolbars
        };
        update();
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);

        return () => {
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
            root.style.removeProperty('--kb');
        };
    }, [active]);
}
