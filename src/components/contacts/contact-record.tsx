'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangleIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ExternalLinkIcon,
    LockIcon,
    MessageCircleIcon,
    MessageSquarePlusIcon,
    PencilIcon,
    PlusIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { ContactDialog } from '@/components/contacts/contact-dialog';
import { ContactTimeline, describe, type TimelineEntry } from '@/components/contacts/contact-timeline';
import { formatFieldValue } from '@/components/contacts/field-filter';
import { RecordConsentDialog } from '@/components/contacts/record-consent-dialog';
import { money, NextStepDialog } from '@/components/contacts/enquiry-card';
import { StageBadge } from '@/components/contacts/stage-badge';
import { TagInput } from '@/components/contacts/tag-input';
import { RingAvatar, TagDots } from '@/components/inbox/window-ring';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { api, errorMessage } from '@/lib/api';
import { dateTime, humanize, relative } from '@/lib/format';
import { LEAD_STATUSES, LIFECYCLE, LIFECYCLE_TONE } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import {
    type ContactRecordPatch,
    updateContactRecord,
    useContactChanges,
    useContactConversations,
    useContactDuplicates,
    useContactFields,
    useMembers,
    useNextSteps,
} from '@/lib/queries';
import type { Contact, Enquiry } from '@/lib/types';
import { cn } from '@/lib/utils';

export type RecordNav = { index: number; total: number; prev: (() => void) | null; next: (() => void) | null };

/** Lifecycle, consent and lead status as badges. */
export function RecordBadges({ contact }: { contact: Contact }) {
    const life = contact.lifecycle;
    const lead = contact.lead_status;

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {life && (
                <Badge
                    tone={LIFECYCLE_TONE[life.key]}
                    className="border border-current/15"
                    title="Lifecycle stage: worked out from enquiries, moves forward only"
                >
                    {life.label}
                </Badge>
            )}
            <Badge
                tone={contact.consent_state === 'opted_out' ? 'bad' : contact.consent_state === 'opted_in' ? 'good' : 'grey'}
                className="border border-current/15"
                title="WhatsApp marketing consent"
            >
                {contact.consent_state === 'opted_out' ? 'Opted out' : contact.consent_state === 'opted_in' ? 'Opted in' : 'Consent unknown'}
            </Badge>
            {lead && (
                <Badge tone="outline" title={lead.automatic ? 'Lead status: automatic until someone picks one' : 'Lead status: picked by a teammate'}>
                    {lead.label ? `Lead status · ${lead.label}` : 'No lead status'}
                </Badge>
            )}
        </div>
    );
}

/** Subscriber → Lead → Opportunity → Customer, with where the contact is now. */
function LifecycleBar({ contact }: { contact: Contact }) {
    const key = contact.lifecycle?.key ?? 'lead';
    if (key === 'other') {
        return (
            <p className="rounded-md border bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
                Lifecycle: <span className="font-semibold text-ink-2">Other</span> · their last chat was closed as not a lead or no action, with no enquiry.
            </p>
        );
    }
    const at = LIFECYCLE.findIndex((l) => l.id === key);

    return (
        <ol className="grid grid-cols-4 gap-1" aria-label="Lifecycle stage">
            {LIFECYCLE.map((l, i) => (
                <li key={l.id} aria-current={i === at ? 'step' : undefined} className="grid gap-1">
                    <span className={cn('h-1.5 rounded-full', i <= at ? 'bg-brand-500' : 'bg-line-2')} />
                    <span className={cn('text-[11px]', i === at ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{l.label}</span>
                </li>
            ))}
        </ol>
    );
}

type FieldDef = {
    key: string;
    label: string;
    value: (c: Contact) => string | null;
    /** The PATCH field; none = read-only, with `lock` saying why. */
    edit?: keyof ContactRecordPatch;
    kind?: 'text' | 'email' | 'lead_status' | 'owner' | 'tags';
    lock?: string;
};

const GROUPS: { title: string; fields: FieldDef[] }[] = [
    {
        title: 'Identity',
        fields: [
            { key: 'phone', label: 'WhatsApp phone', value: (c) => c.phone, lock: 'Comes from WhatsApp. Read-only.' },
            { key: 'email', label: 'Email', value: (c) => c.email, edit: 'email', kind: 'email' },
            { key: 'username', label: 'WhatsApp username', value: (c) => (c.username ? `@${c.username}` : null), lock: 'Supplied by WhatsApp for matching.' },
        ],
    },
    {
        title: 'Profile',
        fields: [
            { key: 'name', label: 'Name', value: (c) => c.name, edit: 'name' },
            { key: 'profile_name', label: 'WhatsApp profile name', value: (c) => c.profile_name, lock: 'From the customer’s WhatsApp profile.' },
            { key: 'company', label: 'Company', value: (c) => c.company ?? null, edit: 'company' },
            { key: 'job_title', label: 'Job title', value: (c) => c.job_title ?? null, edit: 'job_title' },
            { key: 'city', label: 'City', value: (c) => c.city ?? null, edit: 'city' },
            { key: 'country', label: 'Country', value: (c) => c.country ?? null, edit: 'country' },
            { key: 'language', label: 'Preferred language', value: (c) => c.language ?? null, edit: 'language' },
        ],
    },
    {
        title: 'Sales',
        fields: [
            { key: 'owner', label: 'Contact owner', value: (c) => c.owner?.name ?? 'Unassigned', edit: 'owner_membership_id', kind: 'owner' },
            { key: 'lifecycle', label: 'Lifecycle stage', value: (c) => c.lifecycle?.label ?? null, lock: 'Automatic from enquiries. Moves forward only.' },
            { key: 'lead_status', label: 'Lead status', value: (c) => c.lead_status?.label ?? null, edit: 'lead_status', kind: 'lead_status' },
            { key: 'tags', label: 'Tags', value: (c) => (c.tags.length ? c.tags.join(', ') : null), edit: 'tags', kind: 'tags' },
        ],
    },
    {
        title: 'Source',
        fields: [
            { key: 'source', label: 'Original source', value: (c) => humanize(c.source), lock: 'Set when the contact was first created.' },
            { key: 'source_detail', label: 'Source detail', value: (c) => c.source_detail ?? null, lock: 'The ad, link or page they came from.' },
            { key: 'created_at', label: 'Created in Engage', value: (c) => (c.created_at ? dateTime(c.created_at) : null), lock: 'Set by the system.' },
        ],
    },
    {
        title: 'Consent',
        fields: [
            {
                key: 'consent',
                label: 'WhatsApp marketing',
                value: (c) => humanize(c.consent_state),
                lock: 'Only the customer opts in. Record consent from the chat.',
            },
            {
                key: 'permission',
                label: 'Permission to contact',
                value: (c) =>
                    c.contact_permission
                        ? `${c.contact_permission.via_label}${c.contact_permission.note ? ` · ${c.contact_permission.note}` : ''} · ${dateTime(c.contact_permission.at)}${c.contact_permission.by_name ? ` · ${c.contact_permission.by_name}` : ''}`
                        : null,
                lock: 'Recorded when a teammate started the chat.',
            },
        ],
    },
    {
        title: 'Activity',
        fields: [
            {
                key: 'last_in',
                label: 'Last customer message',
                value: (c) => (c.last_inbound_at ? dateTime(c.last_inbound_at) : null),
                lock: 'Live from the chat.',
            },
        ],
    },
];

/**
 * The contact record (3.5), sliding in over the current page: 50% wide (460–920px), one column up to
 * 560px on narrow screens. Deals, tasks, activity and field changes on the left; every field on the right,
 * edited in place. Esc cancels an edit first, then closes; focus goes back to whatever opened it.
 */
export function ContactRecordSheet({
    contact,
    open,
    onOpenChange,
    nav,
    returnFocus,
}: {
    contact: Contact;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nav?: RecordNav | null;
    returnFocus?: HTMLElement | null;
}) {
    const [editing, setEditing] = useState<string | null>(null);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                aria-describedby={undefined}
                closeLabel="Close contact"
                className="w-full max-w-[560px] motion-reduce:animate-none min-[1000px]:w-1/2 min-[1000px]:max-w-[920px] min-[1000px]:min-w-[460px]"
                onEscapeKeyDown={(e) => {
                    if (editing) {
                        e.preventDefault();
                        setEditing(null);
                    }
                }}
                // Focus the record itself, not its first button: the Enter that opened it must not press "Next".
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[data-record-body]')?.focus();
                }}
                onCloseAutoFocus={(e) => {
                    if (returnFocus && document.contains(returnFocus)) {
                        e.preventDefault();
                        returnFocus.focus();
                    }
                }}
            >
                <RecordBody contact={contact} nav={nav} editing={editing} setEditing={setEditing} inSheet />
            </SheetContent>
        </Sheet>
    );
}

/** The record itself: used in the slide-in panel and on the full record page. */
export function RecordBody({
    contact,
    nav,
    editing,
    setEditing,
    inSheet = false,
}: {
    contact: Contact;
    nav?: RecordNav | null;
    editing: string | null;
    setEditing: (key: string | null) => void;
    inSheet?: boolean;
}) {
    const { can } = useSession();
    const router = useRouter();
    const chats = useContactConversations(contact.id);
    const duplicates = useContactDuplicates(contact.id);
    const chat = chats.data?.[0] ?? null;
    const windowAt =
        chat?.window_expires_at ?? (contact.last_inbound_at ? new Date(new Date(contact.last_inbound_at).getTime() + 86_400_000).toISOString() : null);
    const [dealOpen, setDealOpen] = useState(false);
    const [taskOpen, setTaskOpen] = useState(false);
    const [consentOpen, setConsentOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const fields = useContactFields(can(P.ContactsView));
    const custom = fields.data ?? [];
    const Title = inSheet ? SheetTitle : 'h1';
    const Desc = inSheet ? SheetDescription : 'p';

    return (
        <>
            {inSheet && (
                <div className="flex h-12 shrink-0 items-center gap-1 border-b bg-card px-3 pr-14">
                    {nav && (
                        <>
                            <Button variant="ghost" size="icon-sm" disabled={!nav.prev} onClick={() => nav.prev?.()} aria-label="Previous contact">
                                <ChevronLeftIcon />
                            </Button>
                            <Button variant="ghost" size="icon-sm" disabled={!nav.next} onClick={() => nav.next?.()} aria-label="Next contact">
                                <ChevronRightIcon />
                            </Button>
                            <span className="px-1 text-[12px] text-muted-foreground tabular-nums">
                                {nav.index + 1} of {nav.total}
                            </span>
                        </>
                    )}
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                        <Link href={`/contacts/${contact.id}`}>
                            <ExternalLinkIcon /> Open full record
                        </Link>
                    </Button>
                </div>
            )}
            <div data-record-body tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
                <header className="grid gap-3 border-b bg-card px-5 py-4">
                    <div className="flex items-center gap-3">
                        <RingAvatar
                            name={contact.display_name}
                            expiresAt={windowAt}
                            hasChat={!!chat || !!contact.last_inbound_at}
                            className="size-12 text-[15px]"
                        />
                        <div className="min-w-0 flex-1">
                            <Title className="truncate text-[17px] leading-tight font-semibold">{contact.display_name}</Title>
                            <Desc className="truncate text-[13px] text-muted-foreground">
                                {[contact.company, contact.phone ?? (contact.username ? `@${contact.username}` : null)].filter(Boolean).join(' · ') ||
                                    'WhatsApp user'}
                            </Desc>
                        </div>
                    </div>
                    <RecordBadges contact={contact} />
                    <div className="flex flex-wrap gap-2">
                        {chat ? (
                            <Button size="sm" onClick={() => router.push(`/inbox?c=${chat.id}`)}>
                                <MessageCircleIcon /> Open chat
                            </Button>
                        ) : (
                            can(P.InboxReply) && (
                                <Button
                                    size="sm"
                                    disabled={!contact.wa_id && !contact.phone}
                                    title={!contact.wa_id && !contact.phone ? 'No phone number saved' : undefined}
                                    onClick={() => router.push(`/inbox?start=${contact.id}`)}
                                >
                                    <MessageSquarePlusIcon /> Start chat
                                </Button>
                            )
                        )}
                        {can(P.ContactsUpdate) && (
                            <>
                                <Button size="sm" variant="outline" onClick={() => setDealOpen(true)}>
                                    <PlusIcon /> Deal
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                                    <PlusIcon /> Task
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setConsentOpen(true)}>
                                    Record consent
                                </Button>
                            </>
                        )}
                    </div>
                </header>

                <div className="grid gap-3 px-5 pt-4">
                    {(duplicates.data ?? []).length > 0 && (
                        <div role="alert" className="flex gap-2 rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-[12px] text-warn">
                            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                            <p>
                                Possible duplicate:{' '}
                                {(duplicates.data ?? []).map((d, i) => (
                                    <span key={d.id}>
                                        {i > 0 && ', '}
                                        <Link href={`/contacts/${d.id}`} className="font-semibold underline-offset-2 hover:underline">
                                            {d.display_name}
                                        </Link>{' '}
                                        (same {d.match === 'whatsapp_id' ? 'WhatsApp ID' : d.match})
                                    </span>
                                ))}
                                . Check before adding deals or tasks.
                            </p>
                        </div>
                    )}
                    <LifecycleBar contact={contact} />
                </div>

                <div className="grid gap-4 p-5 min-[1000px]:grid-cols-2">
                    <div className="grid content-start gap-4">
                        <Deals contactId={contact.id} />
                        <Tasks contactId={contact.id} />
                        <Activity contactId={contact.id} />
                        <Changes contactId={contact.id} />
                        <details className="group rounded-lg border bg-card">
                            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase select-none">
                                Full history and enquiries
                                <ChevronRightIcon className="size-3.5 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
                            </summary>
                            <section className="border-t p-3" aria-label="Enquiries and history">
                                <ContactTimeline contactId={contact.id} />
                            </section>
                        </details>
                    </div>
                    <div className="grid content-start gap-3">
                        <p className="text-[11px] text-muted-foreground">
                            Click a field to edit it. Locked fields come from WhatsApp, enquiries or the customer.
                        </p>
                        {GROUPS.map((g, i) => (
                            <details key={g.title} open={i < 3} className="group rounded-lg border bg-card">
                                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase select-none">
                                    {g.title}
                                    <ChevronRightIcon className="size-3.5 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
                                </summary>
                                <dl className="grid border-t">
                                    {g.fields.map((f) => (
                                        <FieldRow key={f.key} contact={contact} field={f} editing={editing === f.key} setEditing={setEditing} />
                                    ))}
                                </dl>
                            </details>
                        ))}
                        <details className="group rounded-lg border bg-card">
                            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase select-none">
                                Custom fields
                                <ChevronRightIcon className="size-3.5 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
                            </summary>
                            <dl className="grid border-t">
                                {custom.length === 0 && <p className="px-3 py-2 text-[12px] text-muted-foreground">No custom fields in this workspace.</p>}
                                {custom.map((f) => (
                                    <div
                                        key={f.key}
                                        className="grid grid-cols-[minmax(7rem,40%)_1fr] gap-2 border-b border-line-2 px-3 py-2 text-[13px] last:border-b-0"
                                    >
                                        <dt className="text-muted-foreground">{f.label}</dt>
                                        <dd className="min-w-0 break-words" dir="auto">
                                            {formatFieldValue(contact.attributes?.[f.key], f.type) || <span className="text-faint">—</span>}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            {can(P.ContactsUpdate) && (
                                <div className="border-t px-3 py-2">
                                    <Button size="sm" variant="outline" onClick={() => setDetailsOpen(true)}>
                                        <PencilIcon /> Edit all details
                                    </Button>
                                </div>
                            )}
                        </details>
                    </div>
                </div>
            </div>
            <StartDealDialog contactId={contact.id} open={dealOpen} onOpenChange={setDealOpen} />
            <RecordConsentDialog
                contact={contact}
                open={consentOpen}
                onOpenChange={setConsentOpen}
                initialState={contact.consent_state === 'opted_in' ? 'opted_out' : 'opted_in'}
            />
            {detailsOpen && <ContactDialog open onOpenChange={setDetailsOpen} contact={contact} />}
            <NextStepDialog contactId={contact.id} enquiryId={null} open={taskOpen} onOpenChange={setTaskOpen} conversationId={chat?.id} />
        </>
    );
}

function FieldRow({ contact, field, editing, setEditing }: { contact: Contact; field: FieldDef; editing: boolean; setEditing: (key: string | null) => void }) {
    const { can } = useSession();
    const value = field.value(contact);
    const customer = contact.lifecycle?.key === 'customer';
    const lock = field.lock ?? (field.key === 'lead_status' && customer ? 'Customers don’t have a lead status.' : undefined);
    const editable = !!field.edit && !lock && can(P.ContactsUpdate) && (field.kind !== 'owner' || can(P.TeamView));

    return (
        <div className="group/f grid grid-cols-[minmax(7rem,40%)_1fr] items-start gap-2 border-b border-line-2 px-3 py-2 text-[13px] last:border-b-0">
            <dt className="pt-1 text-muted-foreground">{field.label}</dt>
            <dd className="min-w-0">
                {editing && editable ? (
                    <FieldEditor contact={contact} field={field} value={value} onDone={() => setEditing(null)} />
                ) : editable ? (
                    <button
                        type="button"
                        onClick={() => setEditing(field.key)}
                        className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                        aria-label={`Edit ${field.label}`}
                    >
                        <span className={cn('min-w-0 flex-1 break-words', !value && 'text-faint')} dir="auto">
                            {field.kind === 'tags' && contact.tags.length ? <TagDots tags={contact.tags} max={8} /> : (value ?? '—')}
                            {field.kind === 'lead_status' && contact.lead_status?.automatic && value && <span className="text-faint"> · automatic</span>}
                        </span>
                        <PencilIcon className="mt-0.5 size-3.5 shrink-0 text-faint opacity-0 group-focus-within/f:opacity-100 group-hover/f:opacity-100" />
                    </button>
                ) : (
                    <span className="flex items-start gap-1.5 px-1 py-0.5" title={lock}>
                        <span className={cn('min-w-0 flex-1 break-words', !value && 'text-faint')} dir="auto">
                            {value ?? '—'}
                        </span>
                        {lock && <LockIcon className="mt-0.5 size-3 shrink-0 text-faint" aria-label={lock} />}
                    </span>
                )}
            </dd>
        </div>
    );
}

/** One field being edited. Enter or Save keeps it; Esc or Cancel drops it (Esc does not close the panel then). */
function FieldEditor({ contact, field, value, onDone }: { contact: Contact; field: FieldDef; value: string | null; onDone: () => void }) {
    const { can } = useSession();
    const qc = useQueryClient();
    const members = useMembers(field.kind === 'owner' && can(P.TeamView));
    const [draft, setDraft] = useState(() =>
        field.kind === 'owner'
            ? (contact.owner?.id ?? '')
            : field.kind === 'lead_status'
              ? contact.lead_status?.automatic
                  ? ''
                  : (contact.lead_status?.key ?? '')
              : (value ?? ''),
    );
    const [tags, setTags] = useState<string[]>(contact.tags);
    const [busy, setBusy] = useState(false);

    const save = async (raw?: string) => {
        if (!field.edit) return;
        const v = raw ?? draft;
        const body: ContactRecordPatch =
            field.kind === 'tags'
                ? { tags }
                : field.kind === 'owner'
                  ? { owner_membership_id: v || null }
                  : field.kind === 'lead_status'
                    ? { lead_status: (v || null) as ContactRecordPatch['lead_status'] }
                    : { [field.edit]: v.trim() || null };
        setBusy(true);
        try {
            await updateContactRecord(contact.id, body);
            void qc.invalidateQueries({ queryKey: ['contacts'] });
            onDone();
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            className="grid gap-1.5"
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            {field.kind === 'owner' ? (
                <Select value={draft || 'none'} onValueChange={(v) => void save(v === 'none' ? '' : v)}>
                    <SelectTrigger size="sm" aria-label={field.label} autoFocus>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {(members.data?.data ?? [])
                            .filter((m) => m.status === 'active')
                            .map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.user?.name ?? 'Teammate'}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            ) : field.kind === 'lead_status' ? (
                <Select value={draft || 'auto'} onValueChange={(v) => void save(v === 'auto' ? '' : v)}>
                    <SelectTrigger size="sm" aria-label={field.label} autoFocus>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="auto">Automatic</SelectItem>
                        {LEAD_STATUSES.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                                {s.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : field.kind === 'tags' ? (
                <TagInput value={tags} onChange={setTags} />
            ) : (
                <Input
                    autoFocus
                    type={field.kind === 'email' ? 'email' : 'text'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={190}
                    className="h-8"
                    aria-label={field.label}
                    dir="auto"
                />
            )}
            {field.kind !== 'owner' && field.kind !== 'lead_status' && (
                <span className="flex gap-1.5">
                    <Button type="submit" size="sm" disabled={busy}>
                        {busy ? 'Saving…' : 'Save'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={onDone}>
                        Cancel
                    </Button>
                </span>
            )}
        </form>
    );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <section className="grid gap-2" aria-label={title}>
            <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</h3>
                {action}
            </div>
            {children}
        </section>
    );
}

function Deals({ contactId }: { contactId: string }) {
    const enquiries = useQuery({
        queryKey: ['contacts', contactId, 'enquiries'],
        queryFn: () => api<{ data: Enquiry[] }>(`contacts/${contactId}/enquiries`).then((r) => r.data),
    });
    const rows = enquiries.data ?? [];

    return (
        <Section title="Deals">
            {rows.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">{enquiries.isLoading ? 'Loading…' : 'No deals yet.'}</p>
            ) : (
                <ul className="grid gap-1.5">
                    {rows.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-[13px]">
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold">{e.title ?? `Enquiry #${e.number}`}</span>
                                <span className="text-[11px] text-muted-foreground">
                                    {e.source_label} · {relative(e.started_at)}
                                    {e.value !== null ? ` · ${money(e)}` : ''}
                                </span>
                                {e.won?.reference && <span className="block text-[11px] text-muted-foreground">Reference {e.won.reference}</span>}
                            </span>
                            <StageBadge stage={e.stage ? { ...e.stage, color: e.stage.color ?? 'grey', archived: false } : null} />
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}

function Tasks({ contactId }: { contactId: string }) {
    const steps = useNextSteps(contactId);
    const open = (steps.data ?? []).filter((s) => s.status === 'open');

    return (
        <Section title="Open tasks">
            {open.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">{steps.isLoading ? 'Loading…' : 'No open tasks.'}</p>
            ) : (
                <ul className="grid gap-1.5">
                    {open.map((s) => (
                        <li key={s.id} className="rounded-md border bg-card px-3 py-2 text-[13px]">
                            <span className="block truncate font-semibold">
                                {s.type_label}: {s.title}
                            </span>
                            <span className={cn('text-[11px]', s.overdue ? 'font-semibold text-bad' : 'text-muted-foreground')}>
                                {s.overdue ? 'Overdue · ' : 'Due '}
                                {dateTime(s.due_at)}
                                {s.assigned ? ` · ${s.assigned.name}` : ''}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}

function Activity({ contactId }: { contactId: string }) {
    const timeline = useQuery({
        queryKey: ['contacts', contactId, 'timeline', 'recent'],
        queryFn: () => api<{ data: TimelineEntry[] }>(`contacts/${contactId}/timeline`, { query: { per_page: 6 } }).then((r) => r.data.slice(0, 6)),
    });

    return (
        <Section title="Recent activity">
            {(timeline.data ?? []).length === 0 ? (
                <p className="text-[12px] text-muted-foreground">{timeline.isLoading ? 'Loading…' : 'Nothing yet.'}</p>
            ) : (
                <ol className="grid gap-1.5 border-l border-line-2 pl-3">
                    {(timeline.data ?? []).map((e) => (
                        <li key={e.id} className="text-[12.5px]">
                            <span className="text-ink-2">{describe(e)}</span>
                            <span className="block text-[11px] text-muted-foreground">
                                {e.actor_name ? `${e.actor_name} · ` : ''}
                                {relative(e.occurred_at)}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </Section>
    );
}

function Changes({ contactId }: { contactId: string }) {
    const changes = useContactChanges(contactId);
    const rows = (changes.data ?? []).slice(0, 5);

    return (
        <Section title="Field changes">
            {rows.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">{changes.isLoading ? 'Loading…' : 'No changes yet.'}</p>
            ) : (
                <ul className="grid gap-1.5">
                    {rows.map((c) => (
                        <li key={c.id} className="text-[12.5px]">
                            <span className="font-semibold">{c.label}</span>{' '}
                            {c.from ? (
                                <>
                                    <span className="text-muted-foreground line-through">{c.from}</span> → {c.to ?? '—'}
                                </>
                            ) : (
                                <>set to {c.to ?? '—'}</>
                            )}
                            <span className="block text-[11px] text-muted-foreground">
                                {c.by?.name ?? (c.source === 'system' ? 'Automation' : 'System')} · {relative(c.at)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}

function StartDealDialog({ contactId, open, onOpenChange }: { contactId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
    const qc = useQueryClient();
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-label="New deal"
            className="fixed inset-x-0 bottom-0 z-[60] border-t bg-card p-4 shadow-raised sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 sm:rounded-lg sm:border"
        >
            <form
                className="grid gap-2"
                onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                        await api(`contacts/${contactId}/enquiries`, { method: 'POST', body: { note: note.trim() || null } });
                        toast.success('Deal started');
                        void qc.invalidateQueries({ queryKey: ['contacts', contactId] });
                        setNote('');
                        onOpenChange(false);
                    } catch (err) {
                        toast.error(errorMessage(err));
                    } finally {
                        setBusy(false);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        e.stopPropagation();
                        onOpenChange(false);
                    }
                }}
            >
                <label className="grid gap-1.5 text-[13px] font-semibold">
                    New deal
                    <Input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="What it's about (optional)" />
                </label>
                <span className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={busy}>
                        {busy ? 'Starting…' : 'Start deal'}
                    </Button>
                </span>
            </form>
        </div>
    );
}
