'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BotIcon, CopyIcon, KeyRoundIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, errorMessage } from '@/lib/api';
import {
    activateChatbot,
    type ChatbotFlow,
    chatbotKeys,
    createChatbot,
    deleteChatbot,
    deleteChatbotSecret,
    duplicateChatbot,
    saveChatbotSecret,
    useChatbots,
    useChatbotSecrets,
} from '@/lib/chatbots';
import { P } from '@/lib/permissions';
import { usePhoneNumbers } from '@/lib/queries';
import { cn } from '@/lib/utils';

const NO_NUMBER = '__none__';
const TEMPLATES = [
    { key: 'menu', title: 'Menu bot', blurb: 'Welcome message with buttons, answers, and a path to a person.' },
    { key: 'lead', title: 'Lead capture', blurb: 'Asks name and email, tags the contact, hands over to sales.' },
    { key: 'blank', title: 'Start from scratch', blurb: 'Only a Start and a Handoff block.' },
] as const;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const router = useRouter();
    const numbers = (usePhoneNumbers().data ?? []).filter((n) => n.status !== 'disconnected');
    const [name, setName] = useState('');
    const [number, setNumber] = useState<string>(NO_NUMBER);
    const [template, setTemplate] = useState<(typeof TEMPLATES)[number]['key']>('menu');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = async () => {
        setBusy(true);
        setError(null);
        try {
            const flow = await createChatbot({ name: name.trim() || 'My chatbot', phone_number_id: number === NO_NUMBER ? null : number, template });
            router.push(`/chatbots/builder?id=${flow.id}`);
        } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>New chatbot</DialogTitle>
                    <DialogDescription>A bot answers on one WhatsApp number. You can test it before it goes live.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <FormError message={error} />
                    <Field label="Name" htmlFor="cb-name">
                        <Input id="cb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Welcome bot" autoFocus />
                    </Field>
                    <Field label="WhatsApp number" htmlFor="cb-number" hint="Only one bot is live per number at a time.">
                        <Select value={number} onValueChange={setNumber}>
                            <SelectTrigger id="cb-number">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_NUMBER}>Choose later</SelectItem>
                                {numbers.map((n) => (
                                    <SelectItem key={n.id} value={n.id}>
                                        {n.verified_name ?? n.display_phone_number} {n.verified_name ? `· ${n.display_phone_number}` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <div className="grid gap-1.5">
                        <p className="text-sm font-medium">Start from</p>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {TEMPLATES.map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setTemplate(t.key)}
                                    aria-pressed={template === t.key}
                                    className={cn(
                                        'rounded-lg border p-3 text-left hover:border-brand-500/60',
                                        template === t.key && 'border-brand-500 bg-brand-50 ring-2 ring-primary/40',
                                    )}
                                >
                                    <span className="block text-[13px] font-semibold">{t.title}</span>
                                    <span className="mt-1 block text-[11.5px] leading-snug text-muted-foreground">{t.blurb}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={create} disabled={busy}>
                        {busy ? 'Creating…' : 'Create and open the builder'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SecretsCard({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const secrets = useChatbotSecrets();
    const [name, setName] = useState('');
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            await saveChatbotSecret(name.trim(), value);
            setName('');
            setValue('');
            toast.success('API key saved');
            void qc.invalidateQueries({ queryKey: chatbotKeys.secrets });
            void qc.invalidateQueries({ queryKey: chatbotKeys.options });
        } catch (e) {
            toast.error(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[15px]">
                    <KeyRoundIcon className="size-4" /> API keys
                </CardTitle>
                <CardDescription>
                    Keys and tokens for API-call blocks (for example your store&apos;s REST key). Use them in a block as {'{{secret.NAME}}'}. They are stored
                    encrypted and are never shown again or put into a flow.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {(secrets.data ?? []).length > 0 && (
                    <ul className="divide-y rounded-md border text-[13px]">
                        {(secrets.data ?? []).map((s) => (
                            <li key={s.name} className="flex items-center justify-between gap-2 px-3 py-2">
                                <span>
                                    <code className="font-semibold">{s.name}</code> <span className="text-muted-foreground">{s.hint ?? '••••'}</span>
                                </span>
                                {canManage && (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Delete ${s.name}`}
                                        onClick={async () => {
                                            try {
                                                await deleteChatbotSecret(s.name);
                                                void qc.invalidateQueries({ queryKey: chatbotKeys.secrets });
                                                void qc.invalidateQueries({ queryKey: chatbotKeys.options });
                                            } catch (e) {
                                                toast.error(errorMessage(e));
                                            }
                                        }}
                                    >
                                        <Trash2Icon />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {canManage && (
                    <form
                        className="flex flex-wrap gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void save();
                        }}
                    >
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 60))}
                            placeholder="NAME (e.g. WOO_KEY)"
                            className="w-48 font-mono"
                            aria-label="Key name"
                        />
                        <Input
                            type="password"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="Value"
                            className="min-w-48 flex-1"
                            aria-label="Key value"
                            autoComplete="off"
                        />
                        <Button type="submit" variant="outline" disabled={busy || !name || !value}>
                            Save key
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}

export default function ChatbotsPage() {
    const { can } = useSession();
    const qc = useQueryClient();
    const router = useRouter();
    const allowed = can(P.ChatbotsView);
    const canManage = can(P.ChatbotsManage);
    const list = useChatbots(allowed);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<ChatbotFlow | null>(null);
    const [replace, setReplace] = useState<{ flow: ChatbotFlow; other: string } | null>(null);

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
            if (e instanceof ApiError && e.status === 409) {
                setReplace({ flow, other: (e.details?.active_flow as { name?: string } | undefined)?.name ?? 'Another bot' });
            } else {
                toast.error(errorMessage(e));
            }
        }
    };

    return (
        <>
            <PageHeader
                title="Chatbots & Flows"
                description="Menu bots that answer on a WhatsApp number, alongside your Team Inbox: every message lands in the inbox at once, and agents can take over at any moment."
                actions={
                    canManage && meta?.enabled ? (
                        <Button onClick={() => setCreating(true)} disabled={full} title={full ? 'Your plan’s chatbot limit is reached.' : undefined}>
                            <PlusIcon /> New chatbot
                        </Button>
                    ) : undefined
                }
            />

            {list.isLoading ? (
                <Skeleton className="h-48 w-full" />
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
                <div className="space-y-6">
                    <Card>
                        {flows.length === 0 ? (
                            <EmptyState
                                icon={<BotIcon className="size-6" />}
                                title="No chatbots yet"
                                description="Start from a menu bot, a lead-capture bot or a blank canvas. Test it in the builder, publish it, then switch it on for a number."
                                action={
                                    canManage ? (
                                        <Button onClick={() => setCreating(true)}>
                                            <PlusIcon /> New chatbot
                                        </Button>
                                    ) : undefined
                                }
                            />
                        ) : (
                            <>
                                <div className="flex items-center justify-between border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
                                    <span>
                                        {meta?.limit === null
                                            ? `${meta?.used ?? flows.length} chatbots · unlimited on your plan`
                                            : `${meta?.used} of ${meta?.limit} chatbots on your plan`}
                                    </span>
                                    {full && (
                                        <Link href="/billing" className="font-medium text-brand-600 hover:underline">
                                            Upgrade for more
                                        </Link>
                                    )}
                                </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Chatbot</TableHead>
                                            <TableHead>Number</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">In a flow now</TableHead>
                                            <TableHead className="text-right">Started (30 days)</TableHead>
                                            <TableHead>Live</TableHead>
                                            <TableHead className="w-10" />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {flows.map((f) => (
                                            <TableRow key={f.id}>
                                                <TableCell>
                                                    <Link href={`/chatbots/builder?id=${f.id}`} className="font-semibold hover:underline">
                                                        {f.name}
                                                    </Link>
                                                    <span className="block text-[11.5px] text-muted-foreground">Edited {when(f.draft_updated_at)}</span>
                                                </TableCell>
                                                <TableCell className="text-[13px]">
                                                    {f.phone_number ? (
                                                        (f.phone_number.verified_name ?? f.phone_number.display_phone_number)
                                                    ) : (
                                                        <span className="text-muted-foreground">Not chosen</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        <Badge tone={f.status === 'live' ? 'good' : f.status === 'paused' ? 'grey' : 'warn'} dot>
                                                            {f.status === 'live' ? `Live · v${f.published_version}` : f.status === 'paused' ? 'Off' : 'Draft'}
                                                        </Badge>
                                                        {f.published_version !== null && f.has_unpublished_changes && (
                                                            <Badge tone="info">Unpublished changes</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{f.stats?.running ?? 0}</TableCell>
                                                <TableCell className="text-right tabular-nums">{f.stats?.started_30d ?? 0}</TableCell>
                                                <TableCell>
                                                    <Switch
                                                        checked={f.is_active}
                                                        disabled={!canManage || f.published_version === null || !f.phone_number_id}
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
                                                </TableCell>
                                                <TableCell>
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
                                                            {canManage && (
                                                                <DropdownMenuItem
                                                                    disabled={full}
                                                                    onSelect={async () => {
                                                                        try {
                                                                            const copy = await duplicateChatbot(f.id);
                                                                            toast.success(`Created “${copy.name}”`);
                                                                            refresh();
                                                                        } catch (e) {
                                                                            toast.error(errorMessage(e));
                                                                        }
                                                                    }}
                                                                >
                                                                    <CopyIcon /> Duplicate
                                                                </DropdownMenuItem>
                                                            )}
                                                            {canManage && (
                                                                <DropdownMenuItem destructive onSelect={() => setDeleting(f)}>
                                                                    <Trash2Icon /> Delete
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </>
                        )}
                    </Card>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-[15px]">How bots and agents share a conversation</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-[13px] text-ink-2">
                                <p>
                                    • Every customer message lands in the Team Inbox immediately; the bot answers alongside it. Filter the inbox by “Bot” to
                                    watch.
                                </p>
                                <p>
                                    • The moment an agent replies (or someone replies from the WhatsApp Business app), the bot stops in that conversation. A
                                    reply it was still preparing is discarded.
                                </p>
                                <p>
                                    • “Talk to a person” and the Handoff block pause the bot and route the chat to your team. “Hand back to bot” in the inbox
                                    lets it continue.
                                </p>
                                <p>
                                    • Customers who stop answering get one reminder; later the bot stops and the chat is marked Abandoned, with the step where
                                    they left.
                                </p>
                            </CardContent>
                        </Card>
                        <SecretsCard canManage={canManage} />
                    </div>
                </div>
            )}

            <CreateDialog open={creating} onOpenChange={setCreating} />

            <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The bot, its versions and its statistics are deleted. Conversations stay in the inbox; any that are in this bot&apos;s flow right
                            now stop.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                const f = deleting;
                                setDeleting(null);
                                if (!f) return;
                                try {
                                    await deleteChatbot(f.id);
                                    toast.success('Chatbot deleted');
                                    refresh();
                                } catch (e) {
                                    toast.error(errorMessage(e));
                                }
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
                        <AlertDialogTitle>Replace the live bot on this number?</AlertDialogTitle>
                        <AlertDialogDescription>
                            “{replace?.other}” is live on this number and will be switched off. Only one bot answers per number.
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
