'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { OUTCOME_LABEL } from '@/components/chatbots/flow-dashboard';
import { stepOrder } from '@/components/chatbots/studio/simple-view';
import { KIND_LABEL, kindOf } from '@/components/chatbots/studio/kinds';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration, useChatbot, useChatbotAnalytics, useChatbots } from '@/lib/chatbots';
import { P } from '@/lib/permissions';

type Mode = 'counts' | 'percent' | 'gaveup';
type Tab = 'steps' | 'paths' | 'outcomes' | 'versions' | 'health';

/**
 * Flow insights (approved design): how customers move through one flow, from the recorded run events,
 * for the live version (steps unchanged since earlier versions are counted together), one version, or all.
 * Every figure says what it is a share of. Flow health is separate: whether the automation itself works.
 */
function Insights() {
    const { can } = useSession();
    const router = useRouter();
    const params = useSearchParams();
    const allowed = can(P.ChatbotsView);
    const flows = useChatbots({ kind: 'bot' }, allowed);
    const list = flows.data?.data ?? [];
    const wanted = params.get('flow');
    const flowId = wanted ?? list.find((f) => f.published_version !== null)?.id ?? list[0]?.id ?? null;
    const [days, setDays] = useState(30);
    const [version, setVersion] = useState('current');
    const [mode, setMode] = useState<Mode>('counts');
    const [tab, setTab] = useState<Tab>('steps');
    const detail = useChatbot(flowId);
    const analytics = useChatbotAnalytics(flowId ?? 'none', days, allowed && flowId !== null, version);
    if (!allowed) return <Forbidden />;

    const a = analytics.data;
    const d = detail.data;
    const s = a?.sessions;
    const started = s?.started ?? 0;
    const share = (n: number) => (started > 0 ? `${Math.round((100 * n) / started)}%` : '—');
    const steps = d ? stepOrder(d.draft).filter((n) => n.type !== 'start') : [];
    const maxGaveUp = Math.max(0, ...steps.map((n) => a?.nodes[n.id]?.abandoned ?? 0));

    return (
        <>
            <div className="cb-pagehead">
                <div>
                    <h1>Flow insights</h1>
                    <p>
                        How customers move through one flow. Every figure says what it is a share of. Flow health, below, is separate: it says whether the
                        automation itself is working. Test chats are never counted.
                    </p>
                </div>
            </div>
            {list.length === 0 && !flows.isLoading ? (
                <div className="cb-card cb-empty">No flows yet. Create one on My Flows; its figures show here once customers use it.</div>
            ) : (
                <>
                    <div className="cb-row">
                        <select
                            className="cb-in"
                            style={{ width: 'auto', minWidth: 240 }}
                            value={flowId ?? ''}
                            onChange={(e) => {
                                setVersion('current');
                                router.replace(`/chatbots/insights?flow=${e.target.value}`);
                            }}
                            aria-label="Flow"
                        >
                            {list.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                        <select
                            className="cb-in"
                            style={{ width: 'auto' }}
                            value={version}
                            onChange={(e) => setVersion(e.target.value)}
                            aria-label="Version"
                            data-testid="insights-scope"
                        >
                            <option value="current">
                                {d?.published_version ? `Version ${d.published_version} (live) and unchanged steps` : 'Live version'}
                            </option>
                            {[...(a?.versions ?? [])].reverse().map((v) => (
                                <option key={v.version} value={String(v.version)}>
                                    Version {v.version} only · {v.sessions} chats
                                </option>
                            ))}
                            <option value="all">All versions together</option>
                        </select>
                        <select className="cb-in" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
                            <option value={7}>Last 7 days</option>
                            <option value={30}>Last 30 days</option>
                            <option value={90}>Last 90 days</option>
                        </select>
                        <div className="cb-seg" aria-label="Figures">
                            {(
                                [
                                    ['counts', 'Counts'],
                                    ['percent', 'Percentages'],
                                    ['gaveup', 'Gave up'],
                                ] as const
                            ).map(([k, l]) => (
                                <button key={k} type="button" className={mode === k ? 'on' : undefined} onClick={() => setMode(k)} aria-pressed={mode === k}>
                                    {l}
                                </button>
                            ))}
                        </div>
                        {flowId && (
                            <Link href={`/chatbots/builder?id=${flowId}`} className="cb-btn sm cb-spacer">
                                See figures on the builder
                            </Link>
                        )}
                    </div>

                    {!a || !d ? (
                        <Skeleton className="h-72 w-full" />
                    ) : (
                        <>
                            <div className="cb-kpis">
                                <div className="cb-kpi">
                                    <span className="cb-l">Chats started</span>
                                    <span className="cb-v">{started}</span>
                                    <span className="cb-l">unique chats · last {days} days</span>
                                </div>
                                <div className="cb-kpi">
                                    <span className="cb-l">Finished or handed over</span>
                                    <span className="cb-v">{s ? s.completed + s.handed_off : 0}</span>
                                    <span className="cb-l">{s ? share(s.completed + s.handed_off) : '—'} of chats started</span>
                                </div>
                                <div className="cb-kpi">
                                    <span className="cb-l">Waiting</span>
                                    <span className="cb-v">{s?.running ?? 0}</span>
                                    <span className="cb-l">no reply yet, inside 24 h</span>
                                </div>
                                <div className="cb-kpi">
                                    <span className="cb-l">Gave up</span>
                                    <span className="cb-v">{s?.abandoned ?? 0}</span>
                                    <span className="cb-l">stopped answering · {share(s?.abandoned ?? 0)} of chats started</span>
                                </div>
                                <div className="cb-kpi">
                                    <span className="cb-l">Stopped by an error</span>
                                    <span className="cb-v">{s?.stopped ?? 0}</span>
                                    <span className="cb-l">{steps.reduce((t, n) => t + (a.nodes[n.id]?.errors ?? 0), 0)} failed steps or messages</span>
                                </div>
                            </div>
                            <p className="cb-small cb-muted">
                                Average time to finish: {formatDuration(s?.avg_seconds ?? null)}.
                                {a.scope === 'current' && ' Steps that changed in a later version count only from that version on.'}
                            </p>

                            <div className="cb-tabs" role="tablist">
                                {(
                                    [
                                        ['steps', 'Steps'],
                                        ['paths', 'Buttons & paths'],
                                        ['outcomes', 'Outcomes'],
                                        ['versions', 'Compare versions'],
                                        ['health', 'Flow health'],
                                    ] as const
                                ).map(([k, l]) => (
                                    <button
                                        key={k}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === k}
                                        className={tab === k ? 'on' : undefined}
                                        onClick={() => setTab(k)}
                                    >
                                        {l}
                                    </button>
                                ))}
                            </div>

                            {tab === 'steps' && (
                                <div className="cb-card cb-scrollx">
                                    <table className="cb-t" data-testid="insights-steps">
                                        <thead>
                                            <tr>
                                                <th>Step</th>
                                                <th>Reached (unique chats)</th>
                                                <th>Gave up here</th>
                                                <th>Handed over</th>
                                                <th>Answer didn’t fit</th>
                                                <th>Failures</th>
                                                <th aria-label="Runs" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {steps.map((n) => {
                                                const st = a.nodes[n.id];
                                                const k = kindOf(n.type);

                                                return (
                                                    <tr key={n.id}>
                                                        <td>
                                                            <span className="cb-row" style={{ flexWrap: 'nowrap' }}>
                                                                <span className={`cb-chip cb-kind ${k}`}>{KIND_LABEL[k]}</span>
                                                                <b>{n.title}</b>
                                                                {mode === 'gaveup' && st && st.abandoned > 0 && st.abandoned === maxGaveUp && (
                                                                    <span className="cb-chip warn">Biggest drop</span>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="cb-num">
                                                            {st ? (mode === 'percent' ? share(st.entries) : st.entries) : '—'}
                                                            {st && mode !== 'percent' && started > 0 && (
                                                                <span className="cb-small cb-muted">
                                                                    {' '}
                                                                    · {share(st.entries)} of {started}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="cb-num">{st?.abandoned || '—'}</td>
                                                        <td className="cb-num">{st?.handoffs || '—'}</td>
                                                        <td className="cb-num">{st?.no_match || '—'}</td>
                                                        <td className="cb-num">{st?.errors || '—'}</td>
                                                        <td>
                                                            <Link href={`/chatbots/runs?flow=${flowId}`} className="cb-btn xs">
                                                                Runs
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'paths' && (
                                <div className="cb-card cb-scrollx">
                                    <table className="cb-t">
                                        <thead>
                                            <tr>
                                                <th>Step</th>
                                                <th>Path</th>
                                                <th>Taken</th>
                                                <th>Share of the step</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {steps
                                                .filter((n) => n.outputs.length > 1)
                                                .flatMap((n) =>
                                                    n.outputs.map((o, idx) => {
                                                        const st = a.nodes[n.id];
                                                        const taken = st?.clicks[o.id] ?? 0;

                                                        return (
                                                            <tr key={`${n.id}:${o.id}`}>
                                                                <td>{idx === 0 ? <b>{n.title}</b> : ''}</td>
                                                                <td>{o.label}</td>
                                                                <td className="cb-num">{taken}</td>
                                                                <td className="cb-num">
                                                                    {st && st.entries > 0 ? `${Math.round((100 * taken) / st.entries)}%` : '—'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    }),
                                                )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'outcomes' && (
                                <div className="cb-card" data-testid="outcomes">
                                    {a.outcomes.length === 0 ? (
                                        <p className="cb-empty">
                                            No outcomes yet. Give your End and handover steps an outcome (for example “Qualified buyer”) to count them here.
                                        </p>
                                    ) : (
                                        <table className="cb-t">
                                            <thead>
                                                <tr>
                                                    <th>Outcome</th>
                                                    <th>Chats</th>
                                                    <th>Share of chats started</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {a.outcomes.map((o) => (
                                                    <tr key={o.label}>
                                                        <td>{OUTCOME_LABEL[o.label] ?? o.label}</td>
                                                        <td className="cb-num">{o.count}</td>
                                                        <td className="cb-num">{share(o.count)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {tab === 'versions' && (
                                <div className="cb-card cb-scrollx">
                                    <table className="cb-t">
                                        <thead>
                                            <tr>
                                                <th>Version</th>
                                                <th>Published</th>
                                                <th>Chats in this period</th>
                                                <th>Steps changed from the previous version</th>
                                                <th aria-label="Open" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...a.versions].reverse().map((v) => (
                                                <tr key={v.version}>
                                                    <td>
                                                        <b>Version {v.version}</b>{' '}
                                                        {v.version === d.published_version && <span className="cb-chip live">Live</span>}
                                                    </td>
                                                    <td className="cb-small">{v.published_at ? new Date(v.published_at).toLocaleString() : '—'}</td>
                                                    <td className="cb-num">{v.sessions}</td>
                                                    <td className="cb-num">{v.changed_steps ?? '—'}</td>
                                                    <td>
                                                        <button type="button" className="cb-btn xs" onClick={() => setVersion(String(v.version))}>
                                                            Show its figures
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'health' && (
                                <div className="cb-col">
                                    {(d.attention ?? []).length === 0 && d.issues.filter((i) => i.level === 'error').length === 0 ? (
                                        <p className="cb-banner ok">Working: nothing broke since publishing, and the draft passes the publish checks.</p>
                                    ) : null}
                                    {(d.attention ?? []).map((t) => (
                                        <p key={t} className="cb-banner bad">
                                            Live: {t}
                                        </p>
                                    ))}
                                    {d.issues
                                        .filter((i) => i.level === 'error')
                                        .map((i, n) => (
                                            <p key={n} className="cb-banner warn">
                                                Draft: {i.message}
                                            </p>
                                        ))}
                                    <p className="cb-small cb-muted">
                                        {s?.stopped ?? 0} chats stopped by an error in this period; open Runs &amp; Activity to see where and why.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </>
    );
}

export default function FlowInsightsPage() {
    return (
        <Suspense>
            <Insights />
        </Suspense>
    );
}
