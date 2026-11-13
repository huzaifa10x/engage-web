'use client';

import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { OUTCOME_LABEL } from '@/components/chatbots/flow-dashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { type ChatbotRun, type RunEvent, useChatbotRun, useChatbotRuns, useChatbots } from '@/lib/chatbots';
import { P } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const STATUS: Record<ChatbotRun['status'], [string, string]> = {
    active: ['Running', 'draft'],
    waiting: ['Waiting', 'draft'],
    completed: ['Completed', 'ok'],
    handed_off: ['Handed over', 'info'],
    abandoned: ['Gave up', 'warn'],
    stopped: ['Stopped', 'off'],
};

const REASON: Record<string, string> = {
    handoff: 'reached a handover step',
    end: 'reached an end step',
    window_closed: 'the 24-hour window had closed',
    template_unavailable: 'the template was not available',
    send_failed: 'a message could not be sent',
    opted_out: 'the customer opted out',
    number_unavailable: 'the WhatsApp number was not connected',
    taken_over: 'a person took over',
    loop: 'the flow went round in a loop',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function Runs() {
    const { can } = useSession();
    const params = useSearchParams();
    const allowed = can(P.ChatbotsView);
    const [flow, setFlow] = useState(params.get('flow') ?? 'all');
    const [status, setStatus] = useState('all');
    const [q, setQ] = useState('');
    const [open, setOpen] = useState<string | null>(null);
    const flows = useChatbots({ kind: 'bot' }, allowed);
    const filters = Object.fromEntries(Object.entries({ flow, status, q: q.trim() }).filter(([, v]) => v !== '' && v !== 'all')) as Record<string, string>;
    const runs = useChatbotRuns(filters, allowed);
    if (!allowed) return <Forbidden />;
    const rows = runs.data?.pages.flatMap((p) => p.data) ?? [];
    const count = (st: ChatbotRun['status'][]) => rows.filter((r) => st.includes(r.status)).length;

    return (
        <>
            <div className="cb-pagehead">
                <div>
                    <h1>Runs &amp; Activity</h1>
                    <p>
                        What happened in each conversation, step by step, and why. Use it to find a problem and jump to the exact step. Test chats are never
                        listed.
                    </p>
                </div>
            </div>
            <div className="cb-kpis">
                {(
                    [
                        [['completed'], 'Completed'],
                        [['handed_off'], 'Handed over'],
                        [['active', 'waiting'], 'Waiting (inside 24 h)'],
                        [['abandoned'], 'Gave up (no reply)'],
                        [['stopped'], 'Stopped or failed'],
                    ] as [ChatbotRun['status'][], string][]
                ).map(([st, l]) => (
                    <div key={l} className="cb-kpi">
                        <span className="cb-v">{count(st)}</span>
                        <span className="cb-l">{l}</span>
                    </div>
                ))}
            </div>
            <div className="cb-card">
                <div className="cb-row" style={{ padding: 16 }}>
                    <select className="cb-in" style={{ width: 'auto', minWidth: 220 }} value={flow} onChange={(e) => setFlow(e.target.value)} aria-label="Flow">
                        <option value="all">All flows</option>
                        {(flows.data?.data ?? []).map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.name}
                            </option>
                        ))}
                    </select>
                    <select className="cb-in" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Outcome">
                        <option value="all">Any outcome</option>
                        <option value="running">Waiting</option>
                        <option value="completed">Completed</option>
                        <option value="handed_off">Handed over</option>
                        <option value="abandoned">Gave up</option>
                        <option value="stopped">Stopped</option>
                    </select>
                    <input
                        className="cb-in"
                        style={{ width: 240 }}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by name or number"
                        aria-label="Search runs"
                    />
                    <span className="cb-spacer cb-small cb-muted">
                        {rows.length}
                        {runs.hasNextPage ? '+' : ''} runs
                    </span>
                </div>
                {runs.isLoading ? (
                    <Skeleton className="h-48 w-full" />
                ) : rows.length === 0 ? (
                    <div className="cb-empty">
                        <b style={{ color: 'var(--cb-ink)' }}>No runs yet</b>
                        <span>When a live flow answers a customer, the run shows up here.</span>
                    </div>
                ) : (
                    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" style={{ borderTop: '1px solid var(--cb-line-2)' }}>
                        <div className="cb-scrollx" style={{ maxHeight: 640, overflowY: 'auto' }}>
                            <table className="cb-t" data-testid="runs-table">
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Flow</th>
                                        <th>State</th>
                                        <th>Started</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id} className={cn('click', open === r.id && 'sel')} onClick={() => setOpen(r.id)}>
                                            <td>
                                                <b>{r.contact?.name ?? 'Unknown'}</b>
                                                {r.contact?.phone && <div className="cb-small cb-muted">+{r.contact.phone}</div>}
                                            </td>
                                            <td className="cb-small">
                                                {r.flow.name}
                                                <div className="cb-muted">v{r.version}</div>
                                            </td>
                                            <td>
                                                <span className={`cb-chip ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                                                <div className="cb-small cb-muted">{r.outcome ? (OUTCOME_LABEL[r.outcome] ?? r.outcome) : '—'}</div>
                                            </td>
                                            <td className="cb-small cb-num">{when(r.started_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {runs.hasNextPage && (
                                <div className="cb-row" style={{ justifyContent: 'center', padding: 12 }}>
                                    <button type="button" className="cb-btn sm" onClick={() => void runs.fetchNextPage()} disabled={runs.isFetchingNextPage}>
                                        Show older runs
                                    </button>
                                </div>
                            )}
                        </div>
                        <div style={{ borderLeft: '1px solid var(--cb-line-2)', padding: 16 }}>
                            {open ? <RunReplay id={open} /> : <p className="cb-muted cb-small">Pick a run to follow the customer step by step.</p>}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

/** One run, step by step: follow the customer with the slider; each step links to the builder. */
function RunReplay({ id }: { id: string }) {
    const run = useChatbotRun(id);
    const r = run.data;
    const [at, setAt] = useState<{ id: string; i: number } | null>(null);
    if (!r) return <Skeleton className="h-64 w-full" />;
    const events = r.timeline;
    const last = Math.max(0, events.length - 1);
    const i = at && at.id === id ? Math.min(at.i, last) : last;
    const cur = events[i];
    const shown = events.slice(0, i + 1);
    const go = (n: number) => setAt({ id, i: Math.max(0, Math.min(last, n)) });
    const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

    return (
        <div className="cb-col" style={{ gap: 12 }} data-testid="run-detail">
            <div className="cb-row">
                <h3>{r.contact?.name ?? 'Unknown'}</h3>
                <span className={`cb-chip ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                <span className="cb-spacer cb-small cb-muted">
                    {r.flow.name} v{r.version}
                </span>
            </div>
            <p className="cb-small cb-muted">
                {r.ended_reason ? `Ended: ${REASON[r.ended_reason] ?? r.ended_reason}` : 'Still running'}
                {r.ended_node ? ` at “${r.ended_node.title}”` : ''}
                {r.current_node ? `, now at “${r.current_node.title}”` : ''} · started {when(r.started_at)}
            </p>
            <div className="cb-row">
                <Link href={`/inbox?c=${r.conversation_id}`} className="cb-btn sm">
                    <ExternalLinkIcon className="size-3.5" /> Open the conversation
                </Link>
                <Link href={`/chatbots/builder?id=${r.flow.id}`} className="cb-btn sm">
                    <ExternalLinkIcon className="size-3.5" /> Open the flow
                </Link>
            </div>
            {!r.complete_log && (
                <p className="cb-banner sample cb-small">
                    This run started before messages were recorded with runs: its steps and paths are shown; the conversation has the messages.
                </p>
            )}
            {events.length > 0 && (
                <>
                    <b>Follow the customer</b>
                    <div className="cb-row" style={{ flexWrap: 'nowrap' }}>
                        <button type="button" className="cb-btn sm" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous step">
                            ◀
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={last}
                            value={i}
                            onChange={(e) => go(Number(e.target.value))}
                            className="cb-grow"
                            aria-label="Replay position"
                        />
                        <button type="button" className="cb-btn sm" onClick={() => go(i + 1)} disabled={i === last} aria-label="Next step">
                            ▶
                        </button>
                        <span className="cb-small cb-muted cb-num">
                            {i + 1} / {events.length}
                        </span>
                    </div>
                    {cur && (
                        <div className="cb-banner sample cb-row" style={{ justifyContent: 'space-between' }}>
                            <span>
                                <b>{time(cur.at)}</b> · {cur.kind === 'customer' ? `The customer wrote “${cur.text ?? ''}”` : `At “${cur.node}”`}
                            </span>
                            <Link href={`/chatbots/builder?id=${r.flow.id}&step=${cur.node_id}`} className="cb-btn sm">
                                Open this step in the builder
                            </Link>
                        </div>
                    )}
                </>
            )}
            <div className="grid gap-3 xl:grid-cols-2">
                <div className="cb-phone">
                    <div className="cb-ph">
                        <span className="cb-av">{(r.contact?.name ?? '?').slice(0, 2).toUpperCase()}</span>
                        <span>
                            <b>{r.contact?.name ?? 'Unknown'}</b>
                            <span style={{ display: 'block', fontSize: 11.5, opacity: 0.8 }}>Recorded run</span>
                        </span>
                    </div>
                    <div className="cb-chat">
                        {shown
                            .filter((e) => e.kind === 'customer' || e.kind === 'bot')
                            .map((e) => (
                                <div key={e.seq} className={cn('cb-msg', e.kind === 'customer' ? 'me' : 'bot')}>
                                    {e.text ?? `(${e.type ?? 'message'})`}
                                </div>
                            ))}
                    </div>
                </div>
                <ol className="cb-col" style={{ gap: 2, listStyle: 'none', margin: 0, padding: 0 }} data-testid="run-timeline">
                    {events.map((e, n) => (
                        <TimelineItem key={e.seq} e={e} current={n === i} onClick={() => go(n)} />
                    ))}
                </ol>
            </div>
            {Object.keys(r.answers).length > 0 && (
                <section>
                    <b className="cb-small">Answers saved in this run</b>
                    <dl className="cb-small" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', margin: '6px 0 0' }}>
                        {Object.entries(r.answers).map(([k, v]) => (
                            <div key={k} className="contents">
                                <dt className="cb-muted">{k}</dt>
                                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}
        </div>
    );
}

function TimelineItem({ e, current, onClick }: { e: RunEvent; current: boolean; onClick: () => void }) {
    const time = e.at ? new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    if (e.kind === 'customer' || e.kind === 'bot') {
        return (
            <li>
                <button type="button" className="cb-whyitem" onClick={onClick} style={current ? { background: 'var(--cb-brand-wash)' } : undefined}>
                    <span className="cb-b" style={e.kind === 'customer' ? { background: 'var(--cb-send-i)' } : undefined} />
                    <span>
                        <span className="cb-num cb-muted">{time} </span>
                        {e.kind === 'customer' ? 'Customer: ' : 'Bot: '}
                        {e.text ?? `(${e.type ?? 'message'})`}
                        {e.kind === 'bot' && e.status ? ` · ${e.status}` : ''}
                        {e.error ? ` · ${e.error}` : ''}
                    </span>
                </button>
            </li>
        );
    }
    const line =
        e.kind === 'enter'
            ? `Step “${e.node}”`
            : e.kind === 'path'
              ? `→ ${e.label ?? e.output}`
              : e.kind === 'note'
                ? `Note for the team: ${e.text ?? ''}`
                : e.kind === 'handoff'
                  ? `Handed over${e.detail ? ` · ${OUTCOME_LABEL[e.detail] ?? e.detail}` : ''}`
                  : e.kind === 'complete'
                    ? `Finished${e.detail ? ` · ${e.detail}` : ''}`
                    : e.kind === 'abandon'
                      ? 'The customer stopped answering'
                      : `Problem at “${e.node}”: ${e.detail ?? ''}`;

    return (
        <li>
            <button
                type="button"
                className="cb-whyitem"
                onClick={onClick}
                style={{
                    ...(current ? { background: 'var(--cb-brand-wash)' } : {}),
                    ...(e.kind === 'error' ? { color: 'var(--cb-bad-i)' } : {}),
                    whiteSpace: 'pre-wrap',
                }}
            >
                <span className="cb-b" style={e.kind === 'error' ? { background: 'var(--cb-bad-i)' } : { background: '#c9d0c2' }} />
                <span>
                    <span className="cb-num cb-muted">{time} </span>
                    {line}
                </span>
            </button>
        </li>
    );
}

export default function ChatbotRunsPage() {
    return (
        <Suspense>
            <Runs />
        </Suspense>
    );
}
