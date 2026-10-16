'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    BarChart3Icon,
    BotIcon,
    CalendarClockIcon,
    ChevronDownIcon,
    ClipboardCheckIcon,
    CopyIcon,
    DownloadIcon,
    FolderIcon,
    FolderInputIcon,
    MoreHorizontalIcon,
    PencilIcon,
    PlusIcon,
    SearchIcon,
    SettingsIcon,
    Trash2Icon,
    TriangleAlertIcon,
    UploadIcon,
    UsersIcon,
    WorkflowIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { FlowDashboard } from '@/components/chatbots/flow-dashboard';
import { RunPeriodDialog, runPeriodLabel } from '@/components/chatbots/run-period-dialog';
import { TemplateGallery } from '@/components/chatbots/template-gallery';
import { WorkspaceDialog } from '@/components/chatbots/workspace-dialog';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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

const STATUSES = [
    ['all', 'All'],
    ['live', 'Live'],
    ['paused', 'Published, off'],
    ['draft', 'Drafts'],
    ['archived', 'Archived'],
] as const;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function ChatbotsList() {
    const { can } = useSession();
    const qc = useQueryClient();
    const router = useRouter();
    const params = useSearchParams();
    const allowed = can(P.ChatbotsView);
    const canManage = can(P.ChatbotsManage);
    const canPublish = can(P.ChatbotsPublish);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState<(typeof STATUSES)[number][0]>('all');
    const [folder, setFolder] = useState<string | null>(null);
    const [kind, setKind] = useState<'bot' | 'subflow'>('bot');
    const filters = Object.fromEntries(Object.entries({ q, status, folder: folder ?? '', kind }).filter(([, v]) => v !== '' && v !== 'all')) as Record<
        string,
        string
    >;
    const list = useChatbots(filters, allowed);
    const [creating, setCreating] = useState<'bot' | 'subflow' | null>(null);
    const [workspace, setWorkspace] = useState(false);
    const [deleting, setDeleting] = useState<ChatbotFlow | null>(null);
    const [replace, setReplace] = useState<{ flow: ChatbotFlow; other: string } | null>(null);
    const [moving, setMoving] = useState<ChatbotFlow | null>(null);
    const [scheduling, setScheduling] = useState<ChatbotFlow | null>(null);
    const [editors, setEditors] = useState<ChatbotFlow | null>(null);
    const [dashboard, setDashboard] = useState<ChatbotFlow | null>(null);
    const [importing, setImporting] = useState<Record<string, unknown> | null>(null);
    const file = useRef<HTMLInputElement>(null);

    // /chatbots?analytics=<id> (from the builder) opens that flow's dashboard.
    const wanted = params.get('analytics');
    const [opened, setOpened] = useState<string | null>(null);
    if (wanted && wanted !== opened && list.data) {
        setOpened(wanted);
        const f = list.data.data.find((x) => x.id === wanted);
        if (f) setDashboard(f);
    }

    if (!allowed) return <Forbidden />;

    const meta = list.data?.meta;
    const flows = list.data?.data ?? [];
    const full = meta?.limit !== null && meta?.limit !== undefined && meta.used >= meta.limit;
    const refresh = () => void qc.invalidateQueries({ queryKey: chatbotKeys.all });

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

    return (
        <>
            <PageHeader
                title="Chatbots & Flows"
                description="Bots that answer on your WhatsApp numbers alongside the Team Inbox. Every message lands in the inbox at once, and your team can take over at any moment."
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setWorkspace(true)}>
                            <SettingsIcon /> Workspace
                        </Button>
                        {canManage && meta?.enabled && (
                            <>
                                <Button variant="outline" onClick={() => file.current?.click()} disabled={full}>
                                    <UploadIcon /> Import
                                </Button>
                                <div className="flex">
                                    <Button
                                        onClick={() => setCreating('bot')}
                                        disabled={full}
                                        title={full ? 'Your plan’s chatbot limit is reached.' : undefined}
                                        className="rounded-r-none"
                                    >
                                        <PlusIcon /> New flow
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button className="rounded-l-none border-l border-l-black/10 px-2" disabled={full} aria-label="More ways to create">
                                                <ChevronDownIcon />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => setCreating('bot')}>
                                                <BotIcon /> Flow from a template
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => setCreating('subflow')}>
                                                <WorkflowIcon /> Subflow (shared part)
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </>
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
                }
            />

            {list.isLoading && !list.data ? (
                <Skeleton className="h-64 w-full" />
            ) : meta && !meta.enabled ? (
                <Card>
                    <EmptyState
                        icon={<BotIcon className="size-6" />}
                        title="Chatbots are not part of your plan"
                        description="Upgrade to Starter or higher to build bots that answer customers on WhatsApp, capture leads and hand over to your team."
                        action={
                            <Button asChild>
                                <Link href="/billing">See plans</Link>
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-lg bg-muted p-1 text-[12.5px] font-semibold">
                            {(
                                [
                                    ['bot', 'Flows'],
                                    ['subflow', 'Subflows'],
                                ] as const
                            ).map(([k, l]) => (
                                <button
                                    key={k}
                                    onClick={() => setKind(k)}
                                    className={cn('rounded-md px-3 py-1', kind === k ? 'bg-card shadow-xs' : 'text-muted-foreground')}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                        <div className="relative min-w-52 flex-1 sm:max-w-xs">
                            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flows…" className="pl-8" aria-label="Search flows" />
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {STATUSES.map(([k, l]) => (
                                <button
                                    key={k}
                                    onClick={() => setStatus(k)}
                                    className={cn(
                                        'rounded-full border px-3 py-1 text-[12.5px] font-semibold',
                                        status === k ? 'border-brand-500 bg-brand-50 text-brand-600' : 'text-muted-foreground hover:bg-muted',
                                    )}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                        {(meta?.folders ?? []).length > 0 && (
                            <Select value={folder ?? '__all__'} onValueChange={(v) => setFolder(v === '__all__' ? null : v)}>
                                <SelectTrigger className="w-48" aria-label="Folder">
                                    <FolderIcon className="size-4 text-muted-foreground" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All folders</SelectItem>
                                    {(meta?.folders ?? []).map((f) => (
                                        <SelectItem key={f} value={f}>
                                            {f}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <span className="ml-auto text-[12px] text-muted-foreground">
                            {meta?.limit === null ? `${meta?.used ?? 0} flows · unlimited on your plan` : `${meta?.used} of ${meta?.limit} flows on your plan`}
                            {full && (
                                <Link href="/billing" className="ml-2 font-semibold text-brand-600 hover:underline">
                                    Upgrade
                                </Link>
                            )}
                        </span>
                    </div>

                    {flows.length === 0 ? (
                        <Card>
                            <EmptyState
                                icon={kind === 'subflow' ? <WorkflowIcon className="size-6" /> : <BotIcon className="size-6" />}
                                title={
                                    q || status !== 'all' || folder ? 'Nothing matches' : kind === 'subflow' ? 'No subflows yet' : 'Build your first chatbot'
                                }
                                description={
                                    q || status !== 'all' || folder
                                        ? 'Try another search or filter.'
                                        : kind === 'subflow'
                                          ? 'A subflow is a shared piece of conversation (contact details, FAQ…) that several flows run. Change it once, every flow using it changes.'
                                          : 'Pick a ready-made flow for your business — appointment booking, cake orders, real estate leads, clinic, cleaning or car rental — fill in your details, test it and switch it on.'
                                }
                                action={
                                    canManage && !(q || status !== 'all' || folder) ? (
                                        <Button onClick={() => setCreating(kind)}>
                                            <PlusIcon /> {kind === 'subflow' ? 'New subflow' : 'Choose a template'}
                                        </Button>
                                    ) : undefined
                                }
                            />
                        </Card>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {flows.map((f) => (
                                <Card
                                    key={f.id}
                                    className={cn(
                                        'flex flex-col gap-0 py-0 transition hover:shadow-[0_8px_24px_rgba(16,24,40,.07)]',
                                        f.status === 'archived' && 'opacity-75',
                                    )}
                                >
                                    <div className="flex items-start gap-3 p-4 pb-3">
                                        <span
                                            className={cn(
                                                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                                                f.status === 'live' ? 'bg-brand-100 text-brand-600' : 'bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {f.kind === 'subflow' ? <WorkflowIcon className="size-5" /> : <BotIcon className="size-5" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <Link href={`/chatbots/builder?id=${f.id}`} className="block truncate text-[14.5px] font-bold hover:underline">
                                                {f.name}
                                            </Link>
                                            <p className="truncate text-[12px] text-muted-foreground">
                                                {f.folder && (
                                                    <>
                                                        <FolderIcon className="mr-1 inline size-3" />
                                                        {f.folder} ·{' '}
                                                    </>
                                                )}
                                                {f.kind === 'subflow'
                                                    ? 'Used by other flows'
                                                    : f.phone_number
                                                      ? (f.phone_number.verified_name ?? f.phone_number.display_phone_number)
                                                      : 'No number yet'}
                                            </p>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${f.name}`}>
                                                    <MoreHorizontalIcon />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => router.push(`/chatbots/builder?id=${f.id}`)}>
                                                    <PencilIcon /> {canManage ? 'Open the builder' : 'View'}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => setDashboard(f)}>
                                                    <BarChart3Icon /> Dashboard
                                                </DropdownMenuItem>
                                                {canManage && (
                                                    <>
                                                        <DropdownMenuItem disabled={full} onSelect={() => void act(() => duplicateChatbot(f.id), 'Duplicated')}>
                                                            <CopyIcon /> Duplicate
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => setMoving(f)}>
                                                            <FolderInputIcon /> Move to folder
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
                                                                void act(
                                                                    () => archiveChatbot(f.id, f.status !== 'archived'),
                                                                    f.status === 'archived' ? 'Restored' : 'Archived — switched off',
                                                                )
                                                            }
                                                        >
                                                            {f.status === 'archived' ? <ArchiveRestoreIcon /> : <ArchiveIcon />}{' '}
                                                            {f.status === 'archived' ? 'Restore' : 'Archive'}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem destructive onSelect={() => setDeleting(f)}>
                                                            <Trash2Icon /> Delete
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <div className="flex flex-wrap gap-1 px-4">
                                        <Badge tone={f.status === 'live' ? 'good' : f.status === 'draft' ? 'warn' : 'grey'} dot>
                                            {f.status === 'live'
                                                ? `Live · v${f.published_version}`
                                                : f.status === 'paused'
                                                  ? `Off · v${f.published_version}`
                                                  : f.status === 'archived'
                                                    ? 'Archived'
                                                    : 'Draft'}
                                        </Badge>
                                        {f.kind === 'bot' && f.role === 'default' && <Badge tone="info">Default flow</Badge>}
                                        {f.kind === 'bot' && f.role === 'greeting' && <Badge tone="info">Greeting</Badge>}
                                        {f.published_version !== null && f.has_unpublished_changes && <Badge tone="outline">Unpublished changes</Badge>}
                                        {f.review && (
                                            <Badge
                                                tone={
                                                    f.review.status === 'approved' && f.review.current
                                                        ? 'good'
                                                        : f.review.status === 'changes_requested'
                                                          ? 'warn'
                                                          : 'info'
                                                }
                                            >
                                                <ClipboardCheckIcon />
                                                {f.review.status === 'requested'
                                                    ? 'In review'
                                                    : f.review.status === 'approved'
                                                      ? f.review.current
                                                          ? 'Approved'
                                                          : 'Changed since approval'
                                                      : 'Changes requested'}
                                            </Badge>
                                        )}
                                        {runPeriodLabel(f) && (
                                            <Badge tone={f.activate_at ? 'brand' : 'grey'}>
                                                <CalendarClockIcon className="size-3" /> {runPeriodLabel(f)}
                                            </Badge>
                                        )}
                                    </div>
                                    {(f.attention ?? []).length > 0 && (
                                        <Link
                                            href={`/chatbots/builder?id=${f.id}`}
                                            className="mx-4 mt-2 flex items-start gap-1.5 rounded-lg bg-bad-bg px-2.5 py-1.5 text-[12px] text-bad hover:underline"
                                            title={(f.attention ?? []).join('\n')}
                                        >
                                            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                                            <span className="line-clamp-2">Needs attention: {(f.attention ?? [])[0]}</span>
                                        </Link>
                                    )}
                                    {f.kind === 'bot' && (
                                        <p className="mt-2 line-clamp-2 px-4 text-[12px] text-muted-foreground">
                                            {f.triggers.length ? `Starts on: ${f.triggers.join(' · ')}` : 'Nothing starts it yet'}
                                        </p>
                                    )}
                                    <div className="mt-auto grid grid-cols-3 gap-2 border-t px-4 py-3 text-center">
                                        {(
                                            [
                                                ['Started (30d)', f.stats?.started_30d ?? 0],
                                                [
                                                    'Completed',
                                                    f.stats?.completion_rate === null || f.stats?.completion_rate === undefined
                                                        ? '—'
                                                        : `${f.stats.completion_rate}%`,
                                                ],
                                                [
                                                    'To a person',
                                                    f.stats?.handoff_rate === null || f.stats?.handoff_rate === undefined ? '—' : `${f.stats.handoff_rate}%`,
                                                ],
                                            ] as [string, string | number][]
                                        ).map(([l, v]) => (
                                            <div key={l}>
                                                <p className="text-[15px] font-bold tabular-nums">{v}</p>
                                                <p className="text-[10.5px] text-muted-foreground">{l}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {f.kind === 'bot' && f.status !== 'archived' && (
                                        <div className="flex items-center justify-between border-t px-4 py-2.5">
                                            <span className="text-[12px] text-muted-foreground">Edited {when(f.draft_updated_at)}</span>
                                            <label className="flex items-center gap-2 text-[12.5px] font-semibold">
                                                Live
                                                <Switch
                                                    checked={f.is_active}
                                                    disabled={!canPublish || f.published_version === null || !f.phone_number_id}
                                                    onCheckedChange={(v) => void toggle(f, v)}
                                                    aria-label={`${f.name} live`}
                                                    title={
                                                        f.published_version === null
                                                            ? 'Publish it in the builder first'
                                                            : !f.phone_number_id
                                                              ? 'Choose a number in the builder first'
                                                              : undefined
                                                    }
                                                />
                                            </label>
                                        </div>
                                    )}
                                </Card>
                            ))}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-[15px]">How bots and your team share a conversation</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-x-8 gap-y-2 text-[13px] text-ink-2 md:grid-cols-2">
                            <p>
                                • Several flows can be live on one number: keyword, QR-code, campaign-reply and ad flows next to one default flow and one
                                greeting flow.
                            </p>
                            <p>• Every customer message lands in the Team Inbox at once; the bot answers alongside it. Filter the inbox by “Bot” to watch.</p>
                            <p>• The moment an agent replies, the bot stops in that conversation. A reply it was still preparing is discarded.</p>
                            <p>• “Talk to a person” pauses the bot, leaves agents a note signed with the bot’s name, and routes the chat to your team.</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            <TemplateGallery open={creating !== null} onOpenChange={(o) => !o && setCreating(null)} kind={creating ?? 'bot'} folder={folder} />
            <WorkspaceDialog open={workspace} onOpenChange={setWorkspace} canManage={canManage} canPublish={canPublish} />
            <FlowDashboard flow={dashboard} onOpenChange={(o) => !o && setDashboard(null)} />
            <MoveDialog flow={moving} folders={meta?.folders ?? []} onClose={() => setMoving(null)} onDone={refresh} />
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
                    <DialogTitle>Move to folder</DialogTitle>
                    <DialogDescription>Type a new folder name or pick one. Empty = no folder.</DialogDescription>
                </DialogHeader>
                <Input
                    list="cb-folders"
                    value={value}
                    onChange={(e) => setValue(e.target.value.slice(0, 60))}
                    placeholder="e.g. Client: Sweet Crumbs"
                    autoFocus
                />
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
