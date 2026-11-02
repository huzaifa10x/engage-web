'use client';

import { useState } from 'react';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { P } from '@/lib/permissions';
import type { Contact } from '@/lib/types';

import { SourceChip } from './source-chip';
import { SOURCE_NOTE, SourceDetailsDialog } from './source-details';

/** Conversations › chat sidebar › Source. Agents see the chip only; details need growth.view. */
export function SourceSection({ contact }: { contact: Contact }) {
    const { can, me } = useSession();
    const full = me.growth?.tier === 'full';
    const [open, setOpen] = useState(false);
    const a = contact.acquisition;
    if (!a) return null;

    const details = full && can(P.GrowthView); // Starter: the chip only
    const touch = a.original && a.status !== 'before' ? a.original : a.latest;

    return (
        <section className="grid gap-2 border-b px-5 py-4 text-[13px]" aria-label="Lead source">
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Source</span>
                <SourceChip acquisition={a} />
            </div>
            {details && touch && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                    {touch.headline && (
                        <>
                            <dt className="text-muted-foreground">Ad headline</dt>
                            <dd className="break-words">{touch.headline}</dd>
                        </>
                    )}
                    {touch.campaign && (
                        <>
                            <dt className="text-muted-foreground">Campaign</dt>
                            <dd className="break-words">{touch.campaign}</dd>
                        </>
                    )}
                    {a.landing_page && (
                        <>
                            <dt className="text-muted-foreground">Landing page</dt>
                            <dd className="font-mono text-[12px] break-all">{a.landing_page}</dd>
                        </>
                    )}
                </dl>
            )}
            {SOURCE_NOTE[a.status] && <p className="text-[12px] leading-snug text-muted-foreground">{SOURCE_NOTE[a.status]}</p>}
            {details && (
                <>
                    <Button size="sm" variant="outline" className="w-fit" onClick={() => setOpen(true)}>
                        View source details
                    </Button>
                    <SourceDetailsDialog contact={contact} open={open} onOpenChange={setOpen} />
                </>
            )}
        </section>
    );
}
