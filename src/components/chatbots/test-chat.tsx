'use client';

import { ClockIcon, ImageIcon, ListIcon, MapPinIcon, MicIcon, RotateCcwIcon, SendIcon, StickyNoteIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/components/app/session';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type ChatbotOptions, LANGUAGES, RTL, testChatbot, type TestOptions, type TestTurn, type TranscriptItem } from '@/lib/chatbots';
import { P } from '@/lib/permissions';
import { useContacts } from '@/lib/queries';
import { cn } from '@/lib/utils';

import { messageOfPayload, RichText } from './wa-preview';

type Item = TranscriptItem & { key: number };
type Input_ = { text?: string; payload?: string; type?: string; action?: 'timeout' };

const NOBODY = '__test__';

/**
 * The test simulator: the real engine runs the current draft, as a sample customer or a real
 * contact (their name, fields and tags). Nothing is sent on WhatsApp and nothing is saved. API and
 * Sheets steps are dry runs (their sample answer, or the failure chosen in Test conditions) unless a
 * person allowed to manage integrations confirms live calls to the workspace's test endpoints.
 * The block the customer is at lights up on the canvas.
 */
export function TestChat({
    flowId,
    botName,
    languages,
    numberId,
    options,
    onClose,
    onNode,
    fromNode = null,
    fromTitle,
    selectedNode = null,
    onFromNode,
}: {
    flowId: string;
    botName: string;
    languages: string[];
    numberId: string | null;
    options: ChatbotOptions | undefined;
    onClose: () => void;
    onNode: (id: string | null) => void;
    /** Start the test at this step instead of the beginning (“Test from this step”). */
    fromNode?: string | null;
    fromTitle?: string;
    /** The step selected in the builder, for “From selected step”. */
    selectedNode?: string | null;
    onFromNode?: (id: string | null) => void;
}) {
    const { can } = useSession();
    const mayGoLive = can(P.ChatbotsPublish) && can(P.IntegrationsManage);
    /** What the test runs under: whose number, the 24-hour window, how API/Sheets steps answer, a paid lead source. */
    const [cfg, setCfg] = useState<TestOptions>({ number_id: numberId, window: 'open', api_mode: 'success', source: null, integrations: 'mock' });
    const [showCfg, setShowCfg] = useState(false);
    const [askLive, setAskLive] = useState(false);
    const [reason, setReason] = useState('');
    const live = cfg.integrations === 'live';
    const [items, setItems] = useState<Item[]>([]);
    const [testId, setTestId] = useState<string | null>(null);
    const [state, setState] = useState<TestTurn['state'] | null>(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [contactId, setContactId] = useState<string>(NOBODY);
    const [lang, setLang] = useState(languages[0] ?? 'en');
    const counter = useRef(0);
    const scroller = useRef<HTMLDivElement>(null);
    const contacts = useContacts({});
    const people = (contacts.data?.pages.flatMap((p) => p.data) ?? []).slice(0, 50);

    const push = (list: TranscriptItem[]) => setItems((prev) => [...prev, ...list.map((i) => ({ ...i, key: counter.current++ }))]);
    const apply = (r: TestTurn) => {
        setTestId(r.test_id);
        setState(r.state);
        onNode(r.state.node_id);
        push(r.transcript);
    };

    const turn = async (input: Input_, shown?: string, fresh = false, contact = contactId, language = lang, conditions = cfg) => {
        if (shown) push([{ kind: 'customer', text: shown }]);
        setBusy(true);
        setError(null);
        try {
            apply(
                await testChatbot(flowId, {
                    test_id: fresh ? null : testId,
                    contact_id: contact === NOBODY ? null : contact,
                    language: fresh ? language : undefined,
                    from_node: fresh ? (fromNode ?? undefined) : undefined,
                    ...conditions,
                    source: fresh ? (conditions.source ?? undefined) : undefined,
                    ...input,
                }),
            );
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const restart = (contact = contactId, language = lang, conditions = cfg) => {
        setItems([]);
        setTestId(null);
        setState(null);
        void turn({}, undefined, true, contact, language, conditions);
    };
    const changeCfg = (patch: Partial<TestOptions>) => {
        const next = { ...cfg, ...patch };
        setCfg(next);
        restart(contactId, lang, next);
    };

    // The conversation starts as soon as the simulator opens.
    useEffect(() => {
        let alive = true;
        testChatbot(flowId, { language: languages[0] ?? null, ...cfg, source: undefined, from_node: fromNode ?? undefined })
            .then((r) => alive && apply(r))
            .catch((e) => alive && setError(errorMessage(e)))
            .finally(() => alive && setBusy(false));

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the simulator opens
    }, [flowId]);

    useEffect(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [items.length, busy]);

    const running = state === null || ['active', 'waiting'].includes(state.status);
    const rtl = RTL.includes(state?.language ?? lang);
    const send = () => {
        const t = text.trim();
        if (!t || busy) return;
        setText('');
        void turn({ text: t }, t);
    };

    const conditionsChanged = live || cfg.window === 'closed' || cfg.api_mode !== 'success' || !!cfg.source || contactId !== NOBODY;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="cb-col" style={{ gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--cb-line)' }}>
                <div className="cb-banner sample cb-small">
                    <span>
                        <b>Test mode.</b> Runs this draft on the same engine as live chats. Nothing is sent on WhatsApp, no contact is changed, API and Sheets
                        steps use sample answers unless you choose your test endpoints, and tests never appear in Runs or Insights.
                    </span>
                </div>
                <details className="cb-card" style={{ padding: 0 }} open={showCfg} onToggle={(e) => setShowCfg((e.target as HTMLDetailsElement).open)}>
                    <summary className="cursor-pointer px-3 py-2.5 text-[13.5px] font-semibold" aria-label="Test settings">
                        Test settings{conditionsChanged ? ' · changed' : ''}
                    </summary>
                    <div className="grid grid-cols-2 gap-2 px-3 pb-3 text-[12.5px]" data-testid="test-conditions">
                        <label className="cb-field">
                            <span className="l">Customer</span>
                            <select
                                className="cb-in"
                                value={contactId}
                                onChange={(e) => {
                                    setContactId(e.target.value);
                                    restart(e.target.value);
                                }}
                                aria-label="Test as contact"
                            >
                                <option value={NOBODY}>New customer (unknown)</option>
                                {people.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.display_name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <CfgSelect
                            label="WhatsApp number"
                            value={cfg.number_id ?? '__flow__'}
                            onChange={(v) => changeCfg({ number_id: v === '__flow__' ? numberId : v })}
                            options={[
                                ['__flow__', 'The flow’s number'],
                                ...(options?.numbers ?? []).map((n) => [n.id, n.verified_name ?? n.display_phone_number ?? n.id] as [string, string]),
                            ]}
                        />
                        <CfgSelect
                            label="API and integrations"
                            value={live ? 'live' : (cfg.api_mode ?? 'success')}
                            onChange={(v) => {
                                if (v === 'live') setAskLive(true);
                                else
                                    changeCfg({
                                        api_mode: v as 'success' | 'error' | 'timeout',
                                        integrations: 'mock',
                                        confirm_live: undefined,
                                        live_reason: undefined,
                                    });
                            }}
                            options={[
                                ['success', 'Succeed (sample answer)'],
                                ['error', 'Fail with an error'],
                                ['timeout', 'Time out'],
                                ...(mayGoLive ? [['live', 'Call test endpoints for real…'] as [string, string]] : []),
                            ]}
                        />
                        <CfgSelect
                            label="24-hour window"
                            value={cfg.window ?? 'open'}
                            onChange={(v) => changeCfg({ window: v as 'open' | 'closed' })}
                            options={[
                                ['open', 'Open (customer wrote)'],
                                ['closed', 'Closed (templates only)'],
                            ]}
                        />
                        <CfgSelect
                            label="Lead source"
                            value={cfg.source ?? '__none__'}
                            onChange={(v) => changeCfg({ source: v === '__none__' ? null : (v as TestOptions['source']) })}
                            options={[
                                ['__none__', 'None (organic)'],
                                ['meta_ad', 'Meta ad'],
                                ['google_ads', 'Google Ads'],
                                ['paid_other', 'Other paid source'],
                            ]}
                        />
                        {languages.length > 1 && (
                            <CfgSelect
                                label="Language"
                                value={lang}
                                onChange={(v) => {
                                    setLang(v);
                                    restart(contactId, v);
                                }}
                                options={languages.map((l) => [l, LANGUAGES[l] ?? l.toUpperCase()] as [string, string])}
                            />
                        )}
                    </div>
                </details>
                <div className="cb-row">
                    <button type="button" className="cb-btn sm" onClick={() => (fromNode && onFromNode ? onFromNode(null) : restart())} disabled={busy}>
                        <RotateCcwIcon className="size-3.5" /> Restart
                    </button>
                    {onFromNode && (
                        <button
                            type="button"
                            className="cb-btn sm"
                            disabled={busy || !selectedNode}
                            title={selectedNode ? 'Start the test at the step selected in the flow' : 'Select a step in the flow first'}
                            onClick={() => (selectedNode === fromNode ? restart() : onFromNode(selectedNode))}
                        >
                            ▶ From selected step
                        </button>
                    )}
                    <button
                        type="button"
                        className="cb-btn sm"
                        disabled={busy || !state?.has_timeout}
                        title="Pretend the customer stopped answering: the step’s No reply path runs now"
                        onClick={() => void turn({ action: 'timeout' }, undefined)}
                    >
                        <ClockIcon className="size-3.5" /> No reply
                    </button>
                    <button
                        type="button"
                        className="cb-btn sm cb-iconbtn cb-spacer"
                        onClick={() => {
                            onNode(null);
                            onClose();
                        }}
                        aria-label="Close the test"
                        title="Close the test"
                    >
                        <XIcon className="size-4" />
                    </button>
                </div>
                {live && (
                    <p className="cb-banner warn cb-small" data-testid="live-banner">
                        Live integrations: API and Sheets steps call your workspace’s test endpoints for real, and each call is recorded in the audit log.
                        Anything else stays a dry run. WhatsApp messages are never sent from a test.
                    </p>
                )}
            </div>
            <Dialog open={askLive} onOpenChange={setAskLive}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Call test endpoints for real?</DialogTitle>
                        <DialogDescription>
                            API and Google Sheets steps will really call the test endpoints set in Workspace settings (only those). The calls can change data in
                            those systems. Each one is recorded in the audit log with your name and this reason.
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Why, e.g. check the sandbox CRM mapping"
                        maxLength={200}
                        aria-label="Reason"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAskLive(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={reason.trim().length < 5}
                            onClick={() => {
                                setAskLive(false);
                                changeCfg({ integrations: 'live', confirm_live: true, live_reason: reason.trim() });
                            }}
                        >
                            Call for real
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="flex items-center gap-2.5 bg-[#008069] px-3 py-2 text-white">
                <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-sm" aria-hidden>
                    🤖
                </span>
                <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{botName || 'Your business'}</p>
                    <p className="text-[11px] opacity-85">{busy ? 'typing…' : state?.status === 'handed_off' ? 'a person is handling this chat' : 'online'}</p>
                </div>
            </div>

            <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#efeae2] px-3 py-3" dir={rtl ? 'rtl' : undefined}>
                {items.map((item) =>
                    item.kind === 'customer' ? (
                        <div key={item.key} className="flex justify-end">
                            <p className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-2.5 py-1.5 text-[13px] whitespace-pre-wrap shadow-xs">
                                {item.text}
                            </p>
                        </div>
                    ) : item.kind === 'note' ? (
                        <p
                            key={item.key}
                            className="mx-auto w-fit max-w-[92%] rounded-md bg-[#fff6d8] px-2.5 py-1 text-center text-[11px] text-[#7a5d00]"
                            dir="ltr"
                        >
                            {item.text}
                        </p>
                    ) : item.kind === 'internal' ? (
                        <div
                            key={item.key}
                            className="mx-auto max-w-[92%] rounded-md border border-dashed border-[#d6b656] bg-[#fffbea] px-2.5 py-1.5 text-[11.5px] text-[#5f4800]"
                            dir="ltr"
                        >
                            <p className="flex items-center gap-1 font-bold">
                                <StickyNoteIcon className="size-3" /> Internal note by {item.author}
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap">{item.text}</p>
                        </div>
                    ) : (
                        <BotMessage
                            key={item.key}
                            message={item.message}
                            disabled={busy || !running}
                            onTap={(payload, title) => void turn({ payload, text: title }, title)}
                        />
                    ),
                )}
                {busy && (
                    <div className="inline-flex gap-1 rounded-lg bg-card px-3 py-2.5 shadow-xs" aria-label="The bot is typing">
                        {[0, 1, 2].map((i) => (
                            <span key={i} className="size-1.5 animate-pulse rounded-full bg-slate-400" style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                    </div>
                )}
                {state && !running && (
                    <p className="mx-auto mt-2 w-fit rounded-md bg-card px-3 py-1.5 text-[12px] text-muted-foreground shadow-xs" dir="ltr">
                        {state.status === 'handed_off'
                            ? '⏸ Handed off: in a real chat a person continues here.'
                            : state.status === 'completed'
                              ? '🏁 The flow finished.'
                              : '⏹ The flow stopped.'}{' '}
                        <button className="font-semibold text-brand-600 hover:underline" onClick={() => restart()}>
                            Start again
                        </button>
                    </p>
                )}
                {state?.status === 'waiting' && !busy && (
                    <p className="mx-auto w-fit rounded-md bg-card px-3 py-1.5 text-[12px] text-muted-foreground shadow-xs" dir="ltr">
                        ⏱ Waiting.{' '}
                        <button className="font-semibold text-brand-600 hover:underline" onClick={() => void turn({})}>
                            Skip the wait
                        </button>
                    </p>
                )}
                {state?.has_timeout && running && !busy && (
                    <p className="mx-auto w-fit rounded-md bg-card px-3 py-1.5 text-[12px] text-muted-foreground shadow-xs" dir="ltr">
                        <button className="font-semibold text-brand-600 hover:underline" onClick={() => void turn({ action: 'timeout' }, '(no reply)')}>
                            <ClockIcon className="mr-1 inline size-3.5" />
                            Pretend the customer does not reply
                        </button>
                    </p>
                )}
                {error && (
                    <p className="rounded-md bg-bad-bg px-3 py-2 text-[12px] text-bad" dir="ltr">
                        {error}
                    </p>
                )}
            </div>

            <form
                className="flex items-center gap-1.5 bg-[#f0f2f5] px-2.5 py-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    send();
                }}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={!running || busy}
                            aria-label="Send something else"
                            title="Send a photo, location or voice note"
                        >
                            <ImageIcon />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top">
                        <DropdownMenuItem onSelect={() => void turn({ type: 'image' }, '📷 Photo')}>
                            <ImageIcon /> A photo
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void turn({ type: 'location' }, '📍 Location')}>
                            <MapPinIcon /> A location pin
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void turn({ type: 'audio' }, '🎤 Voice note')}>
                            <MicIcon /> A voice note
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message"
                    className="rounded-full bg-card"
                    disabled={!running}
                    aria-label="Message"
                    dir="auto"
                />
                <Button
                    type="submit"
                    size="icon"
                    className="shrink-0 rounded-full bg-[#00a884] text-white hover:bg-[#008f72]"
                    disabled={busy || !text.trim() || !running}
                    aria-label="Send"
                >
                    <SendIcon />
                </Button>
            </form>
            {state && (Object.keys(state.vars).length > 0 || state.contact.tags.length > 0) && (
                <details className="border-t bg-card px-4 py-2 text-[11.5px]">
                    <summary className="cursor-pointer font-semibold text-muted-foreground">What the bot knows now</summary>
                    <dl className="mt-1.5 grid max-h-36 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 overflow-auto">
                        {Object.entries(state.vars).map(([k, v]) => (
                            <div key={k} className="contents">
                                <dt className="font-mono text-muted-foreground">var.{k}</dt>
                                <dd className="truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}</dd>
                            </div>
                        ))}
                        {state.contact.tags.length > 0 && (
                            <div className="contents">
                                <dt className="font-mono text-muted-foreground">tags</dt>
                                <dd>{state.contact.tags.join(', ')}</dd>
                            </div>
                        )}
                    </dl>
                </details>
            )}
        </div>
    );
}

function BotMessage({
    message,
    disabled,
    onTap,
}: {
    message: Extract<TranscriptItem, { kind: 'bot' }>['message'];
    disabled: boolean;
    onTap: (payload: string, title: string) => void;
}) {
    const [listOpen, setListOpen] = useState(false);
    const content = (message.content ?? {}) as Record<string, any>;
    const m = messageOfPayload(message);
    const bubble = 'rounded-lg rounded-tl-sm bg-card px-2.5 py-1.5 text-[13px] shadow-xs';
    const buttons = content.type === 'button' ? ((content.action?.buttons ?? []) as { reply: { id: string; title: string } }[]) : [];
    const sections =
        content.type === 'list' ? ((content.action?.sections ?? []) as { title?: string; rows: { id: string; title: string; description?: string }[] }[]) : [];

    return (
        <div className="max-w-[86%] space-y-px">
            <div className={bubble}>
                {m.template && <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Template · {m.template}</p>}
                {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- the author's own picture link
                    <img src={m.image} alt="" className="mb-1.5 max-h-44 w-full rounded object-cover" />
                )}
                {m.media && !m.image && <p className="mb-1 rounded bg-muted px-2 py-1 text-[12px]">📎 {m.media.name ?? `${m.media.kind} file`}</p>}
                {m.header && <p className="font-semibold">{m.header}</p>}
                {m.text && <RichText text={m.text} />}
                {m.footer && <p className="mt-0.5 text-[11px] text-muted-foreground">{m.footer}</p>}
            </div>
            {m.cta && (
                <a
                    href={content.action?.parameters?.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md bg-card px-3 py-2 text-center text-[13px] font-medium text-[#027eb5] shadow-xs hover:bg-[#f3fbf9]"
                >
                    ↗ {m.cta}
                </a>
            )}
            {buttons.map((b) => (
                <button
                    key={b.reply.id}
                    disabled={disabled}
                    onClick={() => onTap(b.reply.id, b.reply.title)}
                    className="block w-full rounded-md bg-card px-3 py-2 text-center text-[13px] font-medium text-[#027eb5] shadow-xs hover:bg-[#f3fbf9] disabled:opacity-60"
                >
                    {b.reply.title}
                </button>
            ))}
            {content.type === 'list' && (
                <>
                    <button
                        disabled={disabled}
                        onClick={() => setListOpen((o) => !o)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-card px-3 py-2 text-[13px] font-medium text-[#027eb5] shadow-xs hover:bg-[#f3fbf9] disabled:opacity-60"
                    >
                        <ListIcon className="size-4" /> {content.action?.button ?? 'Choose'}
                    </button>
                    {listOpen && !disabled && (
                        <div className="overflow-hidden rounded-md bg-card shadow-xs">
                            {sections.map((s, n) => (
                                <div key={n}>
                                    {s.title && <p className="px-3 pt-2 text-[10.5px] font-semibold text-muted-foreground uppercase">{s.title}</p>}
                                    {s.rows.map((r) => (
                                        <button
                                            key={r.id}
                                            onClick={() => {
                                                setListOpen(false);
                                                onTap(r.id, r.title);
                                            }}
                                            className="block w-full border-t border-line-2 px-3 py-2 text-left first:border-t-0 hover:bg-muted"
                                        >
                                            <span className="block text-[13px]">{r.title}</span>
                                            {r.description && <span className="block text-[11.5px] text-muted-foreground">{r.description}</span>}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
            {message.type === 'location' && (
                <p className={cn(bubble, 'flex items-center gap-1.5')}>
                    <MapPinIcon className="size-4 text-bad" /> {message.body}
                </p>
            )}
        </div>
    );
}

function CfgSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
    return (
        <label className="cb-field">
            <span className="l">{label}</span>
            <select className="cb-in" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
                {options.map(([v, l]) => (
                    <option key={v} value={v}>
                        {l}
                    </option>
                ))}
            </select>
        </label>
    );
}
