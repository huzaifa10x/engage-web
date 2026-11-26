'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useReplyPromise } from '@/lib/queries';
import type { ReplyPromisePreset, ReplyPromiseSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

/** The presets (business minutes: agent, Managers, Owner; the last is the limit). Fast is the default. */
const PRESETS: { id: Exclude<ReplyPromisePreset, 'custom'>; label: string; steps: [number, number, number] }[] = [
    { id: 'fast', label: 'Fast', steps: [5, 15, 30] },
    { id: 'standard', label: 'Standard', steps: [15, 30, 45] },
    { id: 'relaxed', label: 'Relaxed', steps: [30, 60, 90] },
];

const WHO = { agent: 'Assigned agent (else Managers)', manager: 'Managers', owner: 'Owner, by WhatsApp and email' } as const;

/**
 * Settings › Business hours › Reply promise (3.3): every enquiry gets a person's reply within N
 * business minutes. Needs reply is sorted by time left; while a chat still waits, the agent, then the
 * Managers, then the Owner are told. The average booking value turns waits into "AED at stake".
 */
export function ReplyPromiseCard({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const query = useReplyPromise();
    const [draft, setDraft] = useState<ReplyPromiseSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const v = draft ?? query.data ?? null;
    const save = useMutation({
        mutationFn: (s: ReplyPromiseSettings) =>
            api<{ data: ReplyPromiseSettings }>('tenant/reply-promise', {
                method: 'PUT',
                body: {
                    enabled: s.enabled,
                    preset: s.preset,
                    // A preset sets the times; only Custom sends its own.
                    ...(s.preset === 'custom' ? { limit_minutes: s.limit_minutes, ladder: s.ladder } : {}),
                    hold: s.hold,
                    hold_message: s.hold_message,
                    reassign: s.reassign,
                    intro: s.intro,
                    avg_booking_value: s.avg_booking_value,
                    owner_whatsapp: { phone: s.owner_whatsapp.phone || null, template: s.owner_whatsapp.template?.name ? s.owner_whatsapp.template : null },
                },
            }),
        onSuccess: () => {
            toast.success('Reply promise saved · chats already waiting move to the new limit within a few minutes');
            setDraft(null);
            setError(null);
            void qc.invalidateQueries({ queryKey: ['reply-promise'] });
            void qc.invalidateQueries({ queryKey: ['inbox'] });
        },
        onError: (e) => setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e)),
    });

    if (!v) return <Skeleton className="h-64" />;
    const set = (patch: Partial<ReplyPromiseSettings>) => setDraft({ ...v, ...patch });
    const off = !canManage;
    const noHours = query.data?.needs_business_hours === true;

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle className="flex items-center gap-2">
                        Reply alerts
                        <Badge tone={v.enabled ? 'good' : 'grey'}>{v.enabled ? `${v.ladder.map((s) => s.minutes).join(' / ')} min` : 'Off'}</Badge>
                    </CardTitle>
                    <CardDescription>
                        Every enquiry gets a person’s reply within this time, counted only in business hours (a 21:00 message is due after opening). Only a
                        reply WhatsApp accepted counts. Needs reply is sorted by time left, and the team is told while a chat still waits.
                    </CardDescription>
                </div>
                <Switch
                    checked={v.enabled}
                    disabled={off || (noHours && !v.enabled)}
                    aria-label="Use the reply promise"
                    onCheckedChange={(enabled) => set({ enabled })}
                />
            </CardHeader>
            <CardContent className="grid gap-4 text-[13px]">
                {noHours && (
                    <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                        Set your business hours first (above). The reply promise counts only time when you are open, so it stays off until they are set.
                    </p>
                )}
                <div className="grid gap-2">
                    <Label>Speed</Label>
                    <div role="radiogroup" aria-label="Reply alert speed" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[...PRESETS, { id: 'custom' as const, label: 'Custom', steps: null }].map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                role="radio"
                                aria-checked={v.preset === p.id}
                                disabled={off}
                                onClick={() =>
                                    set(
                                        p.steps
                                            ? {
                                                  preset: p.id,
                                                  limit_minutes: p.steps[2],
                                                  ladder: p.steps.map((minutes, i) => ({ minutes, to: (['agent', 'manager', 'owner'] as const)[i]! })),
                                              }
                                            : { preset: 'custom' },
                                    )
                                }
                                className={cn(
                                    'rounded-lg border px-3 py-2 text-left disabled:opacity-60',
                                    v.preset === p.id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'bg-card hover:bg-muted',
                                )}
                            >
                                <span className="block text-[13px] font-semibold">
                                    {p.label}
                                    {p.id === 'fast' && <span className="ml-1 text-[11px] font-normal text-muted-foreground">default</span>}
                                </span>
                                <span className="block text-[12px] text-muted-foreground tabular-nums">
                                    {p.steps ? `${p.steps.join(' / ')} min` : 'Your own steps'}
                                </span>
                            </button>
                        ))}
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                        UAE customers message several businesses at once and choose whoever answers first. In the inbox a wait turns amber at the first step and
                        red at the second.
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className={cn('grid gap-1.5', v.preset !== 'custom' && 'hidden')}>
                        <Label htmlFor="promise-limit">Waiting limit (business minutes)</Label>
                        <Input
                            id="promise-limit"
                            inputMode="numeric"
                            disabled={off}
                            value={v.limit_minutes}
                            onChange={(e) => set({ limit_minutes: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="promise-value">Average booking value (AED)</Label>
                        <Input
                            id="promise-value"
                            inputMode="numeric"
                            disabled={off}
                            value={v.avg_booking_value ?? ''}
                            placeholder="For “AED at stake” in the weekly report"
                            onChange={(e) => set({ avg_booking_value: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })}
                        />
                    </div>
                </div>

                <div className="grid gap-2 rounded-md border p-3">
                    <p className="font-medium">At the second step ({v.ladder[1]?.minutes ?? '—'} min)</p>
                    <label className="flex items-start gap-3">
                        <span className="min-w-0 flex-1">
                            <span className="block font-medium">Holding message to the customer</span>
                            <span className="block text-[12px] text-muted-foreground">
                                Once per wait, naming the agent. It never counts as a reply. {'{name}'} is the customer’s first name, {'{agent}'} the agent’s.
                            </span>
                        </span>
                        <Switch checked={v.hold} disabled={off} onCheckedChange={(hold) => set({ hold })} aria-label="Holding message" />
                    </label>
                    {v.hold && (
                        <Input
                            disabled={off}
                            maxLength={300}
                            aria-label="Holding message"
                            value={v.hold_message}
                            onChange={(e) => set({ hold_message: e.target.value })}
                        />
                    )}
                    <label className="flex items-start gap-3">
                        <span className="min-w-0 flex-1">
                            <span className="block font-medium">Move to the next free agent</span>
                            <span className="block text-[12px] text-muted-foreground">Teams of 3 or more. The wait clock is not reset.</span>
                        </span>
                        <Switch
                            checked={v.reassign}
                            disabled={off}
                            onCheckedChange={(reassign) => set({ reassign })}
                            aria-label="Move to the next free agent"
                        />
                    </label>
                    <label className="flex items-start gap-3 border-t pt-2">
                        <span className="min-w-0 flex-1">
                            <span className="block font-medium">Agent’s name in the first reply</span>
                            <span className="block text-[12px] text-muted-foreground">
                                “Sara here from {'<your business>'} 👋” at the start of each conversation’s first reply.
                            </span>
                        </span>
                        <Switch checked={v.intro} disabled={off} onCheckedChange={(intro) => set({ intro })} aria-label="Agent’s name in the first reply" />
                    </label>
                    <p className="text-[12px] text-muted-foreground">The holding message and the move are part of Automations (paid plans).</p>
                </div>

                <div className={cn('grid gap-2', v.preset !== 'custom' && 'hidden')}>
                    <Label>Alerts while a chat still waits</Label>
                    {v.ladder.map((step, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                            <Input
                                className="w-20"
                                inputMode="numeric"
                                disabled={off}
                                aria-label={`Step ${i + 1} minutes`}
                                value={step.minutes}
                                onChange={(e) =>
                                    set({ ladder: v.ladder.map((s, j) => (j === i ? { ...s, minutes: Number(e.target.value.replace(/\D/g, '')) || 0 } : s)) })
                                }
                            />
                            <span className="text-muted-foreground">min →</span>
                            <Select
                                value={step.to}
                                disabled={off}
                                onValueChange={(to) => set({ ladder: v.ladder.map((s, j) => (j === i ? { ...s, to: to as typeof s.to } : s)) })}
                            >
                                <SelectTrigger className="w-72" aria-label={`Step ${i + 1} who`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(WHO).map(([k, l]) => (
                                        <SelectItem key={k} value={k}>
                                            {l}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!off && (
                                <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label="Remove step"
                                    onClick={() => set({ ladder: v.ladder.filter((_, j) => j !== i) })}
                                >
                                    <TrashIcon />
                                </Button>
                            )}
                        </div>
                    ))}
                    {!off && v.ladder.length < 5 && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-fit"
                            onClick={() => set({ ladder: [...v.ladder, { minutes: (v.ladder.at(-1)?.minutes ?? 15) + 15, to: 'owner' }] })}
                        >
                            <PlusIcon /> Add a step
                        </Button>
                    )}
                    <p className="text-[12px] text-muted-foreground">Every alert is logged on the chat (Wait alerts) and counted in the weekly report.</p>
                </div>

                <div className="grid gap-2 rounded-md border p-3">
                    <p className="flex items-center gap-2 font-medium">
                        Owner’s WhatsApp alert
                        <Badge tone={v.owner_whatsapp.ready ? 'good' : 'grey'}>{v.owner_whatsapp.ready ? 'Ready' : 'Email only'}</Badge>
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                        Sent from the chat’s number with an approved utility template whose body has two variables: {'{{1}}'} the customer’s name and {'{{2}}'}{' '}
                        the minutes waited.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Input
                            disabled={off}
                            aria-label="Owner WhatsApp number"
                            placeholder="+971 50 123 4567"
                            value={v.owner_whatsapp.phone ?? ''}
                            onChange={(e) => set({ owner_whatsapp: { ...v.owner_whatsapp, phone: e.target.value } })}
                        />
                        <Input
                            disabled={off}
                            aria-label="Template name"
                            placeholder="Template name"
                            value={v.owner_whatsapp.template?.name ?? ''}
                            onChange={(e) =>
                                set({
                                    owner_whatsapp: {
                                        ...v.owner_whatsapp,
                                        template: { name: e.target.value, language: v.owner_whatsapp.template?.language ?? 'en' },
                                    },
                                })
                            }
                        />
                        <Input
                            disabled={off}
                            aria-label="Template language"
                            placeholder="Language, e.g. en"
                            value={v.owner_whatsapp.template?.language ?? ''}
                            onChange={(e) =>
                                set({
                                    owner_whatsapp: {
                                        ...v.owner_whatsapp,
                                        template: { name: v.owner_whatsapp.template?.name ?? '', language: e.target.value },
                                    },
                                })
                            }
                        />
                    </div>
                </div>

                {error && (
                    <p role="alert" className="text-[12.5px] text-bad">
                        {error}
                    </p>
                )}
                {canManage && (
                    <div className="flex justify-end">
                        <Button onClick={() => save.mutate(v)} disabled={save.isPending || draft === null}>
                            {save.isPending ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
