'use client';

import { useState } from 'react';

import { useSession } from '@/components/app/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dateTime } from '@/lib/format';
import { P } from '@/lib/permissions';
import type { Contact } from '@/lib/types';

import { LeadDetails } from './lead-details';
import { CONFIDENCE_TEXT, SourceChip } from './source-chip';

/**
 * Contacts & CRM › contact › Acquisition (Technical Specification v1.2 §6, prototype): Original
 * source, Latest touch, First tracked enquiry, Landing page, Confidence, "See lead journey".
 * Growth Hub only adds this card; the CRM still owns the record. "Not available" rather than a guess.
 */
export function AcquisitionCard({ contact }: { contact: Contact }) {
    const { can, me } = useSession();
    const full = me.growth?.tier === 'full';
    const [open, setOpen] = useState(false);
    const a = contact.acquisition;
    if (!a || !full || !can(P.GrowthView)) return null;

    const na = <span className="text-muted-foreground">Not available</span>;
    const rows: [string, React.ReactNode][] = [
        ['Original source', <b key="o">{a.original?.label ?? 'Unknown source'}</b>],
        ['Latest touch', a.latest ? `${a.latest.label}${a.latest.occurred_at ? ` · ${dateTime(a.latest.occurred_at)}` : ''}` : 'None confirmed'],
        ['First tracked enquiry', a.first_tracked_enquiry_at ? dateTime(a.first_tracked_enquiry_at) : na],
        ['Landing page', a.landing_page ? <span className="font-mono text-[12px] break-all">{a.landing_page}</span> : na],
        [
            'Confidence',
            <div key="c" className="grid gap-1">
                <SourceChip acquisition={a} />
                <span className="text-[12px] text-muted-foreground">{CONFIDENCE_TEXT[a.status]}</span>
            </div>,
        ],
    ];

    return (
        <section className="grid gap-2.5 rounded-lg border p-3.5" aria-label="Acquisition">
            <div className="flex items-center gap-2">
                <h3 className="text-[13.5px] font-semibold">Acquisition</h3>
                <Badge tone="outline">Growth Hub</Badge>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="min-w-0">{v}</dd>
                    </div>
                ))}
            </dl>
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
                See lead journey
            </Button>
            <p className="text-[12px] leading-snug text-muted-foreground">
                The original source never changes. New ad taps or website visits are added as touches.
            </p>
            <LeadDetails contact={contact} open={open} onOpenChange={setOpen} />
        </section>
    );
}
