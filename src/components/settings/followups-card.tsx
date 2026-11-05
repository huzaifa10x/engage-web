'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError, errorMessage } from '@/lib/api';
import { updateFollowUps, useFollowUps, useMembers, useTemplates } from '@/lib/queries';
import type { FollowUpSettings } from '@/lib/types';

const NONE = '__none__';

function Rule({
    title,
    description,
    enabled,
    onToggle,
    disabled,
    locked,
    stats,
    children,
}: {
    title: string;
    description: string;
    enabled: boolean;
    onToggle: (v: boolean) => void;
    disabled: boolean;
    locked?: string | null;
    stats?: { fired: number; replied: number; skipped: number };
    children?: React.ReactNode;
}) {
    return (
        <div className="grid gap-2 rounded-md border p-3">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                        {title}
                        {locked && <Badge tone="grey">{locked}</Badge>}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground">{description}</p>
                    {stats && (stats.fired > 0 || stats.skipped > 0) && (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                            Last 30 days: fired {stats.fired} · customer replied after {stats.replied}
                            {stats.skipped > 0 ? ` · skipped ${stats.skipped}` : ''}
                        </p>
                    )}
                </div>
                <Switch checked={enabled} disabled={disabled || !!locked} onCheckedChange={onToggle} aria-label={title} />
            </div>
            {enabled && children && <div className="grid gap-2 border-t pt-2">{children}</div>}
        </div>
    );
}

function Minutes({
    label,
    value,
    onChange,
    disabled,
    min = 1,
    max = 1440,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    disabled: boolean;
    min?: number;
    max?: number;
}) {
    return (
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
            {label}
            <Input
                type="number"
                className="w-24"
                min={min}
                max={max}
                disabled={disabled}
                value={value}
                onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
            />
        </label>
    );
}

/**
 * Settings › Follow-up rules (Engagement Plan §IV). Team-side rules notify or reassign, never message
 * the customer; customer-side nudges send one message within strict limits. Every rule respects
 * business hours, consent, the weekly cap and stops when the customer replies.
 */
export function FollowUpsCard({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const query = useFollowUps();
    const members = useMembers(canManage).data?.data ?? [];
    const templates = (useTemplates({ status: 'APPROVED' }, canManage).data?.data ?? []).filter((t) => t.sendable);
    const [draft, setDraft] = useState<FollowUpSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const data = query.data;
    const value = draft ?? data?.settings ?? null;

    if (!data || !value) return <Skeleton className="h-64" />;
    const set = <K extends keyof FollowUpSettings>(key: K, patch: Partial<FollowUpSettings[K]> | FollowUpSettings[K]) =>
        setDraft({ ...value, [key]: typeof patch === 'object' && patch !== null && !Array.isArray(patch) ? { ...(value[key] as object), ...patch } : patch });
    const off = !canManage;
    const pro = 'Pro plan';
    const e = data.estimate;

    const save = async () => {
        setSaving(true);
        try {
            qc.setQueryData(['followups'], await updateFollowUps(value));
            setDraft(null);
            toast.success('Follow-up rules saved');
        } catch (err) {
            toast.error(err instanceof ApiError ? (Object.values(err.fields)[0]?.[0] ?? err.message) : errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const bodyVars = (name: string) => {
        const t = templates.find((x) => x.name === name);
        const body = t?.components.find((c) => c.type === 'BODY')?.text ?? '';

        return (body.match(/\{\{[^}]+\}\}/g) ?? []).length;
    };

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Follow-up rules</CardTitle>
                    <CardDescription>
                        Alerts when the team hasn’t replied, and a nudge when the customer goes quiet. Times count opening hours only. Every rule stops when the
                        customer replies, never runs at night, and respects opt-outs and the weekly limit.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="grid gap-3">
                <p className="text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">The team hasn’t replied · internal only</p>
                <Rule
                    title="Remind the agent"
                    description="Needs reply for this long: the assigned agent is notified (unassigned chats: the Owners and Admins)."
                    enabled={value.reply_alert.enabled}
                    onToggle={(enabled) => set('reply_alert', { enabled })}
                    disabled={off}
                    locked={data.allowed.team ? null : 'Not in your plan'}
                    stats={data.stats.reply_alert}
                >
                    <Minutes label="After (minutes)" value={value.reply_alert.minutes} onChange={(minutes) => set('reply_alert', { minutes })} disabled={off} />
                </Rule>
                <Rule
                    title="Escalate"
                    description="Still no reply: tell the team lead, or hand the chat to the least busy teammate who can reply on that number."
                    enabled={value.escalation.enabled}
                    onToggle={(enabled) => set('escalation', { enabled })}
                    disabled={off}
                    locked={data.allowed.escalation ? null : pro}
                    stats={data.stats.reply_escalation}
                >
                    <Minutes label="After (minutes)" value={value.escalation.minutes} onChange={(minutes) => set('escalation', { minutes })} disabled={off} />
                    <Select value={value.escalation.action} onValueChange={(v) => set('escalation', { action: v as 'notify' | 'reassign' })} disabled={off}>
                        <SelectTrigger size="sm" className="w-72" aria-label="Escalation action">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="notify">Notify the team lead</SelectItem>
                            <SelectItem value="reassign">Reassign to the least busy teammate</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="grid gap-1">
                        <p className="text-[12.5px] text-muted-foreground">Team lead (none chosen: all Owners and Admins)</p>
                        <div className="flex flex-wrap gap-3">
                            {members.map((m) => (
                                <label key={m.id} className="flex items-center gap-1.5 text-[13px]">
                                    <Checkbox
                                        checked={value.escalation.notify_ids.includes(m.id)}
                                        disabled={off}
                                        onCheckedChange={(c) =>
                                            set('escalation', {
                                                notify_ids: c ? [...value.escalation.notify_ids, m.id] : value.escalation.notify_ids.filter((x) => x !== m.id),
                                            })
                                        }
                                    />
                                    {m.user?.name ?? 'Teammate'}
                                </label>
                            ))}
                        </div>
                    </div>
                </Rule>
                <Rule
                    title="Urgent: window about to close"
                    description="The 24-hour window closes soon and nobody replied. After it closes, only a paid template can reach the customer."
                    enabled={value.window_alert.enabled}
                    onToggle={(enabled) => set('window_alert', { enabled })}
                    disabled={off}
                    locked={data.allowed.team ? null : 'Not in your plan'}
                    stats={data.stats.window_alert}
                >
                    <Minutes
                        label="Minutes before it closes"
                        value={value.window_alert.minutes_before}
                        onChange={(minutes_before) => set('window_alert', { minutes_before })}
                        disabled={off}
                        min={15}
                        max={720}
                    />
                </Rule>
                <Rule
                    title="Assign unassigned chats"
                    description="Unassigned for this long: assigned by round-robin to the least busy teammate who can reply on that number."
                    enabled={value.unassigned.enabled}
                    onToggle={(enabled) => set('unassigned', { enabled })}
                    disabled={off}
                    locked={data.allowed.round_robin ? null : 'Not in your plan'}
                    stats={data.stats.unassigned_assign}
                >
                    <Minutes label="After (minutes)" value={value.unassigned.minutes} onChange={(minutes) => set('unassigned', { minutes })} disabled={off} />
                </Rule>

                <p className="mt-2 text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">The customer went quiet · sends a message</p>
                <div className="rounded-md bg-muted px-3 py-2 text-[12.5px] leading-snug">
                    <p>
                        <b>Before you turn it on:</b> about <b>{e.nudges_per_month}</b> nudges a month (from the last 30 days, after {e.nudge_hours} h of
                        silence). Service messages are free up to {e.free_service_messages.toLocaleString()} per number per month: roughly{' '}
                        <b>{e.within_free}</b> would use that allowance{e.beyond_free > 0 ? ` and ${e.beyond_free} would be charged at the utility rate` : ''}.
                    </p>
                    {e.numbers.length > 0 && (
                        <p className="mt-1 text-muted-foreground">
                            This month so far:{' '}
                            {e.numbers
                                .map(
                                    (n) =>
                                        `${n.display ?? 'number'} ${n.service_messages_this_month.toLocaleString()} sent, ${n.free_left.toLocaleString()} free left`,
                                )
                                .join(' · ')}
                            . Meta’s pricing can change; check it against your invoice.
                        </p>
                    )}
                </div>
                <Rule
                    title="Nudge"
                    description="After a person’s reply, if the customer stays silent: one normal message, only while the 24-hour window is open. Due at night, it waits for opening time, or is skipped if the window would close first."
                    enabled={value.nudge.enabled}
                    onToggle={(enabled) => set('nudge', { enabled })}
                    disabled={off}
                    locked={data.allowed.nudges ? null : pro}
                    stats={data.stats.nudge}
                >
                    <Minutes label="After (hours of silence)" value={value.nudge.hours} onChange={(hours) => set('nudge', { hours })} disabled={off} max={23} />
                    <textarea
                        aria-label="Nudge message"
                        className="field-sizing-content min-h-16 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                        maxLength={1000}
                        disabled={off}
                        value={value.nudge.message}
                        onChange={(ev) => set('nudge', { message: ev.target.value })}
                    />
                    <p className="text-[12px] text-muted-foreground">{'{{name}}'} is the customer’s first name.</p>
                </Rule>
                <Rule
                    title="Second nudge (template)"
                    description="Optional, later: an approved template, only to contacts who opted in (others are skipped). Paid per message; Meta may refuse marketing templates under its per-user limit."
                    enabled={value.second_nudge.enabled}
                    onToggle={(enabled) => set('second_nudge', { enabled })}
                    disabled={off}
                    locked={data.allowed.nudges ? null : pro}
                    stats={data.stats.nudge_template}
                >
                    <Minutes
                        label="After the first nudge (hours)"
                        value={value.second_nudge.hours}
                        onChange={(hours) => set('second_nudge', { hours })}
                        disabled={off}
                        max={168}
                    />
                    <Select
                        value={value.second_nudge.template ? `${value.second_nudge.template.name}|${value.second_nudge.template.language}` : NONE}
                        onValueChange={(v) => {
                            if (v === NONE) return set('second_nudge', { template: null });
                            const [name, language] = v.split('|');
                            set('second_nudge', { template: { name, language, body: Array.from({ length: bodyVars(name) }, () => '{{name}}') } });
                        }}
                        disabled={off}
                    >
                        <SelectTrigger size="sm" className="w-80" aria-label="Template">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Choose an approved template…</SelectItem>
                            {templates.map((t) => (
                                <SelectItem key={t.id} value={`${t.name}|${t.language}`}>
                                    {t.name} · {t.language}
                                    {t.category ? ` · ${t.category.toLowerCase()}` : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {value.second_nudge.template && value.second_nudge.template.body.length > 0 && (
                        <div className="grid gap-1">
                            {value.second_nudge.template.body.map((v, i) => (
                                <Input
                                    key={i}
                                    aria-label={`Variable ${i + 1}`}
                                    value={v}
                                    disabled={off}
                                    onChange={(ev) => {
                                        const t = value.second_nudge.template!;
                                        set('second_nudge', { template: { ...t, body: t.body.map((x, j) => (j === i ? ev.target.value : x)) } });
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </Rule>
                <div className="flex flex-wrap items-center gap-4">
                    <Minutes
                        label="At most this many automated messages per contact per week"
                        value={value.weekly_cap}
                        onChange={(weekly_cap) => setDraft({ ...value, weekly_cap })}
                        disabled={off}
                        max={20}
                    />
                    <Minutes
                        label="Free service messages per number per month"
                        value={value.free_service_messages}
                        onChange={(free_service_messages) => setDraft({ ...value, free_service_messages })}
                        disabled={off}
                        min={0}
                        max={100000}
                    />
                </div>
                {canManage && (
                    <div className="flex justify-end">
                        <Button onClick={save} disabled={saving || draft === null}>
                            {saving ? 'Saving…' : 'Save follow-up rules'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
