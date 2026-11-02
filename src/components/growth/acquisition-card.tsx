'use client';

import { useState } from 'react';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { dateTime } from '@/lib/format';
import { P } from '@/lib/permissions';
import type { Contact } from '@/lib/types';

import { SourceChip } from './source-chip';
import { SourceDetailsDialog } from './source-details';

/** Contacts & CRM › contact › Acquisition (Owner, Admin). "Not available" rather than a guess. */
export function AcquisitionCard({ contact }: { contact: Contact }) {
    const { can, me } = useSession();
    const full = me.growth?.tier === 'full';
    const [open, setOpen] = useState(false);
    const a = contact.acquisition;
    if (!a || !full || !can(P.GrowthView)) return null;

    const na = <span className="text-muted-foreground">Not available</span>;
    const rows: [string, React.ReactNode][] = [
        ['Original source', a.original?.label ?? na],
        ['Latest touch', a.latest ? `${a.latest.label}${a.latest.occurred_at ? ` · ${dateTime(a.latest.occurred_at)}` : ''}` : na],
        ['First tracked enquiry', a.first_tracked_enquiry_at ? dateTime(a.first_tracked_enquiry_at) : na],
        ['Landing page', a.landing_page ? <span className="font-mono text-[12px] break-all">{a.landing_page}</span> : na],
        ['Confidence', a.confidence === 'confirmed' ? 'Confirmed' : na],
    ];

    return (
        <section className="grid gap-2.5 rounded-lg border p-3.5" aria-label="Acquisition">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13.5px] font-semibold">Acquisition</h3>
                <SourceChip acquisition={a} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="min-w-0">{v}</dd>
                    </div>
                ))}
            </dl>
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setOpen(true)}>
                See lead journey
            </Button>
            <SourceDetailsDialog contact={contact} open={open} onOpenChange={setOpen} />
        </section>
    );
}
