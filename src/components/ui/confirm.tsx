'use client';

import { useEffect, useState } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Ask = { title: string; body?: string; confirm?: string; cancel?: string; destructive?: boolean };
type Pending = Ask & { resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;

/**
 * "Are you sure?" inside the app instead of the browser's own pop-up: a bottom sheet on phones, a
 * small centred dialog on a computer. Resolves true when confirmed.
 */
export function confirmAction(ask: Ask | string): Promise<boolean> {
    const a = typeof ask === 'string' ? { title: ask } : ask;

    return new Promise((resolve) => {
        if (!show) return resolve(typeof window !== 'undefined' && window.confirm(a.body ? `${a.title}\n\n${a.body}` : a.title));
        show({ ...a, resolve });
    });
}

/** Mounted once (Providers): shows whatever confirmAction asks. */
export function ConfirmHost() {
    const [pending, setPending] = useState<Pending | null>(null);
    useEffect(() => {
        show = setPending;

        return () => {
            show = null;
        };
    }, []);
    const answer = (ok: boolean) => {
        pending?.resolve(ok);
        setPending(null);
    };

    return (
        <AlertDialog open={pending !== null} onOpenChange={(o) => !o && answer(false)}>
            {pending && (
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{pending.title}</AlertDialogTitle>
                        {pending.body && <AlertDialogDescription>{pending.body}</AlertDialogDescription>}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => answer(false)} className="max-sm:h-12">
                            {pending.cancel ?? 'Cancel'}
                        </AlertDialogCancel>
                        <AlertDialogAction destructive={pending.destructive} onClick={() => answer(true)} className="max-sm:h-12">
                            {pending.confirm ?? 'Continue'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            )}
        </AlertDialog>
    );
}
