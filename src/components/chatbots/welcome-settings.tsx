'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, errorMessage } from '@/lib/api';
import { relative } from '@/lib/format';

type IceBreaker = { text: string; flow_id: string | null };
type NumberWelcome = {
    phone_number_id: string;
    display_phone_number: string | null;
    verified_name: string | null;
    settings: { welcome_enabled: boolean; welcome_flow_id: string | null; ice_breakers: IceBreaker[]; synced_at: string | null };
    flows: { id: string; name: string; live: boolean }[];
    on_meta: { enable_welcome_message: boolean | null; prompts: string[] } | null;
};

const NONE = '__none__';
const MAX = 4;
const LIMIT = 80;

function NumberSettings({ n, canPublish }: { n: NumberWelcome; canPublish: boolean }) {
    const qc = useQueryClient();
    const [welcome, setWelcome] = useState(n.settings.welcome_enabled);
    const [welcomeFlow, setWelcomeFlow] = useState<string | null>(n.settings.welcome_flow_id);
    const [breakers, setBreakers] = useState<IceBreaker[]>(() => {
        const list = [...n.settings.ice_breakers];
        while (list.length < MAX) list.push({ text: '', flow_id: null });
        return list;
    });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const label = n.verified_name ?? n.display_phone_number ?? 'This number';
    const flowName = (id: string | null) => n.flows.find((f) => f.id === id)?.name;

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            await api(`chatbots/welcome/${n.phone_number_id}`, {
                method: 'PUT',
                body: { welcome_enabled: welcome, welcome_flow_id: welcomeFlow, ice_breakers: breakers.filter((b) => b.text.trim() !== '') },
            });
            toast.success('Saved on WhatsApp. New chats show them right away.');
            void qc.invalidateQueries({ queryKey: ['chatbots', 'welcome'] });
        } catch (e) {
            setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? errorMessage(e)) : errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const metaDiffers =
        n.on_meta !== null &&
        (n.on_meta.prompts.join('\n') !== n.settings.ice_breakers.map((b) => b.text).join('\n') ||
            (n.on_meta.enable_welcome_message ?? false) !== n.settings.welcome_enabled);

    return (
        <section className="grid gap-3 rounded-md border p-3" aria-label={`Welcome and ice breakers for ${label}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold">
                    {label} <span className="font-mono text-[12px] font-normal text-muted-foreground">{n.display_phone_number}</span>
                </p>
                {n.settings.synced_at && <p className="text-[12px] text-muted-foreground">Saved on WhatsApp {relative(n.settings.synced_at)}</p>}
            </div>
            {metaDiffers && (
                <p role="alert" className="rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12.5px]">
                    WhatsApp shows something else now (changed in WhatsApp Manager?):{' '}
                    {n.on_meta!.prompts.length ? n.on_meta!.prompts.map((p) => `“${p}”`).join(', ') : 'no ice breakers'}. Save here to put yours back.
                </p>
            )}
            {n.flows.length === 0 && (
                <p className="text-[12.5px] text-muted-foreground">Publish a flow on this number first: welcomes and ice breakers start a flow.</p>
            )}
            <FormError message={error} />

            <div className="grid gap-2">
                <label className="flex items-center justify-between gap-3 text-[13px]">
                    <span>
                        Welcome message
                        <span className="block text-[12px] text-muted-foreground">
                            When someone opens a chat with this number for the first time, this flow greets them before they type.
                        </span>
                    </span>
                    <Switch checked={welcome} onCheckedChange={setWelcome} disabled={!canPublish} aria-label="Welcome message" />
                </label>
                {welcome && (
                    <Select value={welcomeFlow ?? NONE} onValueChange={(v) => setWelcomeFlow(v === NONE ? null : v)} disabled={!canPublish}>
                        <SelectTrigger className="sm:w-80" aria-label="Welcome flow">
                            <SelectValue placeholder="Choose a flow" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Choose a flow</SelectItem>
                            {n.flows.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                    {f.name}
                                    {f.live ? '' : ' (paused)'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="grid gap-2">
                <p className="text-[13px]">
                    Ice breakers
                    <span className="block text-[12px] text-muted-foreground">
                        Up to 4 questions WhatsApp shows in a new chat. Tapping one sends its words and starts the flow you choose. 80 characters, no emoji.
                    </span>
                </p>
                <ol className="grid gap-2" aria-label="Ice breakers">
                    {breakers.map((b, i) => (
                        <li key={i} className="grid gap-2 sm:grid-cols-[1fr_16rem]">
                            <div className="relative">
                                <Input
                                    value={b.text}
                                    maxLength={LIMIT}
                                    placeholder={['Book a class', 'See prices', 'Opening hours', 'Talk to someone'][i]}
                                    aria-label={`Ice breaker ${i + 1}`}
                                    disabled={!canPublish}
                                    onChange={(e) => setBreakers(breakers.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
                                />
                                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-faint">
                                    {b.text.length}/{LIMIT}
                                </span>
                            </div>
                            <Select
                                value={b.flow_id ?? NONE}
                                disabled={!canPublish}
                                onValueChange={(v) => setBreakers(breakers.map((x, k) => (k === i ? { ...x, flow_id: v === NONE ? null : v } : x)))}
                            >
                                <SelectTrigger aria-label={`Flow for ice breaker ${i + 1}`}>
                                    <SelectValue placeholder="Starts this flow" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Starts this flow…</SelectItem>
                                    {n.flows.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>
                                            {f.name}
                                            {f.live ? '' : ' (paused)'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </li>
                    ))}
                </ol>
            </div>
            {!canPublish && <p className="text-[12px] text-muted-foreground">Only people who can publish flows change these.</p>}
            {canPublish && (
                <Button size="sm" className="w-fit" onClick={save} disabled={busy}>
                    {busy ? 'Saving on WhatsApp…' : 'Save on WhatsApp'}
                </Button>
            )}
            {n.settings.ice_breakers.length > 0 && (
                <p className="text-[12px] text-muted-foreground">
                    Live: {n.settings.ice_breakers.map((b) => `“${b.text}” → ${flowName(b.flow_id) ?? 'removed flow'}`).join(' · ')}
                </p>
            )}
        </section>
    );
}

/** Bot settings › Welcome & ice breakers: per number, set on WhatsApp through Meta. */
export function WelcomeSettings({ canPublish }: { canPublish: boolean }) {
    const [check, setCheck] = useState(false);
    const q = useQuery({
        queryKey: ['chatbots', 'welcome', check],
        queryFn: () => api<{ data: NumberWelcome[] }>('chatbots/welcome', { query: { check: check ? 1 : null } }).then((r) => r.data),
    });
    if (!q.data) return <Skeleton className="h-48" />;

    return (
        <div className="space-y-3" role="region" aria-label="Welcome and ice breakers">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] text-muted-foreground">What a customer sees when they open a chat with your number for the first time.</p>
                <Button size="sm" variant="outline" onClick={() => setCheck(true)} disabled={check && q.isFetching}>
                    <RefreshCwIcon /> Check what WhatsApp shows
                </Button>
            </div>
            {q.data.length === 0 && <p className="text-[13px] text-muted-foreground">Connect a WhatsApp number first.</p>}
            {q.data.map((n) => (
                <NumberSettings key={`${n.phone_number_id}-${n.settings.synced_at ?? ''}`} n={n} canPublish={canPublish} />
            ))}
        </div>
    );
}
