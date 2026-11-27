'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LockIcon, PencilIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { ContactDialog } from '@/components/contacts/contact-dialog';
import { formatFieldValue } from '@/components/contacts/field-filter';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { contactSource } from '@/lib/format';
import { dur, engageId, fmtDay, fmtPhone, fmtWhen, LEAD_STATUSES, LIFECYCLE, REPLY_LABEL, windowLeft } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import {
    type Assignee,
    type ContactRecordPatch,
    updateContactRecord,
    useAssignees,
    useConsentHistory,
    useContactChanges,
    useContactFields,
    useCrmSync,
    useMembers,
} from '@/lib/queries';
import type { Contact, ContactFieldChange, LifecycleKey } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ---------- lifecycle ---------- */

const LIFE_TONE: Record<LifecycleKey, string> = {
    subscriber: 'border-border bg-muted text-ink-2',
    lead: 'border-info/25 bg-info-bg text-info',
    opportunity: 'border-brand-500/30 bg-brand-50 text-brand-600',
    customer: 'border-good/30 bg-good-bg text-good',
    other: 'border-border bg-muted text-faint',
};

export function LifePill({ contact, label }: { contact: Contact; label?: string }) {
    const key = contact.lifecycle?.key ?? 'lead';

    return (
        <span className={cn('inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11px] font-semibold whitespace-nowrap', LIFE_TONE[key])}>
            {label ?? contact.lifecycle?.label ?? 'Lead'}
        </span>
    );
}

/** Subscriber › Lead › Opportunity › Customer as chevrons; brand for now, tint for done. */
export function LifeBar({ contact, fill = false, note = false }: { contact: Contact; fill?: boolean; note?: boolean }) {
    const key = contact.lifecycle?.key ?? 'lead';
    if (key === 'other') return <LifePill contact={contact} label="Other · not a sales contact" />;
    const at = LIFECYCLE.findIndex((l) => l.id === key);

    return (
        <div className="flex flex-wrap items-center gap-1" aria-label={`Lifecycle stage: ${contact.lifecycle?.label ?? 'Lead'}`}>
            {LIFECYCLE.map((l, i) => (
                <span
                    key={l.id}
                    aria-current={i === at ? 'step' : undefined}
                    className={cn(
                        'inline-flex h-[26px] items-center px-3.5 text-[13px] font-semibold [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%,8px_50%)] first:[clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%)]',
                        fill && 'flex-1 justify-center px-1.5',
                        i < at ? 'bg-brand-100 text-brand-600' : i === at ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground',
                    )}
                >
                    {l.label}
                </span>
            ))}
            {note && <span className="ml-2.5 text-[12px] text-muted-foreground">Automatic from deals · never moves backwards</span>}
        </div>
    );
}

/* ---------- sync (status only until HubSpot is connected) ---------- */

export function useSyncState(): { tone: 'none' | 'warn' | 'good'; label: string; provider: 'none' | 'hubspot' } {
    const sync = useCrmSync();
    const provider = sync.data?.provider ?? 'none';
    if (provider === 'none') return { tone: 'none', label: 'Not connected', provider };

    return { tone: 'warn', label: 'Not synced yet', provider };
}

export const consentLabel = (s: Contact['consent_state']) => ({ opted_in: 'Opted in', opted_out: 'Opted out', unknown: 'Unknown' })[s];
export const consentTone = (s: Contact['consent_state']) => (s === 'opted_in' ? 'good' : s === 'opted_out' ? 'bad' : 'grey') as 'good' | 'bad' | 'grey';

/* ---------- one field list drives the record, the edit and the sync map ---------- */

export type FieldCtx = { contact: Contact; now: number; consentAt: string | null };
type EditKind = 'text' | 'email' | 'tel' | 'lang' | 'owner' | 'leadStatus' | 'tags';
type Dir = 'both' | 'out' | 'in' | 'none' | 'match';
export type CrmField = {
    group: 'Identity' | 'Profile' | 'Sales' | 'Source' | 'Consent' | 'Activity';
    key: string;
    label: string;
    get: (x: FieldCtx) => string;
    edit: EditKind | null;
    hubspot: string;
    dir: Dir;
    note: string;
    /** The change-history field names that count as an edit of this row. */
    history?: string[];
};

const first = (c: Contact) => (c.name ?? '').split(' ')[0] ?? '';
const last = (c: Contact) => (c.name ?? '').split(' ').slice(1).join(' ');
const or = (v: string | null | undefined) => (v && v.trim() ? v : '—');

export const CRM_FIELDS: CrmField[] = [
    {
        group: 'Identity',
        key: 'cid',
        label: 'engageX ID',
        get: ({ contact: c }) => engageId(c.id),
        edit: null,
        hubspot: 'engagex_id (custom)',
        dir: 'out',
        note: 'Permanent. Never changes, survives merges.',
    },
    {
        group: 'Identity',
        key: 'waId',
        label: 'WhatsApp user ID',
        get: ({ contact: c }) => or(c.bsuid),
        edit: null,
        hubspot: '—',
        dir: 'match',
        note: 'Supplied by Meta. Used inside engageX to match messages to this contact; not sent to other systems.',
    },
    {
        group: 'Identity',
        key: 'phone',
        label: 'WhatsApp phone',
        get: ({ contact: c }) => (c.phone ? fmtPhone(c.phone) : 'Hidden by customer'),
        edit: 'tel',
        hubspot: 'phone / mobilephone',
        dir: 'both',
        note: 'Given by the customer. 2nd match key, stored as +971…',
        history: ['phone'],
    },
    {
        group: 'Identity',
        key: 'username',
        label: 'WhatsApp username',
        get: ({ contact: c }) => (c.username ? `@${c.username}` : '—'),
        edit: null,
        hubspot: '—',
        dir: 'match',
        note: 'Supplied by Meta. Matching only.',
    },
    {
        group: 'Identity',
        key: 'email',
        label: 'Email',
        get: ({ contact: c }) => or(c.email),
        edit: 'email',
        hubspot: 'email',
        dir: 'both',
        note: '3rd match key.',
        history: ['email'],
    },
    {
        group: 'Profile',
        key: 'firstName',
        label: 'First name',
        get: ({ contact: c }) => or(first(c)),
        edit: 'text',
        hubspot: 'firstname',
        dir: 'both',
        note: 'The name the customer gave or your team saved.',
        history: ['name'],
    },
    {
        group: 'Profile',
        key: 'lastName',
        label: 'Last name',
        get: ({ contact: c }) => or(last(c)),
        edit: 'text',
        hubspot: 'lastname',
        dir: 'both',
        note: '',
        history: ['name'],
    },
    {
        group: 'Profile',
        key: 'profileName',
        label: 'WhatsApp profile name',
        get: ({ contact: c }) => or(c.profile_name),
        edit: null,
        hubspot: '—',
        dir: 'match',
        note: 'Supplied by Meta. Shown to agents in engageX only; save it as the contact’s name if the customer confirms it.',
    },
    {
        group: 'Profile',
        key: 'company',
        label: 'Company',
        get: ({ contact: c }) => or(c.company),
        edit: 'text',
        hubspot: 'company (+ associated Company)',
        dir: 'both',
        note: '',
        history: ['company'],
    },
    {
        group: 'Profile',
        key: 'jobTitle',
        label: 'Job title',
        get: ({ contact: c }) => or(c.job_title),
        edit: 'text',
        hubspot: 'jobtitle',
        dir: 'both',
        note: '',
        history: ['job_title'],
    },
    {
        group: 'Profile',
        key: 'city',
        label: 'City',
        get: ({ contact: c }) => or(c.city),
        edit: 'text',
        hubspot: 'city',
        dir: 'both',
        note: '',
        history: ['city'],
    },
    {
        group: 'Profile',
        key: 'country',
        label: 'Country',
        get: ({ contact: c }) => or(c.country),
        edit: 'text',
        hubspot: 'country',
        dir: 'both',
        note: '',
        history: ['country'],
    },
    {
        group: 'Profile',
        key: 'language',
        label: 'Preferred language',
        get: ({ contact: c }) => c.language ?? 'English',
        edit: 'lang',
        hubspot: 'hs_language',
        dir: 'both',
        note: 'Picks Arabic or English templates.',
        history: ['language'],
    },
    {
        group: 'Sales',
        key: 'owner',
        label: 'Contact owner',
        get: ({ contact: c }) => c.owner?.name ?? 'Unassigned',
        edit: 'owner',
        hubspot: 'hubspot_owner_id',
        dir: 'both',
        note: 'Mapped user-to-user in sync settings.',
        history: ['owner_membership_id'],
    },
    {
        group: 'Sales',
        key: 'lifecycle',
        label: 'Lifecycle stage',
        get: ({ contact: c }) => c.lifecycle?.label ?? 'Lead',
        edit: null,
        hubspot: 'lifecyclestage',
        dir: 'out',
        note: 'Automatic from deals. Only moves forward.',
    },
    {
        group: 'Sales',
        key: 'leadStatus',
        label: 'Lead status',
        get: ({ contact: c }) => (c.lifecycle?.key === 'customer' ? '—' : (c.lead_status?.label ?? 'New')),
        edit: 'leadStatus',
        hubspot: 'hs_lead_status',
        dir: 'both',
        note: 'Automatic unless an agent sets it.',
        history: ['lead_status'],
    },
    {
        group: 'Sales',
        key: 'tags',
        label: 'Tags',
        get: ({ contact: c }) => c.tags.join(', ') || '—',
        edit: 'tags',
        hubspot: 'engagex_tags (custom multi-select)',
        dir: 'both',
        note: '',
        history: ['tags'],
    },
    {
        group: 'Source',
        key: 'source',
        label: 'Original source',
        get: ({ contact: c }) => contactSource(c.source),
        edit: null,
        hubspot: 'engagex_original_source (custom)',
        dir: 'out',
        note: 'HubSpot sets its own Original source automatically, so engageX writes to a custom property.',
    },
    {
        group: 'Source',
        key: 'sourceDetail',
        label: 'Source detail',
        get: ({ contact: c }) => or(c.source_detail),
        edit: 'text',
        hubspot: 'engagex_source_detail (custom)',
        dir: 'out',
        note: 'Ad, campaign or page.',
        history: ['source_detail'],
    },
    {
        group: 'Source',
        key: 'createdAt',
        label: 'Created in engageX',
        get: ({ contact: c, now }) => (c.created_at ? fmtWhen(c.created_at, now) : '—'),
        edit: null,
        hubspot: 'engagex_created_at (custom)',
        dir: 'out',
        note: '',
    },
    {
        group: 'Consent',
        key: 'consent',
        label: 'WhatsApp marketing',
        get: ({ contact: c }) => consentLabel(c.consent_state),
        edit: null,
        hubspot: 'Subscription: WhatsApp marketing',
        dir: 'both',
        note: 'Opt-outs sync both ways and always win (Meta: respect opt-outs made on or off WhatsApp). Opt-ins only come from the customer.',
    },
    {
        group: 'Consent',
        key: 'consentAt',
        label: 'Consent captured',
        get: ({ consentAt }) => consentAt ?? '—',
        edit: null,
        hubspot: 'whatsapp_consent_at / _via (custom)',
        dir: 'both',
        note: 'Proof of when and how consent changed.',
    },
    {
        group: 'Activity',
        key: 'lastIn',
        label: 'Last customer message',
        get: ({ contact: c, now }) => (c.last_inbound_at ? fmtWhen(c.last_inbound_at, now) : '—'),
        edit: null,
        hubspot: 'Logged as WhatsApp activity',
        dir: 'out',
        note: '',
    },
    {
        group: 'Activity',
        key: 'lastHuman',
        label: 'Last human reply',
        get: ({ contact: c, now }) => (c.last_human_reply_at ? fmtWhen(c.last_human_reply_at, now) : '—'),
        edit: null,
        hubspot: 'engagex_last_human_reply (custom)',
        dir: 'out',
        note: '',
    },
    {
        group: 'Activity',
        key: 'window',
        label: 'WhatsApp window',
        get: ({ contact: c, now }) =>
            !c.chat
                ? 'No chat yet'
                : windowLeft(c.chat.window_expires_at, now) > 0
                  ? `Open · ${dur(windowLeft(c.chat.window_expires_at, now))} left`
                  : 'Closed · template only',
        edit: null,
        hubspot: '—',
        dir: 'none',
        note: 'Live in engageX only.',
    },
    {
        group: 'Activity',
        key: 'convo',
        label: 'Conversation',
        get: ({ contact: c }) => (!c.chat ? 'No chat yet' : (REPLY_LABEL[c.chat.state] ?? 'Waiting for customer')),
        edit: null,
        hubspot: '—',
        dir: 'none',
        note: 'Live in engageX only.',
    },
];
export const FIELD_GROUPS = [...new Set(CRM_FIELDS.map((f) => f.group))];

export const DEAL_FIELDS: [string, string, string, Dir, string][] = [
    ['Deal title', 'dealname', 'Deal_Name', 'both', ''],
    ['Value', 'amount', 'Amount', 'both', 'AED. Currency set per account.'],
    ['Billing period', 'engagex_billing_period (custom)', 'Billing_Period (custom)', 'both', 'One-off, monthly or yearly.'],
    ['Stage', 'dealstage + pipeline', 'Stage + Pipeline', 'both', 'Mapped stage by stage below.'],
    ['Expected close', 'closedate', 'Closing_Date', 'both', ''],
    ['Deal owner', 'hubspot_owner_id', 'Owner', 'both', ''],
    ['Deal source', 'engagex_deal_source (custom)', 'Lead_Source', 'out', 'Source of this enquiry, not the contact’s first source.'],
    ['Created by', 'engagex_created_by (custom)', 'Created_By_engageX (custom)', 'out', ''],
    ['Contact', 'Association: contact', 'Contact_Name', 'both', ''],
    ['Company', 'Association: company', 'Account_Name', 'both', ''],
];
export const TASK_FIELDS: [string, string, string, Dir, string][] = [
    ['Type (Call / Follow up / Quote / Meeting)', 'hs_task_type', 'Subject + custom Type', 'both', ''],
    ['Due', 'hs_timestamp', 'Due_Date', 'both', ''],
    ['Responsible', 'hubspot_owner_id', 'Owner', 'both', ''],
    ['Status (open / done / cancelled)', 'hs_task_status', 'Status', 'both', 'Cancelled is kept as cancelled, not completed.'],
    ['Linked deal / contact', 'Associations', 'What_Id / Who_Id', 'both', ''],
];
export const DIR_LABEL: Record<Dir, string> = {
    both: '⇄ Two-way',
    out: '→ engageX to CRM',
    in: '← CRM to engageX',
    none: 'engageX only',
    match: 'Matching only · not synced',
};

const LOCKS: Record<string, string> = {
    cid: 'Permanent engageX ID. Never changes.',
    waId: 'Supplied by Meta for matching messages. Read-only.',
    username: 'Supplied by Meta for matching messages. Read-only.',
    profileName: 'Comes from the customer’s WhatsApp profile. Save it as First/Last name if they confirm it.',
    phone: 'Comes from WhatsApp for this chat. Read-only.',
    lifecycle: 'Automatic from deals. Moves forward only.',
    leadStatus: 'Customers don’t have a lead status.',
    source: 'Set when the contact was first created.',
    createdAt: 'Set by the system.',
    consent: 'Only the customer can opt in. Opt-outs come from the customer or a synced CRM unsubscribe.',
    consentAt: 'Recorded automatically when consent changes.',
    lastIn: 'Live from the conversation.',
    lastHuman: 'Live from the conversation.',
    window: 'Live from the conversation.',
    convo: 'Live from the conversation.',
};
const canEditField = (c: Contact, f: CrmField) =>
    !!f.edit && !(f.key === 'phone' && !!c.chat && !!c.phone) && !(f.key === 'leadStatus' && c.lifecycle?.key === 'customer');

/** "Opted in · 3 Nov · Interactive opt-in button" from the latest consent event. */
export function useConsentAt(contactId: string, now: number): string | null {
    const h = useConsentHistory(contactId);
    const e = (h.data ?? []).find((x) => ['opted_in', 'opted_out', 'marketing_opted_out', 'marketing_opted_in'].includes(x.action));

    return e ? `${fmtDay(e.created_at, now)} · ${e.source_label}` : null;
}

/* ---------- inline editing ---------- */

/**
 * One field of the record. Hover a field and click ✎ to edit; 🔒 fields come from WhatsApp, deals or the
 * customer. Enter saves, Esc cancels. Each saved change is recorded in the change history, and the row
 * flashes green.
 */
export function FieldRow({
    f,
    ctx,
    changes,
    editing,
    setEditing,
}: {
    f: CrmField;
    ctx: FieldCtx;
    changes: ContactFieldChange[];
    editing: boolean;
    setEditing: (k: string | null) => void;
}) {
    const { can } = useSession();
    const c = ctx.contact;
    const ok = canEditField(c, f) && can(P.ContactsUpdate);
    const lastChange = changes.find((x) => f.history?.includes(x.field));
    const tip = `HubSpot: ${f.hubspot}${lastChange ? ` · Last changed by ${lastChange.by?.name ?? 'engageX'}, ${fmtWhen(lastChange.at, ctx.now)}` : ''}`;
    const [flash, setFlash] = useState(false);
    const pen = useRef<HTMLButtonElement>(null);
    const value = f.get(ctx);

    if (editing && ok)
        return (
            <FieldEditor
                f={f}
                contact={c}
                onDone={(saved) => {
                    setEditing(null);
                    if (saved) {
                        setFlash(true);
                        setTimeout(() => setFlash(false), 650);
                    }
                    setTimeout(() => pen.current?.focus(), 0);
                }}
            />
        );

    return (
        <div
            data-row={f.key}
            title={tip}
            className={cn(
                'group/f -mx-1.5 my-0.5 flex items-center justify-between gap-3 rounded-md px-1.5 py-[5px] text-[13px] transition-colors duration-150 motion-reduce:transition-none',
                ok && 'hover:bg-muted',
                flash && 'animate-[saved_.6s_ease-out] motion-reduce:animate-none',
            )}
        >
            <span className="flex-none cursor-help text-muted-foreground">
                {f.label}
                {lastChange && <i className="ml-1.5 inline-block size-1.5 rounded-full bg-warn align-middle" title="Changed recently" />}
            </span>
            <span className="inline-flex min-w-0 items-center justify-end gap-1.5 text-right [overflow-wrap:anywhere]" dir="auto">
                {f.key === 'lifecycle' ? <LifePill contact={c} /> : value}
                {ok ? (
                    <button
                        ref={pen}
                        type="button"
                        onClick={() => setEditing(f.key)}
                        title={`Edit ${f.label}`}
                        aria-label={`Edit ${f.label}`}
                        className="grid place-items-center rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/f:opacity-100 hover:bg-brand-50 hover:text-brand-600 focus:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-500 motion-reduce:transition-none"
                    >
                        <PencilIcon className="size-[13px]" />
                    </button>
                ) : (
                    <span title={LOCKS[f.key] ?? 'Read-only'} className="grid cursor-help place-items-center opacity-35 group-hover/f:opacity-80">
                        <LockIcon className="size-3" aria-label={LOCKS[f.key] ?? 'Read-only'} />
                    </span>
                )}
            </span>
        </div>
    );
}

function FieldEditor({ f, contact: c, onDone }: { f: CrmField; contact: Contact; onDone: (saved: boolean) => void }) {
    const qc = useQueryClient();
    const { can } = useSession();
    const members = useMembers(f.edit === 'owner' && can(P.TeamView));
    const assignees = useAssignees(c.chat?.id, f.edit === 'owner' && !!c.chat);
    const owners =
        (members.data?.data ?? []).filter((m) => m.status === 'active').map((m) => ({ id: m.id, name: m.user?.name ?? 'Teammate' })).length > 0
            ? (members.data?.data ?? []).filter((m) => m.status === 'active').map((m) => ({ id: m.id, name: m.user?.name ?? 'Teammate' }))
            : (assignees.data ?? []).map((a) => ({ id: a.id, name: a.name }));
    const initial =
        f.key === 'firstName'
            ? first(c)
            : f.key === 'lastName'
              ? last(c)
              : f.key === 'phone'
                ? (c.phone ?? '')
                : f.key === 'email'
                  ? (c.email ?? '')
                  : f.key === 'company'
                    ? (c.company ?? '')
                    : f.key === 'jobTitle'
                      ? (c.job_title ?? '')
                      : f.key === 'city'
                        ? (c.city ?? '')
                        : f.key === 'country'
                          ? (c.country ?? '')
                          : f.key === 'language'
                            ? (c.language ?? 'English')
                            : f.key === 'owner'
                              ? (c.owner?.id ?? '')
                              : f.key === 'leadStatus'
                                ? c.lead_status?.automatic
                                    ? ''
                                    : (c.lead_status?.key ?? '')
                                : f.key === 'tags'
                                  ? c.tags.join(', ')
                                  : f.key === 'sourceDetail'
                                    ? (c.source_detail ?? '')
                                    : '';
    const [v, setV] = useState(initial);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const input = useRef<HTMLInputElement & HTMLSelectElement>(null);
    useEffect(() => {
        input.current?.focus();
        if (input.current instanceof HTMLInputElement) input.current.select();
    }, []);

    const save = async () => {
        const t = v.trim();
        if (f.edit === 'email' && t && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return setErr('Enter a valid email, or leave it empty');
        if (f.edit === 'tel' && t && (!t.startsWith('+') || t.replace(/\D/g, '').length < 8 || t.replace(/\D/g, '').length > 15))
            return setErr('Use international format, starting with +');
        if ((f.edit === 'email' || f.edit === 'tel') && !t && !c.bsuid && !(f.edit === 'email' ? c.phone : c.email))
            return setErr('A contact needs a phone, a WhatsApp ID or an email');
        if (t === initial.trim()) return onDone(false);
        const body: ContactRecordPatch =
            f.key === 'firstName'
                ? { name: [t, last(c)].filter(Boolean).join(' ') || null }
                : f.key === 'lastName'
                  ? { name: [first(c), t].filter(Boolean).join(' ') || null }
                  : f.key === 'phone'
                    ? { phone: t || null }
                    : f.key === 'email'
                      ? { email: t.toLowerCase() || null }
                      : f.key === 'company'
                        ? { company: t || null }
                        : f.key === 'jobTitle'
                          ? { job_title: t || null }
                          : f.key === 'city'
                            ? { city: t || null }
                            : f.key === 'country'
                              ? { country: t || null }
                              : f.key === 'language'
                                ? { language: t || null }
                                : f.key === 'owner'
                                  ? { owner_membership_id: t || null }
                                  : f.key === 'leadStatus'
                                    ? { lead_status: (t || null) as ContactRecordPatch['lead_status'] }
                                    : f.key === 'tags'
                                      ? {
                                            tags: [
                                                ...new Set(
                                                    t
                                                        .split(',')
                                                        .map((x) => x.trim())
                                                        .filter(Boolean),
                                                ),
                                            ],
                                        }
                                      : { source_detail: t || null };
        setBusy(true);
        try {
            await updateContactRecord(c.id, body);
            void qc.invalidateQueries({ queryKey: ['contacts'] });
            void qc.invalidateQueries({ queryKey: ['inbox'] });
            toast.success(`${f.label} saved · recorded in change history`);
            onDone(true);
        } catch (e) {
            setErr(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };
    const keys = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void save();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onDone(false);
        }
    };
    const field = cn(
        'h-8 max-w-[200px] min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20',
        err && 'border-bad',
    );

    return (
        <>
            <div className="-mx-1.5 my-0.5 flex items-center justify-between gap-3 rounded-md bg-card px-1.5 py-[5px] text-[13px] shadow-[0_0_0_1px_var(--brand-500)]">
                <span className="flex-none text-muted-foreground">{f.label}</span>
                <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5" onKeyDown={keys}>
                    {f.edit === 'lang' ? (
                        <select ref={input} className={field} value={v} onChange={(e) => setV(e.target.value)} aria-label={f.label}>
                            {['English', 'Arabic', 'Hindi', 'Urdu', 'Other'].map((l) => (
                                <option key={l}>{l}</option>
                            ))}
                        </select>
                    ) : f.edit === 'owner' ? (
                        <select ref={input} className={field} value={v} onChange={(e) => setV(e.target.value)} aria-label={f.label}>
                            <option value="">Unassigned</option>
                            {owners.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.name}
                                </option>
                            ))}
                        </select>
                    ) : f.edit === 'leadStatus' ? (
                        <select ref={input} className={field} value={v} onChange={(e) => setV(e.target.value)} aria-label={f.label}>
                            <option value="">Automatic</option>
                            {LEAD_STATUSES.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            ref={input}
                            className={field}
                            value={v}
                            onChange={(e) => {
                                setV(e.target.value);
                                setErr(null);
                            }}
                            placeholder={f.edit === 'tel' ? '+971 50 123 4567' : f.edit === 'tags' ? 'Comma separated' : undefined}
                            type={f.edit === 'email' ? 'email' : f.edit === 'tel' ? 'tel' : 'text'}
                            aria-label={f.label}
                            aria-invalid={!!err}
                            dir="auto"
                        />
                    )}
                    <Button size="sm" className="h-7" disabled={busy} onClick={() => void save()}>
                        Save
                    </Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => onDone(false)}>
                        Cancel
                    </Button>
                </span>
            </div>
            {err && (
                <p role="alert" className="text-right text-[12px] text-bad">
                    {err}
                </p>
            )}
        </>
    );
}

/** All field groups as boxes (full record) or folding sections (contact panel). */
export function FieldGroups({ contact, now, folding = false }: { contact: Contact; now: number; folding?: boolean }) {
    const { can } = useSession();
    const custom = useContactFields(can(P.ContactsView)).data ?? [];
    const [allDetails, setAllDetails] = useState(false);
    const changes = useContactChanges(contact.id).data ?? [];
    const consentAt = useConsentAt(contact.id, now);
    const [editing, setEditing] = useState<string | null>(null);
    const ctx = { contact, now, consentAt };

    return (
        <>
            {FIELD_GROUPS.map((g, i) => {
                const rows = CRM_FIELDS.filter((f) => f.group === g).map((f) => (
                    <FieldRow key={f.key} f={f} ctx={ctx} changes={changes} editing={editing === f.key} setEditing={setEditing} />
                ));

                return folding ? (
                    <details key={g} open={i < 3} className="group border-b border-line-2 py-3.5 last:border-b-0">
                        <summary className="mb-0.5 flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase [&::-webkit-details-marker]:hidden">
                            {g}
                            <span
                                aria-hidden
                                className="ml-auto size-1.5 -rotate-45 border-r-[1.5px] border-b-[1.5px] border-current transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
                            />
                        </summary>
                        {rows}
                    </details>
                ) : (
                    <RBox key={g} title={g}>
                        {rows}
                    </RBox>
                );
            })}
            {/* The workspace's own fields (and the contact's lead stage), edited in the full form. */}
            {(custom.length > 0 || can(P.ContactsUpdate)) &&
                (() => {
                    const body = (
                        <>
                            {custom.map((f) => (
                                <Kv key={f.key} k={f.label} v={formatFieldValue(contact.attributes?.[f.key], f.type) || '—'} />
                            ))}
                            {custom.length === 0 && <p className="text-[12px] text-muted-foreground">No custom fields in this workspace.</p>}
                            {can(P.ContactsUpdate) && (
                                <Button size="sm" variant="outline" className="mt-1.5" onClick={() => setAllDetails(true)}>
                                    <PencilIcon /> Edit all details
                                </Button>
                            )}
                        </>
                    );

                    return folding ? (
                        <details className="group border-b border-line-2 py-3.5 last:border-b-0">
                            <summary className="mb-0.5 flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase [&::-webkit-details-marker]:hidden">
                                Custom fields
                                <span
                                    aria-hidden
                                    className="ml-auto size-1.5 -rotate-45 border-r-[1.5px] border-b-[1.5px] border-current transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
                                />
                            </summary>
                            {body}
                        </details>
                    ) : (
                        <RBox title="Custom fields">{body}</RBox>
                    );
                })()}
            {allDetails && <ContactDialog open onOpenChange={setAllDetails} contact={contact} />}
        </>
    );
}

export function RBox({
    title,
    badge,
    children,
    className,
    action,
}: {
    title: React.ReactNode;
    badge?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    action?: React.ReactNode;
}) {
    return (
        <section className={cn('min-w-0 rounded-[10px] border bg-card px-4 py-3', className)}>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                {title}
                {badge}
                {action && <span className="ml-auto normal-case">{action}</span>}
            </h3>
            {children}
        </section>
    );
}

export function Kv({ k, v, title }: { k: React.ReactNode; v: React.ReactNode; title?: string }) {
    return (
        <div className="my-2 flex items-center justify-between gap-3 text-[13px]" title={title}>
            <span className="flex-none text-muted-foreground">{k}</span>
            <span className="min-w-0 text-right [overflow-wrap:anywhere]">{v}</span>
        </div>
    );
}

/** Teammates who can own a contact or deal (for the owner pickers in Contacts & CRM). */
export function useTeamOwners(): Assignee[] {
    const { can, membership, me } = useSession();
    const members = useMembers(can(P.TeamView));
    const list = (members.data?.data ?? [])
        .filter((m) => m.status === 'active')
        .map((m) => ({ id: m.id, name: m.user?.name ?? 'Teammate', role: null, can_access: true }));

    return list.length > 0 ? list : [{ id: membership.id, name: me.user.name ?? 'You', role: null, can_access: true }];
}
