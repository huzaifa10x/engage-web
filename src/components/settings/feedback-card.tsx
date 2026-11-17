'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SmileIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, errorMessage } from '@/lib/api';

type FeedbackSettings = {
    csat_enabled: boolean;
    csat_question: string;
    csat_thanks: string;
    review_enabled: boolean;
    review_on_orders: boolean;
    review_on_bookings: boolean;
    review_template: { name: string; language: string; body: string[] } | null;
    templates: { id: string; name: string; language: string; body_variables: number; body: string }[];
};

const NONE = '__none__';

/** Follow-ups & Alerts › Satisfaction and feedback: the CSAT rating after a support chat and feedback requests after orders and bookings. */
export function FeedbackCard({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ['feedback-settings'], queryFn: () => api<{ data: FeedbackSettings }>('tenant/feedback').then((r) => r.data) });
    const [draft, setDraft] = useState<FeedbackSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const v = draft ?? q.data ?? null;
    if (!v) return <Skeleton className="h-48" />;
    const set = (patch: Partial<FeedbackSettings>) => setDraft({ ...v, ...patch });
    const key = v.review_template ? `${v.review_template.name}|${v.review_template.language}` : NONE;
    const chosen = v.templates.find((t) => `${t.name}|${t.language}` === key) ?? null;

    const save = async () => {
        setSaving(true);
        try {
            const r = await api<{ data: FeedbackSettings }>('tenant/feedback', {
                method: 'PUT',
                body: {
                    csat_enabled: v.csat_enabled,
                    csat_question: v.csat_question,
                    csat_thanks: v.csat_thanks,
                    review_enabled: v.review_enabled,
                    review_on_orders: v.review_on_orders,
                    review_on_bookings: v.review_on_bookings,
                    review_template: v.review_template,
                },
            });
            qc.setQueryData(['feedback-settings'], r.data);
            setDraft(null);
            toast.success('Feedback settings saved');
        } catch (e) {
            toast.error(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="gap-4 p-5" role="region" aria-label="Satisfaction and feedback">
            <div className="flex items-start gap-3">
                <SmileIcon className="mt-0.5 size-5 text-muted-foreground" />
                <div>
                    <p className="text-sm font-semibold">Satisfaction and feedback</p>
                    <p className="text-[12.5px] text-muted-foreground">
                        Ask customers how it went. Never more than one request per customer in 7 days. Results are in Analytics › Messages & Team.
                    </p>
                </div>
            </div>

            <div className="grid gap-3 rounded-md border p-3">
                <label className="flex items-center justify-between gap-3 text-[13px]">
                    <span>
                        <span className="font-medium">Rating after a support chat is closed</span>
                        <span className="block text-[12px] text-muted-foreground">
                            One tap: Good, OK or Poor. Sent only within 24 hours of the customer’s last message; otherwise skipped.
                        </span>
                    </span>
                    <Switch
                        checked={v.csat_enabled}
                        onCheckedChange={(c) => set({ csat_enabled: c })}
                        disabled={!canManage}
                        aria-label="Rating after a support chat"
                    />
                </label>
                {v.csat_enabled && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Question" htmlFor="fb-q">
                            <Input
                                id="fb-q"
                                maxLength={1024}
                                value={v.csat_question}
                                disabled={!canManage}
                                onChange={(e) => set({ csat_question: e.target.value })}
                            />
                        </Field>
                        <Field label="Reply to an answer" htmlFor="fb-t">
                            <Input
                                id="fb-t"
                                maxLength={1024}
                                value={v.csat_thanks}
                                disabled={!canManage}
                                onChange={(e) => set({ csat_thanks: e.target.value })}
                            />
                        </Field>
                    </div>
                )}
            </div>

            <div className="grid gap-3 rounded-md border p-3">
                <label className="flex items-center justify-between gap-3 text-[13px]">
                    <span>
                        <span className="font-medium">Feedback request after a delivered order or a completed booking</span>
                        <span className="block text-[12px] text-muted-foreground">
                            Sent with an approved utility template. Orders: WooCommerce orders marked completed (delivered). Bookings: reported by your booking
                            tool through the API (POST /bookings/completed).
                        </span>
                    </span>
                    <Switch
                        checked={v.review_enabled}
                        onCheckedChange={(c) => set({ review_enabled: c })}
                        disabled={!canManage}
                        aria-label="Feedback request after orders and bookings"
                    />
                </label>
                {v.review_enabled && (
                    <>
                        <div className="flex flex-wrap gap-4 text-[13px]">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={v.review_on_orders}
                                    disabled={!canManage}
                                    onChange={(e) => set({ review_on_orders: e.target.checked })}
                                />
                                After delivered orders
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={v.review_on_bookings}
                                    disabled={!canManage}
                                    onChange={(e) => set({ review_on_bookings: e.target.checked })}
                                />
                                After completed bookings
                            </label>
                        </div>
                        <Field label="Utility template" htmlFor="fb-tpl">
                            <Select
                                value={key}
                                disabled={!canManage}
                                onValueChange={(k) => {
                                    const t = v.templates.find((x) => `${x.name}|${x.language}` === k);
                                    set({
                                        review_template: t
                                            ? { name: t.name, language: t.language, body: Array.from({ length: t.body_variables }, () => '') }
                                            : null,
                                    });
                                }}
                            >
                                <SelectTrigger id="fb-tpl" className="sm:w-96">
                                    <SelectValue placeholder="Choose an approved utility template" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Choose an approved utility template</SelectItem>
                                    {v.templates.map((t) => (
                                        <SelectItem key={t.id} value={`${t.name}|${t.language}`}>
                                            {t.name} ({t.language})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        {v.templates.length === 0 && (
                            <p className="text-[12.5px] text-muted-foreground">No approved utility template yet. Create one in Templates (category Utility).</p>
                        )}
                        {chosen && (
                            <div className="grid gap-2">
                                <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] whitespace-pre-wrap">{chosen.body}</p>
                                {v.review_template!.body.map((value, i) => (
                                    <Field
                                        key={i}
                                        label={`Variable {{${i + 1}}}`}
                                        htmlFor={`fb-v${i}`}
                                        hint="A contact field like {{first_name|there}}, or {{reference}}: the order number or booking reference."
                                    >
                                        <Input
                                            id={`fb-v${i}`}
                                            value={value}
                                            disabled={!canManage}
                                            onChange={(e) =>
                                                set({
                                                    review_template: {
                                                        ...v.review_template!,
                                                        body: v.review_template!.body.map((x, k) => (k === i ? e.target.value : x)),
                                                    },
                                                })
                                            }
                                        />
                                    </Field>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {canManage && draft && (
                <div className="flex gap-2">
                    <Button size="sm" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
                        Cancel
                    </Button>
                </div>
            )}
        </Card>
    );
}
