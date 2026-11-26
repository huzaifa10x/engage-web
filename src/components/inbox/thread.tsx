'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeftIcon,
    BellDotIcon,
    BotIcon,
    CheckIcon,
    ChevronDownIcon,
    CopyIcon,
    DiamondIcon,
    ExternalLinkIcon,
    FileTextIcon,
    FlagIcon,
    HistoryIcon,
    InfoIcon,
    Loader2Icon,
    LockIcon,
    MoonIcon,
    MoreHorizontalIcon,
    PanelRightIcon,
    PencilIcon,
    SettingsIcon,
    SunIcon,
    TriangleAlertIcon,
    UploadCloudIcon,
    PhoneIcon,
    UserIcon,
    CheckCircle2Icon,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { useOpenContact } from '@/components/contacts/contact-sheet';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useStored } from '@/hooks/use-stored';
import { api, errorMessage } from '@/lib/api';
import { handBackConversation, takeOverConversation } from '@/lib/chatbots';
import { newId } from '@/lib/id';
import { dur, fmtDay, fmtPhone, fmtTime, fmtWhen, REPLY_LABEL, windowLeft, windowTier } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import { getEcho } from '@/lib/realtime';
import {
    addConversationNote,
    assignConversation,
    keys,
    markUnread,
    type SendPayload,
    sendToConversation,
    sendTyping,
    setConversationAutoReply,
    snoozeConversation,
    useAssignees,
    useConversation,
    useConversationEvents,
    useConversationNotes,
    useMembers,
    usePhoneNumbers,
    useResolutions,
    useThread,
} from '@/lib/queries';
import type { ConversationEvent, ConversationNote, Enquiry, Message, Resolution } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Composer, type ComposerHandle, type ComposerMode } from './composer';
import { ContextPanel, eventText, isDealEvent } from './context-panel';
import { Chip, useNow, WindowChip } from './conversation-list';
import { EditContactDialog, FlagDialog, NewDealDialog, SnoozeDialog, StepDialog } from './inbox-dialogs';
import { MessageBubble } from './message-bubble';
import { MobileWaitBar } from './mobile-wait-bar';
import { reopenChat, resolveChat, ResolveMenu } from './resolve-menu';
import { TemplateDialog } from './template-dialog';
import { WaitClock } from './wait-clock';
import { OwnerAvatar, RingAvatar } from './window-ring';

type TimelineItem =
    | { kind: 'message'; at: string; message: Message }
    | { kind: 'note'; at: string; note: ConversationNote }
    | { kind: 'event'; at: string; event: ConversationEvent };

type Viewer = { id: string; name: string; typing: boolean };

/**
 * Who else has this chat open (3.5): a presence channel per chat lists the teammates viewing it, and
 * "typing" pings arrive on the same channel. Without realtime, nobody is shown.
 */
function usePresence(tenantId: string, conversationId: string, meId: string): Viewer[] {
    const [viewers, setViewers] = useState<Viewer[]>([]);
    useEffect(() => {
        const echoP = getEcho();
        if (!echoP || !tenantId) return;
        const name = `tenant.${tenantId}.conversation.${conversationId}`;
        const timers = new Map<string, ReturnType<typeof setTimeout>>();
        let left = false;
        void echoP.then((echo) => {
            if (left) return;
            echo.join(name)
                .here((users: { id: string; name: string }[]) => setViewers(users.filter((u) => u.id !== meId).map((u) => ({ ...u, typing: false }))))
                .joining((u: { id: string; name: string }) => u.id !== meId && setViewers((v) => [...v.filter((x) => x.id !== u.id), { ...u, typing: false }]))
                .leaving((u: { id: string }) => setViewers((v) => v.filter((x) => x.id !== u.id)))
                .listen('.teammate.typing', (e: { membership_id: string; name: string; typing: boolean }) => {
                    if (e.membership_id === meId) return;
                    setViewers((v) => {
                        const rest = v.filter((x) => x.id !== e.membership_id);

                        return [...rest, { id: e.membership_id, name: e.name, typing: e.typing }];
                    });
                    clearTimeout(timers.get(e.membership_id));
                    if (e.typing)
                        timers.set(
                            e.membership_id,
                            setTimeout(() => setViewers((v) => v.map((x) => (x.id === e.membership_id ? { ...x, typing: false } : x))), 8000),
                        );
                });
        });

        return () => {
            left = true;
            timers.forEach(clearTimeout);
            void echoP.then((echo) => echo.leave(name));
        };
    }, [tenantId, conversationId, meId]);

    return viewers;
}

function DayLabel({ at, now }: { at: string; now: number }) {
    return (
        <div className="my-3 flex justify-center">
            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground shadow-[0_1px_0.5px_rgba(11,20,26,.08)]">
                {fmtDay(at, now)}
            </span>
        </div>
    );
}

/** A team note: yellow with a gold left edge, never sent to the customer. */
function NoteLine({ note }: { note: ConversationNote }) {
    return (
        <div className="my-1.5 flex justify-end">
            <div className="max-w-[min(34rem,80%)] rounded-lg border-l-[3px] border-[#d4a72c] bg-[#fff3c4] px-2.5 pt-1.5 pb-1 text-[13px] text-[#3d3108] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]">
                <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#8a6d0b]">
                    <LockIcon className="size-3" /> Internal note · {note.by_bot ? 'Chatbot' : note.mine ? 'You' : note.author} · Team only
                </p>
                <p className="break-words whitespace-pre-wrap" dir="auto">
                    {note.body}
                </p>
                {note.created_at && <p className="mt-0.5 text-right text-[11px] text-[#8a6d0b]/80">{fmtTime(note.created_at)}</p>}
            </div>
        </div>
    );
}

/** A system event in the timeline (assigned, resolved, snoozed, deal moved…), centred and small. */
function EventLine({ event }: { event: ConversationEvent }) {
    const deal = isDealEvent(event.type);

    return (
        <div className="my-2 flex justify-center">
            <span
                className={cn(
                    'inline-flex max-w-[90%] items-center gap-1 rounded-full px-2.5 py-0.5 text-center text-[11px]',
                    deal ? 'bg-brand-50 font-semibold text-brand-600' : 'bg-white/80 text-muted-foreground',
                )}
            >
                {deal && <DiamondIcon className="size-2.5 shrink-0 fill-current" />}
                {eventText(event)} · {fmtTime(event.at)}
            </span>
        </div>
    );
}

function Banner({
    tone,
    icon,
    children,
    actions,
}: {
    tone: 'red' | 'amber' | 'blue' | 'grey';
    icon: React.ReactNode;
    children: React.ReactNode;
    actions?: React.ReactNode;
}) {
    return (
        <div
            role="status"
            className={cn(
                'mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px] [&>svg]:size-4 [&>svg]:shrink-0',
                tone === 'red' && 'border-bad/30 bg-bad-bg text-bad',
                tone === 'amber' && 'border-warn/30 bg-warn-bg text-warn',
                tone === 'blue' && 'border-info/30 bg-info-bg text-info',
                tone === 'grey' && 'border-border bg-muted text-ink-2',
            )}
        >
            {icon}
            <span className="min-w-0 flex-1 text-ink-2">{children}</span>
            {actions}
        </div>
    );
}

/** True while something that contains files is being dragged (not text or a link). */
const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');

const inputFocused = () => {
    const el = document.activeElement;

    return !!el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || (el as HTMLElement).isContentEditable);
};

export function Thread({
    conversationId,
    polling,
    onBack,
    focusMessageId = null,
    closureId = null,
    onResolved,
    initialMode = 'reply',
}: {
    conversationId: string;
    polling: boolean;
    onBack: () => void;
    /** Opened from a contact's history: scroll to this message and mark it for a moment. */
    focusMessageId?: string | null;
    /** Opened from a Resolved row: show that closure, even if the chat was reopened or closed again since. */
    closureId?: string | null;
    /** After resolving here: the page moves on to the next chat in Needs reply. */
    onResolved?: () => void;
    /** Opened from Start conversation on a closed window: straight to Template. */
    initialMode?: ComposerMode;
}) {
    const { can, membership, me, feature } = useSession();
    const qc = useQueryClient();
    const conversation = useConversation(conversationId, polling ? 15_000 : false);
    const thread = useThread(conversationId, polling ? 5_000 : false);
    const events = useConversationEvents(conversationId, polling ? 15_000 : false);
    const closures = useResolutions({ conversation_id: conversationId, days: 0 });
    const now = useNow(20_000);
    const members = useMembers(can(P.TeamView));
    const assignees = useAssignees(conversationId, true);
    const openContact = useOpenContact();
    const viewers = usePresence(me.active_tenant_id ?? '', conversationId, membership.id);
    // The customer panel: remembered beside the chat on wide screens; over the chat (closed at first) on narrow ones.
    const [ctxWide, setCtxWide] = useStored<boolean>('engage.inbox.ctx-open', true);
    const [ctxNarrow, setCtxNarrow] = useState(false);
    const wide = useMediaQuery('(min-width: 1280px)');
    const ctxOpen = wide ? ctxWide : ctxNarrow;
    const setCtxOpen = wide ? setCtxWide : setCtxNarrow;
    const [mode, setMode] = useState<ComposerMode>(initialMode);
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [fullTemplate, setFullTemplate] = useState(false);
    const [pending, setPending] = useState<{ kind: 'collision' | 'window'; by?: string; at?: number; send: () => Promise<void> } | null>(null);
    const [dialog, setDialog] = useState<'edit' | 'step' | 'deal' | 'snooze' | 'flag' | null>(null);
    const [flagging, setFlagging] = useState<Resolution | null>(null);
    const composer = useRef<ComposerHandle>(null);
    const dragDepth = useRef(0);
    const [dropping, setDropping] = useState(false);
    const scroller = useRef<HTMLDivElement>(null);
    const pinnedToBottom = useRef(true);
    const readFor = useRef<string | null>(null);
    const typingSince = useRef<number | null>(null);
    const c = conversation.data;
    const deals = useQuery({
        queryKey: ['contacts', c?.contact?.id, 'enquiries'],
        queryFn: () => api<{ data: Enquiry[] }>(`contacts/${c?.contact?.id}/enquiries`).then((r) => r.data),
        enabled: !!c?.contact?.id,
    });

    const refresh = useCallback(() => {
        void qc.invalidateQueries({ queryKey: keys.thread(conversationId) });
        void qc.invalidateQueries({ queryKey: keys.conversation(conversationId) });
        void qc.invalidateQueries({ queryKey: keys.conversationsAll });
        void qc.invalidateQueries({ queryKey: ['inbox', 'events', conversationId] });
    }, [qc, conversationId]);

    // API pages are newest-first; display oldest → newest.
    const messages = useMemo(() => (thread.data?.pages.flatMap((p) => p.data) ?? []).slice().reverse(), [thread.data]);
    const byWamid = useMemo(() => new Map(messages.filter((m) => m.wamid).map((m) => [m.wamid as string, m])), [messages]);
    const names = useMemo(() => new Map((members.data?.data ?? []).map((m) => [m.id, m.user?.name ?? 'Teammate'])), [members.data]);
    const notesAllowed = feature('internal_notes').enabled;
    const notes = useConversationNotes(conversationId, notesAllowed);
    const timeline = useMemo(() => {
        const from = messages[0]?.timestamp ? new Date(messages[0].timestamp).getTime() : 0;
        const older = (at: string) => thread.hasNextPage && new Date(at).getTime() < from;
        const items: TimelineItem[] = messages.map((m) => ({ kind: 'message', at: m.timestamp ?? '', message: m }));
        for (const n of notes.data ?? []) if (n.created_at && !older(n.created_at)) items.push({ kind: 'note', at: n.created_at, note: n });
        for (const e of events.data ?? []) if (!older(e.at)) items.push({ kind: 'event', at: e.at, event: e });

        return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    }, [messages, notes.data, events.data, thread.hasNextPage]);

    // Keep the view pinned to the newest message unless the agent scrolled up to read history.
    useEffect(() => {
        const el = scroller.current;
        if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
    }, [timeline.length, conversationId]);

    // A link to one message (/inbox?c=…&m=…): load earlier pages until it is there, then show it.
    const focusDone = useRef<string | null>(null);
    useEffect(() => {
        if (!focusMessageId || focusDone.current === focusMessageId || !thread.data) return;
        if (!messages.some((m) => m.id === focusMessageId)) {
            if (thread.hasNextPage && !thread.isFetchingNextPage && thread.data.pages.length < 30) void thread.fetchNextPage();
            return;
        }
        const el = document.getElementById(`msg-${focusMessageId}`);
        if (!el) return; // not drawn yet (the chat is still loading): try again on the next render
        focusDone.current = focusMessageId;
        pinnedToBottom.current = false;
        el.scrollIntoView({ block: 'center' });
        el.dataset.focused = 'true';
        const t = setTimeout(() => delete el.dataset.focused, 4000);
        return () => clearTimeout(t);
    }, [focusMessageId, messages, thread]);

    // Opening a chat marks it read (never changes its status).
    const unread = c?.unread_count ?? 0;
    useEffect(() => {
        if (unread > 0 && readFor.current !== `${conversationId}:${messages.length}`) {
            readFor.current = `${conversationId}:${messages.length}`;
            void api(`conversations/${conversationId}/read`, { method: 'POST' }).then(() => {
                void qc.invalidateQueries({ queryKey: keys.conversationsAll });
                void qc.invalidateQueries({ queryKey: keys.conversation(conversationId) });
            });
        }
    }, [unread, conversationId, messages.length, qc]);

    // R / N / T switch the composer, E resolves (when not typing).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || inputFocused() || document.querySelector('[role="dialog"],[role="menu"]')) return;
            const k = e.key.toLowerCase();
            if (k === 'r' || k === 'n' || k === 't') {
                e.preventDefault();
                const m = k === 'r' ? 'reply' : k === 'n' ? 'note' : 'template';
                setPending(null);
                setMode(m);
                if (m !== 'template') setTimeout(() => composer.current?.focus(), 0);
            }
            if (k === 'e' && c && c.status === 'open' && can(P.InboxReply)) {
                e.preventDefault();
                void resolveChat(qc, c, 'resolved', onResolved);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [c, can, qc, onResolved]);

    const numbers = usePhoneNumbers();
    const wabaAccountId = numbers.data?.find((n) => n.id === c?.phone_number_id)?.waba_account_id ?? null;

    if (conversation.isLoading || !c) {
        return (
            <div className="flex flex-1 flex-col gap-3 p-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-16 w-2/3" />
                <Skeleton className="ml-auto h-16 w-1/2" />
            </div>
        );
    }

    const contact = c.contact;
    const name = contact?.display_name ?? 'WhatsApp user';
    const numberGone = c.phone_number?.status === 'disconnected';
    const disabledReason = numberGone
        ? `This conversation is on ${c.phone_number?.verified_name ?? c.phone_number?.display_phone_number ?? 'a number'}, which is no longer connected. You can read the history, but messages cannot be sent or received here. Reconnect the number in Channels to continue.`
        : !can(P.InboxReply)
          ? 'Your role can read this conversation but not reply.'
          : null;
    const state = c.status === 'closed' ? 'closed' : c.snoozed_until ? 'snoozed' : (c.state ?? 'waiting');
    const replyOpen = (c.window.replies_allowed ?? c.window.open) && !(contact?.consent_state === 'opted_out' && !c.window.replies_allowed);
    const tier = windowTier(c.window.expires_at, now, !!contact?.last_inbound_at || !!c.window.expires_at);
    const owner = c.assigned_name ?? null;
    const dealList = deals.data ?? [];
    const current = dealList.find((d) => d.current) ?? null;
    const teammates = (assignees.data ?? []).filter((a) => a.can_access);
    const lastOut = [...messages].reverse().find((m) => m.direction === 'outbound');
    const pick = closureId ? (closures.data ?? []).find((r) => r.id === closureId) : null;

    // The composer passes one key per reply, so a retry (or a reply sent when the phone is back online) is stored once.
    const send = async (payload: SendPayload, idempotencyKey: string = newId()) => {
        await sendToConversation(conversationId, payload, idempotencyKey);
        pinnedToBottom.current = true;
        typingSince.current = null;
        setPending(null);
        refresh();
    };
    const onTyping = (typing: boolean) => {
        if (typing && typingSince.current === null) typingSince.current = Date.now();
        void sendTyping(conversationId, typing).catch(() => undefined);
    };
    // Right before a reply or template goes out: was the window closed meanwhile, or did a teammate answer?
    const beforeSend = async (kind: 'reply' | 'template', go: () => Promise<void>) => {
        const [conv, th] = await Promise.all([conversation.refetch(), thread.refetch()]);
        const fresh = conv.data;
        if (kind === 'reply' && fresh && !(fresh.window.replies_allowed ?? fresh.window.open)) {
            setPending({ kind: 'window', send: go });
            return false;
        }
        const since = typingSince.current;
        if (since !== null) {
            const other = (th.data?.pages.flatMap((p) => p.data) ?? []).find(
                (m) =>
                    m.direction === 'outbound' &&
                    m.origin === 'agent' &&
                    m.sent_by_membership_id !== membership.id &&
                    !!m.timestamp &&
                    new Date(m.timestamp).getTime() > since,
            );
            if (other) {
                setPending({
                    kind: 'collision',
                    by: (names.get(other.sent_by_membership_id ?? '') ?? 'A teammate').split(' ')[0],
                    at: new Date(other.timestamp as string).getTime(),
                    send: go,
                });
                return false;
            }
        }

        return true;
    };
    const snooze = async (until: Date | null) => {
        try {
            await snoozeConversation(c.id, until ? until.toISOString() : null);
            refresh();
            if (!until) return void toast.success('Unsnoozed · back in the queue');
            toast.success(`Snoozed until ${fmtWhen(until.toISOString())} · a new customer message wakes it`, {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        await snoozeConversation(c.id, null);
                        refresh();
                    },
                },
            });
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    const assign = async (id: string | null, label: string) => {
        if (id === c.assigned_membership_id) return;
        try {
            await assignConversation(c.id, id, c.assigned_membership_id);
            refresh();
            toast.success(id ? `Assigned to ${label}` : 'Moved to Unassigned');
        } catch (e) {
            toast.error(errorMessage(e));
            refresh(); // a teammate changed it first: show who has it now
        }
    };
    const bot = async (action: 'take' | 'back') => {
        try {
            if (action === 'take') {
                await takeOverConversation(c.id);
                toast.success(`${c.bot?.flow_name ?? 'The flow'} stopped for this conversation`);
            } else {
                const r = await handBackConversation(c.id);
                toast.success(
                    r.meta?.outcome === 'opted_out'
                        ? 'Handed back. This customer opted out, so the bot stays quiet until they write again.'
                        : "Handed back. Nothing was sent: the bot answers the customer's next message.",
                );
            }
            refresh();
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    // Snooze presets; warn when the wake-up is past the window.
    const d1 = new Date(now);
    d1.setDate(d1.getDate() + 1);
    d1.setHours(9, 0, 0, 0);
    const d2 = new Date(now);
    d2.setDate(d2.getDate() + ((8 - d2.getDay()) % 7 || 7));
    d2.setHours(9, 0, 0, 0);
    const presets: [string, Date][] = [
        ['In 1 hour', new Date(now + 3_600_000)],
        ['In 3 hours', new Date(now + 3 * 3_600_000)],
        ['Tomorrow morning', d1],
        ['Next Monday', d2],
    ];

    // Banners above the composer, most important first.
    const banners: React.ReactNode[] = [];
    if (pick && !(c.status === 'closed' && c.resolution?.id === pick.id)) {
        banners.push(
            <Banner key="closure" tone="grey" icon={<HistoryIcon />}>
                <b className="font-semibold">Viewing closure of {fmtWhen(pick.resolved_at, now)}</b> · resolved by{' '}
                {pick.resolved_by?.name.split(' ')[0] ?? 'the chatbot'} · {pick.reason_label}
                {pick.reopened_at
                    ? ` · ${pick.reopen_how === 'flag' ? 'flagged & reopened' : 'reopened'} ${fmtWhen(pick.reopened_at, now)}${pick.reopened_by ? ` by ${pick.reopened_by.name.split(' ')[0]}` : ''}`
                    : ''}
                {pick.flag ? ` · flag note: “${pick.flag.note}”` : ''}
                {pick.later_closures ? ` · ${pick.later_closures} later closure${pick.later_closures > 1 ? 's' : ''}` : ''}
            </Banner>,
        );
    }
    if (c.status === 'closed') {
        const r = c.resolution;
        banners.push(
            <Banner
                key="resolved"
                tone="blue"
                icon={<CheckIcon />}
                actions={
                    <>
                        {r && !r.flag && can(P.InboxAssign) && (
                            <Button size="sm" variant="outline" className="border-bad/40 text-bad" onClick={() => setFlagging(r)}>
                                <FlagIcon /> Flag for review
                            </Button>
                        )}
                        {can(P.InboxReply) && (
                            <Button size="sm" variant="outline" onClick={() => void reopenChat(qc, c)}>
                                Reopen
                            </Button>
                        )}
                    </>
                }
            >
                <b className="font-semibold">
                    Resolved{r?.resolved_by ? ` by ${r.resolved_by.name.split(' ')[0]}` : ''} · {r?.reason_label ?? 'Resolved'}
                </b>
                {r ? ` · ${dur(now - new Date(r.resolved_at).getTime())} ago` : ''}. Viewing doesn’t change its status. A new message from either side reopens
                it.
            </Banner>,
        );
    }
    if (pending?.kind === 'collision') {
        banners.push(
            <Banner
                key="collision"
                tone="red"
                icon={<TriangleAlertIcon />}
                actions={
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                                const go = pending.send;
                                setPending(null);
                                typingSince.current = null;
                                await go();
                            }}
                        >
                            Send anyway
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPending(null)}>
                            Keep draft
                        </Button>
                    </>
                }
            >
                <b className="font-semibold">
                    {pending.by} replied {dur(now - (pending.at ?? now))} ago
                </b>{' '}
                while you were typing. Review their message before sending a second answer.
            </Banner>,
        );
    } else if (pending?.kind === 'window') {
        banners.push(
            <Banner
                key="closedwhile"
                tone="red"
                icon={<TriangleAlertIcon />}
                actions={
                    mode !== 'template' && (
                        <Button size="sm" onClick={() => (setPending(null), setMode('template'))}>
                            Choose template
                        </Button>
                    )
                }
            >
                <b className="font-semibold">The 24-hour window closed while you were typing.</b> Your draft is saved. Free-form replies are blocked; send an
                approved template instead.
            </Banner>,
        );
    } else if (mode === 'reply' && !replyOpen && c.status !== 'closed') {
        const tplSent = lastOut?.type === 'template' && c.state !== 'needs_reply';
        banners.push(
            tplSent ? (
                <Banner key="tplsent" tone="blue" icon={<InfoIcon />}>
                    Template sent. Free-form replies unlock when {name} responds.
                </Banner>
            ) : contact?.consent_state === 'opted_out' && c.window.open ? (
                <Banner key="optout" tone="amber" icon={<InfoIcon />}>
                    This contact opted out. You can reply as soon as they write to you again.
                </Banner>
            ) : (
                <Banner
                    key="locked"
                    tone="amber"
                    icon={<FileTextIcon />}
                    actions={
                        <Button size="sm" onClick={() => setMode('template')}>
                            Choose template
                        </Button>
                    }
                >
                    <b className="font-semibold">
                        {c.window.expires_at ? `Window closed ${dur(-windowLeft(c.window.expires_at, now))} ago.` : 'No open window.'}
                    </b>{' '}
                    WhatsApp only allows approved templates until the customer replies.
                </Banner>
            ),
        );
    } else if (mode === 'reply' && tier === 'critical') {
        banners.push(
            <Banner key="critical" tone="red" icon={<TriangleAlertIcon />}>
                Window closes in <b className="font-semibold">{dur(windowLeft(c.window.expires_at, now), true)}</b>. Reply now to avoid needing a template.
            </Banner>,
        );
    }
    if (c.handler === 'bot' && mode === 'reply' && !disabledReason) {
        banners.push(
            <Banner key="bot" tone="blue" icon={<BotIcon />}>
                {c.bot?.flow_name ?? 'The chatbot'} is answering{c.bot?.node_title ? ` (at “${c.bot.node_title}”)` : ''}. Sending a message takes over and stops
                it here.
            </Banner>,
        );
    }

    const automation =
        c.handler === 'bot' && c.bot ? (
            <>
                <Chip tone="dark">
                    <SettingsIcon /> {c.bot.flow_name ?? 'Chatbot'}
                    {c.bot.node_title ? ` · ${c.bot.node_title}` : ''}
                </Chip>
                {can(P.InboxReply) && (
                    <button type="button" className="text-[12px] font-semibold text-brand-600 hover:underline" onClick={() => void bot('take')}>
                        Stop flow
                    </button>
                )}
            </>
        ) : (
            <span className="text-muted-foreground">No automation running</span>
        );

    return (
        <div className="flex min-h-0 min-w-0 flex-1">
            <div
                className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2]"
                onDragEnter={(e) => {
                    if (!hasFiles(e)) return;
                    e.preventDefault();
                    dragDepth.current += 1;
                    setDropping(true);
                }}
                onDragOver={(e) => {
                    if (!hasFiles(e)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = disabledReason || !replyOpen ? 'none' : 'copy';
                }}
                onDragLeave={(e) => {
                    if (!hasFiles(e)) return;
                    dragDepth.current = Math.max(0, dragDepth.current - 1);
                    if (dragDepth.current === 0) setDropping(false);
                }}
                onDrop={(e) => {
                    if (!hasFiles(e)) return;
                    e.preventDefault();
                    dragDepth.current = 0;
                    setDropping(false);
                    const files = [...e.dataTransfer.files];
                    if (disabledReason) return void toast.error(disabledReason);
                    if (!replyOpen) return void toast.error('The window is closed. Send a template instead.');
                    if (files.length === 0) return void toast.error('That item cannot be attached. Drop a file from your computer.');
                    if (files.length > 1) toast.message('One file per message: the first file was attached.');
                    setMode('reply');
                    composer.current?.attach(files[0]);
                }}
            >
                {dropping && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/15 p-6 backdrop-blur-[1px]">
                        <div className="rounded-xl border-2 border-dashed border-brand-500 bg-card px-8 py-6 text-center shadow-raised">
                            <UploadCloudIcon className="mx-auto size-8 text-brand-600" />
                            <p className="mt-2 text-[15px] font-semibold">
                                {disabledReason || !replyOpen ? 'Files cannot be sent right now' : 'Drop to attach'}
                            </p>
                        </div>
                    </div>
                )}

                <header className="border-b bg-card">
                    <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to list">
                            <ArrowLeftIcon />
                        </Button>
                        <RingAvatar
                            name={name}
                            expiresAt={c.window.expires_at}
                            hasChat={tier !== 'none'}
                            now={now}
                            className="size-10 text-[13px] max-md:size-9"
                        />
                        {/* Phones (prototype): tap the name for the customer's details. */}
                        <button type="button" className="min-w-0 flex-1 text-left md:pointer-events-none" onClick={() => setCtxOpen(true)} tabIndex={-1}>
                            <b className="block truncate text-[15px] font-semibold" dir="auto">
                                {name}
                            </b>
                            <small className="block truncate text-[12px] text-muted-foreground max-md:hidden">
                                {contact?.phone ? fmtPhone(contact.phone) : contact?.username ? `@${contact.username}` : 'Number hidden'} · WhatsApp
                                {contact?.company ? ` · ${contact.company}` : ''}
                            </small>
                            <small className="block truncate text-[12px] text-muted-foreground md:hidden">
                                {owner ? `Assigned to ${owner.split(' ')[0]}` : 'Unassigned'} · tap for details
                            </small>
                        </button>
                        {contact?.phone && (
                            <Button asChild variant="ghost" size="icon-sm" className="md:hidden">
                                <a href={`tel:${contact.phone}`} aria-label={`Call ${name}`}>
                                    <PhoneIcon />
                                </a>
                            </Button>
                        )}
                        <div className="flex shrink-0 items-center gap-1.5">
                            {can(P.InboxAssign) && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                                            <OwnerAvatar name={owner} className="size-5 text-[9px]" /> {owner ? owner.split(' ')[0] : 'Assign'}
                                            <ChevronDownIcon className="-mr-0.5 opacity-60" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
                                        <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                                            Assign to
                                        </DropdownMenuLabel>
                                        {(assignees.data ?? []).map((a) => (
                                            <DropdownMenuItem key={a.id} disabled={!a.can_access} onSelect={() => void assign(a.id, a.name)}>
                                                <OwnerAvatar name={a.name} className="size-5 text-[9px]" /> <span className="flex-1 truncate">{a.name}</span>
                                                {c.assigned_membership_id === a.id && <small className="text-[11px] text-muted-foreground">✓ Current</small>}
                                                {!a.can_access && <small className="text-[11px] text-muted-foreground">No access</small>}
                                            </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={() => void assign(null, '')}>
                                            <OwnerAvatar name={null} className="size-5 text-[9px]" /> <span className="flex-1">Unassigned</span>
                                            {!c.assigned_membership_id && <small className="text-[11px] text-muted-foreground">✓ Current</small>}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                            {can(P.InboxReply) &&
                                feature('snooze').enabled &&
                                !numberGone &&
                                (c.snoozed_until ? (
                                    <Button variant="outline" size="sm" onClick={() => void snooze(null)}>
                                        <SunIcon /> Unsnooze
                                    </Button>
                                ) : (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm" className="hidden sm:inline-flex" disabled={c.status === 'closed'}>
                                                <MoonIcon /> Snooze
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-60">
                                            <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                                                Snooze until
                                            </DropdownMenuLabel>
                                            {presets.map(([label, at]) => (
                                                <DropdownMenuItem key={label} onSelect={() => void snooze(at)}>
                                                    <span className="flex-1">{label}</span>
                                                    <small className="text-[11px] text-muted-foreground">
                                                        {label.startsWith('In') ? fmtTime(at.getTime()) : fmtWhen(at.getTime(), now)}
                                                    </small>
                                                </DropdownMenuItem>
                                            ))}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={() => setDialog('snooze')}>Pick date & time…</DropdownMenuItem>
                                            {c.window.open && c.window.expires_at && new Date(c.window.expires_at) < d1 && (
                                                <>
                                                    <DropdownMenuSeparator />
                                                    <p className="px-2 py-1.5 text-[11px] text-warn">
                                                        <TriangleAlertIcon className="mr-1 inline size-3" />
                                                        Window closes {fmtWhen(c.window.expires_at, now)}. Snoozing past it means a template will be needed.
                                                    </p>
                                                </>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ))}
                            {can(P.InboxReply) && !numberGone && (
                                <span className="max-md:hidden">
                                    <ResolveMenu conversation={c} onResolved={onResolved} />
                                </span>
                            )}
                            <Button
                                variant={ctxOpen ? 'secondary' : 'ghost'}
                                size="icon-sm"
                                className="max-md:hidden"
                                onClick={() => setCtxOpen(!ctxOpen)}
                                title="Customer context"
                                aria-label="Customer context"
                                aria-pressed={ctxOpen}
                            >
                                <PanelRightIcon />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" title="More" aria-label="More">
                                        <MoreHorizontalIcon />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-60">
                                    {/* Phones: the header's buttons live here (prototype chat menu). */}
                                    {can(P.InboxReply) && !numberGone && (
                                        <DropdownMenuItem
                                            className="md:hidden"
                                            onSelect={() => void (c.status === 'closed' ? reopenChat(qc, c) : resolveChat(qc, c, 'resolved', onResolved))}
                                        >
                                            <CheckCircle2Icon /> {c.status === 'closed' ? 'Reopen chat' : 'Resolve chat'}
                                        </DropdownMenuItem>
                                    )}
                                    {can(P.InboxAssign) && c.assigned_membership_id !== membership.id && (
                                        <DropdownMenuItem className="md:hidden" onSelect={() => void assign(membership.id, me.user.name)}>
                                            <UserIcon /> Assign to me
                                        </DropdownMenuItem>
                                    )}
                                    {can(P.InboxReply) && feature('snooze').enabled && !numberGone && c.status !== 'closed' && !c.snoozed_until && (
                                        <DropdownMenuItem className="md:hidden" onSelect={() => setDialog('snooze')}>
                                            <MoonIcon /> Snooze…
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem className="md:hidden" onSelect={() => setCtxOpen(true)}>
                                        <PanelRightIcon /> Customer details
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="md:hidden" />
                                    {contact && can(P.ContactsUpdate) && (
                                        <DropdownMenuItem onSelect={() => setDialog('edit')}>
                                            <PencilIcon /> Edit contact
                                        </DropdownMenuItem>
                                    )}
                                    {contact && can(P.ContactsUpdate) && (
                                        <DropdownMenuItem onSelect={() => setDialog('step')}>
                                            <HistoryIcon /> Set next step
                                        </DropdownMenuItem>
                                    )}
                                    {contact && can(P.ContactsUpdate) && (
                                        <DropdownMenuItem onSelect={() => setDialog('deal')}>
                                            <DiamondIcon /> New deal
                                        </DropdownMenuItem>
                                    )}
                                    {contact && can(P.ContactsView) && (
                                        <DropdownMenuItem onSelect={() => openContact(contact)}>
                                            <ExternalLinkIcon /> Open in CRM
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onSelect={async () => {
                                            try {
                                                await markUnread(c.id);
                                                readFor.current = `${c.id}:${messages.length}`;
                                                void qc.invalidateQueries({ queryKey: keys.conversationsAll });
                                                toast.success('Marked as unread');
                                            } catch (e) {
                                                toast.error(errorMessage(e));
                                            }
                                        }}
                                    >
                                        <BellDotIcon /> Mark as unread
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onSelect={() => {
                                            void navigator.clipboard?.writeText(`${window.location.origin}/inbox?c=${c.id}`);
                                            toast.success('Link copied');
                                        }}
                                    >
                                        <CopyIcon /> Copy link to conversation
                                    </DropdownMenuItem>
                                    {can(P.InboxReply) && !numberGone && (
                                        <>
                                            <DropdownMenuSeparator />
                                            {c.handler !== 'bot' && (c.bot_available ?? !!c.bot) && c.status === 'open' && (
                                                <DropdownMenuItem onSelect={() => void bot('back')}>
                                                    <BotIcon /> {c.bot ? 'Hand back to bot' : 'Hand to bot'}
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem
                                                onSelect={async () => {
                                                    try {
                                                        await setConversationAutoReply(c.id, !c.auto_reply_enabled);
                                                        toast.success(
                                                            c.auto_reply_enabled
                                                                ? 'Auto reply cancelled for this conversation'
                                                                : 'Auto reply allowed for this conversation',
                                                        );
                                                        refresh();
                                                    } catch (e) {
                                                        toast.error(errorMessage(e));
                                                    }
                                                }}
                                            >
                                                <SettingsIcon /> {c.auto_reply_enabled ? 'Cancel auto reply' : 'Allow auto reply'}
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    <MobileWaitBar conversation={c} fetchedAt={conversation.dataUpdatedAt} now={now} name={name} numberGone={numberGone} />
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 pb-2.5 text-[12px] max-md:hidden">
                        {numberGone ? <Chip tone="bad">Number disconnected</Chip> : <WindowChip conversation={c} now={now} big />}
                        <Chip tone={state === 'needs_reply' ? 'bad' : state === 'waiting' ? 'info' : 'grey'}>
                            {REPLY_LABEL[state]}
                            {state === 'needs_reply' && c.needs_reply_since && !c.promise
                                ? ` · ${dur(now - new Date(c.needs_reply_since).getTime(), true)}`
                                : ''}
                            {state === 'snoozed' && c.snoozed_until ? ` until ${fmtWhen(c.snoozed_until, now)}` : ''}
                        </Chip>
                        <WaitClock conversation={c} fetchedAt={conversation.dataUpdatedAt} now={now} />
                        <span className="h-4 w-px bg-border" aria-hidden />
                        {automation}
                        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
                        <span className="hidden sm:inline">
                            Owner: <b className="font-semibold">{owner ?? 'Unassigned'}</b>
                        </span>
                        {viewers.map((v) => (
                            <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info">
                                <OwnerAvatar name={v.name} className="size-4 text-[8px]" /> {v.name.split(' ')[0]} is {v.typing ? 'typing…' : 'viewing'}
                            </span>
                        ))}
                    </div>
                </header>

                <div
                    ref={scroller}
                    onScroll={(e) => {
                        const el = e.currentTarget;
                        pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                    }}
                    className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8"
                >
                    {thread.hasNextPage && (
                        <div className="mb-2 flex justify-center">
                            <Button size="sm" variant="outline" onClick={() => thread.fetchNextPage()} disabled={thread.isFetchingNextPage}>
                                {thread.isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null} Load earlier messages
                            </Button>
                        </div>
                    )}
                    {thread.isLoading && <Skeleton className="h-16 w-1/2" />}
                    {timeline.map((item, i) => {
                        const prevItem = timeline[i - 1];
                        const newDay = !prevItem || new Date(prevItem.at).toDateString() !== new Date(item.at).toDateString();
                        const day = newDay && item.at ? <DayLabel at={item.at} now={now} /> : null;
                        if (item.kind === 'note')
                            return (
                                <Fragment key={`n-${item.note.id}`}>
                                    {day}
                                    <NoteLine note={item.note} />
                                </Fragment>
                            );
                        if (item.kind === 'event')
                            return (
                                <Fragment key={`e-${item.event.id}`}>
                                    {day}
                                    <EventLine event={item.event} />
                                </Fragment>
                            );
                        const m = item.message;
                        const prev = !newDay && prevItem?.kind === 'message' ? prevItem.message : undefined;
                        const grouped =
                            !!prev &&
                            prev.direction === m.direction &&
                            prev.origin === m.origin &&
                            prev.sent_by_membership_id === m.sent_by_membership_id &&
                            !!m.timestamp &&
                            !!prev.timestamp &&
                            new Date(m.timestamp).getTime() - new Date(prev.timestamp).getTime() < 5 * 60_000;
                        const author =
                            m.direction !== 'outbound' || grouped
                                ? null
                                : m.origin === 'agent'
                                  ? m.sent_by_membership_id === membership.id
                                      ? 'You'
                                      : (names.get(m.sent_by_membership_id ?? '') ?? 'Teammate')
                                  : m.origin === 'automation' && m.automation !== 'consent'
                                    ? `Automation · ${c.bot?.flow_name ?? 'Flow'}`
                                    : null;

                        return (
                            <Fragment key={m.id}>
                                {day}
                                <div
                                    id={`msg-${m.id}`}
                                    className={cn(
                                        'rounded-md data-focused:ring-2 data-focused:ring-primary/60 data-focused:ring-offset-2',
                                        grouped ? '-mt-1' : 'mt-1.5',
                                    )}
                                >
                                    <MessageBubble
                                        grouped={grouped}
                                        message={m}
                                        quoted={m.reply_to_wamid ? (byWamid.get(m.reply_to_wamid) ?? null) : undefined}
                                        authorLabel={author}
                                        onReply={disabledReason || !replyOpen ? undefined : setReplyTo}
                                        onRetry={
                                            disabledReason
                                                ? undefined
                                                : async (msg) => {
                                                      if (!replyOpen && msg.type !== 'template') {
                                                          toast.error('Window closed since this failed. Send a template instead.');
                                                          setMode('template');
                                                          return;
                                                      }
                                                      try {
                                                          await api(`conversations/${c.id}/messages/${msg.id}/retry`, { method: 'POST' });
                                                          toast.success('Sending again');
                                                      } catch (e) {
                                                          toast.error(errorMessage(e));
                                                      } finally {
                                                          refresh();
                                                      }
                                                  }
                                        }
                                        onTemplate={disabledReason ? undefined : () => setMode('template')}
                                    />
                                </div>
                            </Fragment>
                        );
                    })}
                </div>

                <Composer
                    ref={composer}
                    conversation={c}
                    now={now}
                    mode={mode}
                    onMode={(m) => {
                        setPending(null);
                        setMode(m);
                    }}
                    disabledReason={disabledReason}
                    replyTo={replyTo}
                    onClearReply={() => setReplyTo(null)}
                    onSend={send}
                    onNote={
                        notesAllowed && can(P.InboxReply)
                            ? async (body, mentions) => {
                                  await addConversationNote(c.id, body, mentions);
                                  pinnedToBottom.current = true;
                                  void qc.invalidateQueries({ queryKey: ['inbox', 'notes', c.id] });
                                  toast.success('Note saved · team only');
                              }
                            : undefined
                    }
                    beforeSend={beforeSend}
                    onTyping={onTyping}
                    banners={banners.length ? <>{banners}</> : null}
                    wabaAccountId={wabaAccountId}
                    teammates={teammates}
                    dealTitle={current?.title ?? null}
                    onFullTemplate={() => setFullTemplate(true)}
                />
            </div>

            <ContextPanel conversation={c} open={ctxOpen} onClose={() => setCtxOpen(false)} now={now} />
            <TemplateDialog
                open={fullTemplate}
                onOpenChange={setFullTemplate}
                wabaAccountId={wabaAccountId}
                onSend={async (p) => {
                    await send(p);
                    toast.success('Template queued for sending');
                }}
                noMarketing={contact?.consent_state === 'opted_out' || !!contact?.marketing_opted_out}
                unknownConsent={contact?.consent_state === 'unknown'}
            />
            {contact && dialog === 'edit' && <EditContactDialog contact={contact} open onOpenChange={(o) => !o && setDialog(null)} />}
            {contact && dialog === 'deal' && (
                <NewDealDialog
                    contact={contact}
                    open
                    onOpenChange={(o) => !o && setDialog(null)}
                    owners={teammates}
                    defaultOwner={c.assigned_membership_id ?? membership.id}
                />
            )}
            {contact && dialog === 'step' && (
                <StepDialog
                    contactId={contact.id}
                    deals={dealList}
                    currentDealId={current?.id ?? null}
                    open
                    onOpenChange={(o) => !o && setDialog(null)}
                    owners={teammates}
                    defaultOwner={current?.owner?.id ?? c.assigned_membership_id ?? membership.id}
                />
            )}
            <SnoozeDialog open={dialog === 'snooze'} onOpenChange={(o) => !o && setDialog(null)} onSnooze={(at) => snooze(at)} />
            <FlagDialog resolution={flagging} contactName={name} onClose={() => (setFlagging(null), refresh())} />
        </div>
    );
}
