'use client';

import { PhoneIcon } from 'lucide-react';
import Link from 'next/link';

import { useSession } from '@/components/app/session';
import { P } from '@/lib/permissions';
import { usePhoneNumbers } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** True once the numbers have loaded and none is connected (null while loading). */
export function useNoNumber(): boolean | null {
    const numbers = usePhoneNumbers();
    if (!numbers.data) return null;

    return !numbers.data.some((n) => n.status === 'connected');
}

/**
 * "Connect your WhatsApp number to …" (audit APP-002, APP-009, APP-026): shown where something
 * can't work without a connected number, with the way to fix it for this person's role, in visible
 * text rather than a disabled button with no reason.
 */
export function ConnectPrompt({ purpose, className, compact = false }: { purpose: string; className?: string; compact?: boolean }) {
    const { can } = useSession();
    const canConnect = can(P.ChannelsManage);

    return (
        <div role="status" className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-bg/60 p-3.5 text-[13.5px]', className)}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-warn">
                <PhoneIcon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <b className="block font-semibold">Connect your WhatsApp number to {purpose}.</b>
                {!compact && (
                    <span className="block text-muted-foreground">
                        {canConnect ? 'It takes about two minutes through Meta.' : 'Ask the workspace owner or an admin to connect it in Channels.'}
                    </span>
                )}
            </span>
            {canConnect && (
                <Link href="/channels" className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-bold text-primary-foreground">
                    Connect WhatsApp
                </Link>
            )}
        </div>
    );
}
