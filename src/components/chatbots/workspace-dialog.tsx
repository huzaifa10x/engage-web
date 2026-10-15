'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, Loader2Icon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ApiError, errorMessage } from '@/lib/api';
import {
    chatbotKeys,
    deleteChatbotSecret,
    deleteChatbotSnippet,
    saveChatbotSecret,
    saveChatbotSnippet,
    saveChatbotWorkspace,
    useChatbotSecrets,
    useChatbotSnippets,
    useChatbotWorkspace,
} from '@/lib/chatbots';
import { cn } from '@/lib/utils';

const TABS = [
    ['business', 'Business details'],
    ['snippets', 'Snippets'],
    ['keys', 'API keys'],
    ['agency', 'Review & approvals'],
] as const;

/** Settings shared by every flow of the workspace. */
export function WorkspaceDialog({
    open,
    onOpenChange,
    canManage,
    canPublish,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    canManage: boolean;
    canPublish: boolean;
}) {
    const [tab, setTab] = useState<(typeof TABS)[number][0]>('business');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Chatbot workspace</DialogTitle>
                    <DialogDescription>Shared by all your flows: business details, saved text, API keys and the review rule.</DialogDescription>
                </DialogHeader>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                    {TABS.map(([k, l]) => (
                        <button
                            key={k}
                            onClick={() => setTab(k)}
                            className={cn(
                                'flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold',
                                tab === k ? 'bg-card shadow-xs' : 'text-muted-foreground',
                            )}
                        >
                            {l}
                        </button>
                    ))}
                </div>
                {open && tab === 'business' && <Business canManage={canManage} />}
                {open && tab === 'snippets' && <Snippets canManage={canManage} />}
                {open && tab === 'keys' && <Keys canManage={canManage} />}
                {open && tab === 'agency' && <Agency canPublish={canPublish} />}
            </DialogContent>
        </Dialog>
    );
}

function Business({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const ws = useChatbotWorkspace();
    const [rows, setRows] = useState<[string, string][] | null>(null);
    const [busy, setBusy] = useState(false);
    if (ws.data && rows === null) {
        const merged = { ...Object.fromEntries(Object.keys(ws.data.suggestions).map((k) => [k, ''])), ...ws.data.variables };
        setRows(Object.entries(merged));
    }
    const list = rows ?? [];

    return (
        <div className="space-y-3">
            <p className="text-[12.5px] text-muted-foreground">
                Use these in any message as <code className="rounded bg-muted px-1">{'{{business.name}}'}</code>. Change them here and every flow says the new
                value at once — no need to edit or republish flows.
            </p>
            <div className="space-y-1.5">
                {list.map(([k, v], i) => (
                    <div key={i} className="grid grid-cols-[180px_1fr_auto] gap-1.5">
                        <Input
                            value={k}
                            onChange={(e) =>
                                setRows(
                                    list.map((r, n) =>
                                        n === i
                                            ? [
                                                  e.target.value
                                                      .toLowerCase()
                                                      .replace(/[^a-z0-9_]/g, '_')
                                                      .slice(0, 40),
                                                  r[1],
                                              ]
                                            : r,
                                    ),
                                )
                            }
                            className="h-8 font-mono text-[12px]"
                            aria-label="Name"
                            disabled={!canManage}
                            placeholder="key"
                        />
                        <Input
                            value={v}
                            onChange={(e) => setRows(list.map((r, n) => (n === i ? [r[0], e.target.value] : r)))}
                            className="h-8"
                            aria-label={`Value of ${k}`}
                            disabled={!canManage}
                            placeholder={ws.data?.suggestions[k] ?? 'Value'}
                        />
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setRows(list.filter((_, n) => n !== i))}
                            aria-label="Remove"
                            disabled={!canManage}
                        >
                            <XIcon />
                        </Button>
                    </div>
                ))}
            </div>
            {canManage && (
                <div className="flex justify-between">
                    <Button variant="outline" size="sm" onClick={() => setRows([...list, ['', '']])}>
                        <PlusIcon /> Add a detail
                    </Button>
                    <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                const saved = await saveChatbotWorkspace({ variables: Object.fromEntries(list.filter(([k, v]) => k && v.trim())) });
                                qc.setQueryData(chatbotKeys.workspace, saved);
                                void qc.invalidateQueries({ queryKey: chatbotKeys.options });
                                void qc.invalidateQueries({ queryKey: chatbotKeys.templates });
                                toast.success('Business details saved');
                            } catch (e) {
                                toast.error(errorMessage(e));
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        {busy && <Loader2Icon className="animate-spin" />} Save
                    </Button>
                </div>
            )}
        </div>
    );
}

function Snippets({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const snippets = useChatbotSnippets();
    const [name, setName] = useState('');
    const [body, setBody] = useState('');
    const refresh = (rows?: { id: string; name: string; body: string }[]) => {
        if (rows) qc.setQueryData(chatbotKeys.snippets, rows);
        void qc.invalidateQueries({ queryKey: chatbotKeys.options });
    };

    return (
        <div className="space-y-3">
            <p className="text-[12.5px] text-muted-foreground">
                Saved text you insert into any message with the “Snippet” button — opening hours, delivery policy, return rules.
            </p>
            <ul className="divide-y rounded-lg border">
                {(snippets.data ?? []).length === 0 && <li className="px-3 py-3 text-[12.5px] text-muted-foreground">No snippets yet.</li>}
                {(snippets.data ?? []).map((s) => (
                    <li key={s.id} className="flex items-start gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-semibold">{s.name}</p>
                            <p className="line-clamp-2 text-[12px] text-muted-foreground">{s.body}</p>
                        </div>
                        {canManage && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${s.name}`}
                                onClick={async () => {
                                    try {
                                        await deleteChatbotSnippet(s.id);
                                        refresh();
                                        void qc.invalidateQueries({ queryKey: chatbotKeys.snippets });
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
            {canManage && (
                <form
                    className="space-y-2 rounded-lg border p-3"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                            refresh(await saveChatbotSnippet({ name: name.trim(), body }));
                            setName('');
                            setBody('');
                        } catch (err) {
                            toast.error(err instanceof ApiError ? (Object.values(err.fields)[0]?.[0] ?? err.message) : errorMessage(err));
                        }
                    }}
                >
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={80}
                        placeholder="Name, e.g. Opening hours"
                        aria-label="Snippet name"
                    />
                    <textarea
                        rows={3}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        maxLength={4096}
                        placeholder="We are open Sunday to Thursday, 9:00 to 18:00."
                        className="w-full rounded-lg border border-input px-3 py-2 text-[13px]"
                        aria-label="Snippet text"
                    />
                    <Button size="sm" type="submit" disabled={!name.trim() || !body.trim()}>
                        <PlusIcon /> Save snippet
                    </Button>
                </form>
            )}
        </div>
    );
}

function Keys({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const secrets = useChatbotSecrets();
    const [name, setName] = useState('');
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const refresh = () => {
        void qc.invalidateQueries({ queryKey: chatbotKeys.secrets });
        void qc.invalidateQueries({ queryKey: chatbotKeys.options });
    };

    return (
        <div className="space-y-3">
            <p className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
                <KeyRoundIcon className="mt-0.5 size-4 shrink-0" /> Keys and tokens for API-call blocks, used as {'{{secret.NAME}}'}. Stored encrypted, never
                shown again and never put into a flow (so exports never contain them).
            </p>
            {(secrets.data ?? []).length > 0 && (
                <ul className="divide-y rounded-lg border text-[13px]">
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
                                            refresh();
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
                    onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        try {
                            await saveChatbotSecret(name.trim(), value);
                            setName('');
                            setValue('');
                            toast.success('API key saved');
                            refresh();
                        } catch (err) {
                            toast.error(err instanceof ApiError ? (Object.values(err.fields)[0]?.[0] ?? err.message) : errorMessage(err));
                        } finally {
                            setBusy(false);
                        }
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
        </div>
    );
}

function Agency({ canPublish }: { canPublish: boolean }) {
    const qc = useQueryClient();
    const ws = useChatbotWorkspace();

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div>
                    <Label className="text-[13px] font-semibold">Review before publishing</Label>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                        For agencies and teams: an editor asks for a review, a publisher approves that exact version, and only then can it be published. Any
                        later edit needs a new approval.
                    </p>
                </div>
                <Switch
                    checked={ws.data?.approvals ?? false}
                    disabled={!canPublish || !ws.data}
                    onCheckedChange={async (approvals) => {
                        try {
                            qc.setQueryData(chatbotKeys.workspace, await saveChatbotWorkspace({ approvals }));
                            void qc.invalidateQueries({ queryKey: chatbotKeys.all });
                            toast.success(approvals ? 'Reviews are required before publishing' : 'Reviews are no longer required');
                        } catch (e) {
                            toast.error(errorMessage(e));
                        }
                    }}
                    aria-label="Review before publishing"
                />
            </div>
            <div className="rounded-lg bg-muted px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
                <p className="font-semibold">Who can do what</p>
                <p className="mt-1">
                    <b>Viewer</b> (chatbots.view): sees flows, tests them, comments, reads analytics. <b>Editor</b> (chatbots.manage): edits drafts and asks for
                    reviews. <b>Publisher</b> (chatbots.publish): publishes, switches flows on and off, schedules them and approves reviews. Set roles in
                    Settings → Team; a flow can also be limited to some editors.
                </p>
            </div>
        </div>
    );
}
