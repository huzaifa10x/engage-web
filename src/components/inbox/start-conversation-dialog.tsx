'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, ChevronDownIcon, MessageCircleIcon, PhoneOffIcon, SearchIcon, SendIcon, UserPlusIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Field, FormError } from '@/components/app/field';
import { TagInput } from '@/components/contacts/tag-input';
import { RingAvatar } from '@/components/inbox/window-ring';
import { emptySelection, selectionError, selectionPayload, TemplatePicker, type TemplateSelection } from '@/components/templates/template-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { LIFECYCLE_TONE, looksLikePhone, PERMISSION_VIA, validName, withCountryCode } from '@/lib/inbox';
import { keys, startConversation, type StartPayload, useContact, usePhoneNumbers, useStartSearch } from '@/lib/queries';
import type { PermissionVia, StartCandidate } from '@/lib/types';
import { cn } from '@/lib/utils';

type Step = { kind: 'search' } | { kind: 'existing'; candidate: StartCandidate } | { kind: 'new'; typed: string };

const ACTION: Record<StartCandidate['action'], string> = {
    open_chat: 'Open chat',
    send_template: 'Send template',
    start_chat: 'Start chat',
    no_phone: 'No phone',
};

/**
 * Start conversation, search first (3.5). Type a name, number (any format), email or company; each result
 * says what will happen: open the chat they already have, send a template (window closed), start a chat,
 * or nothing (no number). The last option adds a new contact with what was typed. Arrow keys and Enter work.
 */
export function StartConversationDialog({
    open,
    onOpenChange,
    defaultNumberId,
    contactId,
    onStarted,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    defaultNumberId?: string | null;
    /** Opened from a contact's record: straight to that contact. */
    contactId?: string | null;
    onStarted: (conversationId: string) => void;
}) {
    const numbers = (usePhoneNumbers().data ?? []).filter((n) => n.status === 'connected');
    const [numberId, setNumberId] = useState<string | null>(defaultNumberId ?? null);
    const from = numbers.find((n) => n.id === numberId) ?? numbers[0] ?? null;
    const [step, setStep] = useState<Step>({ kind: 'search' });
    const [typed, setTyped] = useState('');
    const [q, setQ] = useState('');
    const [active, setActive] = useState(0);
    const listId = useId();
    const search = useStartSearch(q, from?.id ?? null, open && step.kind === 'search');
    const results = search.data ?? [];
    const options = results.length + 1; // the last one: a new contact

    // Opened for one contact (from its record): straight to that contact, until Back.
    const preset = useContact(open && contactId ? contactId : null);
    const presetSearch = useStartSearch(preset.data?.phone ?? preset.data?.display_name ?? '', from?.id ?? null, open && !!preset.data);
    const presetHit = presetSearch.data?.find((c) => c.id === contactId) ?? null;
    const [presetDismissed, setPresetDismissed] = useState(false);
    const current: Step = step.kind === 'search' && presetHit && !presetDismissed ? { kind: 'existing', candidate: presetHit } : step;

    useEffect(() => {
        const t = setTimeout(() => setQ(typed.trim()), 200);

        return () => clearTimeout(t);
    }, [typed]);

    const close = (o: boolean) => {
        if (!o) {
            setStep({ kind: 'search' });
            setTyped('');
            setPresetDismissed(false);
        }
        onOpenChange(o);
    };

    const choose = (c: StartCandidate) => {
        if (c.action === 'no_phone') return;
        if (c.action === 'open_chat' && c.conversation) {
            close(false);
            onStarted(c.conversation.id);

            return;
        }
        setStep({ kind: 'existing', candidate: c });
    };

    const pickActive = () => (active < results.length ? choose(results[active]) : setStep({ kind: 'new', typed: typed.trim() }));

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {current.kind !== 'search' && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="-ml-1"
                                onClick={() => (setStep({ kind: 'search' }), setPresetDismissed(true))}
                                aria-label="Back to search"
                            >
                                <ArrowLeftIcon />
                            </Button>
                        )}
                        {current.kind === 'new' ? 'New contact' : 'Start conversation'}
                    </DialogTitle>
                    <DialogDescription>
                        {current.kind === 'search'
                            ? 'Search first: the person may already have a chat or be another teammate’s customer.'
                            : current.kind === 'new'
                              ? 'Add who they are and how they agreed to be contacted, then send the first template.'
                              : 'WhatsApp only allows an approved template until the customer replies.'}
                    </DialogDescription>
                </DialogHeader>

                {numbers.length > 1 && (
                    <Field label="From" htmlFor="sc-from">
                        <Select value={from?.id ?? ''} onValueChange={setNumberId}>
                            <SelectTrigger id="sc-from">
                                <SelectValue placeholder="Choose a number" />
                            </SelectTrigger>
                            <SelectContent>
                                {numbers.map((n) => (
                                    <SelectItem key={n.id} value={n.id}>
                                        {n.verified_name ?? n.display_phone_number}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                {current.kind === 'search' && (
                    <div className="grid gap-2">
                        <div className="relative">
                            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
                            <Input
                                autoFocus
                                value={typed}
                                onChange={(e) => (setTyped(e.target.value), setActive(0))}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => (a + 1) % options));
                                    if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => (a - 1 + options) % options));
                                    if (e.key === 'Enter') (e.preventDefault(), pickActive());
                                }}
                                placeholder="Name, number, email or company"
                                className="pl-8"
                                role="combobox"
                                aria-expanded
                                aria-controls={listId}
                                aria-activedescendant={`${listId}-${active}`}
                                aria-label="Search contacts"
                            />
                        </div>
                        {!q && results.length > 0 && <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Recent</p>}
                        <ul id={listId} role="listbox" aria-label="Contacts" className="max-h-[46vh] divide-y overflow-y-auto rounded-lg border">
                            {results.map((c, i) => (
                                <li
                                    key={c.id}
                                    id={`${listId}-${i}`}
                                    role="option"
                                    aria-selected={active === i}
                                    aria-disabled={c.action === 'no_phone'}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => choose(c)}
                                    className={cn(
                                        'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-100 motion-reduce:transition-none',
                                        active === i && 'bg-muted',
                                        c.action === 'no_phone' && 'cursor-not-allowed',
                                    )}
                                >
                                    <RingAvatar
                                        name={c.display_name}
                                        expiresAt={c.conversation?.window_expires_at}
                                        hasChat={!!c.conversation}
                                        className="size-9 text-[12px]"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            <span className="truncate text-[13px] font-semibold">{c.display_name}</span>
                                            <Badge tone={LIFECYCLE_TONE[c.lifecycle.key]} className="border border-current/15 text-[11px]">
                                                {c.lifecycle.label}
                                            </Badge>
                                        </span>
                                        <span className="block truncate text-[12px] text-muted-foreground">
                                            {[c.phone ?? 'No phone number', c.company].filter(Boolean).join(' · ')}
                                        </span>
                                        {c.opted_out && <span className="block text-[11px] font-semibold text-bad">Opted out · utility only</span>}
                                        {c.owner && !c.owner.is_me && <span className="block text-[11px] text-muted-foreground">Owned by {c.owner.name}</span>}
                                    </span>
                                    <span
                                        className={cn(
                                            'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[12px] font-semibold',
                                            c.action === 'no_phone'
                                                ? 'bg-muted text-faint'
                                                : c.action === 'open_chat'
                                                  ? 'bg-primary text-primary-foreground'
                                                  : 'border bg-card',
                                        )}
                                    >
                                        {c.action === 'no_phone' ? (
                                            <PhoneOffIcon className="size-3.5" />
                                        ) : c.action === 'open_chat' ? (
                                            <MessageCircleIcon className="size-3.5" />
                                        ) : (
                                            <SendIcon className="size-3.5" />
                                        )}
                                        {ACTION[c.action]}
                                    </span>
                                </li>
                            ))}
                            <li
                                id={`${listId}-${results.length}`}
                                role="option"
                                aria-selected={active === results.length}
                                onMouseEnter={() => setActive(results.length)}
                                onClick={() => setStep({ kind: 'new', typed: typed.trim() })}
                                className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5', active === results.length && 'bg-muted')}
                            >
                                <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                                    <UserPlusIcon className="size-4" />
                                </span>
                                <span className="text-[13px] font-semibold">
                                    {typed.trim() ? `New contact “${typed.trim()}”` : 'New contact'}
                                    {search.isFetching && <span className="ml-2 font-normal text-faint">Searching…</span>}
                                </span>
                            </li>
                        </ul>
                    </div>
                )}

                {current.kind === 'existing' && from && (
                    <ExistingForm
                        candidate={current.candidate}
                        numberId={from.id}
                        wabaAccountId={from.waba_account_id ?? null}
                        onDone={(id) => (close(false), onStarted(id))}
                    />
                )}
                {current.kind === 'new' && from && (
                    <NewContactForm
                        typed={current.typed}
                        numberId={from.id}
                        wabaAccountId={from.waba_account_id ?? null}
                        onDone={(id) => (close(false), onStarted(id))}
                    />
                )}
                {current.kind !== 'search' && !from && <FormError message="Connect a WhatsApp number first." />}
            </DialogContent>
        </Dialog>
    );
}

/** How the customer agreed to be contacted: required for a new contact or one with nothing on record. */
function PermissionField({
    via,
    note,
    onVia,
    onNote,
}: {
    via: PermissionVia | null;
    note: string;
    onVia: (v: PermissionVia) => void;
    onNote: (v: string) => void;
}) {
    return (
        <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-[13px] font-semibold">How did they agree to be contacted?</legend>
            <div className="grid gap-1 sm:grid-cols-2">
                {PERMISSION_VIA.map((p) => (
                    <label
                        key={p.id}
                        className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px] transition-colors duration-100 motion-reduce:transition-none',
                            via === p.id ? 'border-brand-500 bg-brand-50 font-semibold' : 'hover:bg-muted',
                        )}
                    >
                        <input
                            type="radio"
                            name="permission"
                            value={p.id}
                            checked={via === p.id}
                            onChange={() => onVia(p.id)}
                            className="accent-[var(--brand-500)]"
                        />
                        {p.label}
                    </label>
                ))}
            </div>
            {via === 'other' && (
                <Input value={note} onChange={(e) => onNote(e.target.value)} maxLength={200} placeholder="Say how they agreed" aria-label="How they agreed" />
            )}
        </fieldset>
    );
}

function useSend(onDone: (conversationId: string) => void) {
    const qc = useQueryClient();
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const send = async (payload: StartPayload) => {
        setError(null);
        setPending(true);
        try {
            const message = await startConversation(payload, newId());
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            onDone(message.conversation_id);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setPending(false);
        }
    };

    return { send, error, setError, pending };
}

function TopicAndDeal({ topic, onTopic, deal, onDeal }: { topic: string; onTopic: (v: string) => void; deal: boolean; onDeal: (v: boolean) => void }) {
    return (
        <>
            <Field label="Topic" htmlFor="sc-topic" hint="Optional. What the chat is about, for the team.">
                <Input id="sc-topic" value={topic} onChange={(e) => onTopic(e.target.value)} maxLength={200} placeholder="e.g. Wedding photography quote" />
            </Field>
            <label className="flex items-center gap-2 text-[13px]">
                <Checkbox checked={deal} onCheckedChange={(v) => onDeal(v === true)} /> Create deal
            </label>
        </>
    );
}

function ExistingForm({
    candidate: c,
    numberId,
    wabaAccountId,
    onDone,
}: {
    candidate: StartCandidate;
    numberId: string;
    wabaAccountId: string | null;
    onDone: (id: string) => void;
}) {
    const askPermission = !c.has_permission && !c.conversation;
    const [via, setVia] = useState<PermissionVia | null>(null);
    const [note, setNote] = useState('');
    const [selection, setSelection] = useState<TemplateSelection>(emptySelection);
    const [topic, setTopic] = useState('');
    const [deal, setDeal] = useState(false);
    const { send, error, setError, pending } = useSend(onDone);

    const submit = () => {
        if (askPermission && !via) return setError('Say how they agreed to be contacted.');
        if (via === 'other' && !note.trim()) return setError('Add a short note on how they agreed.');
        const problem = selectionError(selection);
        if (problem) return setError(problem);
        if (c.opted_out && selection.template?.category === 'MARKETING')
            return setError('This contact opted out. Choose a utility or authentication template.');
        void send({
            phone_number_id: numberId,
            contact_id: c.id,
            ...selectionPayload(selection),
            ...(via ? { permission: { via, note: note.trim() || null } } : {}),
            topic: topic.trim() || null,
            create_enquiry: deal,
        });
    };

    return (
        <div className="grid gap-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                <RingAvatar name={c.display_name} expiresAt={c.conversation?.window_expires_at} hasChat={!!c.conversation} className="size-9 text-[12px]" />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{c.display_name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{[c.phone, c.company].filter(Boolean).join(' · ')}</span>
                </span>
            </div>
            {c.owner && !c.owner.is_me && (
                <p className="rounded-md bg-info-bg px-3 py-2 text-[12px] text-info">
                    {c.owner.name}’s customer. They stay the owner and are told you started a chat.
                </p>
            )}
            {c.opted_out && (
                <p className="rounded-md bg-bad-bg px-3 py-2 text-[12px] text-bad">Opted out of marketing: only utility and authentication templates.</p>
            )}
            {askPermission && <PermissionField via={via} note={note} onVia={setVia} onNote={setNote} />}
            <TemplatePicker wabaAccountId={wabaAccountId} value={selection} onChange={setSelection} category={c.opted_out ? 'UTILITY' : null} idPrefix="sc" />
            <TopicAndDeal topic={topic} onTopic={setTopic} deal={deal} onDeal={setDeal} />
            <FormError message={error} />
            <DialogFooter>
                <Button onClick={submit} disabled={pending}>
                    <SendIcon /> {pending ? 'Sending…' : 'Send template'}
                </Button>
            </DialogFooter>
        </div>
    );
}

function NewContactForm({
    typed,
    numberId,
    wabaAccountId,
    onDone,
}: {
    typed: string;
    numberId: string;
    wabaAccountId: string | null;
    onDone: (id: string) => void;
}) {
    // What was typed in the search goes where it belongs: a number into WhatsApp number, anything else into Name.
    const [name, setName] = useState(looksLikePhone(typed) ? '' : typed);
    const [phone, setPhone] = useState(looksLikePhone(typed) ? withCountryCode(typed) : '');
    const [via, setVia] = useState<PermissionVia | null>(null);
    const [note, setNote] = useState('');
    const [more, setMore] = useState(false);
    const [email, setEmail] = useState('');
    const [company, setCompany] = useState('');
    const [source, setSource] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [selection, setSelection] = useState<TemplateSelection>(emptySelection);
    const [topic, setTopic] = useState('');
    const [deal, setDeal] = useState(false);
    const { send, error, setError, pending } = useSend(onDone);
    const nameRef = useRef<HTMLInputElement>(null);
    const nameProblem = name && !validName(name) ? 'Use at least 2 letters and no numbers.' : null;
    const normalized = useMemo(() => withCountryCode(phone), [phone]);

    const submit = () => {
        if (!validName(name)) return (setError('Add their name: at least 2 letters, no numbers.'), nameRef.current?.focus());
        if (!looksLikePhone(phone)) return setError('Add their WhatsApp number, e.g. +971 50 123 4567.');
        if (!via) return setError('Say how they agreed to be contacted.');
        if (via === 'other' && !note.trim()) return setError('Add a short note on how they agreed.');
        const problem = selectionError(selection);
        if (problem) return setError(problem);
        void send({
            phone_number_id: numberId,
            to: normalized,
            new_contact: { name: name.trim(), email: email.trim() || null, company: company.trim() || null, source: source.trim() || null, tags },
            permission: { via, note: note.trim() || null },
            ...selectionPayload(selection),
            topic: topic.trim() || null,
            create_enquiry: deal,
        });
    };

    return (
        <div className="grid gap-4">
            <Field label="Name" htmlFor="nc-name" error={nameProblem ?? undefined}>
                <Input id="nc-name" ref={nameRef} autoFocus={!name} value={name} onChange={(e) => setName(e.target.value)} maxLength={190} dir="auto" />
            </Field>
            <Field
                label="WhatsApp number"
                htmlFor="nc-phone"
                hint={phone && normalized !== phone.trim() ? `Saved as ${normalized}` : 'Local UAE numbers get +971.'}
            >
                <Input
                    id="nc-phone"
                    autoFocus={!!name && !phone}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="+971 50 123 4567"
                />
            </Field>
            <PermissionField via={via} note={note} onVia={setVia} onNote={setNote} />
            <div className="grid gap-3">
                <button
                    type="button"
                    onClick={() => setMore((m) => !m)}
                    aria-expanded={more}
                    className="flex w-fit items-center gap-1 text-[13px] font-semibold text-brand-600"
                >
                    <ChevronDownIcon className={cn('size-4 transition-transform duration-150 motion-reduce:transition-none', !more && '-rotate-90')} /> More
                    details
                </button>
                {more && (
                    <div className="grid gap-3 rounded-lg border p-3">
                        <Field label="Email" htmlFor="nc-email">
                            <Input id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </Field>
                        <Field label="Company" htmlFor="nc-company">
                            <Input id="nc-company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={190} />
                        </Field>
                        <Field label="Source" htmlFor="nc-source" hint="Where they came from, e.g. Expo stand, referral.">
                            <Input id="nc-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} />
                        </Field>
                        <Field label="Tags" htmlFor="nc-tags">
                            <TagInput id="nc-tags" value={tags} onChange={setTags} />
                        </Field>
                    </div>
                )}
            </div>
            <TemplatePicker wabaAccountId={wabaAccountId} value={selection} onChange={setSelection} idPrefix="nc" />
            <TopicAndDeal topic={topic} onTopic={setTopic} deal={deal} onDeal={setDeal} />
            <FormError message={error} />
            <DialogFooter>
                <Button onClick={submit} disabled={pending}>
                    <SendIcon /> {pending ? 'Sending…' : 'Save and send'}
                </Button>
            </DialogFooter>
        </div>
    );
}
