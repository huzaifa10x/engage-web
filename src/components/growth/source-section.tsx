'use client';

import { useState } from 'react';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { P } from '@/lib/permissions';
import type { Contact } from '@/lib/types';

import { LeadDetails, SOURCE_NOTE } from './lead-details';
import { SourceChip } from './source-chip';

/**
 * Conversations › chat sidebar › Source (Technical Specification v1.2 §6, prototype): status chip,
 * source name, campaign (only from permitted evidence) and landing page, the explanation for
 * Multiple sources / details unavailable / Before tracking, and "View source details" (opens Lead
 * details; not for Agents). Agents see the source to tailor the reply, never codes or click IDs.
 * Starter (chip tier): the chip only.
 */
export function SourceSection({ contact }: { contact: Contact }) {
    const { can, me } = useSession();
    const full = me.growth?.tier === 'full';
    const [open, setOpen] = useState(false);
    const a = contact.acquisition;
    if (!a) return null;

    const evidence = full && can(P.GrowthView);
    const s = a.source;

    return (
        <section className="grid gap-2 border-b px-5 py-4 text-[13px]" aria-label="Lead source">
            <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Source</h4>
            <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-3">
                <SourceChip acquisition={a} />
                {full && s && (
                    <>
                        <p className="text-[15px] font-semibold">{s.name}</p>
                        <p className="text-[12.5px] break-words text-muted-foreground">{s.campaign ?? 'No campaign details'}</p>
                        {s.landing_page && (
                            <p className="text-[12.5px]">
                                Landing page: <b className="font-mono text-[12px] break-all">{s.landing_page}</b>
                            </p>
                        )}
                    </>
                )}
                {full && SOURCE_NOTE[a.status] && <p className="mt-1 rounded-md bg-card px-2.5 py-1.5 text-[12px] leading-snug">{SOURCE_NOTE[a.status]}</p>}
                {evidence && (
                    <>
                        <Button size="sm" variant="outline" className="mt-1.5 w-full" onClick={() => setOpen(true)}>
                            View source details
                        </Button>
                        <LeadDetails contact={contact} stageVia="chat" open={open} onOpenChange={setOpen} />
                    </>
                )}
            </div>
            {full && !evidence && (
                <p className="text-[12px] leading-snug text-muted-foreground">
                    You see the source to tailor your reply. Codes, click IDs and costs are hidden for agents.
                </p>
            )}
        </section>
    );
}
