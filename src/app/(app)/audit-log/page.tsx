'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronRightIcon, ListChecksIcon } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dateTime, humanize } from '@/lib/format';
import { P } from '@/lib/permissions';
import { fetchAuditPage, keys, useMembers } from '@/lib/queries';
import type { AuditEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function AuditLogPage() {
    const { can } = useSession();
    const allowed = can(P.AuditView);
    const [open, setOpen] = useState<string | null>(null);

    const log = useInfiniteQuery({
        queryKey: keys.audit,
        queryFn: ({ pageParam }) => fetchAuditPage(pageParam),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.meta.next_cursor ?? null,
        enabled: allowed,
    });
    const members = useMembers(allowed && can(P.TeamView));

    const names = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of members.data?.data ?? []) if (m.user) map.set(m.user.id, m.user.name);

        return map;
    }, [members.data]);

    if (!allowed) return <Forbidden />;

    const rows = log.data?.pages.flatMap((p) => p.data) ?? [];
    const actorName = (a: AuditEntry['actor']) =>
        a.type === 'system' ? 'System' : a.type === 'admin' ? '10X Digital support' : a.type === 'api' ? 'API key' : (names.get(a.id ?? '') ?? 'Former member');

    return (
        <>
            <PageHeader title="Audit log" description="Every sensitive change in this workspace: who did it, when, and what changed." />
            <Card>
                {log.isLoading ? (
                    <div className="p-5">
                        <Skeleton className="h-48" />
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState icon={<ListChecksIcon className="size-5" />} title="Nothing recorded yet" />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-8" />
                                <TableHead>Action</TableHead>
                                <TableHead>By</TableHead>
                                <TableHead>Target</TableHead>
                                <TableHead>When</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((r) => {
                                const expanded = open === r.id;
                                const hasDetail = r.before || r.after || r.meta;

                                return (
                                    <Fragment key={r.id}>
                                        <TableRow className={cn(hasDetail && 'cursor-pointer')} onClick={() => hasDetail && setOpen(expanded ? null : r.id)}>
                                            <TableCell>
                                                {hasDetail && (
                                                    <ChevronRightIcon
                                                        className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-90')}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium">{humanize(r.action)}</TableCell>
                                            <TableCell>
                                                <span className="flex items-center gap-2">
                                                    <Avatar name={actorName(r.actor)} className="size-6 text-[10px]" />
                                                    {actorName(r.actor)}
                                                    {r.actor.type === 'admin' && <Badge tone="warn">Support</Badge>}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{r.entity.type ? humanize(r.entity.type) : '—'}</TableCell>
                                            <TableCell className="whitespace-nowrap text-muted-foreground">{dateTime(r.created_at)}</TableCell>
                                        </TableRow>
                                        {expanded && (
                                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                                <TableCell />
                                                <TableCell colSpan={4}>
                                                    <div className="grid gap-3 md:grid-cols-3">
                                                        {(['before', 'after', 'meta'] as const).map((k) =>
                                                            r[k] ? (
                                                                <div key={k}>
                                                                    <p className="mb-1 text-[12px] font-semibold text-muted-foreground uppercase">{k}</p>
                                                                    <pre className="max-h-60 overflow-auto rounded-md border bg-card p-2 font-mono text-[12px]">
                                                                        {JSON.stringify(r[k], null, 2)}
                                                                    </pre>
                                                                </div>
                                                            ) : null,
                                                        )}
                                                    </div>
                                                    {r.request_id && (
                                                        <p className="mt-2 font-mono text-[11.5px] text-muted-foreground">Request {r.request_id}</p>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </Card>
            {log.hasNextPage && (
                <div className="mt-4 flex justify-center">
                    <Button variant="outline" onClick={() => log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                        {log.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
                    </Button>
                </div>
            )}
        </>
    );
}
