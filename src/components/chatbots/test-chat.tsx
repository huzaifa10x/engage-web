'use client';

import { FileTextIcon, ListIcon, MapPinIcon, RotateCcwIcon, SendIcon, UserIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { testChatbot, type TestTurn, type TranscriptItem } from '@/lib/chatbots';
import { useContacts } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Item = TranscriptItem & { key: number };

const NOBODY = '__test__';

/**
 * Test chat: the real engine runs the current draft (published or not). Nothing is sent on
 * WhatsApp and nothing is saved on contacts; API-call blocks do call their URL.
 */
export function TestChat({ flowId, onClose, onNode }: { flowId: string; onClose: () => void; onNode: (id: string | null) => void }) {
    const [items, setItems] = useState<Item[]>([]);
    const [testId, setTestId] = useState<string | null>(null);
    const [state, setState] = useState<TestTurn['state'] | null>(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [contactId, setContactId] = useState<string>(NOBODY);
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

    const turn = async (input: { text?: string; payload?: string }, shown?: string, fresh = false, contact = contactId) => {
        if (shown) push([{ kind: 'customer', text: shown }]);
        setBusy(true);
        setError(null);
        try {
            apply(await testChatbot(flowId, { test_id: fresh ? null : testId, contact_id: contact === NOBODY ? null : contact, ...input }));
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const restart = (contact = contactId) => {
        setItems([]);
        setTestId(null);
        setState(null);
        void turn({}, undefined, true, contact);
    };

    // The conversation starts as soon as the test window opens.
    useEffect(() => {
        let alive = true;
        testChatbot(flowId, {})
            .then((r) => alive && apply(r))
            .catch((e) => alive && setError(errorMessage(e)))
            .finally(() => alive && setBusy(false));

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the window opens
    }, [flowId]);

    useEffect(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [items.length, busy]);

    const running = state === null || ['active', 'waiting'].includes(state.status);
    const send = () => {
        const t = text.trim();
        if (!t || busy) return;
        setText('');
        void turn({ text: t }, t);
    };

    return (
        <Dialog
            open
            onOpenChange={(o) => {
                if (!o) {
                    onNode(null);
                    onClose();
                }
            }}
        >
            <DialogContent className="flex h-[min(780px,92vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[420px]">
                <DialogHeader className="border-b px-4 py-3 text-left">
                    <DialogTitle className="text-[15px]">Test the flow</DialogTitle>
                    <DialogDescription className="text-[12px]">Runs your draft. Nothing is sent on WhatsApp or saved on contacts.</DialogDescription>
                    <div className="mt-2 flex items-center gap-2">
                        <UserIcon className="size-4 shrink-0 text-muted-foreground" />
                        <Select
                            value={contactId}
                            onValueChange={(v) => {
                                setContactId(v);
                                restart(v); // start again with that contact's data
                            }}
                        >
                            <SelectTrigger size="sm" className="flex-1" aria-label="Test as contact">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NOBODY}>Test Customer (sample data)</SelectItem>
                                {people.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        Preview as {c.display_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => restart()} disabled={busy}>
                            <RotateCcwIcon /> Restart
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex items-center gap-2.5 bg-[#075e54] px-3 py-2 text-white">
                    <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-sm" aria-hidden>
                        🤖
                    </span>
                    <div>
                        <p className="text-[13.5px] font-semibold">Your business</p>
                        <p className="text-[11px] opacity-80">
                            {busy ? 'typing…' : state?.status === 'handed_off' ? 'a person is handling this chat' : 'online'}
                        </p>
                    </div>
                </div>

                <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#efeae2] px-3 py-3">
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
                                className="mx-auto w-fit max-w-[90%] rounded-md bg-[#fff6d8] px-2.5 py-1 text-center text-[11.5px] text-[#7a5d00]"
                            >
                                {item.text}
                            </p>
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
                        <p className="mx-auto mt-2 w-fit rounded-md bg-card px-3 py-1.5 text-[12px] text-muted-foreground shadow-xs">
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
                        <p className="mx-auto w-fit rounded-md bg-card px-3 py-1.5 text-[12px] text-muted-foreground shadow-xs">
                            ⏱ Waiting (Delay block).{' '}
                            <button className="font-semibold text-brand-600 hover:underline" onClick={() => void turn({})}>
                                Skip the wait
                            </button>
                        </p>
                    )}
                    {error && <p className="rounded-md bg-bad-bg px-3 py-2 text-[12px] text-bad">{error}</p>}
                </div>

                <form
                    className="flex items-center gap-2 bg-[#f0f0f0] px-3 py-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        send();
                    }}
                >
                    <Input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type a message"
                        className="rounded-full bg-card"
                        disabled={!running}
                        aria-label="Message"
                    />
                    <Button
                        type="submit"
                        size="icon"
                        className="rounded-full bg-[#128c7e] text-white hover:bg-[#0f7a6e]"
                        disabled={busy || !text.trim() || !running}
                        aria-label="Send"
                    >
                        <SendIcon />
                    </Button>
                </form>
                {state && Object.keys(state.vars).length > 0 && (
                    <details className="border-t bg-card px-4 py-2 text-[11.5px]">
                        <summary className="cursor-pointer font-semibold text-muted-foreground">Variables & contact in this test</summary>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-[10.5px]">
                            {JSON.stringify({ vars: state.vars, contact: state.contact }, null, 2)}
                        </pre>
                    </details>
                )}
            </DialogContent>
        </Dialog>
    );
}

type Interactive = {
    type?: string;
    header?: { type?: string; text?: string; image?: { link?: string } };
    body?: { text?: string };
    footer?: { text?: string };
    action?: {
        button?: string;
        buttons?: { reply: { id: string; title: string } }[];
        sections?: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
    };
};

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
    const content = (message.content ?? {}) as Record<string, unknown>;
    const bubble = 'max-w-[85%] rounded-lg rounded-tl-sm bg-card px-2.5 py-1.5 text-[13px] shadow-xs';

    if (message.type === 'interactive') {
        const i = content as Interactive;

        return (
            <div className="max-w-[85%] space-y-px">
                <div className={cn(bubble, 'max-w-none')}>
                    {i.header?.type === 'image' && i.header.image?.link && (
                        // eslint-disable-next-line @next/next/no-img-element -- the author's own picture link
                        <img src={i.header.image.link} alt="" className="mb-1.5 max-h-40 w-full rounded object-cover" />
                    )}
                    {i.header?.type === 'text' && <p className="font-semibold">{i.header.text}</p>}
                    <p className="whitespace-pre-wrap">{i.body?.text}</p>
                    {i.footer?.text && <p className="mt-1 text-[11px] text-muted-foreground">{i.footer.text}</p>}
                </div>
                {i.type === 'button' &&
                    (i.action?.buttons ?? []).map((b) => (
                        <button
                            key={b.reply.id}
                            disabled={disabled}
                            onClick={() => onTap(b.reply.id, b.reply.title)}
                            className="block w-full rounded-md bg-card px-3 py-2 text-center text-[13px] font-medium text-[#128c7e] shadow-xs hover:bg-[#f3fbf9] disabled:opacity-60"
                        >
                            {b.reply.title}
                        </button>
                    ))}
                {i.type === 'list' && (
                    <>
                        <button
                            disabled={disabled}
                            onClick={() => setListOpen((o) => !o)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-card px-3 py-2 text-[13px] font-medium text-[#128c7e] shadow-xs hover:bg-[#f3fbf9] disabled:opacity-60"
                        >
                            <ListIcon className="size-4" /> {i.action?.button ?? 'Choose'}
                        </button>
                        {listOpen && !disabled && (
                            <div className="overflow-hidden rounded-md bg-card shadow-xs">
                                {(i.action?.sections ?? []).map((s, n) => (
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
            </div>
        );
    }

    if (message.type === 'image') {
        return (
            <div className={bubble}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the author's own picture link */}
                <img src={String(content.link ?? '')} alt="" className="mb-1 max-h-48 w-full rounded object-cover" />
                {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
            </div>
        );
    }
    if (message.type === 'video' || message.type === 'document') {
        return (
            <a
                href={String(content.link ?? '#')}
                target="_blank"
                rel="noreferrer"
                className={cn(bubble, 'flex items-center gap-2 text-brand-600 hover:underline')}
            >
                <FileTextIcon className="size-4" /> {String(content.filename ?? message.type)}
                {message.body && <span className="text-ink-2"> — {message.body}</span>}
            </a>
        );
    }
    if (message.type === 'location') {
        return (
            <p className={cn(bubble, 'flex items-center gap-1.5')}>
                <MapPinIcon className="size-4 text-bad" /> {message.body ?? `${content.latitude}, ${content.longitude}`}
            </p>
        );
    }
    if (message.type === 'template') {
        return (
            <div className={bubble}>
                <p className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Template · {message.template?.name}</p>
                <p className="text-[12px] text-muted-foreground">Sent as the approved template, with your variables filled in.</p>
            </div>
        );
    }

    return <p className={cn(bubble, 'whitespace-pre-wrap')}>{message.body}</p>;
}
