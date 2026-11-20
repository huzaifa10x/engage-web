'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, MessageCircleIcon, PlusIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { ContactTimeline, describe, type TimelineEntry } from '@/components/contacts/contact-timeline';
import { Chip, useNow } from '@/components/inbox/conversation-list';
import { NewDealDialog, StepDialog } from '@/components/inbox/inbox-dialogs';
import { RingAvatar } from '@/components/inbox/window-ring';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { engageId, fmtDay, fmtMoney, fmtPhone, fmtWhen } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import { useContactChanges, useContactDuplicates, useConversationNotes, useCrmSync, useNextSteps, useThread } from '@/lib/queries';
import type { Contact, Enquiry } from '@/lib/types';
import { cn } from '@/lib/utils';

import { consentLabel, consentTone, FieldGroups, Kv, LifeBar, LifePill, RBox, useSyncState, useTeamOwners } from './crm-fields';

export type RecordNav = { index: number; total: number; prev: (() => void) | null; next: (() => void) | null };

const dealTone = (d: Enquiry) => (d.group === 'won' ? 'good' : d.group === 'lost' ? 'grey' : 'info') as 'good' | 'grey' | 'info';
const windowFor = (c: Contact) =>
    c.chat?.window_expires_at ?? (c.last_inbound_at ? new Date(new Date(c.last_inbound_at).getTime() + 86_400_000).toISOString() : null);

export function useDeals(contactId: string) {
    return useQuery({
        queryKey: ['contacts', contactId, 'enquiries'],
        queryFn: () => api<{ data: Enquiry[] }>(`contacts/${contactId}/enquiries`).then((r) => r.data),
    });
}

type Act = { at: string; kind: 'in' | 'out' | 'note' | 'ev'; text: string };

/** Messages, notes and record events, newest first (Activity). */
function useActivity(c: Contact, limit: number): Act[] {
    const chatId = c.chat?.id ?? null;
    const thread = useThread(chatId);
    const notes = useConversationNotes(chatId);
    const timeline = useQuery({
        queryKey: ['contacts', c.id, 'timeline', 'record'],
        queryFn: () => api<{ data: TimelineEntry[] }>(`contacts/${c.id}/timeline`, { query: { per_page: 40 } }).then((r) => r.data),
    });

    return useMemo(() => {
        const out: Act[] = [];
        for (const m of thread.data?.pages[0]?.data ?? []) {
            if (!m.timestamp) continue;
            const text = (m.body ?? m.template?.rendered?.body ?? (m.template?.name ? `Template · ${m.template.name}` : `${m.type} message`)).replace(
                /\s+/g,
                ' ',
            );
            const short = text.length > 110 ? `${text.slice(0, 110)}…` : text;
            const who = m.direction === 'inbound' ? c.display_name : m.origin === 'automation' ? 'Automation' : 'Agent';
            out.push({ at: m.timestamp, kind: m.direction === 'inbound' ? 'in' : 'out', text: `${who}: ${short}` });
        }
        for (const n of notes.data ?? []) if (n.created_at) out.push({ at: n.created_at, kind: 'note', text: `Note · ${n.author}: ${n.body.slice(0, 110)}` });
        for (const e of timeline.data ?? []) {
            if (chatId && (e.type === 'message.received' || e.type === 'message.sent')) continue;
            out.push({ at: e.occurred_at, kind: 'ev', text: `${describe(e)}${e.actor_name ? ` · ${e.actor_name}` : ''}` });
        }

        return out.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, limit);
    }, [thread.data, notes.data, timeline.data, chatId, c.display_name, limit]);
}

function ActivityList({ items, now }: { items: Act[]; now: number }) {
    if (items.length === 0) return <p className="text-[12px] text-muted-foreground">No activity yet</p>;

    return (
        <ol className="flex flex-col gap-2">
            {items.map((x, i) => (
                <li
                    key={i}
                    className={cn(
                        'border-l-2 pl-2.5 text-[13px] leading-snug [overflow-wrap:anywhere]',
                        x.kind === 'in' ? 'border-brand-500' : x.kind === 'note' ? 'border-[#d4a72c]' : 'border-border',
                        x.kind === 'ev' && 'text-muted-foreground',
                    )}
                    dir="auto"
                >
                    <small className="block text-[11px] text-faint">{fmtWhen(x.at, now)}</small>
                    {x.kind === 'in' ? '💬 ' : x.kind === 'out' ? '↗ ' : x.kind === 'note' ? '🔒 ' : ''}
                    {x.text}
                </li>
            ))}
        </ol>
    );
}

function DealRows({ deals, now, codes }: { deals: Enquiry[]; now: number; codes?: Map<string, { hubspot: string; zoho: string }> }) {
    if (deals.length === 0) return <p className="text-[12px] text-muted-foreground">No deals. Support contacts don’t need one.</p>;

    return (
        <>
            {deals.map((d) => (
                <div key={d.id} className="mb-1.5 rounded-lg border border-line-2 px-2.5 py-2 text-[13px]">
                    <div className="flex items-center gap-1.5">
                        <b className="min-w-0 flex-1 truncate font-semibold" dir="auto">
                            {d.title ?? `Enquiry ${d.number}`}
                        </b>
                        <Chip tone={dealTone(d)}>{d.stage?.name ?? 'No stage'}</Chip>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                        {fmtMoney(d.value, d.value_period)} · {d.owner?.name.split(' ')[0] ?? 'No owner'}
                        {codes
                            ? ` · ${d.source_label || 'Unattributed'}`
                            : d.expected_close_on && d.open
                              ? ` · closes ${fmtDay(d.expected_close_on, now)}`
                              : ''}
                    </p>
                    {codes && d.stage && codes.get(d.stage.id) && (
                        <p className="text-[12px] text-muted-foreground">
                            HubSpot dealstage: <code className="rounded bg-muted px-1 font-mono text-[11px]">{codes.get(d.stage.id)?.hubspot}</code> · Zoho:{' '}
                            <code className="rounded bg-muted px-1 font-mono text-[11px]">{codes.get(d.stage.id)?.zoho}</code>
                        </p>
                    )}
                </div>
            ))}
        </>
    );
}

function ChangeList({ contactId, limit, now }: { contactId: string; limit: number; now: number }) {
    const rows = (useContactChanges(contactId).data ?? []).slice(0, limit);
    if (rows.length === 0) return <p className="text-[12px] text-muted-foreground">No field changes yet. Every edit is recorded here with who made it.</p>;

    return (
        <>
            {rows.map((a) => (
                <div key={a.id} className="border-b border-line-2 py-1.5 text-[13px] [overflow-wrap:anywhere] last:border-b-0">
                    <div>
                        <b className="font-semibold">{a.label}</b> <span className="text-muted-foreground">{a.from ?? '—'}</span> → {a.to ?? '—'}
                    </div>
                    <small className="mt-0.5 block text-[11px] text-faint">
                        {a.by?.name ?? (a.source === 'system' ? 'Automation' : 'Engage')} · {fmtWhen(a.at, now)}
                    </small>
                </div>
            ))}
        </>
    );
}

/** What the record's buttons do: open/start the chat, add a deal or a task. */
function useRecordActions(c: Contact) {
    const router = useRouter();
    const [dialog, setDialog] = useState<'deal' | 'task' | null>(null);
    const owners = useTeamOwners();
    const deals = useDeals(c.id).data ?? [];
    const current = deals.find((d) => d.current) ?? null;
    const openChat = () => c.chat && router.push(`/inbox?c=${c.chat.id}`);
    const startChat = () => {
        if (!c.phone && !c.wa_id && !c.bsuid) return void toast.error('Add a WhatsApp phone number first');
        router.push(`/inbox?start=${c.id}`);
    };
    const dialogs = (
        <>
            {dialog === 'deal' && (
                <NewDealDialog contact={c} open onOpenChange={(o) => !o && setDialog(null)} owners={owners} defaultOwner={c.owner?.id ?? null} />
            )}
            {dialog === 'task' && (
                <StepDialog
                    contactId={c.id}
                    deals={deals}
                    currentDealId={current?.id ?? null}
                    open
                    onOpenChange={(o) => !o && setDialog(null)}
                    owners={owners}
                    defaultOwner={current?.owner?.id ?? c.owner?.id ?? null}
                />
            )}
        </>
    );

    return { openChat, startChat, addDeal: () => setDialog('deal'), addTask: () => setDialog('task'), dialogs };
}

function DuplicateBanner({ contact, onReview, long = false }: { contact: Contact; onReview: (id: string) => void; long?: boolean }) {
    const dups = useContactDuplicates(contact.id).data ?? [];
    if (dups.length === 0) return null;
    const d = dups[0];

    return (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warn/30 bg-warn-bg px-3 py-2 text-[13px]">
            <TriangleAlertIcon className="size-4 shrink-0 text-warn" />
            <span className="min-w-0 flex-1 text-ink-2">
                <b className="font-semibold">Possible duplicate</b>
                {long ? ': ' : ' of '}
                {dups.map((x) => `${x.display_name} (${engageId(x.id)})`).join(', ')}
                {long ? ` has the same ${d.match === 'whatsapp_id' ? 'WhatsApp user ID' : d.match === 'phone' ? 'phone number' : 'email'}.` : '.'}
            </span>
            <Button size="sm" variant="outline" onClick={() => onReview(d.id)}>
                Review
            </Button>
        </div>
    );
}

/**
 * The contact panel (3.5): slides in over any screen so you never lose your place. Half the screen
 * (460–920px), two columns; one column up to 560px on narrow screens. Esc cancels an open edit first, then
 * closes; focus goes back to whatever opened it.
 */
export function ContactRecordSheet({
    contact,
    open,
    onOpenChange,
    nav,
    returnFocus,
    onReview,
}: {
    contact: Contact;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nav?: RecordNav | null;
    returnFocus?: HTMLElement | null;
    onReview: (id: string) => void;
}) {
    const { can } = useSession();
    const now = useNow();
    const c = contact;
    const deals = useDeals(c.id).data ?? [];
    const tasks = (useNextSteps(c.id).data ?? []).filter((s) => s.status === 'open').sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
    const acts = useActivity(c, 6);
    const changes = useContactChanges(c.id).data ?? [];
    const sync = useSyncState();
    const a = useRecordActions(c);
    const lead = c.lifecycle?.key === 'customer' ? '—' : (c.lead_status?.label ?? 'New');

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                aria-describedby={undefined}
                closeLabel="Close contact"
                hideClose
                className="w-full max-w-[560px] gap-0 overflow-y-auto p-0 motion-reduce:animate-none min-[1000px]:w-[clamp(460px,50vw,920px)] min-[1000px]:max-w-none"
                onEscapeKeyDown={(e) => {
                    // An open field edit is cancelled first (the editor handles Esc itself).
                    if ((e.target as HTMLElement | null)?.closest?.('[aria-invalid],input,select')) e.preventDefault();
                }}
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[data-peek-close]')?.focus();
                }}
                onCloseAutoFocus={(e) => {
                    if (returnFocus && document.contains(returnFocus)) {
                        e.preventDefault();
                        returnFocus.focus({ preventScroll: true });
                    }
                }}
            >
                <div className="sticky top-0 z-[2] border-b border-line-2 bg-gradient-to-b from-brand-50 to-card px-5 pt-3 pb-3.5">
                    <div className="mb-3 flex items-center gap-1.5">
                        {nav ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    disabled={!nav.prev}
                                    onClick={() => nav.prev?.()}
                                    title="Previous contact"
                                    aria-label="Previous contact"
                                >
                                    <ChevronLeftIcon />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    disabled={!nav.next}
                                    onClick={() => nav.next?.()}
                                    title="Next contact"
                                    aria-label="Next contact"
                                >
                                    <ChevronRightIcon />
                                </Button>
                                <span className="text-[12px] text-muted-foreground tabular-nums">
                                    {nav.index + 1} of {nav.total}
                                </span>
                            </>
                        ) : (
                            <span className="text-[12px] text-muted-foreground">Contact</span>
                        )}
                        <span className="flex-1" />
                        <Button asChild variant="outline" size="sm">
                            <Link href={`/contacts/${c.id}`} onClick={() => onOpenChange(false)}>
                                Open full record <ExternalLinkIcon />
                            </Link>
                        </Button>
                        <Button
                            data-peek-close
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onOpenChange(false)}
                            title="Close (Esc)"
                            aria-label="Close contact"
                        >
                            <XIcon />
                        </Button>
                    </div>
                    <div className="flex items-center gap-3.5">
                        <RingAvatar
                            name={c.display_name}
                            expiresAt={windowFor(c)}
                            hasChat={!!c.chat || !!c.last_inbound_at}
                            className="size-12 text-[15px]"
                            now={now}
                        />
                        <div className="min-w-0">
                            <SheetTitle className="truncate text-[17px] font-semibold tracking-tight" dir="auto">
                                {c.display_name}
                            </SheetTitle>
                            <SheetDescription className="text-[12px] text-muted-foreground">
                                {c.company || 'No company'} · {c.phone ? fmtPhone(c.phone) : 'Number hidden'}
                            </SheetDescription>
                        </div>
                    </div>
                    <div className="my-3 flex flex-wrap items-center gap-1.5">
                        <LifePill contact={c} />
                        <Chip tone={consentTone(c.consent_state)}>{consentLabel(c.consent_state)}</Chip>
                        <Chip title="Lead status">{lead === '—' ? 'No lead status' : `Lead status · ${lead}`}</Chip>
                        <Chip tone={sync.tone === 'good' ? 'good' : sync.tone === 'warn' ? 'warn' : 'grey'}>{sync.label}</Chip>
                    </div>
                    <div className="flex gap-1.5">
                        {c.chat ? (
                            <Button size="sm" onClick={a.openChat}>
                                <MessageCircleIcon /> Open chat
                            </Button>
                        ) : (
                            can(P.InboxReply) && (
                                <Button size="sm" variant="outline" onClick={a.startChat}>
                                    <MessageCircleIcon /> Start chat
                                </Button>
                            )
                        )}
                        {can(P.ContactsUpdate) && (
                            <>
                                <Button size="sm" variant="outline" onClick={a.addDeal}>
                                    <PlusIcon /> Deal
                                </Button>
                                <Button size="sm" variant="outline" onClick={a.addTask}>
                                    <PlusIcon /> Task
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                <div className="px-5 pt-1 pb-16">
                    <DuplicateBanner contact={c} onReview={onReview} />
                    {c.lifecycle?.key !== 'other' && (
                        <div className="mt-3.5 mb-0.5">
                            <LifeBar contact={c} fill />
                        </div>
                    )}
                    <div className="grid gap-x-7 min-[1000px]:grid-cols-2">
                        <div className="min-w-0">
                            <PkSec title="Deals" badge={deals.length}>
                                <DealRows deals={deals} now={now} />
                            </PkSec>
                            <PkSec title="Open tasks" badge={tasks.length}>
                                {tasks.length === 0 && <p className="text-[12px] text-muted-foreground">Nothing open</p>}
                                {tasks.map((s) => {
                                    const over = new Date(s.due_at).getTime() < now;

                                    return (
                                        <Kv
                                            key={s.id}
                                            k={
                                                <span className={cn(over && 'text-bad')}>
                                                    {over ? '⚠ ' : ''}
                                                    {s.type_label} · {fmtWhen(s.due_at, now)}
                                                </span>
                                            }
                                            v={s.assigned?.name.split(' ')[0] ?? ''}
                                        />
                                    );
                                })}
                            </PkSec>
                            <PkSec title="Recent activity">
                                <ActivityList items={acts} now={now} />
                            </PkSec>
                            {changes.length > 0 && (
                                <PkSec title="Change history" badge={changes.length}>
                                    <ChangeList contactId={c.id} limit={5} now={now} />
                                </PkSec>
                            )}
                        </div>
                        <div className="min-w-0">
                            <FieldGroups contact={c} now={now} folding />
                        </div>
                    </div>
                </div>
                {a.dialogs}
            </SheetContent>
        </Sheet>
    );
}

function PkSec({ title, badge, children }: { title: string; badge?: number; children: React.ReactNode }) {
    return (
        <section className="border-b border-line-2 pt-3.5 pb-2.5 last:border-b-0">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                {title}
                {badge !== undefined && <Chip>{badge}</Chip>}
            </h3>
            {children}
        </section>
    );
}

/** The full contact record (Contacts & CRM): fields, activity, deals, tasks, change history and sync. */
export function FullRecord({ contact: c, onReview }: { contact: Contact; onReview: (id: string) => void }) {
    const { can } = useSession();
    const now = useNow();
    const deals = useDeals(c.id).data ?? [];
    const steps = useNextSteps(c.id).data ?? [];
    const tasks = [...steps].sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || +new Date(a.due_at) - +new Date(b.due_at));
    const acts = useActivity(c, 16);
    const changes = useContactChanges(c.id).data ?? [];
    const sync = useSyncState();
    const crm = useCrmSync();
    const codes = useMemo(() => new Map((crm.data?.stage_map ?? []).map((m) => [m.stage.id, { hubspot: m.hubspot, zoho: m.zoho }])), [crm.data]);
    const a = useRecordActions(c);

    return (
        <div>
            <div className="mb-3 rounded-[10px] border bg-card px-4 pt-3 pb-3.5">
                <Link href="/contacts" className="text-[13px] font-semibold text-brand-600 hover:underline">
                    ‹ All contacts
                </Link>
                <div className="my-2 mb-3 flex flex-wrap items-center gap-3">
                    <RingAvatar
                        name={c.display_name}
                        expiresAt={windowFor(c)}
                        hasChat={!!c.chat || !!c.last_inbound_at}
                        className="size-12 text-[15px]"
                        now={now}
                    />
                    <div className="min-w-0">
                        <h1 className="text-[17px] font-semibold tracking-tight" dir="auto">
                            {c.display_name}
                        </h1>
                        <span className="text-[12px] text-muted-foreground">
                            {c.company || 'No company'} · {c.phone ? fmtPhone(c.phone) : 'Number hidden'} · {engageId(c.id)}
                        </span>
                    </div>
                    <span className="flex-1" />
                    {c.chat ? (
                        <Button onClick={a.openChat}>
                            <MessageCircleIcon /> Open WhatsApp chat
                        </Button>
                    ) : (
                        can(P.InboxReply) && (
                            <Button variant="outline" onClick={a.startChat}>
                                <MessageCircleIcon /> Start WhatsApp chat
                            </Button>
                        )
                    )}
                    {can(P.ContactsUpdate) && (
                        <>
                            <Button variant="outline" onClick={a.addDeal}>
                                <PlusIcon /> Deal
                            </Button>
                            <Button variant="outline" onClick={a.addTask}>
                                <PlusIcon /> Task
                            </Button>
                        </>
                    )}
                </div>
                <LifeBar contact={c} note />
                <DuplicateBanner contact={c} onReview={onReview} long />
            </div>
            <div className="grid items-start gap-3 min-[1100px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,.95fr)]">
                <div className="grid min-w-0 gap-3">
                    <p className="-mb-1 ml-0.5 text-[12px] text-muted-foreground">
                        Hover a field and click ✎ to edit. 🔒 fields come from WhatsApp, deals or the customer.
                    </p>
                    <FieldGroups contact={c} now={now} />
                </div>
                <div className="grid min-w-0 gap-3">
                    <RBox title="Activity">
                        <div className="max-h-[560px] overflow-y-auto">
                            <ActivityList items={acts} now={now} />
                        </div>
                    </RBox>
                    <details className="group rounded-[10px] border bg-card">
                        <summary className="flex cursor-pointer list-none items-center px-4 py-3 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase select-none [&::-webkit-details-marker]:hidden">
                            Full history and enquiries
                            <span
                                aria-hidden
                                className="ml-auto size-1.5 -rotate-45 border-r-[1.5px] border-b-[1.5px] border-current transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
                            />
                        </summary>
                        <section className="border-t p-3" aria-label="Enquiries and history">
                            <ContactTimeline contactId={c.id} />
                        </section>
                    </details>
                </div>
                <div className="grid min-w-0 gap-3">
                    <RBox title="Deals" badge={<Chip>{deals.length}</Chip>}>
                        <DealRows deals={deals} now={now} codes={codes} />
                    </RBox>
                    <RBox title="Tasks" badge={<Chip>{steps.filter((s) => s.status === 'open').length} open</Chip>}>
                        {tasks.length === 0 && <p className="text-[12px] text-muted-foreground">No tasks</p>}
                        {tasks.map((s) => {
                            const over = s.status === 'open' && new Date(s.due_at).getTime() < now;
                            const deal = s.enquiry_id ? deals.find((d) => d.id === s.enquiry_id) : null;

                            return (
                                <Kv
                                    key={s.id}
                                    k={
                                        <span className={cn(over && 'text-bad')}>
                                            {s.type_label} · {fmtDay(s.due_at, now)}
                                            {deal ? ` · ${(deal.title ?? `Enquiry ${deal.number}`).split(' · ')[0]}` : ''}
                                        </span>
                                    }
                                    v={s.status === 'cancelled' ? 'Cancelled' : s.status === 'done' ? 'Done' : (s.assigned?.name.split(' ')[0] ?? '')}
                                />
                            );
                        })}
                    </RBox>
                    <RBox title="Change history" badge={<Chip>{changes.length}</Chip>}>
                        <ChangeList contactId={c.id} limit={12} now={now} />
                    </RBox>
                    <RBox title="Sync">
                        <Kv k="Status" v={<Chip tone={sync.tone === 'warn' ? 'warn' : sync.tone === 'good' ? 'good' : 'grey'}>{sync.label}</Chip>} />
                        <Kv k="HubSpot contact ID" v={<span className="text-muted-foreground">—</span>} />
                        <Kv k="Zoho record" v={<span className="text-muted-foreground">—</span>} />
                        <Kv k="Matched by" v={c.bsuid ? 'WhatsApp user ID' : c.phone ? 'Phone' : 'Email'} />
                    </RBox>
                </div>
            </div>
            {a.dialogs}
        </div>
    );
}
