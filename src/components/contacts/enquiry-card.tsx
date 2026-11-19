'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClockIcon, CheckIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DateField } from '@/components/app/date-field';
import { useSession } from '@/components/app/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError, errorMessage } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { P } from '@/lib/permissions';
import { AED } from '@/lib/promise';
import { keys, useAssignees, useStages } from '@/lib/queries';
import type { CrmStage, Enquiry, NextStep } from '@/lib/types';
import { cn } from '@/lib/utils';

const PERIOD: Record<string, string> = { once: '', month: ' / month', year: ' / year' };

export const LOST_REASONS = ['Chose another company', 'Too expensive', 'Dates or plans changed', 'Stopped replying', 'Not a real enquiry', 'Other'];

const STEP_TYPES: [NextStep['type'], string][] = [
    ['call', 'Call'],
    ['message', 'Message'],
    ['meeting', 'Meeting'],
    ['quote', 'Send quote'],
    ['other', 'Other'],
];

export function money(e: Pick<Enquiry, 'value' | 'value_period'>): string {
    return e.value === null ? 'Value not set' : `${AED(e.value)}${PERIOD[e.value_period ?? 'once'] ?? ''}`;
}

/** Everything that shows an enquiry is refreshed after a change. */
export function invalidateEnquiry(qc: ReturnType<typeof useQueryClient>, contactId: string) {
    void qc.invalidateQueries({ queryKey: ['contacts', contactId] });
    void qc.invalidateQueries({ queryKey: ['enquiries'] });
    void qc.invalidateQueries({ queryKey: keys.contactsAll });
    void qc.invalidateQueries({ queryKey: keys.conversationsAll });
    void qc.invalidateQueries({ queryKey: keys.stages });
    void qc.invalidateQueries({ queryKey: keys.stageHistory(contactId) });
    void qc.invalidateQueries({ queryKey: ['inbox', 'conversation'] });
    void qc.invalidateQueries({ queryKey: ['reports'] });
}

/** Moves one enquiry to a stage (the version it was loaded with is sent back: nobody is overwritten). */
export function useMoveEnquiry(enquiry: Enquiry, via: 'chat' | 'leads' | 'contact' = 'chat', onDone?: () => void) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: ({ stageId, reason }: { stageId: string | null; reason?: string | null }) =>
            api(`contacts/${enquiry.contact_id}/stage`, {
                method: 'POST',
                body: { stage_id: stageId, version: enquiry.stage_version, reason: reason?.trim() || null, enquiry_id: enquiry.id, via },
            }),
        onSuccess: () => {
            invalidateEnquiry(qc, enquiry.contact_id);
            onDone?.();
        },
        onError: (e) => {
            if (e instanceof ApiError && e.status === 409) invalidateEnquiry(qc, enquiry.contact_id);
        },
    });
}

/**
 * Closing an enquiry (3.3): to a Won-group stage it needs a verified payment, or a reference
 * (invoice, receipt or contract number) from anyone who replies to customers; to a Lost-group stage,
 * a reason. An open next step can be cancelled at the same time. Used by Booked / Not booked, the
 * stage stepper and dragging a card on the board.
 */
export function CloseEnquiryDialog({
    enquiry,
    stage,
    open,
    onOpenChange,
    onDone,
}: {
    enquiry: Enquiry;
    stage: Pick<CrmStage, 'id' | 'name' | 'group'> | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDone?: () => void;
}) {
    const qc = useQueryClient();
    const [ref, setRef] = useState('');
    const [lost, setLost] = useState('');
    const [other, setOther] = useState('');
    const [cancelStep, setCancelStep] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState<string | null>(null);
    const key = `${enquiry.id}:${stage?.id}`;
    if (open && loaded !== key) {
        setLoaded(key);
        setRef('');
        setLost('');
        setOther('');
        setCancelStep(true);
        setError(null);
    }
    if (!open && loaded !== null) setLoaded(null);

    const won = stage?.group === 'won';
    const needsRef = won && !enquiry.verified_paid;
    const move = useMoveEnquiry(enquiry, 'chat');

    const save = async () => {
        if (!stage) return;
        let reason: string | null = null;
        if (needsRef) {
            if (ref.trim().length < 3) return setError('Add the invoice, receipt or contract number (at least 3 characters).');
            reason = ref.trim();
        }
        if (stage.group === 'lost') {
            if (!lost) return setError('Choose why it was lost.');
            if (lost === 'Other' && other.trim().length < 3) return setError('Say why it was lost.');
            reason = lost === 'Other' ? other.trim() : lost + (other.trim() ? ` · ${other.trim()}` : '');
        }
        setError(null);
        try {
            await move.mutateAsync({ stageId: stage.id, reason });
            if (cancelStep && enquiry.next_step) {
                await api(`next-steps/${enquiry.next_step.id}`, {
                    method: 'PATCH',
                    body: { status: 'cancelled', cancel_reason: `Enquiry moved to ${stage.name}` },
                });
                invalidateEnquiry(qc, enquiry.contact_id);
            }
            toast.success(won ? `${stage.name} · ${needsRef ? `reference ${reason}` : 'verified payment'}` : `${stage.name} · ${reason}`);
            onOpenChange(false);
            onDone?.();
        } catch (e) {
            setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {won ? 'Mark as' : 'Close as'} {stage?.name}
                    </DialogTitle>
                    <DialogDescription>
                        {enquiry.title ?? `Enquiry ${enquiry.number}`}
                        {enquiry.contact ? ` · ${enquiry.contact.name}` : ''} · {money(enquiry)}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 text-[13px]">
                    {won && enquiry.verified_paid && (
                        <p className="rounded-md bg-good-bg px-3 py-2 text-good">A verified payment is linked to this enquiry: no reference is needed.</p>
                    )}
                    {needsRef && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="won-ref">Reference</Label>
                            <Input
                                id="won-ref"
                                value={ref}
                                maxLength={120}
                                onChange={(e) => setRef(e.target.value)}
                                placeholder="e.g. INV-2209 or Contract NR-114"
                            />
                            <p className="text-[12px] text-muted-foreground">
                                No verified payment yet. A booking marked by staff is shown as “Booked (marked by staff)”, never as paid.
                            </p>
                        </div>
                    )}
                    {stage?.group === 'lost' && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="lost-reason">Why was it lost?</Label>
                            <Select value={lost} onValueChange={setLost}>
                                <SelectTrigger id="lost-reason">
                                    <SelectValue placeholder="Choose…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {LOST_REASONS.map((r) => (
                                        <SelectItem key={r} value={r}>
                                            {r}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                value={other}
                                maxLength={150}
                                onChange={(e) => setOther(e.target.value)}
                                placeholder={lost === 'Other' ? 'Say why (required)' : 'Details (optional)'}
                                aria-label="Details"
                            />
                        </div>
                    )}
                    {enquiry.next_step && (
                        <label className="flex items-center gap-2">
                            <Checkbox checked={cancelStep} onCheckedChange={(v) => setCancelStep(v === true)} />
                            Cancel the open next step: {enquiry.next_step.title} ({dateTime(enquiry.next_step.due_at)})
                        </label>
                    )}
                    {error && (
                        <p role="alert" className="text-[12.5px] text-bad">
                            {error}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={move.isPending}>
                        {move.isPending ? 'Saving…' : `Move to ${stage?.name ?? ''}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Edits the card. The version it was loaded with is sent back: if a teammate saved in between,
 * nothing is overwritten, their version is loaded and the person makes the change again.
 */
export function EnquiryEditDialog({ enquiry, open, onOpenChange }: { enquiry: Enquiry; open: boolean; onOpenChange: (open: boolean) => void }) {
    const qc = useQueryClient();
    const [title, setTitle] = useState('');
    const [value, setValue] = useState('');
    const [period, setPeriod] = useState<'once' | 'month' | 'year'>('once');
    const [close, setClose] = useState('');
    const [conflict, setConflict] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState<string | null>(null);
    const key = `${enquiry.id}:${enquiry.details_version}`;
    if (open && loaded !== key) {
        setLoaded(key);
        setTitle(enquiry.title ?? '');
        setValue(enquiry.value !== null ? String(enquiry.value) : '');
        setPeriod(enquiry.value_period ?? 'once');
        setClose(enquiry.expected_close_on ?? '');
        setError(null);
    }
    if (!open && loaded !== null) {
        setLoaded(null);
        setConflict(null);
    }

    const save = useMutation({
        mutationFn: () =>
            api<{ data: Enquiry }>(`enquiries/${enquiry.id}`, {
                method: 'PATCH',
                body: {
                    version: enquiry.details_version,
                    title: title.trim() || null,
                    value: value.trim() === '' ? null : Number(value),
                    value_period: value.trim() === '' ? null : period,
                    expected_close_on: close || null,
                },
            }),
        onSuccess: () => {
            toast.success('Enquiry saved');
            invalidateEnquiry(qc, enquiry.contact_id);
            onOpenChange(false);
        },
        onError: (e) => {
            if (e instanceof ApiError && e.status === 409) {
                // Their version replaces the form when it reloads (the version changes).
                setConflict(e.message);
                invalidateEnquiry(qc, enquiry.contact_id);

                return;
            }
            setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        },
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit enquiry {enquiry.number}</DialogTitle>
                    <DialogDescription>
                        {enquiry.updated_by
                            ? `Last changed by ${enquiry.updated_by}, ${dateTime(enquiry.updated_at)}.`
                            : 'What the customer is asking about and what it is worth.'}
                    </DialogDescription>
                </DialogHeader>
                {conflict && (
                    <p role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
                        {conflict}
                    </p>
                )}
                <div className="grid gap-3 text-[13px]">
                    <div className="grid gap-1.5">
                        <Label htmlFor="enq-title">What it is about</Label>
                        <Input id="enq-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SUV rental, 3 days" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="enq-value">Value (AED)</Label>
                            <Input id="enq-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="enq-period">Billed</Label>
                            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                                <SelectTrigger id="enq-period">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="once">One-off</SelectItem>
                                    <SelectItem value="month">Monthly</SelectItem>
                                    <SelectItem value="year">Yearly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="enq-close">Expected to close</Label>
                        <DateField id="enq-close" value={close} onChange={setClose} />
                    </div>
                    {error && (
                        <p role="alert" className="text-[12.5px] text-bad">
                            {error}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => save.mutate()} disabled={save.isPending}>
                        {save.isPending ? 'Saving…' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function NextStepDialog({
    contactId,
    enquiryId,
    open,
    onOpenChange,
    conversationId,
}: {
    contactId: string;
    enquiryId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId?: string;
}) {
    const qc = useQueryClient();
    const { membership } = useSession();
    const assignees = useAssignees(conversationId, open && !!conversationId);
    const [type, setType] = useState<NextStep['type']>('call');
    const [title, setTitle] = useState('');
    const [due, setDue] = useState('');
    const [who, setWho] = useState(membership.id);
    const [error, setError] = useState<string | null>(null);

    const save = useMutation({
        mutationFn: () =>
            api(`contacts/${contactId}/next-steps`, {
                method: 'POST',
                body: { enquiry_id: enquiryId, type, title: title.trim(), due_at: due ? new Date(due).toISOString() : null, assigned_membership_id: who },
            }),
        onSuccess: () => {
            toast.success('Next step added');
            invalidateEnquiry(qc, contactId);
            setTitle('');
            setDue('');
            onOpenChange(false);
        },
        onError: (e) => setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add a next step</DialogTitle>
                    <DialogDescription>What happens next, and when. It shows on the enquiry until it is done.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 text-[13px]">
                    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Type">
                        {STEP_TYPES.map(([k, l]) => (
                            <button
                                key={k}
                                type="button"
                                role="radio"
                                aria-checked={type === k}
                                onClick={() => setType(k)}
                                className={cn(
                                    'rounded-full border px-2.5 py-0.5 text-[12.5px]',
                                    type === k ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground',
                                )}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="step-title">What</Label>
                        <Input
                            id="step-title"
                            value={title}
                            maxLength={160}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Call back about the quote"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="step-due">When</Label>
                        <Input id="step-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
                    </div>
                    {assignees.data && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="step-who">Who</Label>
                            <Select value={who} onValueChange={setWho}>
                                <SelectTrigger id="step-who">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {assignees.data.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name}
                                            {m.id === membership.id ? ' (you)' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {error && (
                        <p role="alert" className="text-[12.5px] text-bad">
                            {error}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => save.mutate()} disabled={save.isPending || !title.trim() || !due}>
                        {save.isPending ? 'Saving…' : 'Add step'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * The enquiry card (3.3): what it is about, its stage as a stepper (open stages, then Won), Booked /
 * Not booked as shortcuts to the Won and Lost stages, money kept honest (booked by staff vs paid
 * verified), the next step, and editing without overwriting a teammate.
 */
export function EnquiryCard({ enquiry, conversationId, compact = false }: { enquiry: Enquiry; conversationId?: string; compact?: boolean }) {
    const qc = useQueryClient();
    const { can } = useSession();
    const stages = (useStages().data ?? []).filter((s) => !s.archived);
    const openStages = stages.filter((s) => (s.group ?? 'open') === 'open');
    const wonStage = stages.find((s) => s.group === 'won') ?? null;
    const lostStage = stages.find((s) => s.group === 'lost') ?? null;
    const [closing, setClosing] = useState<CrmStage | null>(null);
    const [editing, setEditing] = useState(false);
    const [adding, setAdding] = useState(false);
    const move = useMoveEnquiry(enquiry, 'chat', () => toast.success('Stage updated'));
    const canMove = can(P.StagesChange);
    const canEdit = can(P.ContactsUpdate);

    const go = (s: CrmStage) => {
        if (s.id === enquiry.stage?.id) return;
        if ((s.group ?? 'open') === 'open') move.mutate({ stageId: s.id }, { onError: (e) => toast.error(errorMessage(e)) });
        else setClosing(s);
    };
    const doneStep = async (step: NextStep) => {
        try {
            await api(`next-steps/${step.id}`, { method: 'PATCH', body: { status: 'done' } });
            toast.success('Next step done');
            invalidateEnquiry(qc, enquiry.contact_id);
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    const steps = [...openStages, ...(wonStage ? [wonStage] : [])];
    const reached = steps.findIndex((s) => s.id === enquiry.stage?.id);

    return (
        <div className="grid gap-2.5 rounded-lg border bg-card p-3 text-[13px]" aria-label={`Enquiry ${enquiry.number}`}>
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{enquiry.title ?? `Enquiry ${enquiry.number}`}</p>
                    <p className="text-[12px] text-muted-foreground">
                        {money(enquiry)}
                        {enquiry.expected_close_on ? ` · closes ${date(enquiry.expected_close_on)}` : ''}
                    </p>
                </div>
                {canEdit && (
                    <Button size="icon-sm" variant="ghost" aria-label="Edit enquiry" onClick={() => setEditing(true)}>
                        <PencilIcon />
                    </Button>
                )}
            </div>

            {enquiry.group === 'open' ? (
                <ol className="flex flex-wrap gap-1" aria-label="Stage">
                    {steps.map((s, i) => (
                        <li key={s.id}>
                            <button
                                type="button"
                                disabled={!canMove || move.isPending}
                                onClick={() => go(s)}
                                aria-current={s.id === enquiry.stage?.id ? 'step' : undefined}
                                className={cn(
                                    'rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-colors enabled:hover:bg-muted',
                                    s.id === enquiry.stage?.id
                                        ? 'border-primary bg-primary text-primary-foreground enabled:hover:bg-primary'
                                        : i < reached
                                          ? 'border-brand-600/40 text-brand-600'
                                          : 'text-muted-foreground',
                                )}
                            >
                                {s.name}
                            </button>
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={enquiry.group === 'won' ? 'good' : 'bad'}>{enquiry.stage?.name}</Badge>
                    <span className="text-[12px] text-muted-foreground">
                        {enquiry.group === 'won'
                            ? enquiry.won?.reference
                                ? `Reference ${enquiry.won.reference}${enquiry.won.by ? ` · ${enquiry.won.by}` : ''}`
                                : 'Verified payment'
                            : enquiry.lost_reason}
                    </span>
                    {canMove && openStages[0] && (
                        <button type="button" className="text-[12px] text-primary underline-offset-2 hover:underline" onClick={() => go(openStages[0])}>
                            Reopen
                        </button>
                    )}
                </p>
            )}

            {enquiry.group === 'open' && canMove && (wonStage || lostStage) && (
                <div className="flex gap-2">
                    {wonStage && (
                        <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => setClosing(wonStage)}
                            aria-label={`Booked: move to ${wonStage.name}`}
                            title={`Moves the enquiry to ${wonStage.name}`}
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
                            title={`Moves the enquiry to ${lostStage.name}`}
                        >
                            Not booked
                        </Button>
                    )}
                </div>
            )}

            {!compact && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                    <dt className="text-muted-foreground">Booked (marked by staff)</dt>
                    <dd className="text-right">{enquiry.group === 'won' && !enquiry.won?.verified ? money(enquiry) : '—'}</dd>
                    <dt className="text-muted-foreground">Paid (verified)</dt>
                    <dd className={cn('text-right', enquiry.verified_paid && 'font-semibold text-good')}>
                        {enquiry.verified_paid ? AED(enquiry.paid_total) : '—'}
                    </dd>
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="text-right">
                        {enquiry.source_label}{' '}
                        <Badge tone={enquiry.source_confidence === 'verified' ? 'good' : enquiry.source_confidence === 'partial' ? 'warn' : 'grey'}>
                            {enquiry.confidence_label}
                        </Badge>
                    </dd>
                </dl>
            )}

            {enquiry.next_step ? (
                <div className={cn('flex items-center gap-2 rounded-md px-2.5 py-1.5', enquiry.next_step.overdue ? 'bg-bad-bg text-bad' : 'bg-muted')}>
                    <CalendarClockIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">
                        {enquiry.next_step.title} · {dateTime(enquiry.next_step.due_at)}
                        {enquiry.next_step.assigned ? ` · ${enquiry.next_step.assigned.name.split(' ')[0]}` : ''}
                    </span>
                    {canEdit && (
                        <button
                            type="button"
                            className="text-[12px] font-semibold underline-offset-2 hover:underline"
                            onClick={() => void doneStep(enquiry.next_step!)}
                        >
                            Done
                        </button>
                    )}
                </div>
            ) : (
                enquiry.group === 'open' &&
                canEdit && (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-left text-[12.5px] text-warn hover:bg-muted"
                    >
                        <PlusIcon className="size-3.5" /> No next step · add one
                    </button>
                )
            )}

            <CloseEnquiryDialog enquiry={enquiry} stage={closing} open={closing !== null} onOpenChange={(o) => !o && setClosing(null)} />
            <EnquiryEditDialog enquiry={enquiry} open={editing} onOpenChange={setEditing} />
            <NextStepDialog contactId={enquiry.contact_id} enquiryId={enquiry.id} open={adding} onOpenChange={setAdding} conversationId={conversationId} />
        </div>
    );
}
