'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ChatbotOptions, FlowSettings, NodeConfig, Variable } from '@/lib/chatbots';

import { Hint, LimitedInput, Row, TargetPicker, Toggle, VarText } from './inspector-fields';

type Patch = (patch: Partial<NodeConfig>) => void;

/** Blocks that send free text: they take a fallback template for when the 24-hour window has closed. */
export const FALLBACK_TYPES = new Set(['message', 'media', 'buttons', 'list', 'product', 'url', 'form', 'question', 'ask_media', 'location', 'rating']);

/**
 * The approved template this step sends instead when the customer’s 24-hour window has closed
 * (the step runs again when they answer). Without one, the flow’s re-opening template is used.
 */
export function FallbackTemplatePicker({
    c,
    set,
    options,
    settings,
}: {
    c: NodeConfig;
    set: Patch;
    options: ChatbotOptions | undefined;
    settings: FlowSettings;
}) {
    const templates = options?.templates ?? [];
    const current = c.fallback_template as { name: string; language: string; body: string[] } | null | undefined;
    const key = current ? `${current.name}|${current.language}` : '__none__';
    const missing = current && !templates.some((t) => t.name === current.name && t.language === current.language);
    const otherwise = settings.reopen_template
        ? `the flow’s re-opening template (${settings.reopen_template.name})`
        : settings.engine_level === 1
          ? 'nothing: the bot stops'
          : 'nothing: the chat goes to your team with a note';

    return (
        <Row label="If the 24-hour window has closed" hint={`Sent instead of this step; the step runs when the customer replies. Without one: ${otherwise}.`}>
            <Select
                value={missing ? '__missing__' : key}
                onValueChange={(v) => {
                    const t = templates.find((x) => `${x.name}|${x.language}` === v);
                    set({ fallback_template: t ? { name: t.name, language: t.language, body: t.variables.body.map(() => '{{contact.first_name}}') } : null });
                }}
            >
                <SelectTrigger aria-label="Fallback template">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__none__">No step template</SelectItem>
                    {missing && <SelectItem value="__missing__">{current?.name} (no longer approved)</SelectItem>}
                    {templates.map((t) => (
                        <SelectItem key={`${t.name}|${t.language}|${t.waba_account_id}`} value={`${t.name}|${t.language}`}>
                            {t.name} · {t.language}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {current?.body.map((v, i) => (
                <Input
                    key={i}
                    value={v}
                    aria-label={`Fallback template variable ${i + 1}`}
                    onChange={(e) => set({ fallback_template: { ...current, body: current.body.map((x, j) => (j === i ? e.target.value : x)) } })}
                    className="h-8 text-[12.5px]"
                />
            ))}
        </Row>
    );
}

/** Buttons and list menus: also save the tapped option, and the message when the reply isn’t one of the options. */
export function MenuAnswerFields({ c, set, options, vars }: { c: NodeConfig; set: Patch; options: ChatbotOptions | undefined; vars: Variable[] }) {
    const saving = c.save_to !== null && c.save_to !== undefined;

    return (
        <>
            <Toggle
                label="Save the chosen option"
                hint="The option’s title is written to a contact field or a variable, e.g. the area or department."
                checked={saving}
                onChange={(on) => set({ save_to: on ? 'var:choice' : null })}
            />
            {saving && <TargetPicker label="Save the option to" value={c.save_to} options={options} onChange={(save_to) => set({ save_to })} />}
            <VarText
                label="When the reply isn’t one of the options"
                value={c.error_text ?? null}
                onChange={(v) => set({ error_text: v || null })}
                vars={vars}
                max={300}
                rows={2}
                placeholder="Please tap one of the options below 👇"
                hint="Sent before showing the options again. Empty = the flow’s retry message."
            />
        </>
    );
}

/** Date answers: how far ahead the customer may choose (a booking window). */
export function BookingWindow({ c, set }: { c: NodeConfig; set: Patch }) {
    return (
        <Row
            label="Latest date allowed"
            hint="In days from today. Empty = no limit. A later date is refused with “please choose a date within the next N days”."
        >
            <div className="flex items-center gap-2">
                <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={c.window_days ?? ''}
                    onChange={(e) => set({ window_days: e.target.value === '' ? null : Math.max(1, Math.min(3650, Math.round(Number(e.target.value)))) })}
                    placeholder="No limit"
                    aria-label="Booking window in days"
                    className="w-28"
                />
                <span className="text-muted-foreground">days ahead</span>
            </div>
        </Row>
    );
}

/** Handover and End: a label for reporting (“Qualified lead”), shown in Flow insights and Runs. */
export function OutcomeInput({ c, set }: { c: NodeConfig; set: Patch }) {
    return (
        <LimitedInput
            label="Outcome"
            value={c.outcome ?? null}
            onChange={(outcome) => set({ outcome: outcome || null })}
            max={60}
            placeholder="Qualified lead"
            hint="Optional. Counted in Flow insights and shown on each run, so you can see how chats ended."
        />
    );
}

/** API call: the answer the Test chat uses instead of calling (nothing is sent from a test). */
export function SampleResponse({ c, set }: { c: NodeConfig; set: Patch }) {
    let invalid = false;
    if (c.sample_body) {
        try {
            JSON.parse(c.sample_body);
        } catch {
            invalid = true;
        }
    }

    return (
        <Row label="Sample answer for the Test chat" hint="The Test chat never calls the address: it uses this answer, so you can check the mapping below.">
            <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                <Input
                    type="number"
                    min={100}
                    max={599}
                    value={c.sample_status ?? ''}
                    onChange={(e) => set({ sample_status: e.target.value === '' ? null : Math.max(100, Math.min(599, Math.round(Number(e.target.value)))) })}
                    placeholder="200"
                    aria-label="Sample status code"
                />
                <textarea
                    rows={4}
                    value={c.sample_body ?? ''}
                    maxLength={5000}
                    onChange={(e) => set({ sample_body: e.target.value || null })}
                    placeholder='{"lead": {"id": "SAMPLE-1"}}'
                    aria-label="Sample response body"
                    className="w-full rounded-lg border border-input px-3 py-2 font-mono text-[12px]"
                />
            </div>
            {invalid && <Hint tone="warn">This isn’t valid JSON, so nothing can be mapped from it.</Hint>}
        </Row>
    );
}
