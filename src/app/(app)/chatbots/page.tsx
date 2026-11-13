'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    BarChart3Icon,
    BotIcon,
    CalendarClockIcon,
    CopyIcon,
    DownloadIcon,
    FolderInputIcon,
    ListIcon,
    MoreHorizontalIcon,
    PencilIcon,
    PowerIcon,
    Trash2Icon,
    TriangleAlertIcon,
    UploadIcon,
    UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { RunPeriodDialog, runPeriodLabel } from '@/components/chatbots/run-period-dialog';
import { TemplateGallery } from '@/components/chatbots/template-gallery';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import {
    activateChatbot,
    archiveChatbot,
    type ChatbotFlow,
    chatbotKeys,
    deleteChatbot,
    duplicateChatbot,
    exportChatbot,
    importChatbot,
    saveChatbot,
    useChatbot,
    useChatbotOptions,
    useChatbots,
} from '@/lib/chatbots';
import { P } from '@/lib/permissions';
import { cn } from '@/lib/utils';

function ChatbotsList() {
    const { can } = useSession();
    const qc = useQueryClient();
    const router = useRouter();
    const params = useSearchParams();
    const allowed = can(P.ChatbotsView);
    const canManage = can(P.ChatbotsManage);
    const canPublish = can(P.ChatbotsPublish);
    const [q, setQ] = useState('');
    const [tab, setTab] = useState<Tab>('all');
    const [number, setNumber] = useState('all');
    const [purpose, setPurpose] = useState('all');
    const [view, setView] = useState<'list' | 'cards'>('list');
    const bots = useChatbots({ kind: 'bot' }, allowed);
    const archived = useChatbots({ kind: 'bot', status: 'archived' }, allowed);
    const subflows = useChatbots({ kind: 'subflow' }, allowed);
    const [choosing, setChoosing] = useState(false);
    const [creating, setCreating] = useState<'bot' | 'subflow' | null>(null);
    const [initial, setInitial] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<ChatbotFlow | null>(null);
    const [replace, setReplace] = useState<{ flow: ChatbotFlow; other: string } | null>(null);
    const [moving, setMoving] = useState<ChatbotFlow | null>(null);
    const [scheduling, setScheduling] = useState<ChatbotFlow | null>(null);
    const [editors, setEditors] = useState<ChatbotFlow | null>(null);
    const [importing, setImporting] = useState<Record<string, unknown> | null>(null);
    const file = useRef<HTMLInputElement>(null);

    // Old links (/chatbots?analytics=<id>) open that flow's insights.
    const wanted = params.get('analytics');
    useEffect(() => {
        if (wanted) router.replace(`/chatbots/insights?flow=${wanted}`);
    }, [wanted, router]);
    // /chatbots?create=1 (Templates page, empty states) opens “Create a flow”.
    const [askedCreate, setAskedCreate] = useState(false);
    if (params.get('create') && !askedCreate) {
        setAskedCreate(true);
        setChoosing(true);
    }

    const numbers = useNumbers(bots.data?.data ?? []);
    if (!allowed) return <Forbidden />;

    const meta = bots.data?.meta;
    const live = bots.data?.data ?? [];
    const all = [...live, ...(archived.data?.data ?? []), ...(subflows.data?.data ?? [])];
    const full = meta?.limit !== null && meta?.limit !== undefined && meta.used >= meta.limit;
    const refresh = () => void qc.invalidateQueries({ queryKey: chatbotKeys.all });
    const purposes = [...new Set([...(meta?.folders ?? []), ...all.map((f) => f.folder).filter((f): f is string => !!f)])].sort();

    const attention = (f: ChatbotFlow) => (f.attention ?? []).length > 0;
    const inTab = (f: ChatbotFlow, t: Tab) =>
        t === 'all'
            ? f.kind === 'bot' && f.status !== 'archived'
            : t === 'live'
              ? f.kind === 'bot' && f.status === 'live'
              : t === 'draft'
                ? f.kind === 'bot' && f.status === 'draft'
                : t === 'off'
                  ? f.kind === 'bot' && f.status === 'paused'
                  : t === 'attention'
                    ? f.kind === 'bot' && f.status !== 'archived' && attention(f)
                    : t === 'archived'
                      ? f.kind === 'bot' && f.status === 'archived'
                      : f.kind === 'subflow';
    const shown = all.filter(
        (f) =>
            inTab(f, tab) &&
            (q.trim() === '' || f.name.toLowerCase().includes(q.trim().toLowerCase())) &&
            (number === 'all' || f.phone_number_id === number) &&
            (purpose === 'all' || f.folder === purpose),
    );
    const total = all.filter((f) => inTab(f, tab)).length;

    // KPIs: the same calculation as Flow insights (sessions of the last 30 days).
    const activeBots = live.filter((f) => f.status !== 'archived');
    const started = activeBots.reduce((n, f) => n + (f.stats?.started_30d ?? 0), 0);
    const finished = activeBots.reduce((n, f) => n + ((f.stats?.started_30d ?? 0) * (f.stats?.completion_rate ?? 0)) / 100, 0);
    const numbersWithRuns = new Set(activeBots.filter((f) => (f.stats?.started_30d ?? 0) > 0).map((f) => f.phone_number_id)).size;

    const toggle = async (flow: ChatbotFlow, active: boolean, replaceOther = false) => {
        try {
            await activateChatbot(flow.id, active, replaceOther);
            toast.success(active ? `“${flow.name}” is live` : `“${flow.name}” is switched off`);
            refresh();
        } catch (e) {
            if (e instanceof ApiError && e.status === 409)
                setReplace({ flow, other: (e.details?.active_flow as { name?: string } | undefined)?.name ?? 'Another flow' });
            else toast.error(errorMessage(e));
        }
    };
    const act = async (fn: () => Promise<unknown>, ok: string) => {
        try {
            await fn();
            toast.success(ok);
            refresh();
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    const download = async (f: ChatbotFlow) => {
        try {
            const json = await exportChatbot(f.id);
            const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${f.name.replace(/[^\w\- ]+/g, '').trim() || 'chatbot'}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    const open = (f: ChatbotFlow) => router.push(`/chatbots/builder?id=${f.id}`);

    const menu = (f: ChatbotFlow) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button type="button" className="cb-btn sm" aria-label={`Actions for ${f.name}`}>
                    <MoreHorizontalIcon className="size-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => open(f)}>
                    <PencilIcon /> {canManage ? 'Edit' : 'View'}
                </DropdownMenuItem>
                {f.kind === 'bot' && (
                    <>
                        <DropdownMenuItem onSelect={() => router.push(`/chatbots/insights?flow=${f.id}`)}>
                            <BarChart3Icon /> Flow insights
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(`/chatbots/runs?flow=${f.id}`)}>
                            <ListIcon /> Runs & Activity
                        </DropdownMenuItem>
                    </>
                )}
                {canPublish && f.kind === 'bot' && f.status !== 'archived' && f.published_version !== null && (
                    <DropdownMenuItem disabled={!f.phone_number_id} onSelect={() => void toggle(f, !f.is_active)}>
                        <PowerIcon /> {f.is_active ? 'Switch off' : 'Switch on'}
                    </DropdownMenuItem>
                )}
                {canManage && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={full} onSelect={() => void act(() => duplicateChatbot(f.id), 'Duplicated')}>
                            <CopyIcon /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setMoving(f)}>
                            <FolderInputIcon /> Change purpose
                        </DropdownMenuItem>
                    </>
                )}
                <DropdownMenuItem onSelect={() => void download(f)}>
                    <DownloadIcon /> Export (JSON)
                </DropdownMenuItem>
                {canPublish && f.kind === 'bot' && (
                    <DropdownMenuItem onSelect={() => setScheduling(f)} disabled={f.published_version === null}>
                        <CalendarClockIcon /> Run period…
                    </DropdownMenuItem>
                )}
                {canPublish && (
                    <DropdownMenuItem onSelect={() => setEditors(f)}>
                        <UsersIcon /> Who can edit
                    </DropdownMenuItem>
                )}
                {canManage && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={() =>
                                void act(() => archiveChatbot(f.id, f.status !== 'archived'), f.status === 'archived' ? 'Restored' : 'Archived — switched off')
                            }
                        >
                            {f.status === 'archived' ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {f.status === 'archived' ? 'Restore' : 'Archive'}
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onSelect={() => setDeleting(f)}>
                            <Trash2Icon /> Delete
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    const status = (f: ChatbotFlow) => (
        <div className="cb-col" style={{ gap: 4, alignItems: 'flex-start' }}>
            <span className={cn('cb-chip', f.status === 'live' ? 'live' : f.status === 'draft' ? 'draft' : 'off')}>
                <span className="dot" />
                {f.status === 'live'
                    ? `Live · v${f.published_version}`
                    : f.status === 'paused'
                      ? `Off · v${f.published_version}`
                      : f.status === 'archived'
                        ? 'Archived'
                        : 'Draft'}
            </span>
            {f.published_version !== null && f.has_unpublished_changes && <span className="cb-chip warn">Unpublished changes</span>}
            {runPeriodLabel(f) && (
                <span className="cb-chip info">
                    <CalendarClockIcon className="size-3" /> {runPeriodLabel(f)}
                </span>
            )}
        </div>
    );
    const sub = (f: ChatbotFlow) =>
        [f.folder, f.kind === 'subflow' ? 'Subflow' : null, `draft rev ${f.draft_revision}${f.draft_updated_by ? ` by ${f.draft_updated_by}` : ''}`]
            .filter(Boolean)
            .join(' · ');
    const numberCell = (f: ChatbotFlow) =>
        f.kind === 'subflow' ? (
            <span className="cb-muted">Run by other flows</span>
        ) : (
            <div className="cb-col" style={{ gap: 0 }}>
                {f.phone_number ? (
                    <span>{f.phone_number.verified_name ?? f.phone_number.display_phone_number}</span>
                ) : (
                    <span style={{ color: 'var(--cb-bad-i)' }}>No number</span>
                )}
                <span className="cb-muted">{f.triggers.length ? f.triggers.join(', ') : 'Nothing starts it yet'}</span>
            </div>
        );
    const days = (f: ChatbotFlow) =>
        f.published_version === null ? (
            <span className="cb-muted">Not published</span>
        ) : (
            <div className="cb-col" style={{ gap: 0 }}>
                <span>
                    <b className="cb-num">{f.stats?.started_30d ?? 0}</b> started
                </span>
                <span className="cb-muted">
                    {pct(f.stats?.completion_rate)} finished · {pct(f.stats?.handoff_rate)} to a person
                </span>
            </div>
        );
    const problems = (f: ChatbotFlow) =>
        attention(f) ? (
            <Link href={`/chatbots/builder?id=${f.id}`} className="cb-chip bad" title={(f.attention ?? []).join('\n')} style={{ textDecoration: 'none' }}>
                <TriangleAlertIcon className="size-3" /> Live: {(f.attention ?? [])[0]}
            </Link>
        ) : (
            <span className="cb-muted">No problems</span>
        );

    const tabs: [Tab, string][] = [
        ['all', 'All'],
        ['live', 'Live'],
        ['draft', 'Drafts'],
        ['off', 'Off'],
        ['attention', 'Need attention'],
        ['archived', 'Archived'],
        ['subflows', 'Subflows'],
    ];
    const loading = bots.isLoading && !bots.data;

    return (
        <>
            <div className="cb-pagehead">
                <div>
                    <h1>My Flows</h1>
                    <p>Bots that answer on your WhatsApp numbers. Your team can take over any chat.</p>
                </div>
                {canManage && meta?.enabled && (
                    <div className="cb-row cb-spacer">
                        <button type="button" className="cb-btn" onClick={() => file.current?.click()} disabled={full}>
                            <UploadIcon className="size-4" /> Import
                        </button>
                        <Link href="/chatbots/templates" className="cb-btn">
                            Start from a template
                        </Link>
                        <button
                            type="button"
                            className="cb-btn pri"
                            onClick={() => setChoosing(true)}
                            disabled={full}
                            title={full ? 'Your plan’s flow limit is reached.' : undefined}
                        >
                            + Create flow
                        </button>
                    </div>
                )}
                <input
                    ref={file}
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        try {
                            setImporting(JSON.parse(await f.text()) as Record<string, unknown>);
                        } catch {
                            toast.error('This file is not a chatbot export (JSON).');
                        }
                    }}
                />
            </div>

            {loading ? (
                <Skeleton className="h-64 w-full" />
            ) : meta && !meta.enabled ? (
                <div className="cb-card cb-empty">
                    <BotIcon className="size-6" />
                    <h3>Chatbots are not part of your plan</h3>
                    <p>Upgrade to Starter or higher to build bots that answer customers on WhatsApp, capture leads and hand over to your team.</p>
                    <Link href="/billing" className="cb-btn pri">
                        See plans
                    </Link>
                </div>
            ) : (
                <>
                    <div className="cb-kpis">
                        <div className="cb-kpi">
                            <span className="cb-l">Live flows</span>
                            <span className="cb-v">{activeBots.filter((f) => f.status === 'live').length}</span>
                            <span className="cb-l">answering customers now</span>
                        </div>
                        <div className="cb-kpi">
                            <span className="cb-l">Chats started · 30 days</span>
                            <span className="cb-v">{started.toLocaleString()}</span>
                            <span className="cb-l">
                                on {numbersWithRuns} WhatsApp number{numbersWithRuns === 1 ? '' : 's'}
                            </span>
                        </div>
                        <div className="cb-kpi">
                            <span className="cb-l">Finished or handed over</span>
                            <span className="cb-v">{started > 0 ? `${Math.round((100 * finished) / started)}%` : '—'}</span>
                            <span className="cb-l">share of chats started</span>
                        </div>
                        <button
                            type="button"
                            className={cn('cb-kpi', tab === 'attention' && 'on')}
                            onClick={() => setTab('attention')}
                            style={activeBots.some(attention) ? { background: 'var(--cb-warn)', borderColor: 'var(--cb-warn-line)' } : undefined}
                        >
                            <span className="cb-l" style={activeBots.some(attention) ? { color: 'var(--cb-warn-i)' } : undefined}>
                                Need attention
                            </span>
                            <span className="cb-v">{activeBots.filter(attention).length}</span>
                            <span className="cb-l" style={activeBots.some(attention) ? { color: 'var(--cb-warn-i)' } : undefined}>
                                live problems to fix
                            </span>
                        </button>
                    </div>

                    <div className="cb-card" data-testid="my-flows">
                        <div className="cb-col" style={{ padding: 16, gap: 12 }}>
                            <div className="cb-seg" role="tablist" aria-label="Show">
                                {tabs.map(([k, l]) => (
                                    <button
                                        key={k}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === k}
                                        className={tab === k ? 'on' : undefined}
                                        onClick={() => setTab(k)}
                                    >
                                        {l} {all.filter((f) => inTab(f, k)).length}
                                    </button>
                                ))}
                            </div>
                            <div className="cb-row" style={{ justifyContent: 'flex-end' }}>
                                <input
                                    className="cb-in"
                                    style={{ width: 200 }}
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Search flows"
                                    aria-label="Search flows"
                                />
                                <select
                                    className="cb-in"
                                    style={{ width: 'auto', minWidth: 200 }}
                                    value={number}
                                    onChange={(e) => setNumber(e.target.value)}
                                    aria-label="WhatsApp number"
                                >
                                    <option value="all">All numbers</option>
                                    {numbers.map((n) => (
                                        <option key={n.id} value={n.id}>
                                            {n.label}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className="cb-in"
                                    style={{ width: 'auto' }}
                                    value={purpose}
                                    onChange={(e) => setPurpose(e.target.value)}
                                    aria-label="Purpose"
                                >
                                    <option value="all">Any purpose</option>
                                    {purposes.map((p) => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>
                                <div className="cb-seg" aria-label="Layout">
                                    <button
                                        type="button"
                                        className={view === 'list' ? 'on' : undefined}
                                        onClick={() => setView('list')}
                                        aria-pressed={view === 'list'}
                                    >
                                        List
                                    </button>
                                    <button
                                        type="button"
                                        className={view === 'cards' ? 'on' : undefined}
                                        onClick={() => setView('cards')}
                                        aria-pressed={view === 'cards'}
                                    >
                                        Cards
                                    </button>
                                </div>
                            </div>
                        </div>

                        {shown.length === 0 ? (
                            <div className="cb-empty">
                                <p>
                                    {total === 0 && tab === 'all'
                                        ? 'No flows yet. Start from a template: answer a few questions and the flow is built for you.'
                                        : total === 0 && tab === 'subflows'
                                          ? 'No subflows yet. A subflow is a reusable part (contact details, FAQ…) that several flows run.'
                                          : 'Nothing matches these filters.'}
                                </p>
                                {canManage && total === 0 && (
                                    <button
                                        type="button"
                                        className="cb-btn pri"
                                        onClick={() => (tab === 'subflows' ? setCreating('subflow') : setChoosing(true))}
                                    >
                                        {tab === 'subflows' ? '+ New subflow' : '+ Create flow'}
                                    </button>
                                )}
                            </div>
                        ) : view === 'list' ? (
                            <div className="cb-scrollx">
                                <table className="cb-t">
                                    <thead>
                                        <tr>
                                            <th>Flow</th>
                                            <th>Status</th>
                                            <th>Numbers &amp; start rules</th>
                                            <th>30 days</th>
                                            <th>Problems</th>
                                            <th aria-label="Actions" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {shown.map((f) => (
                                            <tr key={f.id} className="click" onClick={(e) => !(e.target as HTMLElement).closest('button, a') && open(f)}>
                                                <td>
                                                    <Link
                                                        href={`/chatbots/builder?id=${f.id}`}
                                                        style={{ fontWeight: 600, color: 'var(--cb-ink)', textDecoration: 'none' }}
                                                    >
                                                        {f.name}
                                                    </Link>
                                                    <div className="cb-small cb-muted">{sub(f)}</div>
                                                </td>
                                                <td>{status(f)}</td>
                                                <td className="cb-small">{numberCell(f)}</td>
                                                <td className="cb-small">{days(f)}</td>
                                                <td className="cb-small">{problems(f)}</td>
                                                <td style={{ textAlign: 'right' }}>{menu(f)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                                {shown.map((f) => (
                                    <div key={f.id} className="cb-card cb-col" style={{ padding: 16, gap: 10 }}>
                                        <div className="cb-row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                                            <div className="cb-grow">
                                                <Link
                                                    href={`/chatbots/builder?id=${f.id}`}
                                                    style={{ fontWeight: 600, color: 'var(--cb-ink)', textDecoration: 'none' }}
                                                >
                                                    {f.name}
                                                </Link>
                                                <div className="cb-small cb-muted">{sub(f)}</div>
                                            </div>
                                            {menu(f)}
                                        </div>
                                        {status(f)}
                                        <div className="cb-small">{numberCell(f)}</div>
                                        <div className="cb-small">{days(f)}</div>
                                        <div className="cb-small">{problems(f)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="cb-small cb-muted" style={{ padding: '12px 16px', borderTop: '1px solid var(--cb-line-2)' }}>
                            Showing {shown.length} of {total} {tab === 'subflows' ? 'subflows' : 'flows'}. Figures use the same calculation as Flow insights
                            (last 30 days).
                            {meta &&
                                (meta.limit === null ? ` ${meta.used} flows · unlimited on your plan.` : ` ${meta.used} of ${meta.limit} flows on your plan.`)}
                            {full && (
                                <Link href="/billing" style={{ marginLeft: 6, fontWeight: 600 }}>
                                    Upgrade
                                </Link>
                            )}
                        </p>
                    </div>
                </>
            )}

            <Dialog open={choosing} onOpenChange={setChoosing}>
                <DialogContent className="cbx sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Create a flow</DialogTitle>
                        <DialogDescription className="sr-only">Start from a template or from scratch.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <button
                            type="button"
                            className="cb-card"
                            style={{ padding: 16, textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => {
                                setChoosing(false);
                                router.push('/chatbots/templates');
                            }}
                        >
                            <b>Start from a template</b>
                            <p className="cb-small cb-muted" style={{ marginTop: 6 }}>
                                Answer a few questions; the flow is built from your answers.
                            </p>
                        </button>
                        <button
                            type="button"
                            className="cb-card"
                            style={{ padding: 16, textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => {
                                setChoosing(false);
                                setInitial('blank');
                                setCreating('bot');
                            }}
                        >
                            <b>Start from scratch</b>
                            <p className="cb-small cb-muted" style={{ marginTop: 6 }}>
                                A welcome message and a way to reach your team.
                            </p>
                        </button>
                        <button
                            type="button"
                            className="cb-card sm:col-span-2"
                            style={{ padding: 12, textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => {
                                setChoosing(false);
                                setInitial(null);
                                setCreating('subflow');
                            }}
                        >
                            <b className="cb-small">Reusable subflow</b>
                            <span className="cb-small cb-muted"> · a shared part (contact details, FAQ…) other flows run.</span>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            <TemplateGallery open={creating !== null} onOpenChange={(o) => !o && setCreating(null)} kind={creating ?? 'bot'} initial={initial} />
            <MoveDialog flow={moving} folders={purposes} onClose={() => setMoving(null)} onDone={refresh} />
            <RunPeriodDialog flow={scheduling} onClose={() => setScheduling(null)} onSaved={refresh} />
            <EditorsDialog flow={editors} onClose={() => setEditors(null)} onDone={refresh} />
            <ImportDialog file={importing} onClose={() => setImporting(null)} onDone={(id) => router.push(`/chatbots/builder?id=${id}`)} />

            <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The flow, its versions, comments and statistics are deleted. Conversations stay in the inbox; any in this flow right now stop.
                            Archive it instead to keep it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const f = deleting;
                                setDeleting(null);
                                if (f) void act(() => deleteChatbot(f.id), 'Flow deleted');
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={replace !== null} onOpenChange={(o) => !o && setReplace(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Replace “{replace?.other}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            “{replace?.other}” already has this role (default or greeting flow) on the number. It will be switched off. Keyword, QR and campaign
                            flows can run side by side.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const r = replace;
                                setReplace(null);
                                if (r) void toggle(r.flow, true, true);
                            }}
                        >
                            Switch “{replace?.flow.name}” on
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function MoveDialog({ flow, folders, onClose, onDone }: { flow: ChatbotFlow | null; folders: string[]; onClose: () => void; onDone: () => void }) {
    const [value, setValue] = useState('');
    const [for_, setFor] = useState<string | null>(null);
    if (flow && flow.id !== for_) {
        setFor(flow.id);
        setValue(flow.folder ?? '');
    }

    return (
        <Dialog open={flow !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Purpose</DialogTitle>
                    <DialogDescription>
                        What the flow is for (Bookings, Support, Lead capture…). Used to group and filter flows. Empty = none.
                    </DialogDescription>
                </DialogHeader>
                <Input list="cb-folders" value={value} onChange={(e) => setValue(e.target.value.slice(0, 60))} placeholder="e.g. Bookings" autoFocus />
                <datalist id="cb-folders">
                    {folders.map((f) => (
                        <option key={f} value={f} />
                    ))}
                </datalist>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={async () => {
                            if (!flow) return;
                            try {
                                await saveChatbot(flow.id, { folder: value.trim() || null });
                                onDone();
                                onClose();
                            } catch (e) {
                                toast.error(errorMessage(e));
                            }
                        }}
                    >
                        Move
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditorsDialog({ flow, onClose, onDone }: { flow: ChatbotFlow | null; onClose: () => void; onDone: () => void }) {
    const options = useChatbotOptions(flow !== null);
    const detail = useChatbot(flow?.id ?? null);
    const [picked, setPicked] = useState<string[] | null>(null);
    const [for_, setFor] = useState<string | null>(null);
    if (flow && detail.data && detail.data.id === flow.id && flow.id !== for_) {
        setFor(flow.id);
        setPicked(detail.data.editors);
    }
    const members = options.data?.members ?? [];

    return (
        <Dialog open={flow !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Who can edit “{flow?.name}”</DialogTitle>
                    <DialogDescription>
                        By default everyone who manages chatbots can edit every flow. Limit this flow to some of them — publishers can always edit.
                    </DialogDescription>
                </DialogHeader>
                <label className="flex items-center gap-2 text-[13px] font-semibold">
                    <Checkbox checked={picked === null} onCheckedChange={(v) => setPicked(v ? null : [])} /> Everyone who manages chatbots
                </label>
                {picked !== null && (
                    <ul className="max-h-60 space-y-1.5 overflow-y-auto rounded-lg border p-3">
                        {members.map((m) => (
                            <li key={m.id}>
                                <label className="flex items-center gap-2 text-[13px]">
                                    <Checkbox
                                        checked={picked.includes(m.id)}
                                        onCheckedChange={(v) => setPicked(v ? [...picked, m.id] : picked.filter((x) => x !== m.id))}
                                    />{' '}
                                    {m.name}
                                </label>
                            </li>
                        ))}
                    </ul>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={async () => {
                            if (!flow) return;
                            try {
                                await saveChatbot(flow.id, { editors: picked === null || picked.length === 0 ? null : picked });
                                toast.success('Saved');
                                onDone();
                                onClose();
                            } catch (e) {
                                toast.error(errorMessage(e));
                            }
                        }}
                    >
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ImportDialog({ file, onClose, onDone }: { file: Record<string, unknown> | null; onClose: () => void; onDone: (id: string) => void }) {
    const options = useChatbotOptions(file !== null);
    const [number, setNumber] = useState('__none__');
    const [busy, setBusy] = useState(false);
    const flow = (file?.flow ?? {}) as { name?: string; draft?: { nodes?: unknown[] } };

    return (
        <Dialog open={file !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Import “{flow.name ?? 'flow'}”</DialogTitle>
                    <DialogDescription>
                        {flow.draft?.nodes?.length ?? 0} blocks. It is added as a new draft. API keys are never exported: add them under Workspace → API keys if
                        the flow uses any. Templates and fields are matched by name — the publish checks show anything missing.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                    <Label>WhatsApp number</Label>
                    <Select value={number} onValueChange={setNumber}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">Choose later</SelectItem>
                            {(options.data?.numbers ?? []).map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                    {n.verified_name ?? n.display_phone_number}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={busy}
                        onClick={async () => {
                            if (!file) return;
                            setBusy(true);
                            try {
                                const created = await importChatbot(file, number === '__none__' ? null : number);
                                toast.success('Imported');
                                onDone(created.id);
                            } catch (e) {
                                toast.error(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
                                setBusy(false);
                            }
                        }}
                    >
                        Import
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function ChatbotsPage() {
    return (
        <Suspense>
            <ChatbotsList />
        </Suspense>
    );
}

type Tab = 'all' | 'live' | 'draft' | 'off' | 'attention' | 'archived' | 'subflows';

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);

/** The numbers the flows use, for the number filter. */
function useNumbers(flows: ChatbotFlow[]) {
    const options = useChatbotOptions();
    const seen = new Map<string, string>();
    for (const n of options.data?.numbers ?? [])
        seen.set(n.id, `${n.verified_name ?? n.display_phone_number}${n.verified_name ? ` · ${n.display_phone_number}` : ''}`);
    for (const f of flows)
        if (f.phone_number && !seen.has(f.phone_number.id))
            seen.set(f.phone_number.id, f.phone_number.verified_name ?? f.phone_number.display_phone_number ?? '');

    return [...seen].map(([id, label]) => ({ id, label }));
}
