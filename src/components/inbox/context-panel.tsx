'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronRightIcon, ExternalLinkIcon, PencilIcon, PhoneIcon, PlusIcon, TriangleAlertIcon, TrophyIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ResizeHandle } from '@/components/app/resize-handle';
import { useSession } from '@/components/app/session';
import { useOpenContact } from '@/components/contacts/contact-sheet';
import { CloseEnquiryDialog, EnquiryEditDialog, invalidateEnquiry, useMoveEnquiry } from '@/components/contacts/enquiry-card';
import { RecordConsentDialog } from '@/components/contacts/record-consent-dialog';
import { SourceSection } from '@/components/growth/source-section';
import { ContactOrders } from '@/components/inbox/contact-orders';
import { Chip } from '@/components/inbox/conversation-list';
import { DealDetailsDialog, EditContactDialog, Kv, NewDealDialog, StepDialog } from '@/components/inbox/inbox-dialogs';
import { RingAvatar, TagChip } from '@/components/inbox/window-ring';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useStored } from '@/hooks/use-stored';
import { api, errorMessage } from '@/lib/api';
import { contactSource } from '@/lib/format';
import { dur, engageId, fmtDay, fmtMoney, fmtPhone, fmtWhen, nextDefault, STEP_TYPES } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import {
    type Assignee,
    keys,
    requestConsent,
    setCurrentEnquiry,
    updateContactRecord,
    useAssignees,
    useConversationEvents,
    useInboxTeams,
    useNextSteps,
    useResolutions,
    useStages,
    useTags,
    useWaitAlerts,
} from '@/lib/queries';
import type { Conversation, ConversationEvent, Enquiry, NextStep } from '@/lib/types';
import { cn } from '@/lib/utils';

const NO_TEAM = '__no_team__';

/** One line in plain words for a chat event (the timeline, Ownership and Activity). */
export function eventText(e: ConversationEvent): string {
    const d = e.data as Record<string, string | null | undefined>;
    const who = e.actor_name ?? (e.actor === 'customer' ? 'the customer' : 'Engage');
    switch (e.type) {
        case 'conversation.assigned':
            return d.to_name
                ? `Assigned to ${d.to_name}${e.actor_name ? ` by ${e.actor_name}` : ''}`
                : `Unassigned${e.actor_name ? ` by ${e.actor_name}` : ''}`;
        case 'conversation.resolved':
            return `Resolved by ${e.actor_name ?? 'the chatbot'} · ${d.reason_label ?? 'Resolved'}`;
        case 'conversation.reopened':
            return d.how === 'customer'
                ? 'Reopened by new customer message'
                : d.how === 'flag'
                  ? `Flagged for review and reopened${e.actor_name ? ` by ${e.actor_name}` : ''}`
                  : d.how === 'message'
                    ? 'Reopened by outgoing message'
                    : `Reopened by ${who}`;
        case 'conversation.snoozed':
            return `Snoozed by ${who} until ${d.until ? fmtWhen(d.until) : 'later'}`;
        case 'conversation.unsnoozed':
            return `Unsnoozed by ${who}`;
        case 'consent.changed':
            return `${d.action === 'opted_in' ? 'Opted in to marketing' : d.action === 'opted_out' ? 'Opted out of marketing' : 'Marketing consent changed'} · ${d.source_label ?? ''}`;
        case 'stage.changed':
            return `Deal moved to ${d.to ?? 'no stage'}${e.actor_name ? ` by ${e.actor_name}` : ''}`;
        case 'enquiry.started':
            return `Deal created · enquiry ${d.number ?? ''} · ${d.source_label ?? ''}`;
        case 'flow.ended':
            return `${d.flow ?? 'Chatbot'} ended`;
        case 'next_step.added':
            return `Next step set · ${d.type_label ?? ''} · ${d.due_at ? fmtWhen(d.due_at) : ''}`;
        case 'next_step.done':
            return `Next step done · ${d.type_label ?? ''}`;
        case 'next_step.cancelled':
            return `Task cancelled · ${d.type_label ?? ''}`;
        default:
            return e.type.replace(/[._]/g, ' ');
    }
}
export const isDealEvent = (t: string) => t.startsWith('stage.') || t.startsWith('enquiry.') || t.startsWith('next_step.');

function Section({ title, badge, open = false, children }: { title: string; badge?: React.ReactNode; open?: boolean; children: React.ReactNode }) {
    return (
        <details open={open} className="group border-b">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold select-none">
                {title}
                {badge}
                <ChevronRightIcon className="ml-auto size-[15px] text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
            </summary>
            <div className="grid gap-1 px-4 pb-4 text-[13px]">{children}</div>
        </details>
    );
}

/**
 * The customer context panel (3.5) beside the chat: contact details, the Sales card, tags, ownership,
 * marketing consent, resolution history and activity. Hidden with the panel button; on narrow screens it
 * opens over the chat.
 */
export function ContextPanel({ conversation: c, open, onClose, now }: { conversation: Conversation; open: boolean; onClose: () => void; now: number }) {
    const [width, setWidth] = useStored<number>('engage.inbox.panel-width', 304);
    // One copy of the panel: beside the chat on wide screens, over it on narrow ones.
    const wide = useMediaQuery('(min-width: 1280px)');
    const body = <PanelBody c={c} now={now} onClose={onClose} />;

    return (
        <>
            {open && (
                <ResizeHandle
                    className="hidden xl:block"
                    label="Resize the customer panel"
                    direction="left"
                    width={width}
                    min={280}
                    max={480}
                    onResize={setWidth}
                    onReset={() => setWidth(304)}
                />
            )}
            {open && wide && (
                <aside
                    className="hidden h-full min-h-0 w-(--panel-width) shrink-0 overflow-y-auto border-l bg-card xl:block"
                    style={{ '--panel-width': `${width}px` } as React.CSSProperties}
                    aria-label="Customer context"
                >
                    {body}
                </aside>
            )}
            {open && !wide && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/30 xl:hidden" onClick={onClose}>
                    <aside
                        className="h-full w-full max-w-sm overflow-y-auto bg-card shadow-raised"
                        aria-label="Customer context"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {body}
                    </aside>
                </div>
            )}
        </>
    );
}

function PanelBody({ c, now, onClose }: { c: Conversation; now: number; onClose: () => void }) {
    const { can, membership } = useSession();
    const qc = useQueryClient();
    const contact = c.contact;
    const openContact = useOpenContact();
    const assignees = useAssignees(c.id, true);
    const teams = useInboxTeams();
    const events = useConversationEvents(c.id);
    const closures = useResolutions({ conversation_id: c.id, days: 0 });
    const tags = useTags(true);
    const [editing, setEditing] = useState(false);
    const [recording, setRecording] = useState<'opted_in' | 'opted_out' | null>(null);
    const refresh = () => {
        void qc.invalidateQueries({ queryKey: keys.conversation(c.id) });
        void qc.invalidateQueries({ queryKey: keys.conversationsAll });
        void qc.invalidateQueries({ queryKey: ['inbox', 'events', c.id] });
    };
    const ask = useMutation({
        mutationFn: () => requestConsent(c.id),
        onSuccess: () => {
            toast.success('Opt-in request sent · consent changes only if the customer taps Yes');
            refresh();
            void qc.invalidateQueries({ queryKey: keys.thread(c.id) });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
    if (!contact) return null;
    const saved = !!contact.name;
    const team = (teams.data ?? []).find((t) => t.id === c.assigned_team_id);
    const consent =
        contact.consent_state === 'opted_in'
            ? (['good', 'Opted in'] as const)
            : contact.consent_state === 'opted_out'
              ? (['bad', 'Opted out'] as const)
              : (['grey', 'Unknown'] as const);
    const canAsk = (c.window.replies_allowed ?? c.window.open) && contact.consent_state !== 'opted_out';
    const assignments = (events.data ?? [])
        .filter((e) => e.type === 'conversation.assigned')
        .slice(-4)
        .reverse();
    const activity = (events.data ?? []).slice(-6).reverse();
    const setTags = async (next: string[]) => {
        try {
            await updateContactRecord(contact.id, { tags: next });
            refresh();
            void qc.invalidateQueries({ queryKey: ['contacts'] });
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    return (
        <div>
            <div className="flex items-start gap-3 border-b px-4 py-4">
                <RingAvatar name={contact.display_name} expiresAt={c.window.expires_at} className="size-12 text-[15px]" now={now} />
                <div className="min-w-0 flex-1">
                    <b className="block truncate text-[17px] font-semibold" dir="auto">
                        {contact.display_name}
                    </b>
                    <span className="block truncate text-[13px] text-muted-foreground">
                        {contact.phone ? fmtPhone(contact.phone) : contact.username ? `@${contact.username} · number hidden` : 'Number hidden by customer'}
                    </span>
                    {!saved && (
                        <span className="block text-[11px] text-warn">
                            {contact.profile_name ? 'From WhatsApp profile · not saved' : 'No name'}
                            {contact.profile_name && can(P.ContactsUpdate) && (
                                <>
                                    {' · '}
                                    <button
                                        type="button"
                                        className="font-semibold underline-offset-2 hover:underline"
                                        onClick={async () => {
                                            await updateContactRecord(contact.id, { name: contact.profile_name });
                                            refresh();
                                            toast.success('Name saved to contact');
                                        }}
                                    >
                                        Save name
                                    </button>
                                </>
                            )}
                        </span>
                    )}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Hide panel" title="Hide panel">
                    <XIcon />
                </Button>
            </div>

            <Section title="Contact details">
                <Kv k="Saved name" v={contact.name ?? <span className="text-faint">Not set</span>} />
                {contact.profile_name && contact.profile_name !== contact.name && <Kv k="WhatsApp profile" v={contact.profile_name} />}
                <Kv k="Company" v={contact.company ?? <span className="text-faint">Not set</span>} />
                <Kv k="Email" v={contact.email ?? <span className="text-faint">Not set</span>} />
                <Kv k="Original source" v={contactSource(contact.source, contact.source_detail)} />
                <Kv k="engageX ID" v={<span className="font-mono text-[11px]">{engageId(contact.id)}</span>} />
                <Kv k="WhatsApp user ID" v={<span className="font-mono text-[11px]">{contact.bsuid ?? '—'}</span>} />
                <Kv k="Phone" v={contact.phone ? fmtPhone(contact.phone) : <span className="text-faint">Hidden by customer</span>} />
                {contact.username && <Kv k="WhatsApp username" v={`@${contact.username}`} />}
                <Kv k="Via" v={c.phone_number?.verified_name ?? c.phone_number?.display_phone_number ?? '—'} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {can(P.ContactsUpdate) && (
                        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                            <PencilIcon /> Edit contact
                        </Button>
                    )}
                    {can(P.ContactsView) && (
                        <Button size="sm" variant="outline" onClick={() => openContact(contact)}>
                            <ExternalLinkIcon /> Open in CRM
                        </Button>
                    )}
                </div>
                <div className="-mx-4 mt-2">
                    <SourceSection contact={contact} />
                </div>
            </Section>

            {can(P.ContactsView) && <SalesCard c={c} now={now} owners={(assignees.data ?? []).filter((a) => a.can_access)} />}

            <Section title="Tags" badge={<Chip>{contact.tags.length}</Chip>}>
                <span className="flex flex-wrap gap-1">
                    {contact.tags.map((t) => (
                        <TagChip key={t} tag={t} onRemove={can(P.ContactsUpdate) ? () => void setTags(contact.tags.filter((x) => x !== t)) : undefined} />
                    ))}
                    {can(P.ContactsUpdate) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="inline-flex h-[22px] items-center rounded-full border border-dashed px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                                >
                                    + Tag
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-72 w-48 overflow-y-auto">
                                <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                                    Add tag
                                </DropdownMenuLabel>
                                {(tags.data ?? [])
                                    .filter((t) => !contact.tags.includes(t.name))
                                    .map((t) => (
                                        <DropdownMenuItem key={t.name} onSelect={() => void setTags([...contact.tags, t.name])}>
                                            {t.name}
                                        </DropdownMenuItem>
                                    ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </span>
            </Section>

            <Section title="Ownership" open>
                <Kv k="Assigned to" v={c.assigned_name ?? <Chip>Unassigned</Chip>} />
                {((teams.data ?? []).length > 0 || c.assigned_team_id) && (
                    <div className="flex items-center justify-between gap-2 py-1">
                        <span className="text-muted-foreground">Team</span>
                        {can(P.InboxAssign) ? (
                            <Select
                                value={c.assigned_team_id ?? NO_TEAM}
                                onValueChange={async (v) => {
                                    try {
                                        await api(`conversations/${c.id}`, { method: 'PATCH', body: { assigned_team_id: v === NO_TEAM ? null : v } });
                                        refresh();
                                    } catch (e) {
                                        toast.error(errorMessage(e));
                                    }
                                }}
                            >
                                <SelectTrigger size="sm" className="w-40" aria-label="Team">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_TEAM}>No team</SelectItem>
                                    {(teams.data ?? []).map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <span>{team?.name ?? 'No team'}</span>
                        )}
                    </div>
                )}
                <ol className="mt-1 grid gap-1.5 border-l-2 border-line-2 pl-3">
                    {assignments.length === 0 && <li className="text-muted-foreground">No assignment changes yet</li>}
                    {assignments.map((e) => (
                        <li key={e.id}>
                            {eventText(e)}
                            <small className="block text-[11px] text-muted-foreground">{fmtWhen(e.at, now)}</small>
                        </li>
                    ))}
                </ol>
            </Section>

            <Section title="Marketing consent" badge={<Chip tone={consent[0]}>{consent[1]}</Chip>}>
                <Kv k="Status" v={consent[1]} />
                {contact.consent_requested_at && contact.consent_state !== 'opted_in' && <Kv k="Asked" v={fmtWhen(contact.consent_requested_at, now)} />}
                {contact.marketing_opted_out && <p className="rounded-md bg-warn-bg px-2.5 py-1.5 text-warn">Stopped marketing messages on WhatsApp.</p>}
                {contact.consent_state !== 'opted_in' && can(P.InboxReply) && (
                    <>
                        <Button size="sm" variant="outline" className="mt-1 w-fit" disabled={!canAsk || ask.isPending} onClick={() => ask.mutate()}>
                            {ask.isPending ? 'Sending…' : 'Ask for marketing opt-in'}
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                            {contact.consent_state === 'opted_out'
                                ? 'Customer opted out. Only they can opt back in, by messaging START.'
                                : canAsk
                                  ? 'Sends an interactive opt-in button. Consent changes only when the customer taps it.'
                                  : 'Unavailable: needs an open service window because it uses an interactive message.'}
                        </p>
                    </>
                )}
                {can(P.ContactsUpdate) && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                        {contact.consent_state !== 'opted_in' && (
                            <Button size="sm" variant="ghost" onClick={() => setRecording('opted_in')}>
                                Consent given elsewhere…
                            </Button>
                        )}
                        {contact.consent_state !== 'opted_out' && (
                            <Button size="sm" variant="ghost" onClick={() => setRecording('opted_out')}>
                                Record opt-out
                            </Button>
                        )}
                    </span>
                )}
                <RecordConsentDialog
                    contact={contact}
                    open={recording !== null}
                    onOpenChange={(o) => {
                        if (!o) setRecording(null);
                        refresh();
                    }}
                    initialState={recording ?? 'opted_in'}
                    conversationId={c.id}
                />
            </Section>

            <Section title="Resolution history" badge={<Chip>{closures.data?.length ?? 0}</Chip>} open={c.status === 'closed'}>
                <ol className="grid gap-2">
                    {(closures.data ?? []).length === 0 && <li className="text-muted-foreground">Never resolved</li>}
                    {(closures.data ?? []).map((r) => (
                        <li key={r.id}>
                            <b className="font-semibold">{r.reason_label}</b> by {r.resolved_by?.name.split(' ')[0] ?? 'the chatbot'}
                            <small className="block text-[11px] text-muted-foreground">
                                {fmtWhen(r.resolved_at, now)}
                                {r.reopened_at
                                    ? ` · ${r.reopen_how === 'flag' ? 'flagged and reopened' : r.reopen_how === 'customer' ? 'reopened by customer message' : `reopened by ${r.reopened_by?.name.split(' ')[0] ?? 'a teammate'}`} ${fmtWhen(r.reopened_at, now)}`
                                    : ' · still resolved'}
                            </small>
                            {r.flag && (
                                <small className="block text-[11px] text-bad">
                                    {r.flag.by.name.split(' ')[0]}: {r.flag.note}
                                </small>
                            )}
                        </li>
                    ))}
                </ol>
            </Section>

            <WaitAlertsSection conversationId={c.id} now={now} />

            <Section title="Activity">
                <ol className="grid gap-1.5 border-l-2 border-line-2 pl-3">
                    {activity.length === 0 && <li className="text-muted-foreground">No activity yet</li>}
                    {activity.map((e) => (
                        <li key={e.id}>
                            {eventText(e)}
                            <small className="block text-[11px] text-muted-foreground">{fmtWhen(e.at, now)}</small>
                        </li>
                    ))}
                </ol>
            </Section>
            <ContactOrders contactId={contact.id} />
            {editing && <EditContactDialog contact={contact} open onOpenChange={setEditing} />}
            {membership && null}
        </div>
    );
}

/**
 * The Sales card (3.5): what the customer wants, what it is worth, and what happens next. Tap a stage dot to
 * move the deal; Won and Lost ask what they need. Edits save to the same deal used in Contacts & CRM and
 * never change the chat, its reply state or the WhatsApp window.
 */
function SalesCard({ c, now, owners }: { c: Conversation; now: number; owners: Assignee[] }) {
    const { can, membership } = useSession();
    const qc = useQueryClient();
    const contact = c.contact!;
    const openContact = useOpenContact();
    const deals = useQuery({
        queryKey: ['contacts', contact.id, 'enquiries'],
        queryFn: () => api<{ data: Enquiry[] }>(`contacts/${contact.id}/enquiries`).then((r) => r.data),
    });
    const steps = useNextSteps(contact.id);
    const stages = useStages(true);
    const all = deals.data ?? [];
    const d = all.find((e) => e.current) ?? null;
    const others = all.filter((x) => x !== d).sort((a, b) => Number(b.open) - Number(a.open));
    const open = (steps.data ?? []).filter((s) => s.status === 'open').sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
    const main = open.find((s) => (d ? s.enquiry_id === d.id : !s.enquiry_id)) ?? null;
    const extra = open.filter((s) => s !== main);
    const pipe = useMemo(() => {
        const list = (stages.data ?? []).filter((s) => !s.archived);
        const openOnes = list.filter((s) => (s.group ?? 'open') === 'open').sort((a, b) => a.position - b.position);
        const won = list.find((s) => s.group === 'won');

        return [...openOnes, ...(won ? [won] : [])];
    }, [stages.data]);
    const lostStage = (stages.data ?? []).find((s) => s.group === 'lost' && !s.archived) ?? null;
    const wonStage = pipe.find((s) => s.group === 'won') ?? null;
    const [closing, setClosing] = useState<(typeof pipe)[number] | null>(null);
    const [newDeal, setNewDeal] = useState(false);
    const [editDeal, setEditDeal] = useState(false);
    const [viewing, setViewing] = useState<Enquiry | null>(null);
    const [step, setStep] = useState<{ step?: NextStep | null; type?: string | null } | null>(null);
    const burstRef = useRef<HTMLDivElement>(null);
    const move = useMoveEnquiry(d ?? ({ contact_id: contact.id, id: '', stage_version: 0 } as Enquiry), 'chat');
    const refreshAll = () => invalidateEnquiry(qc, contact.id);
    const canEdit = can(P.ContactsUpdate);
    const canMove = can(P.StagesChange) || can(P.InboxReply);

    const goStage = async (st: (typeof pipe)[number]) => {
        if (!d || d.stage?.id === st.id || !canMove) return;
        if ((st.group ?? 'open') !== 'open') return setClosing(st);
        try {
            await move.mutateAsync({ stageId: st.id });
            toast.success(`Moved to ${st.name} · saved to Contacts & CRM`);
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    const quickStep = async (type: string) => {
        try {
            const at = nextDefault(type);
            await api(`contacts/${contact.id}/next-steps`, {
                method: 'POST',
                body: {
                    type,
                    title: STEP_TYPES.find((t) => t.id === type)?.label ?? 'Follow up',
                    due_at: at.toISOString(),
                    enquiry_id: d?.id ?? null,
                    assigned_membership_id: d?.owner?.id ?? c.assigned_membership_id ?? membership.id,
                },
            });
            refreshAll();
            void qc.invalidateQueries({ queryKey: ['inbox', 'events'] });
            toast.success(`${STEP_TYPES.find((t) => t.id === type)?.label} · ${fmtWhen(at.toISOString())} · saved to Follow-ups & Alerts`);
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    const stepDone = async (s: NextStep) => {
        try {
            await api(`next-steps/${s.id}`, { method: 'PATCH', body: { status: 'done' } });
            refreshAll();
            void qc.invalidateQueries({ queryKey: ['inbox', 'events'] });
            toast.success('Next step marked done');
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    const workOn = async (x: Enquiry) => {
        try {
            await setCurrentEnquiry(contact.id, x.id);
            setViewing(null);
            refreshAll();
            toast.success(`Sales card now shows “${x.title ?? `Enquiry ${x.number}`}” · the chat is unchanged`);
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    useEffect(() => {
        // A real Won: one small tick burst on the card.
        const el = burstRef.current;
        if (!el || !d || d.group !== 'won') return;
    }, [d]);

    const stepBox = (s: NextStep, labelText: string) => {
        const over = new Date(s.due_at).getTime() < now;

        return (
            <div className={cn('rounded-lg border px-3 py-2.5', over ? 'border-bad/40 bg-bad-bg' : 'bg-muted/40')}>
                <p className={cn('text-[11px] font-semibold tracking-[0.06em] uppercase', over ? 'text-bad' : 'text-muted-foreground')}>
                    {over ? (
                        <>
                            <TriangleAlertIcon className="mr-1 inline size-3" />
                            Overdue
                        </>
                    ) : (
                        labelText
                    )}
                </p>
                <b className="block text-[13px] font-semibold">
                    {s.type_label} · {fmtWhen(s.due_at, now)}
                </b>
                <p className="text-[11px] text-muted-foreground">
                    {s.assigned?.name.split(' ')[0] ?? ''}
                    {over ? ` · ${dur(now - new Date(s.due_at).getTime())} late` : ''}
                    {s.title && s.title !== s.type_label ? ` · ${s.title}` : ''}
                </p>
                {canEdit && (
                    <span className="mt-2 flex gap-1.5">
                        <Button size="sm" onClick={() => void stepDone(s)}>
                            <CheckIcon /> Done
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setStep({ step: s })}>
                            Reschedule
                        </Button>
                    </span>
                )}
            </div>
        );
    };
    const extraList = extra.length > 0 && (
        <div className="mt-3 border-t pt-2.5">
            <p className="mb-1.5 text-[11px] text-muted-foreground">Also open for this customer</p>
            {extra.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-1">
                    <span className="min-w-0 flex-1">
                        <b className={cn('block text-[13px] font-semibold', new Date(s.due_at).getTime() < now && 'text-bad')}>
                            {s.type_label} · {fmtWhen(s.due_at, now)}
                        </b>
                        <small className="block truncate text-[11px] text-muted-foreground">
                            {s.enquiry_id ? (all.find((x) => x.id === s.enquiry_id)?.title ?? 'A deal') : 'Customer task, no deal'} ·{' '}
                            {s.assigned?.name.split(' ')[0] ?? ''}
                        </small>
                    </span>
                    {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => void stepDone(s)}>
                            <CheckIcon /> Done
                        </Button>
                    )}
                </div>
            ))}
        </div>
    );
    const othersList = others.length > 0 && (
        <div className="mt-3 border-t pt-2.5">
            <p className="mb-1.5 text-[11px] text-muted-foreground">{d ? 'Other deals' : 'Deals'} for this customer</p>
            {others.map((x) => (
                <div key={x.id} className="grid gap-1.5 py-1.5">
                    <span className="min-w-0">
                        <b className="block truncate text-[13px] font-semibold" dir="auto">
                            {x.title ?? `Enquiry ${x.number}`}
                        </b>
                        <small className="block truncate text-[11px] text-muted-foreground">
                            {x.stage?.name ?? 'No stage'} · {fmtMoney(x.value, x.value_period)}
                        </small>
                    </span>
                    <span className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => setViewing(x)}>
                            View details
                        </Button>
                        {x.open && canEdit && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => void workOn(x)}>
                                Work on this
                            </Button>
                        )}
                    </span>
                </div>
            ))}
        </div>
    );

    const idx = d ? pipe.findIndex((s) => s.id === d.stage?.id) : -1;
    const lost = d?.group === 'lost';

    return (
        <div className="m-3 overflow-hidden rounded-lg border border-brand-500/40 bg-card">
            <div className="flex items-center gap-1.5 bg-brand-50 px-3.5 py-2 text-[11px] font-semibold tracking-[0.06em] text-brand-600 uppercase">
                {d ? 'Sales' : 'Sales & follow-ups'}
                <span className="flex-1" />
                {d && canEdit && (
                    <>
                        <button
                            type="button"
                            className="text-[12px] font-semibold tracking-normal normal-case hover:underline"
                            onClick={() => setNewDeal(true)}
                        >
                            + New deal
                        </button>
                        <span aria-hidden>·</span>
                        <button
                            type="button"
                            className="text-[12px] font-semibold tracking-normal normal-case hover:underline"
                            onClick={() => setEditDeal(true)}
                        >
                            Edit
                        </button>
                    </>
                )}
            </div>
            <div ref={burstRef} className="relative px-3.5 py-3">
                {!d ? (
                    <>
                        <p className="text-[13px]">
                            <b className="block font-semibold">No deal linked</b>
                            <span className="text-muted-foreground">Fine for support or general questions.</span>
                        </p>
                        {main && <div className="mt-2.5">{stepBox(main, 'Next step · customer task')}</div>}
                        {canEdit && (
                            <span className="mt-2.5 flex flex-wrap gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => setNewDeal(true)}>
                                    <PlusIcon /> Create deal
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setStep({})}>
                                    <PlusIcon /> Add follow-up
                                </Button>
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        <b className="block text-[13px] font-semibold" dir="auto">
                            {d.title ?? `Enquiry ${d.number}`}
                        </b>
                        <p className="mb-3 text-[17px] font-semibold tabular-nums">
                            {d.value === null ? (
                                canEdit ? (
                                    <button type="button" className="text-[13px] text-brand-600 hover:underline" onClick={() => setEditDeal(true)}>
                                        + Add value
                                    </button>
                                ) : (
                                    <span className="text-[13px] text-muted-foreground">Value not set</span>
                                )
                            ) : (
                                fmtMoney(d.value, d.value_period)
                            )}
                        </p>
                        <ol className={cn('relative mb-2 flex', lost && 'opacity-40')} aria-label="Deal stage">
                            <span aria-hidden className="absolute top-[7px] right-[10%] left-[10%] h-0.5 bg-line-2" />
                            {pipe.map((st, i) => {
                                const done = !lost && idx >= 0 && i < idx;
                                const on = i === idx;

                                return (
                                    <li key={st.id} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => void goStage(st)}
                                            disabled={!canMove}
                                            title={`Move to ${st.name}`}
                                            aria-current={on ? 'step' : undefined}
                                            className={cn(
                                                'relative z-[1] size-4 rounded-full border-2 bg-card transition-[background,border-color,box-shadow] duration-150 hover:border-brand-500 motion-reduce:transition-none',
                                                done && 'border-brand-500 bg-brand-500',
                                                on && 'border-brand-500 shadow-[inset_0_0_0_3px_var(--brand-500),0_0_0_4px_rgba(104,157,15,.15)]',
                                                !done && !on && 'border-[#d6d3d1]',
                                            )}
                                        />
                                        <span className={cn('max-w-full truncate text-[11px]', on ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                                            {st.name}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                        {!lost && d.group !== 'won' && canMove && (
                            <>
                                {/* Booked / Not booked: shortcuts to the Won and Lost stages (pilot kit). Won still needs proof. */}
                                <span className="mb-1.5 flex gap-1.5">
                                    {wonStage && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1"
                                            onClick={() => setClosing(wonStage)}
                                            title={`Moves the deal to ${wonStage.name}`}
                                        >
                                            <CheckIcon /> Booked
                                        </Button>
                                    )}
                                    {lostStage && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1"
                                            onClick={() => setClosing(lostStage)}
                                            title={`Moves the deal to ${lostStage.name}`}
                                        >
                                            Not booked
                                        </Button>
                                    )}
                                </span>
                                <p className="mb-2.5 text-center text-[11px] text-muted-foreground">or tap a stage to move the deal</p>
                            </>
                        )}
                        {d.group === 'won' ? (
                            main ? (
                                stepBox(main, 'Next step · after the win')
                            ) : (
                                <p className="rounded-lg border border-good/30 bg-good-bg px-3 py-2.5 text-[13px] font-semibold text-good">
                                    <TrophyIcon className="mr-1 inline size-[15px]" /> Won{d.expected_close_on ? ` · ${fmtDay(d.expected_close_on, now)}` : ''}.
                                </p>
                            )
                        ) : lost ? (
                            <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-[13px]">
                                Marked as lost.{' '}
                                {canMove && pipe[1] && (
                                    <button
                                        type="button"
                                        className="font-semibold text-brand-600 hover:underline"
                                        onClick={() => void goStage(pipe[Math.min(1, pipe.length - 1)])}
                                    >
                                        Reopen
                                    </button>
                                )}
                            </p>
                        ) : main ? (
                            stepBox(main, 'Next step')
                        ) : (
                            <div className="rounded-lg border border-warn/40 bg-warn-bg px-3 py-2.5">
                                <p className="text-[13px] font-semibold">No next step yet</p>
                                <p className="mb-2 text-[11px] text-muted-foreground">What should happen next with this customer?</p>
                                {canEdit && (
                                    <span className="flex flex-wrap gap-1">
                                        <QuickChip onClick={() => void quickStep('call')}>
                                            <PhoneIcon className="size-3" /> Call · in 2h
                                        </QuickChip>
                                        <QuickChip onClick={() => void quickStep('message')}>Follow up · tomorrow</QuickChip>
                                        <QuickChip onClick={() => void quickStep('quote')}>Send quote · tomorrow</QuickChip>
                                        <QuickChip onClick={() => setStep({})}>Pick a time…</QuickChip>
                                    </span>
                                )}
                            </div>
                        )}
                    </>
                )}
                {extraList}
                {othersList}
                {d && (
                    <div className="mt-3 flex items-center gap-2 border-t pt-2.5 text-[11px] text-muted-foreground">
                        <span className="min-w-0 flex-1 truncate">
                            {d.owner?.name.split(' ')[0] ?? 'No owner'} · {d.source_label}
                            {d.expected_close_on && d.open ? ` · closes ${fmtDay(d.expected_close_on, now)}` : ''}
                        </span>
                        <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => openContact(contact)}>
                            CRM ↗
                        </button>
                    </div>
                )}
            </div>
            {newDeal && (
                <NewDealDialog contact={contact} open onOpenChange={setNewDeal} owners={owners} defaultOwner={c.assigned_membership_id ?? membership.id} />
            )}
            {d && editDeal && <EnquiryEditDialog enquiry={d} open onOpenChange={setEditDeal} />}
            {d && closing && (
                <CloseEnquiryDialog enquiry={d} stage={closing} open onOpenChange={(o) => !o && setClosing(null)} onWon={() => burst(burstRef.current)} />
            )}
            <DealDetailsDialog deal={viewing} onClose={() => setViewing(null)} onWorkOn={(x) => void workOn(x)} current={viewing?.id === d?.id} />
            {step && (
                <StepDialog
                    contactId={contact.id}
                    deals={all}
                    currentDealId={d?.id ?? null}
                    step={step.step}
                    presetType={step.type}
                    open
                    onOpenChange={(o) => !o && setStep(null)}
                    owners={owners}
                    defaultOwner={d?.owner?.id ?? c.assigned_membership_id ?? membership.id}
                />
            )}
        </div>
    );
}

function QuickChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex h-[26px] items-center gap-1 rounded-full border bg-card px-2.5 text-[12px] font-semibold text-ink-2 hover:bg-muted"
        >
            {children}
        </button>
    );
}

/** One small green tick burst (450ms) on a card that was just won; nothing with reduce motion on. */
export function burst(el: HTMLElement | null) {
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const b = document.createElement('span');
    b.setAttribute('aria-hidden', 'true');
    b.className = 'pointer-events-none absolute left-1/2 top-1/2 z-10';
    b.innerHTML =
        Array.from(
            { length: 8 },
            (_, i) =>
                `<i style="position:absolute;left:-1px;top:-1px;width:2px;height:8px;border-radius:2px;background:var(--good);transform-origin:1px 1px;--a:${i * 45}deg;animation:won-ray 450ms cubic-bezier(.2,.8,.2,1) forwards"></i>`,
        ).join('') +
        '<span style="position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;background:var(--good);color:#fff;display:flex;align-items:center;justify-content:center;animation:won-pop 450ms cubic-bezier(.2,.8,.2,1) forwards"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg></span>';
    el.appendChild(b);
    setTimeout(() => b.remove(), 700);
}

const ROLE_LABEL = { agent: 'Assigned agent', manager: 'Managers', owner: 'Owner' } as const;
const CHANNEL_LABEL = { app: 'in-app', email: 'email', whatsapp: 'WhatsApp' } as const;

/** The reply promise's alert log for this chat: who was told at 30, 45 and 60 minutes, and how. */
function WaitAlertsSection({ conversationId, now }: { conversationId: string; now: number }) {
    const alerts = useWaitAlerts(conversationId);
    const rows = alerts.data ?? [];

    return (
        <Section title="Wait alerts" badge={<Chip tone={rows.length ? 'bad' : 'grey'}>{rows.length}</Chip>} open={rows.length > 0}>
            <ol className="grid gap-1.5 border-l-2 border-bad/40 pl-3">
                {rows.length === 0 && <li className="text-muted-foreground">No alerts for this chat</li>}
                {rows.map((a) => (
                    <li key={a.id}>
                        {a.minutes} min → {a.recipients.map((r) => r.name?.split(' ')[0] ?? 'Teammate').join(', ') || ROLE_LABEL[a.role]}
                        <small className="block text-[11px] text-muted-foreground">
                            {fmtWhen(a.created_at, now)} · {a.channels.map((x) => CHANNEL_LABEL[x]).join(' + ')}
                            {a.whatsapp_error && a.role === 'owner' ? ` · WhatsApp not sent: ${a.whatsapp_error}` : ''}
                        </small>
                    </li>
                ))}
            </ol>
        </Section>
    );
}
