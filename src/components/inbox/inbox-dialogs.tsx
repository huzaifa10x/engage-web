'use client';

import { useQueryClient } from '@tanstack/react-query';
import { FlagIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/app/field';
import { invalidateEnquiry, money } from '@/components/contacts/enquiry-card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { engageId, fmtDay, fmtPhone, nextDefault, STEP_TYPES } from '@/lib/inbox';
import { flagResolution, keys, updateContactRecord, useNextSteps, useStages } from '@/lib/queries';
import type { Assignee } from '@/lib/queries';
import type { Contact, Enquiry, NextStep, Resolution } from '@/lib/types';

const label = 'grid gap-1.5 text-[13px] font-semibold';
const PERIODS = [
    { id: 'once', label: 'one-off' },
    { id: 'month', label: '/ month' },
    { id: 'year', label: '/ year' },
];
const SOURCES = ['Unattributed', 'Existing customer · WhatsApp', 'Referral', 'Website', 'Phone call / walk-in', 'Click-to-WhatsApp ad', 'Instagram'];
const toLocalInput = (d: Date) => {
    const x = new Date(d);
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());

    return x.toISOString().slice(0, 16);
};

/** New deal (3.5): a CRM deal on this contact; it becomes the deal the chat is working on. */
export function NewDealDialog({
    contact,
    open,
    onOpenChange,
    owners,
    defaultOwner,
}: {
    contact: Contact;
    open: boolean;
    onOpenChange: (o: boolean) => void;
    owners: Assignee[];
    defaultOwner: string | null;
}) {
    const qc = useQueryClient();
    const stages = useStages(open);
    const openStages = (stages.data ?? []).filter((s) => (s.group ?? 'open') === 'open' && !s.archived);
    const [title, setTitle] = useState('');
    const [stage, setStage] = useState('');
    const [value, setValue] = useState('');
    const [period, setPeriod] = useState('once');
    const [close, setClose] = useState('');
    const [owner, setOwner] = useState(defaultOwner ?? '');
    const [source, setSource] = useState('Unattributed');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const save = async () => {
        const v = value.replace(/[, ]/g, '');
        if (!title.trim()) return setError('Give the deal a title');
        if (v && (Number.isNaN(+v) || +v < 0)) return setError('Value must be a positive number');
        setBusy(true);
        setError(null);
        try {
            const started = await api<{ data: { id: string } }>(`contacts/${contact.id}/enquiries`, {
                method: 'POST',
                body: { note: source !== 'Unattributed' ? source : null },
            });
            const id = started.data.id;
            const fresh = await api<{ data: Enquiry }>(`enquiries/${id}`);
            await api(`enquiries/${id}`, {
                method: 'PATCH',
                body: {
                    version: fresh.data.details_version,
                    title: title.trim(),
                    value: v ? +v : null,
                    value_period: v ? period : null,
                    expected_close_on: close || null,
                    owner_membership_id: owner || null,
                },
            });
            const target = stage || openStages[0]?.id;
            if (target && target !== fresh.data.stage?.id) {
                await api(`contacts/${contact.id}/stage`, {
                    method: 'POST',
                    body: { stage_id: target, version: fresh.data.stage_version, enquiry_id: id, via: 'chat' },
                });
            }
            invalidateEnquiry(qc, contact.id);
            toast.success('Deal created in Contacts & CRM and set as active');
            onOpenChange(false);
            setTitle('');
            setValue('');
            setClose('');
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>New deal</DialogTitle>
                    <DialogDescription>
                        Creates a CRM deal on {contact.display_name}. A contact can have several deals; this one becomes the deal the chat is working on.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <label className={label}>
                        What do they want?
                        <Input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={120}
                            placeholder="e.g. Instagram ads for Marina launch"
                            dir="auto"
                        />
                    </label>
                    <label className={label}>
                        Stage
                        <Select value={stage || openStages[0]?.id || ''} onValueChange={setStage}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose…" />
                            </SelectTrigger>
                            <SelectContent>
                                {openStages.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    <div className={label}>
                        <span>
                            Value (AED) <small className="font-normal text-muted-foreground">· optional</small>
                        </span>
                        <span className="flex gap-1.5">
                            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="Not set" aria-label="Value" />
                            <Select value={period} onValueChange={setPeriod}>
                                <SelectTrigger className="w-32" aria-label="Billing">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PERIODS.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </span>
                    </div>
                    <label className={label}>
                        <span>
                            Expected close <small className="font-normal text-muted-foreground">· optional</small>
                        </span>
                        <Input type="date" value={close} onChange={(e) => setClose(e.target.value)} />
                    </label>
                    <label className={label}>
                        Deal owner
                        <Select value={owner || 'none'} onValueChange={(v) => setOwner(v === 'none' ? '' : v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {owners.map((o) => (
                                    <SelectItem key={o.id} value={o.id}>
                                        {o.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    <label className={label}>
                        Where did this enquiry come from?
                        <Select value={source} onValueChange={setSource}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SOURCES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {s}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-[11px] font-normal text-muted-foreground">
                            Not the contact’s original source ({contact.source}). Use Unattributed if unsure; an ad or link is recognised by itself.
                        </span>
                    </label>
                    <FormError message={error} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={busy}>
                        {busy ? 'Creating…' : 'Create deal'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Read-only deal details: viewing a deal never changes what the chat is working on. */
export function DealDetailsDialog({
    deal,
    onClose,
    onWorkOn,
    current,
}: {
    deal: Enquiry | null;
    onClose: () => void;
    onWorkOn: (d: Enquiry) => void;
    current: boolean;
}) {
    const steps = useNextSteps(deal?.contact_id ?? null, true);
    const mine = (steps.data ?? []).filter((s) => s.enquiry_id === deal?.id);

    return (
        <Dialog open={!!deal} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Deal details</DialogTitle>
                    <DialogDescription>Read-only. Viewing a deal doesn’t change what this chat is working on.</DialogDescription>
                </DialogHeader>
                {deal && (
                    <div className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-[13px]">
                        <b className="text-[17px] font-semibold" dir="auto">
                            {deal.title ?? `Enquiry ${deal.number}`}
                        </b>
                        <Kv k="Stage" v={deal.stage?.name ?? 'No stage'} />
                        <Kv k="Value" v={money(deal)} />
                        <Kv k={deal.open ? 'Expected close' : 'Closed'} v={deal.expected_close_on ? fmtDay(deal.expected_close_on) : 'Not set'} />
                        <Kv k="Owner" v={deal.owner?.name ?? 'No owner'} />
                        <Kv k="Deal source" v={deal.source_label} />
                        <Kv
                            k="Created"
                            v={`${fmtDay(deal.started_at)} · ${deal.started_by === 'customer' ? 'Customer message' : deal.started_by === 'agent' ? 'A teammate' : 'Automation'}`}
                        />
                        <p className="mt-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Tasks ({mine.length})</p>
                        {mine.length === 0 && <p className="text-muted-foreground">No tasks</p>}
                        {mine.map((s) => (
                            <Kv
                                key={s.id}
                                k={`${s.type_label} · ${fmtDay(s.due_at)}`}
                                v={s.status === 'cancelled' ? 'Cancelled' : s.status === 'done' ? 'Done' : 'Open'}
                            />
                        ))}
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    {deal && deal.open && !current && <Button onClick={() => onWorkOn(deal)}>Work on this deal</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function Kv({ k, v }: { k: string; v: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3 border-b border-line-2 py-1.5 last:border-b-0">
            <span className="text-muted-foreground">{k}</span>
            <span className="text-right" dir="auto">
                {v}
            </span>
        </div>
    );
}

/** Set (or edit) a next step: saved to Follow-ups & Alerts. It doesn't snooze the chat or change Needs reply. */
export function StepDialog({
    contactId,
    deals,
    currentDealId,
    step,
    presetType,
    open,
    onOpenChange,
    owners,
    defaultOwner,
}: {
    contactId: string;
    deals: Enquiry[];
    currentDealId: string | null;
    step?: NextStep | null;
    presetType?: string | null;
    open: boolean;
    onOpenChange: (o: boolean) => void;
    owners: Assignee[];
    defaultOwner: string | null;
}) {
    const qc = useQueryClient();
    const [type, setType] = useState<string>(step?.type ?? presetType ?? 'message');
    const [deal, setDeal] = useState<string>(step ? (step.enquiry_id ?? '') : (currentDealId ?? ''));
    const [due, setDue] = useState(() => toLocalInput(step ? new Date(step.due_at) : nextDefault(presetType ?? 'message')));
    const [owner, setOwner] = useState(step?.assigned?.id ?? defaultOwner ?? owners[0]?.id ?? '');
    const [note, setNote] = useState(step && step.title !== step.type_label ? step.title : '');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const openDeals = deals.filter((d) => d.open);
    const quick = (i: number) => {
        const x = new Date();
        if (i === 0) x.setHours(x.getHours() + 2);
        if (i === 1) {
            x.setDate(x.getDate() + 1);
            x.setHours(10, 0, 0, 0);
        }
        if (i === 2) {
            x.setDate(x.getDate() + 3);
            x.setHours(10, 0, 0, 0);
        }
        setDue(toLocalInput(x));
    };

    const save = async () => {
        const at = Date.parse(due);
        if (!at || at <= Date.now()) return setError('Pick a time in the future');
        const typeLabel = STEP_TYPES.find((t) => t.id === type)?.label ?? 'Follow up';
        const body = {
            type,
            enquiry_id: deal || null,
            due_at: new Date(at).toISOString(),
            assigned_membership_id: owner || null,
            title: note.trim() || typeLabel,
        };
        setBusy(true);
        setError(null);
        try {
            if (step) await api(`next-steps/${step.id}`, { method: 'PATCH', body });
            else await api(`contacts/${contactId}/next-steps`, { method: 'POST', body });
            invalidateEnquiry(qc, contactId);
            void qc.invalidateQueries({ queryKey: ['inbox', 'events'] });
            toast.success('Next step saved to Follow-ups');
            onOpenChange(false);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };
    const remove = async () => {
        if (!step) return;
        try {
            await api(`next-steps/${step.id}`, { method: 'PATCH', body: { status: 'cancelled', cancel_reason: 'Deleted' } });
            invalidateEnquiry(qc, contactId);
            onOpenChange(false);
        } catch (e) {
            setError(errorMessage(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{step ? 'Edit next step' : 'Set next step'}</DialogTitle>
                    <DialogDescription>Saved to Follow-ups. It doesn’t snooze the chat or change Needs reply.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <label className={label}>
                        Type
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STEP_TYPES.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                        {t.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    <label className={label}>
                        For deal
                        <Select value={deal || 'none'} onValueChange={(v) => setDeal(v === 'none' ? '' : v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {openDeals.map((d) => (
                                    <SelectItem key={d.id} value={d.id}>
                                        {d.title ?? `Enquiry ${d.number}`}
                                    </SelectItem>
                                ))}
                                <SelectItem value="none">Not linked to a deal (contact only)</SelectItem>
                            </SelectContent>
                        </Select>
                    </label>
                    <div className={label}>
                        Due
                        <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due" />
                        <span className="flex flex-wrap gap-1">
                            {['In 2 hours', 'Tomorrow 10:00', 'In 3 days'].map((l, i) => (
                                <button
                                    key={l}
                                    type="button"
                                    onClick={() => quick(i)}
                                    className="h-[26px] rounded-full border px-2.5 text-[12px] font-semibold text-ink-2 hover:bg-muted"
                                >
                                    {l}
                                </button>
                            ))}
                        </span>
                    </div>
                    <label className={label}>
                        Responsible
                        <Select value={owner} onValueChange={setOwner}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose…" />
                            </SelectTrigger>
                            <SelectContent>
                                {owners.map((o) => (
                                    <SelectItem key={o.id} value={o.id}>
                                        {o.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    <label className={label}>
                        <span>
                            Note <small className="font-normal text-muted-foreground">· optional</small>
                        </span>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            maxLength={160}
                            className="resize-none rounded-md border border-input bg-card px-3 py-2 text-[13px] font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                        />
                    </label>
                    <FormError message={error} />
                </div>
                <DialogFooter>
                    {step && (
                        <Button variant="outline" className="mr-auto text-bad" onClick={() => void remove()}>
                            Delete
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={busy}>
                        Save next step
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Edit contact (from the chat): only contact fields; deals, next steps and history are separate records. */
export function EditContactDialog({ contact, open, onOpenChange }: { contact: Contact; open: boolean; onOpenChange: (o: boolean) => void }) {
    const qc = useQueryClient();
    const [name, setName] = useState(contact.name ?? '');
    const [email, setEmail] = useState(contact.email ?? '');
    const [company, setCompany] = useState(contact.company ?? '');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const save = async () => {
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Enter a valid email or leave it empty');
        setBusy(true);
        setError(null);
        try {
            await updateContactRecord(contact.id, { name: name.trim() || null, email: email.trim() || null, company: company.trim() || null });
            void qc.invalidateQueries({ queryKey: ['contacts'] });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: ['inbox', 'conversation'] });
            toast.success('Contact saved');
            onOpenChange(false);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit contact</DialogTitle>
                    <DialogDescription>Only contact fields live here. Deals, next steps and history are separate CRM records.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <label className={label}>
                        Display name
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={contact.profile_name ?? 'Customer name'} dir="auto" />
                    </label>
                    {contact.profile_name && (
                        <p className="-mt-1 text-[12px] text-muted-foreground">
                            WhatsApp profile name: <b dir="auto">{contact.profile_name}</b>{' '}
                            <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => setName(contact.profile_name ?? '')}>
                                Use this
                            </button>
                        </p>
                    )}
                    <div className={label}>
                        <span>
                            WhatsApp identity <small className="font-normal text-muted-foreground">· read-only</small>
                        </span>
                        <div className="grid gap-0.5 rounded-lg border bg-muted/40 px-3 py-2 text-[12px] font-normal">
                            <Kv k="engageX ID" v={<span className="font-mono">{engageId(contact.id)}</span>} />
                            <Kv k="WhatsApp user ID" v={<span className="font-mono">{contact.bsuid ?? '—'}</span>} />
                            <Kv k="Phone" v={contact.phone ? fmtPhone(contact.phone) : 'Hidden by customer'} />
                        </div>
                        <span className="text-[11px] font-normal text-muted-foreground">
                            Messages match this contact by WhatsApp user ID first, then phone, so it still works if the customer hides their number.
                        </span>
                    </div>
                    <label className={label}>
                        <span>
                            Email <small className="font-normal text-muted-foreground">· optional</small>
                        </span>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
                    </label>
                    <label className={label}>
                        <span>
                            Company <small className="font-normal text-muted-foreground">· optional</small>
                        </span>
                        <Input value={company} onChange={(e) => setCompany(e.target.value)} />
                    </label>
                    <FormError message={error} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={busy}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Snooze until a chosen time. */
export function SnoozeDialog({ open, onOpenChange, onSnooze }: { open: boolean; onOpenChange: (o: boolean) => void; onSnooze: (at: Date) => Promise<void> }) {
    const [at, setAt] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);

        return toLocalInput(d);
    });
    const [error, setError] = useState<string | null>(null);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Snooze until…</DialogTitle>
                    <DialogDescription>The chat leaves Needs reply until this time, or until the customer messages again.</DialogDescription>
                </DialogHeader>
                <label className={label}>
                    Wake up at
                    <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
                </label>
                <FormError message={error} />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={async () => {
                            const t = Date.parse(at);
                            if (!t || t <= Date.now()) return setError('Pick a time in the future');
                            await onSnooze(new Date(t));
                            onOpenChange(false);
                        }}
                    >
                        Snooze
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Flag for review (managers): the chat reopens, goes back to whoever resolved it with your note, and the
 * original closure stays in the history.
 */
export function FlagDialog({ resolution, contactName, onClose }: { resolution: Resolution | null; contactName: string; onClose: () => void }) {
    const qc = useQueryClient();
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const who = resolution?.resolved_by?.name.split(' ')[0] ?? 'the agent';

    return (
        <Dialog open={!!resolution} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FlagIcon className="size-[17px] text-bad" /> Flag for review
                    </DialogTitle>
                    <DialogDescription>
                        Sends the chat with {contactName} back to {who} with your note. The original closure ({resolution?.reason_label},{' '}
                        {resolution ? fmtDay(resolution.resolved_at) : ''}) stays in the history.
                    </DialogDescription>
                </DialogHeader>
                <label className={label}>
                    Note for {who}
                    <textarea
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        maxLength={300}
                        placeholder="e.g. This looks like a real lead, please follow up today."
                        className="resize-none rounded-md border border-input bg-card px-3 py-2 text-[13px] font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                    />
                </label>
                <FormError message={error} />
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={busy}
                        onClick={async () => {
                            if (!resolution) return;
                            if (note.trim().length < 3) return setError('Add a short note so the agent knows what to do');
                            setBusy(true);
                            try {
                                await flagResolution(resolution.id, note.trim());
                                void qc.invalidateQueries({ queryKey: ['inbox'] });
                                toast.success(`Sent back to ${who}`);
                                setNote('');
                                onClose();
                            } catch (e) {
                                setError(errorMessage(e));
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        Flag and send back
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
