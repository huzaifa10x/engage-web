'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { EnquiryCard } from './enquiry-card';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { P } from '@/lib/permissions';

export type { Enquiry } from '@/lib/types';
import type { Enquiry } from '@/lib/types';

export type TimelineEntry = {
    id: string;
    type: string;
    group: string;
    occurred_at: string;
    actor: 'customer' | 'agent' | 'system';
    actor_name: string | null;
    enquiry_id: string | null;
    enquiry_number: number | null;
    subject: { type: string; id: string } | null;
    data: Record<string, unknown>;
};

const GROUPS: [string, string][] = [
    ['', 'Everything'],
    ['messages', 'Messages'],
    ['enquiries', 'Enquiries'],
    ['tags', 'Tags'],
    ['flows', 'Flows and forms'],
    ['team', 'Team'],
    ['stages', 'Stages'],
    ['consent', 'Consent'],
    ['bookings', 'Bookings'],
    ['payments', 'Payments'],
    ['integrations', 'Integrations'],
];

const REASONS: Record<Enquiry['start_reason'], string> = {
    first_message: 'first message',
    quiet_period: 'wrote again after the quiet period',
    ad_click: 'new ad click',
    manual: 'started by hand',
    backfill: 'from earlier messages',
    imported: 'from the imported WhatsApp Business app history',
};

/** What moved a stage, when it was not a person (item 4). */
const STAGE_BY: Record<string, string> = {
    flow: ' · by a flow',
    booking: ' · by a booking',
    payment: ' · by a verified payment',
    lead_rule: ' · by the lead rule',
    api: ' · through the API',
};

const BULK: Record<string, string> = { 'bulk update': 'in a bulk update', import: 'in an import', 'tag deleted': 'because the tag was deleted' };

/** "… in a bulk update by Sara" when the change was made to many contacts at once. */
function bulkSuffix(e: TimelineEntry): string {
    const how = BULK[s(e.data.bulk)];
    if (!how) return '';
    const by = s(e.data.bulk_by) || (e.actor === 'agent' ? s(e.actor_name) : '');
    return ` ${how}${by ? ` by ${by}` : ''}`;
}

/** The chat link for a message event: opens the conversation at that message. */
const messageHref = (e: TimelineEntry) =>
    (e.type === 'message.received' || e.type === 'message.sent') && e.data.message_id && e.data.conversation_id
        ? `/inbox?c=${s(e.data.conversation_id)}&m=${s(e.data.message_id)}`
        : null;

export const confidenceTone = (c: string): Tone => (c === 'verified' ? 'good' : c === 'partial' ? 'warn' : 'grey');

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** One line in plain words for a timeline event (message text is never shown here). */
export function describe(e: TimelineEntry): string {
    // Message text removed by the workspace's retention setting: the line stays, marked.
    return describeOnly(e) + (e.data.removed ? ' · message removed' : '') + bulkSuffix(e);
}

function describeOnly(e: TimelineEntry): string {
    const d = e.data;
    switch (e.type) {
        case 'message.received':
            return d.type === 'text' ? 'Wrote a message' : `Sent a ${s(d.type).replace('_', ' ')} message`;
        case 'message.sent':
            return d.template
                ? `Template “${s(d.template)}” sent${d.campaign_id ? ' (campaign)' : ''}`
                : `Message sent${d.origin === 'automation' ? ' by an automation' : d.origin === 'campaign' ? ' by a campaign' : ''}`;
        case 'enquiry.started':
            return `Enquiry ${s(d.number)} started (${REASONS[d.reason as Enquiry['start_reason']] ?? s(d.reason)}) · ${s(d.source_label)}, ${s(d.confidence)}`;
        case 'enquiry.source_confirmed':
            return `Source confirmed: ${s(d.source_label)}`;
        case 'contact.created':
            return 'Contact added';
        case 'tag.added':
            return `Tag “${s(d.tag)}” added`;
        case 'tag.removed':
            return `Tag “${s(d.tag)}” removed`;
        case 'flow.step':
            return `Flow “${s(d.flow)}”: step ${s(d.step)}${d.kind === 'error' ? ' failed' : ''}`;
        case 'flow.answer':
            return `Answered in “${s(d.flow)}”${d.detail ? `: ${s(d.detail)}` : ''}`;
        case 'flow.ended':
            return `Flow “${s(d.flow)}” ${d.kind === 'handoff' ? 'handed over to the team' : d.kind === 'abandon' ? 'stopped (no answer)' : 'finished'}`;
        case 'form.submitted':
            return `Customer said (form “${s(d.form)}”): ${((d.answers as { label: string; value: string }[] | undefined) ?? []).map((a) => `${a.label}: ${a.value || '—'}`).join(' · ')}`;
        case 'conversation.assigned':
            return d.to_name ? `Assigned to ${s(d.to_name)}` : 'Unassigned';
        case 'conversation.closed':
            return 'Chat closed';
        case 'conversation.reopened':
            return 'Chat reopened';
        case 'stage.changed':
            return `Stage: ${s(d.from) || 'none'} → ${s(d.to) || 'none'}${d.note ? ` (${s(d.note)})` : ''}${STAGE_BY[s(d.reason)] ?? ''}`;
        case 'consent.changed':
            return `${s(d.action).replaceAll('_', ' ')} · ${s(d.source_label)}`;
        case 'payment.paid':
            return `Paid ${s(d.currency)} ${Number(d.total ?? 0).toLocaleString()} · order ${s(d.order)} (verified by the store)`;
        case 'payment.refunded':
            return `Refunded ${s(d.currency)} ${Number(d.refunded ?? 0).toLocaleString()} · order ${s(d.order)}`;
        case 'webhook.delivered':
            return `Webhook “${s(d.event)}” delivered`;
        case 'webhook.failed':
            return `Webhook “${s(d.event)}” failed${d.response_status ? ` (${s(d.response_status)})` : ''}`;
        case 'feedback.answered':
            return `Rated the chat: ${s(d.rating)}`;
        default:
            return e.type;
    }
}

const who = (e: TimelineEntry) => (e.actor === 'customer' ? 'Customer' : e.actor === 'agent' ? (e.actor_name ?? 'A teammate') : 'System');

/** The contact's enquiries (one per buying conversation) and its whole history, with filters. */
export function ContactTimeline({ contactId }: { contactId: string }) {
    const qc = useQueryClient();
    const { can } = useSession();
    const [group, setGroup] = useState('');
    const [enquiryId, setEnquiryId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [starting, setStarting] = useState(false);
    const enquiries = useQuery({
        queryKey: ['contacts', contactId, 'enquiries'],
        queryFn: () => api<{ data: Enquiry[] }>(`contacts/${contactId}/enquiries`).then((r) => r.data),
    });
    const timeline = useQuery({
        queryKey: ['contacts', contactId, 'timeline', group, enquiryId],
        queryFn: () =>
            api<{ data: TimelineEntry[] }>(`contacts/${contactId}/timeline`, { query: { group: group || null, enquiry_id: enquiryId, per_page: 100 } }).then(
                (r) => r.data,
            ),
    });

    const start = async () => {
        try {
            await api(`contacts/${contactId}/enquiries`, { method: 'POST', body: { note: note.trim() || null } });
            toast.success('New enquiry started');
            setNote('');
            setStarting(false);
            void qc.invalidateQueries({ queryKey: ['contacts', contactId] });
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    return (
        <div className="grid gap-4">
            <section className="grid gap-2" aria-label="Enquiries">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[13.5px] font-semibold">Enquiries</h3>
                    {can(P.ContactsUpdate) && !starting && (
                        <Button size="sm" variant="outline" onClick={() => setStarting(true)}>
                            <PlusIcon /> New enquiry
                        </Button>
                    )}
                </div>
                {starting && (
                    <div className="flex gap-2">
                        <Input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={200}
                            placeholder="Why (optional), e.g. called for a June rental"
                            aria-label="Note"
                        />
                        <Button size="sm" onClick={start}>
                            Start
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setStarting(false)}>
                            Cancel
                        </Button>
                    </div>
                )}
                {!enquiries.data ? (
                    <Skeleton className="h-16" />
                ) : enquiries.data.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">No enquiry yet: one starts when the customer writes.</p>
                ) : (
                    <ul className="grid gap-2">
                        {enquiries.data.map((q) => (
                            <li key={q.id} className="grid gap-1" aria-label={`Enquiry ${q.number}`}>
                                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                                    <button
                                        type="button"
                                        className="font-semibold text-foreground underline-offset-2 hover:underline"
                                        onClick={() => setEnquiryId(enquiryId === q.id ? null : q.id)}
                                        aria-pressed={enquiryId === q.id}
                                        title="Show only this enquiry's history"
                                    >
                                        Enquiry {q.number}
                                        {q.current ? ' · current' : ''}
                                    </button>
                                    <span>
                                        Started {dateTime(q.started_at)} ({REASONS[q.start_reason]}) · {q.owner ? `Owner: ${q.owner.name}` : 'No owner yet'} ·{' '}
                                        {q.messages} messages
                                    </span>
                                    {q.imported && <Badge tone="grey">Imported</Badge>}
                                </div>
                                <EnquiryCard enquiry={q} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="grid gap-2" aria-label="History">
                <h3 className="text-[13.5px] font-semibold">
                    History
                    {enquiryId && ` · enquiry ${enquiries.data?.find((q) => q.id === enquiryId)?.number ?? ''}`}
                </h3>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
                    {GROUPS.map(([k, l]) => (
                        <Button
                            key={k || 'all'}
                            size="sm"
                            variant={group === k ? 'default' : 'ghost'}
                            className="h-7 px-2 text-[12px]"
                            aria-pressed={group === k}
                            onClick={() => setGroup(k)}
                        >
                            {l}
                        </Button>
                    ))}
                </div>
                {!timeline.data ? (
                    <Skeleton className="h-24" />
                ) : timeline.data.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">Nothing here yet.</p>
                ) : (
                    <ol className="grid gap-1.5" aria-label="Events">
                        {timeline.data.map((e) => (
                            <li key={e.id} className="grid grid-cols-[8.5rem_1fr] gap-2 text-[12.5px]">
                                <span className="text-muted-foreground tabular-nums">{dateTime(e.occurred_at)}</span>
                                <span className="min-w-0 break-words">
                                    {describe(e)}
                                    {messageHref(e) && can(P.InboxView) && (
                                        <>
                                            {' '}
                                            <Link href={messageHref(e) as string} className="text-primary underline-offset-2 hover:underline">
                                                Open message
                                            </Link>
                                        </>
                                    )}
                                    <span className="text-muted-foreground">
                                        {' '}
                                        · {who(e)}
                                        {e.enquiry_number ? ` · enquiry ${e.enquiry_number}` : ''}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
            </section>
        </div>
    );
}
