'use client';

import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { dateTime, humanize } from '@/lib/format';
import { useLeadEvidence } from '@/lib/queries';
import type { Acquisition, Contact, LeadEvidence } from '@/lib/types';

import { SourceChip } from './source-chip';

/** One line explaining the statuses that need it (shown wherever the chip has room). */
export const SOURCE_NOTE: Partial<Record<Acquisition['status'], string>> = {
    multi: 'A Meta ad and a website code came in on the same message. Meta counts as the origin; the website visit is kept as a separate touch.',
    web: 'The message had a valid website code, but the tap never registered (for example an ad blocker). It counts as Website only.',
    before: 'This contact existed before Growth Hub started. New touches are recorded; they don’t count as new leads.',
    unattributed: 'No proof of source: no website code and no Meta ad referral on the first message.',
};

const EVIDENCE_TYPE: Record<string, string> = {
    meta_ctwa: 'Meta click-to-WhatsApp referral',
    website_reference: 'Website reference code',
    website_unregistered: 'Website code without a registered tap',
};

function EvidenceRow({ e }: { e: LeadEvidence }) {
    const d = e.details;
    const rows: [string, string | undefined][] = [
        ['Headline', d.headline],
        ['Ad text', d.body],
        ['Source type', d.source_type ? humanize(d.source_type) : undefined],
        ['Media', d.media_type ? humanize(d.media_type) : undefined],
        ['Ad link', d.source_url],
        ['Ad ID', d.ad_id],
        ['Ad click ID', d.click_id],
        ['Platform proof', e.platform_proof ?? undefined],
    ];

    return (
        <li className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold">{e.label}</span>
                <Badge tone={e.confidence === 'confirmed' ? 'good' : 'warn'}>{humanize(e.confidence)}</Badge>
                {e.conflict && <Badge tone="brand">Multiple sources</Badge>}
                <span className="ml-auto text-[12px] text-muted-foreground">{dateTime(e.occurred_at)}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{EVIDENCE_TYPE[e.type] ?? humanize(e.type)}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                {rows
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                        <div key={k} className="contents">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className={k.endsWith('ID') ? 'font-mono break-all' : 'break-words'}>{v}</dd>
                        </div>
                    ))}
            </dl>
        </li>
    );
}

/** "View source details": the proof behind the lead's source. Owner and Admin only (growth.view). */
export function SourceDetailsDialog({ contact, open, onOpenChange }: { contact: Contact; open: boolean; onOpenChange: (open: boolean) => void }) {
    const evidence = useLeadEvidence(contact.id, open);
    const a = contact.acquisition;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Source details</DialogTitle>
                    <DialogDescription>Proof behind where {contact.display_name} came from. IDs are shortened.</DialogDescription>
                </DialogHeader>
                {a && (
                    <div className="grid gap-1.5">
                        <SourceChip acquisition={a} />
                        {SOURCE_NOTE[a.status] && <p className="text-[12.5px] text-muted-foreground">{SOURCE_NOTE[a.status]}</p>}
                    </div>
                )}
                {evidence.isLoading && <Skeleton className="h-24 w-full" />}
                {evidence.isError && <p className="text-[13px] text-bad">The source details could not be loaded.</p>}
                {evidence.data && evidence.data.length === 0 && (
                    <p className="rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">
                        No tracked touches for this contact yet.
                    </p>
                )}
                {evidence.data && evidence.data.length > 0 && (
                    <ol className="grid gap-2">
                        {[...evidence.data].reverse().map((e) => (
                            <EvidenceRow key={e.id} e={e} />
                        ))}
                    </ol>
                )}
            </DialogContent>
        </Dialog>
    );
}
