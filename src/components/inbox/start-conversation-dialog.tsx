'use client';

import { useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SearchIcon, SendIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useNow } from '@/components/inbox/conversation-list';
import { RingAvatar } from '@/components/inbox/window-ring';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { dur, engageId, fmtDay, fmtPhone, PERMISSION_VIA, validName, windowLeft, withCountryCode } from '@/lib/inbox';
import { keys, startConversation, type StartPayload, useContact, usePhoneNumbers, useStartSearch, useTemplates } from '@/lib/queries';
import type { LifecycleKey, MessageTemplate, PermissionVia, StartCandidate } from '@/lib/types';
import { cn } from '@/lib/utils';

const LIFE_TONE: Record<LifecycleKey, string> = {
    subscriber: 'border-border bg-muted text-ink-2',
    lead: 'border-info/25 bg-info-bg text-info',
    opportunity: 'border-brand-500/30 bg-brand-50 text-brand-600',
    customer: 'border-good/30 bg-good-bg text-good',
    other: 'border-border bg-muted text-faint',
};
const badge = 'inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11px] font-semibold whitespace-nowrap';
const label = 'flex flex-col gap-1.5 text-[13px] font-semibold';
const field =
    'h-9 rounded-md border border-input bg-card px-2 text-[13px] font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20';
const digitsOf = (v: string) => v.replace(/\D/g, '');
const looksNum = (q: string) => digitsOf(q).length >= 7 && !/[a-z@]/i.test(q);

/** What choosing a search result does, in the words shown on the row. */
function actionOf(c: StartCandidate, now: number): { k: 'none' | 'open' | 'tpl' | 'start'; l: string; why: string } {
    if (c.action === 'no_phone') return { k: 'none', l: 'No phone number', why: 'Add a number in Contacts & CRM first' };
    if (c.conversation && (c.conversation.window_open || windowLeft(c.conversation.window_expires_at, now) > 0))
        return {
            k: 'open',
            l: 'Open chat',
            why: `Window open · ${dur(windowLeft(c.conversation.window_expires_at, now), true)} left · reply without a template`,
        };
    if (c.conversation) return { k: 'tpl', l: 'Send template', why: 'Window closed · template in the existing chat' };

    return { k: 'start', l: 'Start chat', why: 'No chat yet · first message is a template' };
}

type Step = { kind: 'search' } | { kind: 'form'; pre: StartCandidate | null; seed: string };

/**
 * Start a conversation (3.5): search first so nobody gets a duplicate. If the customer already has a chat
 * it is continued (with a template when the window is closed); otherwise a short form records who they
 * are and how they agreed to be contacted, and the first message is an approved utility template.
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
    const router = useRouter();
    const now = useNow();
    const numbers = (usePhoneNumbers().data ?? []).filter((n) => n.status === 'connected');
    const from = numbers.find((n) => n.id === defaultNumberId) ?? numbers[0] ?? null;
    const [step, setStep] = useState<Step>({ kind: 'search' });
    const [typed, setTyped] = useState('');
    const [q, setQ] = useState('');
    const [hl, setHl] = useState(0);
    const listId = useId();
    const search = useStartSearch(q, from?.id ?? null, open && step.kind === 'search');
    const results = useMemo(() => search.data ?? [], [search.data]);

    // Opened for one contact (from its record): straight to the form, or to its chat.
    const preset = useContact(open && contactId ? contactId : null);
    const presetSearch = useStartSearch(preset.data?.phone ?? preset.data?.email ?? preset.data?.display_name ?? '', from?.id ?? null, open && !!preset.data);
    const presetHit = presetSearch.data?.find((c) => c.id === contactId) ?? null;
    const [presetUsed, setPresetUsed] = useState<string | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setQ(typed.trim()), 150);
        return () => clearTimeout(t);
    }, [typed]);

    const close = (o: boolean) => {
        if (!o) {
            setStep({ kind: 'search' });
            setTyped('');
            setHl(0);
            setPresetUsed(null);
        }
        onOpenChange(o);
    };
    const pick = (c: StartCandidate) => {
        const a = actionOf(c, now);
        if (a.k === 'none') return;
        if (a.k === 'start') return setStep({ kind: 'form', pre: c, seed: '' });
        close(false);
        if (a.k === 'tpl') {
            router.push(`/inbox?c=${c.conversation?.id}&compose=template`, { scroll: false });
            toast.message(`Window closed · pick a template to continue with ${c.display_name}`);
        } else {
            onStarted(c.conversation?.id as string);
            toast.success(`Opened ${c.display_name} · window open, reply normally`);
        }
    };
    if (open && presetHit && presetUsed !== presetHit.id && step.kind === 'search') {
        setPresetUsed(presetHit.id);
        const a = actionOf(presetHit, now);
        if (a.k === 'start') setStep({ kind: 'form', pre: presetHit, seed: '' });
    }

    const seedNum = looksNum(q);
    const exact = seedNum && results.some((c) => c.phone && digitsOf(c.phone) === digitsOf(withCountryCode(q)));
    const enabled = results.filter((c) => actionOf(c, now).k !== 'none');
    const count = enabled.length + 1;
    const active = !results.length && q ? count - 1 : Math.min(hl, count - 1);
    const choose = (i: number) => (i < enabled.length ? pick(enabled[i]) : setStep({ kind: 'form', pre: null, seed: typed.trim() }));

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                {step.kind === 'search' ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Start a conversation</DialogTitle>
                            <DialogDescription>
                                Search first so you don’t create a duplicate. If the customer already has a chat, you’ll continue it.
                            </DialogDescription>
                        </DialogHeader>
                        <label className="relative mt-1 block">
                            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-faint" />
                            <input
                                autoFocus
                                value={typed}
                                autoComplete="off"
                                onChange={(e) => (setTyped(e.target.value), setHl(0))}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        setHl((active + (e.key === 'ArrowDown' ? 1 : -1) + count) % count);
                                    }
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        choose(active);
                                    }
                                }}
                                placeholder="Search name, number, email or company"
                                role="combobox"
                                aria-expanded
                                aria-controls={listId}
                                aria-activedescendant={`${listId}-${active}`}
                                aria-label="Search contacts"
                                className="h-9 w-full rounded-md border border-input bg-card pr-2 pl-8 text-[13px] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                            />
                        </label>
                        <div
                            id={listId}
                            role="listbox"
                            aria-label="Contacts"
                            className="mt-2.5 max-h-[min(420px,56vh)] overflow-y-auto rounded-[10px] border p-1"
                        >
                            {!q && <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">Recent contacts</p>}
                            {q && results.length === 0 && !search.isFetching && (
                                <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">No contact matches</p>
                            )}
                            {results.map((c) => {
                                const a = actionOf(c, now);
                                const i = enabled.indexOf(c);
                                const on = i >= 0 && i === active;

                                return (
                                    <button
                                        key={c.id}
                                        id={i >= 0 ? `${listId}-${i}` : undefined}
                                        type="button"
                                        role="option"
                                        aria-selected={on}
                                        disabled={a.k === 'none'}
                                        onMouseEnter={() => i >= 0 && setHl(i)}
                                        onClick={() => pick(c)}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
                                            on && 'bg-muted shadow-[inset_3px_0_0_var(--brand-500)]',
                                        )}
                                    >
                                        <RingAvatar
                                            name={c.display_name}
                                            expiresAt={c.conversation?.window_expires_at}
                                            hasChat={!!c.conversation}
                                            className="size-9 text-[12px]"
                                            now={now}
                                        />
                                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <b className="truncate text-[13px] font-semibold" dir="auto">
                                                {c.display_name}
                                            </b>
                                            <small className="text-[13px] text-muted-foreground">
                                                {c.phone ? fmtPhone(c.phone) : 'Number hidden'}
                                                {c.company ? ` · ${c.company}` : ''}
                                                {c.owner && !c.owner.is_me ? ` · Owned by ${c.owner.name.split(' ')[0]}` : ''}
                                            </small>
                                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                                <span className={cn(badge, LIFE_TONE[c.lifecycle.key])}>{c.lifecycle.label}</span>
                                                {c.opted_out && <span className={cn(badge, 'border-bad/30 bg-bad-bg text-bad')}>Opted out · utility only</span>}
                                                <span className="text-[12px] text-muted-foreground">{a.why}</span>
                                            </span>
                                        </span>
                                        <span
                                            className={cn(
                                                'pointer-events-none inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] font-semibold',
                                                a.k === 'open' ? 'bg-primary text-primary-foreground' : 'border bg-card',
                                            )}
                                        >
                                            {a.l}
                                        </span>
                                    </button>
                                );
                            })}
                            <button
                                id={`${listId}-${enabled.length}`}
                                type="button"
                                role="option"
                                aria-selected={active === enabled.length}
                                onMouseEnter={() => setHl(enabled.length)}
                                onClick={() => choose(enabled.length)}
                                className={cn(
                                    'mt-1 flex w-full items-center gap-3 rounded-b-lg border-t border-line-2 p-2.5 text-left transition-colors duration-150 hover:bg-muted motion-reduce:transition-none',
                                    active === enabled.length && 'bg-muted shadow-[inset_3px_0_0_var(--brand-500)]',
                                )}
                            >
                                <span className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-brand-500/50 text-brand-600">
                                    <PlusIcon className="size-4" />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <b className="truncate text-[13px] font-semibold">
                                        {seedNum && !exact ? (
                                            <>
                                                Start a new contact with <b>{fmtPhone(withCountryCode(q))}</b>
                                            </>
                                        ) : q && !seedNum ? (
                                            <>
                                                Create a new contact “<b>{q}</b>”
                                            </>
                                        ) : (
                                            'New contact'
                                        )}
                                    </b>
                                    <small className="text-[13px] text-muted-foreground">Name, number and how they agreed to be contacted</small>
                                </span>
                            </button>
                        </div>
                        <p className="text-[12px] text-muted-foreground">↑ ↓ to move · Enter to choose · numbers match in any format (050…, 55…, +971 55…)</p>
                    </>
                ) : (
                    from && (
                        <StartForm
                            key={step.pre?.id ?? 'new'}
                            pre={step.pre}
                            seed={step.seed}
                            numberId={from.id}
                            wabaAccountId={from.waba_account_id ?? null}
                            onBack={() => setStep({ kind: 'search' })}
                            onCancel={() => close(false)}
                            onDone={(id) => (close(false), onStarted(id))}
                        />
                    )
                )}
                {step.kind === 'form' && !from && <p className="text-[13px] text-bad">Connect a WhatsApp number first.</p>}
            </DialogContent>
        </Dialog>
    );
}

/** Approved utility templates the form can fill by itself: {{1}} first name, {{2}} enquiry topic. */
function useStartTemplates(wabaAccountId: string | null): MessageTemplate[] {
    const list = useTemplates({ waba_account_id: wabaAccountId }, !!wabaAccountId);

    return useMemo(
        () =>
            (list.data?.data ?? []).filter(
                (t) =>
                    t.status === 'APPROVED' &&
                    t.sendable &&
                    t.category === 'UTILITY' &&
                    t.variables.header.length === 0 &&
                    !['IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].includes(t.variables.header_format ?? '') &&
                    t.variables.body.length <= 2 &&
                    !t.variables.buttons.some((b) => b.variable),
            ),
        [list.data],
    );
}

function StartForm({
    pre,
    seed,
    numberId,
    wabaAccountId,
    onBack,
    onCancel,
    onDone,
}: {
    pre: StartCandidate | null;
    seed: string;
    numberId: string;
    wabaAccountId: string | null;
    onBack: () => void;
    onCancel: () => void;
    onDone: (conversationId: string) => void;
}) {
    const qc = useQueryClient();
    const now = useNow();
    const record = useContact(pre?.id ?? null).data;
    const templates = useStartTemplates(wabaAccountId);
    const num = looksNum(seed);
    const [name, setName] = useState(pre ? (record?.name ?? record?.profile_name ?? pre.display_name ?? '') : num ? '' : seed.includes('@') ? '' : seed);
    const [phone, setPhone] = useState(pre ? (pre.phone ? fmtPhone(pre.phone) : '') : num ? fmtPhone(withCountryCode(seed)) : '');
    const [via, setVia] = useState<PermissionVia | ''>('');
    const [viaNote, setViaNote] = useState('');
    const [email, setEmail] = useState(seed.includes('@') ? seed : '');
    const [company, setCompany] = useState('');
    const [source, setSource] = useState('Outbound · started by You');
    const [tags, setTags] = useState('');
    const [tpl, setTpl] = useState('');
    const [topic, setTopic] = useState('');
    const [deal, setDeal] = useState(false);
    const [error, setError] = useState<React.ReactNode>(null);
    const [bad, setBad] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const viaRef = useRef<HTMLSelectElement>(null);
    const noteRef = useRef<HTMLInputElement>(null);
    const needOptIn = !pre || !pre.has_permission;
    const own = pre?.owner && !pre.owner.is_me ? pre.owner.name.split(' ')[0] : '';
    const t = templates.find((x) => x.id === tpl) ?? templates[0] ?? null;
    const perm = record?.contact_permission;

    useEffect(() => {
        const el = pre ? document.getElementById('nc-topic') : !name ? nameRef.current : needOptIn && phone ? viaRef.current : phoneRef.current;
        setTimeout(() => el?.focus(), 40);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fail = (m: React.ReactNode, at: 'name' | 'phone' | 'via' | 'note' | null) => {
        setError(m);
        setBad(at);
        (({ name: nameRef, phone: phoneRef, via: viaRef, note: noteRef }) as const)[at ?? 'name'].current?.focus();
    };
    const submit = async () => {
        const n = name.trim().replace(/\s+/g, ' ');
        if (!validName(n)) return fail('Enter the customer’s name: at least two letters, no numbers', 'name');
        const raw = withCountryCode(phone);
        const d = digitsOf(raw);
        if (!pre && (!raw.startsWith('+') || d.length < 8 || d.length > 15))
            return fail('Enter a WhatsApp number, e.g. 050 123 4567 or +971 50 123 4567', 'phone');
        if (needOptIn && !via) return fail('Choose how they agreed to be contacted', 'via');
        if (via === 'other' && viaNote.trim().length < 3) return fail('Say how they agreed to be contacted', 'note');
        if (!t) return fail('No approved utility template fits. Approve one with up to two variables ({{1}} name, {{2}} topic).', null);
        const body = t.variables.body.map((_, i) => (i === 0 ? n.split(' ')[0] : topic.trim() || 'your enquiry'));
        const payload: StartPayload = {
            phone_number_id: numberId,
            ...(pre
                ? { contact_id: pre.id }
                : {
                      to: raw,
                      new_contact: {
                          name: n,
                          email: email.trim().toLowerCase() || null,
                          company: company.trim() || null,
                          source: source.trim() || null,
                          tags: tags
                              .split(',')
                              .map((x) => x.trim())
                              .filter(Boolean),
                      },
                  }),
            ...(via ? { permission: { via, note: viaNote.trim() || null } } : {}),
            type: 'template',
            template: { name: t.name, language: t.language, variables: { header: [], body, buttons: {} } },
            topic: topic.trim() || null,
            create_enquiry: deal,
        };
        setBusy(true);
        try {
            const message = await startConversation(payload, newId());
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            toast.success(
                pre
                    ? `Template sent to ${pre.display_name}${own ? ` · ${own} notified` : ''} · Waiting for customer`
                    : `Contact created · template sent to ${n} · Waiting for customer`,
            );
            onDone(message.conversation_id);
        } catch (e) {
            const m = errorMessage(e);
            const saved = m.match(/^Already saved as (.+?)\.?$/);
            if (saved) {
                fail(
                    <>
                        Already saved as <b>{saved[1]}</b>.{' '}
                        <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={onBack}>
                            Open instead
                        </button>
                    </>,
                    'phone',
                );
            } else fail(m, null);
        } finally {
            setBusy(false);
        }
    };
    const errClass = (k: string) => (bad === k ? 'border-bad' : '');

    return (
        <>
            <DialogHeader>
                <DialogTitle>{pre ? `Start a conversation with ${pre.display_name}` : 'New contact'}</DialogTitle>
                <DialogDescription>
                    {pre
                        ? 'Business-initiated chats start with an approved template.'
                        : 'Only the first three fields are required. Add the rest now or later in the contact panel.'}
                </DialogDescription>
            </DialogHeader>
            {pre ? (
                <p className="mt-2 rounded-lg border bg-muted/50 px-3 py-2 text-[12px]">
                    Uses the existing contact <b>{engageId(pre.id)}</b>. The chat, any deal and the history stay on this record.
                    {own && (
                        <>
                            {' '}
                            <b>{own}</b> stays the owner and is notified.
                        </>
                    )}
                </p>
            ) : (
                <button type="button" onClick={onBack} className="-mt-1 mb-1 w-fit text-[13px] font-semibold text-brand-600 hover:underline">
                    ‹ Back to search
                </button>
            )}
            <form
                className="grid gap-y-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
                onChange={() => (setError(null), setBad(null))}
            >
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <label className={label}>
                        <span>
                            Name <small className="font-normal text-bad">· required</small>
                        </span>
                        <Input
                            ref={nameRef}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Layla Al Mansoori"
                            dir="auto"
                            className={errClass('name')}
                        />
                    </label>
                    <label className={label}>
                        <span>
                            WhatsApp number <small className="font-normal text-bad">· required</small>
                        </span>
                        <Input
                            ref={phoneRef}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            readOnly={!!pre}
                            placeholder="050 123 4567 or +971 50 123 4567"
                            inputMode="tel"
                            className={errClass('phone')}
                        />
                    </label>
                </div>
                {error && (
                    <p role="alert" className="text-[13px] text-bad">
                        {error}
                    </p>
                )}
                {needOptIn ? (
                    <>
                        <label className={cn(label, 'mt-1')}>
                            <span>
                                How did they agree to be contacted on WhatsApp? <small className="font-normal text-bad">· required</small>
                            </span>
                            <select
                                ref={viaRef}
                                className={cn(field, errClass('via'))}
                                value={via}
                                onChange={(e) => setVia(e.target.value as PermissionVia | '')}
                            >
                                <option value="">Choose…</option>
                                {PERMISSION_VIA.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {via === 'other' && (
                            <Input
                                ref={noteRef}
                                value={viaNote}
                                onChange={(e) => setViaNote(e.target.value)}
                                placeholder="Say how, e.g. asked at the exhibition stand"
                                className={errClass('note')}
                            />
                        )}
                        <p className="text-[12px] text-muted-foreground">
                            Meta only allows a business to message first when the person shared their number and agreed to hear from you. This is saved on the
                            contact with your name and the time.
                        </p>
                    </>
                ) : (
                    <p className="mt-2.5 text-[12px] text-muted-foreground">
                        Permission on record: {perm ? `${perm.via_label} · ${fmtDay(perm.at, now)}` : 'the customer wrote to you or opted in to marketing'}.
                    </p>
                )}
                {!pre && (
                    <details className="mt-3 rounded-lg border border-line-2 px-3 py-2">
                        <summary className="cursor-pointer text-[13px] font-semibold text-ink-2">
                            More details <small className="font-normal text-muted-foreground">· optional</small>
                        </summary>
                        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
                            <label className={label}>
                                Email
                                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" type="email" />
                            </label>
                            <label className={label}>
                                Company
                                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" />
                            </label>
                            <label className={label}>
                                Source
                                <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} />
                            </label>
                            <label className={label}>
                                Tags
                                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma separated" />
                            </label>
                        </div>
                    </details>
                )}
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
                    <label className={label}>
                        Template
                        <select className={field} value={t?.id ?? ''} onChange={(e) => setTpl(e.target.value)} disabled={templates.length === 0}>
                            {templates.length === 0 && <option value="">No approved utility template</option>}
                            {templates.map((x) => (
                                <option key={x.id} value={x.id}>
                                    {x.name} · {x.language}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className={label}>
                        {'{{2}}'} Enquiry topic
                        <Input id="nc-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. your website project" maxLength={120} />
                    </label>
                </div>
                <label className="mt-2 flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={deal} onChange={(e) => setDeal(e.target.checked)} className="size-4 accent-[var(--brand-500)]" /> Create a
                    CRM deal for this enquiry <span className="text-muted-foreground">(leave off for billing, support or hiring)</span>
                </label>
                <button type="submit" hidden />
            </form>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button disabled={busy} onClick={() => void submit()}>
                    {busy ? 'Sending…' : 'Send template'} <SendIcon />
                </Button>
            </DialogFooter>
        </>
    );
}
