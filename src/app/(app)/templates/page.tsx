'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileTextIcon, PlusIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { CreateTemplateDialog } from '@/components/templates/create-template-dialog';
import { rejectionReason, TemplatePreview, TemplateStatusBadge, templateStatus } from '@/components/templates/template-status';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { humanize, relative } from '@/lib/format';
import { P } from '@/lib/permissions';
import { deleteTemplate, keys, syncTemplates, useTemplates, useWabaAccounts } from '@/lib/queries';
import type { MessageTemplate } from '@/lib/types';

const ALL = '__all__';
const STATUSES = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'];

export default function TemplatesPage() {
    const { can } = useSession();
    const qc = useQueryClient();
    const allowed = can(P.TemplatesView);
    const accounts = (useWabaAccounts(allowed && can(P.ChannelsView)).data ?? []).filter((a) => a.status === 'connected');
    const [accountId, setAccountId] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [viewing, setViewing] = useState<MessageTemplate | null>(null);
    const [deleting, setDeleting] = useState<MessageTemplate | null>(null);

    const [watch, setWatch] = useState(false);
    // While something is in review, keep checking so the status flips without a manual refresh.
    const templates = useTemplates({ waba_account_id: accountId }, allowed, watch ? 20_000 : false);
    const all = templates.data?.data ?? [];
    const inReview = all.some((t) => t.status === 'PENDING');
    if (inReview !== watch) setWatch(inReview);

    const rows = all.filter((t) => (!status || t.status === status) && (!search.trim() || t.name.includes(search.trim().toLowerCase())));
    const synced = Object.values(templates.data?.meta.last_synced_at ?? {})
        .filter((v): v is string => Boolean(v))
        .sort()[0];

    const sync = useMutation({
        mutationFn: () => syncTemplates(accountId),
        onSuccess: (r) => {
            toast.success(`Synced ${r.synced} template${r.synced === 1 ? '' : 's'} from Meta${r.removed ? `, ${r.removed} removed` : ''}`);
            void qc.invalidateQueries({ queryKey: keys.templatesAll });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const remove = useMutation({
        mutationFn: (id: string) => deleteTemplate(id),
        onSuccess: () => {
            toast.success('Template deleted on Meta');
            void qc.invalidateQueries({ queryKey: keys.templatesAll });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!allowed) return <Forbidden />;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <PageHeader
                title="Templates"
                description="Message templates approved by Meta. They are required to start a conversation or to write to a customer after the 24-hour window has closed."
                actions={
                    <>
                        <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
                            <RefreshCwIcon className={sync.isPending ? 'animate-spin' : undefined} /> Sync from Meta
                        </Button>
                        {can(P.TemplatesSubmit) && (
                            <Button onClick={() => setCreating(true)} disabled={accounts.length === 0}>
                                <PlusIcon /> New template
                            </Button>
                        )}
                    </>
                }
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name"
                        className="pl-9"
                        aria-label="Search templates"
                    />
                </div>
                <Select value={status ?? ALL} onValueChange={(v) => setStatus(v === ALL ? null : v)}>
                    <SelectTrigger className="w-40" aria-label="Status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>All statuses</SelectItem>
                        {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                                {templateStatus(s).label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {accounts.length > 1 && (
                    <Select value={accountId ?? ALL} onValueChange={(v) => setAccountId(v === ALL ? null : v)}>
                        <SelectTrigger className="w-56" aria-label="WhatsApp account">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All WhatsApp accounts</SelectItem>
                            {accounts.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                    {a.name ?? a.business_name ?? a.waba_id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <span className="text-[12.5px] text-muted-foreground">{synced ? `Synced with Meta ${relative(synced)}` : 'Not synced yet'}</span>
            </div>

            <Card className="overflow-hidden p-0">
                {templates.isLoading ? (
                    <div className="grid gap-2 p-4">
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                    </div>
                ) : templates.isError ? (
                    <EmptyState title="Templates could not be loaded" description={errorMessage(templates.error)} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={<FileTextIcon className="size-5" />}
                        title={all.length === 0 ? 'No templates yet' : 'No templates match these filters'}
                        description={
                            all.length === 0
                                ? 'Create your first template, or press “Sync from Meta” if you already have templates in WhatsApp Manager.'
                                : undefined
                        }
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Language</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Updated</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((t) => (
                                <TableRow key={t.id} className="cursor-pointer" onClick={() => setViewing(t)}>
                                    <TableCell>
                                        <p className="font-medium">{t.name}</p>
                                        <p className="max-w-md truncate text-[12.5px] text-muted-foreground">
                                            {t.components.find((c) => c.type?.toUpperCase() === 'BODY')?.text}
                                        </p>
                                    </TableCell>
                                    <TableCell>{humanize(t.category?.toLowerCase())}</TableCell>
                                    <TableCell>{t.language}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <TemplateStatusBadge template={t} />
                                            {t.quality_score && ['RED', 'YELLOW'].includes(t.quality_score) && (
                                                <Badge tone={t.quality_score === 'RED' ? 'bad' : 'warn'}>Quality {t.quality_score.toLowerCase()}</Badge>
                                            )}
                                        </div>
                                        {t.status === 'REJECTED' && t.rejected_reason && (
                                            <p className="mt-1 max-w-xs text-[12px] text-bad">{rejectionReason(t.rejected_reason)}</p>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{relative(t.updated_at)}</TableCell>
                                    <TableCell>
                                        {can(P.TemplatesCreate) && (
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`Delete ${t.name}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleting(t);
                                                }}
                                            >
                                                <Trash2Icon />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>

            <CreateTemplateDialog open={creating} onOpenChange={setCreating} accounts={accounts} />

            <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex flex-wrap items-center gap-2">
                            {viewing?.name} {viewing && <TemplateStatusBadge template={viewing} />}
                        </DialogTitle>
                        <DialogDescription>
                            {viewing ? `${humanize(viewing.category?.toLowerCase())} · ${viewing.language} · ${templateStatus(viewing.status).help}` : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {viewing?.status === 'REJECTED' && viewing.rejected_reason && (
                        <p className="rounded-md border border-bad/20 bg-bad-bg px-3 py-2 text-[13px] text-bad">{rejectionReason(viewing.rejected_reason)}</p>
                    )}
                    {viewing && <TemplatePreview template={viewing} />}
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The template is deleted on Meta as well and can no longer be sent. Meta does not allow reusing the same name for about 4 weeks.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (deleting) remove.mutate(deleting.id);
                                setDeleting(null);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
