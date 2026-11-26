'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BellRingIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PUSH_KEY, usePushState } from '@/components/settings/phone-notifications-card';
import { useStored } from '@/hooks/use-stored';
import { enablePush, permission, pushSupport } from '@/lib/push';

/**
 * Home (mobile prototype): "Don’t miss a waiting customer · Turn on". Shown until answered; the phone's
 * own permission question appears only after the tap. Hidden where notifications can't work.
 */
export function NotifyCard() {
    const qc = useQueryClient();
    const state = usePushState();
    const [dismissed, setDismissed] = useStored<boolean>('engage.notify-card.dismissed', false);
    const [busy, setBusy] = useState(false);
    if (dismissed || state.endpoint === undefined || !state.data?.enabled || pushSupport() !== 'supported' || permission() !== 'default') return null;

    const turnOn = async () => {
        setBusy(true);
        try {
            await enablePush(state.data!.public_key!);
            toast.success('Notifications are on for this phone');
            setDismissed(true);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Notifications were not turned on.');
        } finally {
            setBusy(false);
            void qc.invalidateQueries({ queryKey: PUSH_KEY });
        }
    };

    return (
        <div className="relative mt-2.5 flex items-center gap-3 rounded-2xl border border-primary/60 bg-card p-3.5 shadow-[0_1px_2px_rgba(13,17,9,.05)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                <BellRingIcon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] font-semibold">Don’t miss a waiting customer</b>
                <span className="block text-[12.5px] text-muted-foreground">Get a notification on this phone when someone writes.</span>
            </span>
            <button
                type="button"
                onClick={() => void turnOn()}
                disabled={busy}
                className="h-9 shrink-0 rounded-[10px] bg-primary px-3.5 text-[13px] font-bold text-primary-foreground active:scale-[.97]"
            >
                {busy ? '…' : 'Turn on'}
            </button>
            <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="Not now"
                className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full border bg-card text-muted-foreground"
            >
                <XIcon className="size-3.5" />
            </button>
        </div>
    );
}
