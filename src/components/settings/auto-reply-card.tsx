'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, errorMessage } from '@/lib/api';
import { updateAutoReply, useAutoReply } from '@/lib/queries';
import type { AutoReplySettings } from '@/lib/types';

const NONE = '__none__';

/**
 * Auto reply with a chatbot: per WhatsApp number, any of its chatbot flows — the ready "After hours"
 * template, or a custom flow built in Chatbots & Flows. The flow must be published and switched on.
 */
function AutoReplyBots({ value, disabled, onChange }: { value: AutoReplySettings; disabled: boolean; onChange: (flows: Record<string, string>) => void }) {
    const router = useRouter();
    const [creating, setCreating] = useState<string | null>(null);
    const numbers = value.flow_options ?? [];

    const create = async (numberId: string) => {
        setCreating(numberId);
        try {
            const r = await api<{ data: { id: string } }>('chatbots', {
                method: 'POST',
                body: { name: 'After hours', phone_number_id: numberId, template: 'after_hours' },
            });
            onChange({ ...value.flows, [numberId]: r.data.id });
            toast.success('After hours flow created. Publish and switch it on in the builder, then save here.');
            router.push(`/chatbots/builder?id=${r.data.id}`);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setCreating(null);
        }
    };

    if (numbers.length === 0) return <p className="text-[13px] text-muted-foreground">Connect a WhatsApp number first.</p>;

    return (
        <div className="grid gap-2">
            <p className="text-[13px] text-muted-foreground">
                Choose the chatbot that answers on each number: the ready “After hours” flow, or any custom flow you build. Use{' '}
                <code>{'{{business.next_open}}'}</code> in it to say when you are back.
            </p>
            {numbers.map((n) => {
                const chosen = value.flows[n.phone_number_id] ?? '';
                const flow = n.flows.find((f) => f.id === chosen);

                return (
                    <div key={n.phone_number_id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                        <span className="w-56 truncate text-[13px]">
                            <span className="font-mono">{n.display_phone_number}</span>
                            {n.display && n.display !== n.display_phone_number ? <span className="text-muted-foreground"> · {n.display}</span> : null}
                        </span>
                        <Select
                            value={chosen || NONE}
                            onValueChange={(v) => {
                                const next = { ...value.flows };
                                if (v === NONE) delete next[n.phone_number_id];
                                else next[n.phone_number_id] = v;
                                onChange(next);
                            }}
                            disabled={disabled}
                        >
                            <SelectTrigger size="sm" className="w-64" aria-label={`Chatbot for ${n.display_phone_number}`}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>No auto reply on this number</SelectItem>
                                {n.flows.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.name}
                                        {f.live ? '' : ' (not live)'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {flow && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/chatbots/builder?id=${flow.id}`}>Configure</Link>
                            </Button>
                        )}
                        {flow && !flow.live && <span className="text-[12px] text-warn">Publish and switch it on, or it won’t answer.</span>}
                        {!flow && (
                            <Button variant="ghost" size="sm" disabled={disabled || creating !== null} onClick={() => create(n.phone_number_id)}>
                                {creating === n.phone_number_id ? 'Creating…' : 'Create from the After hours template'}
                            </Button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** The automatic reply customers get when they write in. Can be switched off for a single conversation in the inbox. */
export function AutoReplyCard({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const query = useAutoReply();
    const [draft, setDraft] = useState<AutoReplySettings | null>(null);
    const [saving, setSaving] = useState(false);
    const value = draft ?? query.data ?? null;

    if (!value) return <Skeleton className="h-40" />;

    const save = async () => {
        setSaving(true);
        try {
            const { flow_options, ...body } = value;
            qc.setQueryData(['auto-reply'], await updateAutoReply(body));
            setDraft(null);
            toast.success(value.enabled ? 'Auto reply is on' : 'Auto reply is off');
        } catch (e) {
            toast.error(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Auto reply</CardTitle>
                    <CardDescription>
                        Reply automatically when a customer messages you, with a message or with a chatbot. It answers once per conversation in the chosen
                        period, never in answer to STOP, and can be switched off for a single conversation from the inbox.
                    </CardDescription>
                </div>
                <Switch checked={value.enabled} disabled={!canManage} aria-label="Auto reply" onCheckedChange={(enabled) => setDraft({ ...value, enabled })} />
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field label="Reply with" htmlFor="ar-with" className="sm:max-w-xs">
                    <Select
                        value={value.reply_with}
                        onValueChange={(v) => setDraft({ ...value, reply_with: v as AutoReplySettings['reply_with'] })}
                        disabled={!canManage || !value.enabled}
                    >
                        <SelectTrigger id="ar-with">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="message">A message</SelectItem>
                            <SelectItem value="chatbot">A chatbot</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                {value.reply_with === 'chatbot' ? (
                    <AutoReplyBots value={value} disabled={!canManage || !value.enabled} onChange={(flows) => setDraft({ ...value, flows })} />
                ) : (
                    <Field label="Message" htmlFor="ar-message">
                        <textarea
                            id="ar-message"
                            className="field-sizing-content min-h-20 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-60"
                            maxLength={1000}
                            disabled={!canManage || !value.enabled}
                            value={value.message}
                            onChange={(e) => setDraft({ ...value, message: e.target.value })}
                        />
                    </Field>
                )}
                <Field label="When" htmlFor="ar-when" className="sm:max-w-xs" hint="“Outside business hours” uses the hours set above.">
                    <Select
                        value={value.when}
                        onValueChange={(v) => setDraft({ ...value, when: v as AutoReplySettings['when'] })}
                        disabled={!canManage || !value.enabled}
                    >
                        <SelectTrigger id="ar-when">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="always">Always</SelectItem>
                            <SelectItem value="outside_hours">Only outside business hours</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="Send at most once every" htmlFor="ar-cooldown" className="sm:max-w-xs">
                    <Select
                        value={String(value.cooldown_hours)}
                        onValueChange={(v) => setDraft({ ...value, cooldown_hours: Number(v) })}
                        disabled={!canManage || !value.enabled}
                    >
                        <SelectTrigger id="ar-cooldown">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[1, 4, 12, 24, 48, 168].map((h) => (
                                <SelectItem key={h} value={String(h)}>
                                    {h < 24 ? `${h} hour${h === 1 ? '' : 's'}` : h === 168 ? '7 days' : `${h / 24} day${h === 24 ? '' : 's'}`} per conversation
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                {canManage && (
                    <div className="flex justify-end">
                        <Button
                            onClick={save}
                            disabled={
                                saving ||
                                draft === null ||
                                (value.enabled && value.reply_with === 'message' && !value.message.trim()) ||
                                (value.enabled && value.reply_with === 'chatbot' && Object.values(value.flows).filter(Boolean).length === 0)
                            }
                        >
                            {saving ? 'Saving…' : 'Save auto reply'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
