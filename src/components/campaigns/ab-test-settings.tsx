'use client';

import { Field } from '@/components/app/field';
import { emptySelection, TemplatePicker, type TemplateSelection } from '@/components/templates/template-picker';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { AbGoal, AbKind, AbTestForm, CampaignAudience } from '@/lib/types';

export type AbState = {
    enabled: boolean;
    kind: AbKind;
    goal: AbGoal;
    minSample: number;
    testPercent: 20 | 100;
    autoSendWinner: boolean;
    delayHours: number;
    selection: TemplateSelection;
};

export const emptyAb: AbState = {
    enabled: false,
    kind: 'template',
    goal: 'reply',
    minSample: 200,
    testPercent: 100,
    autoSendWinner: true,
    delayHours: 4,
    selection: emptySelection,
};

export const KIND_LABELS: Record<AbKind, string> = { template: 'Template text', button: 'Button', send_time: 'Send time' };

export const GOAL_LABELS: Record<AbGoal, string> = {
    reply: 'Reply rate',
    click: 'Button click rate',
    lead: 'Leads (from conversion rules)',
    purchase: 'Purchases (from conversion rules)',
};

/** What is sent to the API for an A/B test (null when off). */
export function abForm(ab: AbState): AbTestForm | null {
    if (!ab.enabled) return null;
    const t = ab.selection.template;
    return {
        enabled: true,
        kind: ab.kind,
        goal: ab.goal,
        min_sample: ab.minSample,
        test_percent: ab.testPercent,
        auto_send_winner: ab.testPercent === 20 && ab.autoSendWinner,
        b_delay_hours: ab.kind === 'send_time' ? ab.delayHours : null,
        template_id: ab.kind === 'send_time' ? null : (t?.id ?? null),
        media_id: ab.kind === 'send_time' ? null : (ab.selection.media?.id ?? null),
        variables:
            ab.kind === 'send_time' || !t
                ? undefined
                : {
                      header: t.variables.header.map((_, i) => ab.selection.header[i] ?? ''),
                      body: t.variables.body.map((_, i) => ab.selection.body[i] ?? ''),
                      buttons: ab.selection.buttons,
                  },
    };
}

const money = (n: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

/** A/B test settings in the campaign dialog: what to test, the goal, the sample, and variant B. */
export function AbTestSettings({
    value,
    onChange,
    wabaAccountId,
    category,
    audience,
}: {
    value: AbState;
    onChange: (v: AbState) => void;
    wabaAccountId: string | null;
    category: string | null;
    audience: CampaignAudience | undefined;
}) {
    const set = (patch: Partial<AbState>) => onChange({ ...value, ...patch });
    const eligible = audience?.eligible ?? 0;
    const inTest = value.testPercent === 100 ? eligible : Math.min(eligible, 2 * Math.ceil((eligible * value.testPercent) / 200));
    const perVariant = Math.floor(inTest / 2);
    const estimate = audience?.cost_estimate;
    const share = eligible > 0 ? perVariant / eligible : 0;
    const consent = audience?.consent;

    return (
        <div className="grid gap-3 rounded-md border px-3 py-2.5" role="region" aria-label="A/B test">
            <label className="flex items-center justify-between gap-3 text-[13px]">
                <span>
                    <span className="font-semibold">A/B test</span>
                    <span className="block text-[12px] text-muted-foreground">
                        Send two versions to a random, even split of the audience. Each contact gets only one.
                    </span>
                </span>
                <Switch checked={value.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label="A/B test" />
            </label>
            {value.enabled && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="What to test" htmlFor="ab-kind">
                            <Select value={value.kind} onValueChange={(v) => set({ kind: v as AbKind })}>
                                <SelectTrigger id="ab-kind" aria-label="What to test">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(KIND_LABELS) as AbKind[]).map((k) => (
                                        <SelectItem key={k} value={k}>
                                            {KIND_LABELS[k]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Goal" htmlFor="ab-goal">
                            <Select value={value.goal} onValueChange={(v) => set({ goal: v as AbGoal })}>
                                <SelectTrigger id="ab-goal" aria-label="Goal">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(GOAL_LABELS) as AbGoal[]).map((g) => (
                                        <SelectItem key={g} value={g}>
                                            {GOAL_LABELS[g]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Minimum sample per variant" htmlFor="ab-min" hint="Messages sent. No winner is declared below it.">
                            <Input
                                id="ab-min"
                                type="number"
                                min={10}
                                max={100000}
                                value={value.minSample}
                                onChange={(e) => set({ minSample: Math.max(10, Number(e.target.value) || 10) })}
                            />
                        </Field>
                        <Field label="Who is in the test" htmlFor="ab-share">
                            <Select value={String(value.testPercent)} onValueChange={(v) => set({ testPercent: Number(v) === 20 ? 20 : 100 })}>
                                <SelectTrigger id="ab-share" aria-label="Who is in the test">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="100">The whole list (half A, half B)</SelectItem>
                                    <SelectItem value="20">20% of the list, then the winner to the other 80%</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                    {value.testPercent === 20 && (
                        <label className="flex items-start gap-2 text-[13px]">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={value.autoSendWinner}
                                onChange={(e) => set({ autoSendWinner: e.target.checked })}
                            />
                            <span>
                                Send the winner to the other 80% automatically
                                <span className="block text-[12px] text-muted-foreground">
                                    Only when a winner is clear. Otherwise you choose from the campaign’s results.
                                </span>
                            </span>
                        </label>
                    )}

                    {value.kind === 'send_time' ? (
                        <Field label="Send variant B this many hours after variant A" htmlFor="ab-delay" hint="Same template, 1 to 72 hours later.">
                            <Input
                                id="ab-delay"
                                type="number"
                                min={1}
                                max={72}
                                className="sm:w-32"
                                value={value.delayHours}
                                onChange={(e) => set({ delayHours: Math.min(72, Math.max(1, Number(e.target.value) || 1)) })}
                            />
                        </Field>
                    ) : (
                        <div className="grid gap-2">
                            <p className="text-[13px] font-semibold">
                                Variant B: {value.kind === 'button' ? 'a template with a different button' : 'a template with different text'}
                            </p>
                            {!category && <p className="text-[12.5px] text-muted-foreground">Choose variant A’s template first.</p>}
                            {category && (
                                <TemplatePicker
                                    wabaAccountId={wabaAccountId}
                                    category={category}
                                    idPrefix="ab-tpl"
                                    value={value.selection}
                                    onChange={(v) => set({ selection: v })}
                                />
                            )}
                        </div>
                    )}

                    {audience && eligible > 0 && (
                        <div className="grid gap-1 rounded-md bg-muted px-3 py-2 text-[12.5px]" aria-label="Per variant">
                            <p>
                                Each variant goes to about <span className="font-semibold">{perVariant.toLocaleString()}</span> contacts
                                {value.testPercent === 20 && ` (${(eligible - inTest).toLocaleString()} wait for the winner)`}.
                            </p>
                            {estimate && (
                                <p>Estimated Meta cost per variant: about {money(estimate.total * share, estimate.currency)} (same category, same rates).</p>
                            )}
                            {consent && (
                                <p>
                                    Consent per variant: about {Math.round(consent.opted_in * share).toLocaleString()} opted in
                                    {` · ${Math.round(consent.unknown * share).toLocaleString()} unknown consent`}.
                                </p>
                            )}
                            {perVariant < value.minSample && (
                                <p className="font-medium text-warn">
                                    Below the minimum sample of {value.minSample.toLocaleString()} per variant: no winner can be declared. Grow the audience or
                                    lower the minimum.
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
