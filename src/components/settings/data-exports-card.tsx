'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { DataExport, DataExportKind } from '@/lib/types';

const STATUS: Record<DataExport['status'], { label: string; tone: 'grey' | 'info' | 'good' | 'bad' }> = {
    queued: { label: 'Waiting', tone: 'grey' },
    running: { label: 'Preparing', tone: 'info' },
    ready: { label: 'Ready', tone: 'good' },
    failed: { label: 'Failed', tone: 'bad' },
};

/** Settings › Data: the Owner exports the workspace's data as CSV files, made in the background. */
export function DataExportsCard() {
    const qc = useQueryClient();
    const [kind, setKind] = useState<string>('');
    const exports = useQuery({
        queryKey: ['data', 'exports'],
        queryFn: () => api<{ data: DataExport[]; meta: { kinds: DataExportKind[] } }>('data/exports'),
        // While a file is being made, look again every few seconds.
        refetchInterval: (q) => (q.state.data?.data.some((e) => e.status === 'queued' || e.status === 'running') ? 3000 : false),
    });

    const start = useMutation({
        mutationFn: () => api('data/exports', { method: 'POST', body: { kind } }),
        onSuccess: () => {
            toast.success('Export started. It appears below when it is ready.');
            void qc.invalidateQueries({ queryKey: ['data', 'exports'] });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (exports.isLoading || !exports.data) return <Skeleton className="h-48" />;
    const kinds = exports.data.meta.kinds;
    const label = (k: string) => kinds.find((x) => x.key === k)?.label ?? k;

    return (
        <Card className="gap-4 p-5">
            <div>
                <p className="text-sm font-semibold">Export your data</p>
                <p className="text-[13px] text-muted-foreground">
                    CSV files that open in Excel, Numbers or Google Sheets. Dates are in ISO 8601 with the time zone. Files can be downloaded for 7 days.
                </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="w-64" aria-label="What to export">
                        <SelectValue placeholder="Choose what to export" />
                    </SelectTrigger>
                    <SelectContent>
                        {kinds.map((k) => (
                            <SelectItem key={k.key} value={k.key}>
                                {k.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button onClick={() => start.mutate()} disabled={!kind || start.isPending}>
                    Export
                </Button>
            </div>
            {exports.data.data.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Export</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead>Rows</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {exports.data.data.map((e) => (
                            <TableRow key={e.id}>
                                <TableCell>{label(e.kind)}</TableCell>
                                <TableCell className="text-[13px] text-muted-foreground">
                                    {dateTime(e.created_at)}
                                    {e.requested_by && ` · ${e.requested_by}`}
                                </TableCell>
                                <TableCell className="text-[13px]">{e.rows?.toLocaleString() ?? '—'}</TableCell>
                                <TableCell>
                                    <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                                    {e.error && <span className="ml-2 text-[12.5px] text-muted-foreground">{e.error}</span>}
                                </TableCell>
                                <TableCell className="text-right">
                                    {e.status === 'ready' && (
                                        <Button asChild size="sm" variant="outline">
                                            <a href={`/api/v1/data/exports/${e.id}/download`} download>
                                                <DownloadIcon /> Download
                                            </a>
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </Card>
    );
}
