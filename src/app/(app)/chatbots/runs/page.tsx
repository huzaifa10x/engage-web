'use client';

import { ExternalLinkIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { ChatbotsTabs } from '@/components/chatbots/chatbots-tabs';
import { OUTCOME_LABEL } from '@/components/chatbots/flow-dashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { type ChatbotRun, type RunEvent, useChatbotRun, useChatbotRuns, useChatbots } from '@/lib/chatbots';
import { P } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const STATUS: Record<ChatbotRun['status'], [string, 'good' | 'info' | 'warn' | 'grey' | 'bad' | 'brand']> = {
    active: ['Running', 'brand'],
    waiting: ['Waiting', 'brand'],
    completed: ['Completed', 'good'],
    handed_off: ['Handed over', 'info'],
    abandoned: ['Left midway', 'warn'],
    stopped: ['Stopped', 'grey'],
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
const span = (a: string | null, b: string | null) => {
    if (!a || !b) return null;
    const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));

    return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 360) / 10} h`;
};

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

    return (
        <>
            <ChatbotsTabs />
            <PageHeader
                title="Runs & Activity"
                description="Every time a flow ran for a customer: how it ended, and a step-by-step replay of what happened. Test chats are never listed."
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Select value={flow} onValueChange={setFlow}>
                    <SelectTrigger className="w-56" aria-label="Flow">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All flows</SelectItem>
                        {(flows.data?.data ?? []).map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                                {f.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-44" aria-label="Status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any status</SelectItem>
                        <SelectItem value="running">Running</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="handed_off">Handed over</SelectItem>
                        <SelectItem value="abandoned">Left midway</SelectItem>
                        <SelectItem value="stopped">Stopped</SelectItem>
                    </SelectContent>
                </Select>
                <div className="relative">
                    <SearchIcon className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Customer name or number"
                        className="w-64 pl-8"
                        aria-label="Search runs"
                    />
                </div>
            </div>
            <Card className="overflow-x-auto">
                {runs.isLoading ? (
                    <Skeleton className="h-48 w-full" />
                ) : rows.length === 0 ? (
                    <EmptyState title="No runs yet" description="When a live flow answers a customer, the run shows up here." />
                ) : (
                    <table className="w-full min-w-[760px] text-[13px]" data-testid="runs-table">
                        <thead className="text-left text-[11.5px] text-muted-foreground">
                            <tr className="border-b">
                                <th className="px-4 py-2 font-semibold">Customer</th>
                                <th className="px-4 py-2 font-semibold">Flow</th>
                                <th className="px-4 py-2 font-semibold">Result</th>
                                <th className="px-4 py-2 font-semibold">Started</th>
                                <th className="px-4 py-2 font-semibold">Steps · time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setOpen(r.id)}>
                                    <td className="px-4 py-2.5">
                                        <p className="font-semibold">{r.contact?.name ?? 'Unknown'}</p>
                                        {r.contact?.phone && <p className="text-[11.5px] text-muted-foreground">+{r.contact.phone}</p>}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        {r.flow.name} <span className="text-muted-foreground">· v{r.version}</span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
                                        {r.outcome && <span className="ml-1.5 text-[12px]">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">{when(r.started_at)}</td>
                                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                                        {r.steps} · {span(r.started_at, r.ended_at) ?? 'running'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>
            {runs.hasNextPage && (
                <div className="mt-3 flex justify-center">
                    <Button variant="outline" onClick={() => void runs.fetchNextPage()} disabled={runs.isFetchingNextPage}>
                        Show older runs
                    </Button>
                </div>
            )}
            <RunReplay id={open} onClose={() => setOpen(null)} />
        </>
    );
}

/** One run, step by step, in the order it happened. */
function RunReplay({ id, onClose }: { id: string | null; onClose: () => void }) {
    const run = useChatbotRun(id);
    const r = run.data;

    return (
        <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{r ? `${r.contact?.name ?? 'Customer'} · ${r.flow.name} v${r.version}` : 'Run'}</DialogTitle>
                    <DialogDescription>
                        {r
                            ? `${STATUS[r.status][0]}${r.ended_reason ? `: ${REASON[r.ended_reason] ?? r.ended_reason}` : ''}${r.ended_node ? ` at “${r.ended_node.title}”` : ''}${r.current_node ? `, now at “${r.current_node.title}”` : ''} · started ${when(r.started_at)}`
                            : 'Loading…'}
                    </DialogDescription>
                </DialogHeader>
                {!r ? (
                    <Skeleton className="h-64 w-full" />
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <Button asChild size="sm" variant="outline">
                                <Link href={`/inbox?c=${r.conversation_id}`}>
                                    <ExternalLinkIcon /> Open the conversation
                                </Link>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                                <Link href={`/chatbots/builder?id=${r.flow.id}`}>
                                    <ExternalLinkIcon /> Open the flow
                                </Link>
                            </Button>
                        </div>
                        {!r.complete_log && (
                            <p className="rounded-md bg-muted px-3 py-2 text-[12px]">
                                This run started before messages were recorded with runs: its steps and paths are shown, the conversation has the messages.
                            </p>
                        )}
                        <ol className="space-y-1.5" data-testid="run-timeline">
                            {r.timeline.map((e) => (
                                <TimelineItem key={e.seq} e={e} />
                            ))}
                        </ol>
                        {Object.keys(r.answers).length > 0 && (
                            <section>
                                <p className="mb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Answers saved in this run</p>
                                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[12.5px]">
                                    {Object.entries(r.answers).map(([k, v]) => (
                                        <div key={k} className="contents">
                                            <dt className="text-muted-foreground">{k}</dt>
                                            <dd className="break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function TimelineItem({ e }: { e: RunEvent }) {
    const time = e.at ? new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    if (e.kind === 'customer' || e.kind === 'bot') {
        return (
            <li className={cn('flex', e.kind === 'customer' ? 'justify-start' : 'justify-end')}>
                <div className={cn('max-w-[80%] rounded-lg px-3 py-1.5 text-[13px] shadow-xs', e.kind === 'customer' ? 'bg-muted' : 'bg-[#d9fdd3]')}>
                    <p className="whitespace-pre-wrap">{e.text ?? `(${e.type ?? 'message'})`}</p>
                    <p className="mt-0.5 text-right text-[10.5px] text-muted-foreground">
                        {time}
                        {e.kind === 'bot' && e.status ? ` · ${e.status}` : ''}
                        {e.error ? ` · ${e.error}` : ''}
                    </p>
                </div>
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
        <li className={cn('px-1 text-[12px]', e.kind === 'error' ? 'text-bad' : 'text-muted-foreground', e.kind === 'note' && 'whitespace-pre-wrap')}>
            <span className="mr-2 tabular-nums">{time}</span>
            {line}
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
