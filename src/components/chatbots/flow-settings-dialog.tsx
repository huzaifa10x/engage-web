'use client';

import { useState } from 'react';

import { TagInput } from '@/components/contacts/tag-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { type ChatbotOptions, type FlowSettings, LANGUAGES } from '@/lib/chatbots';
import { cn } from '@/lib/utils';

const TABS = [
    ['timing', 'Timing'],
    ['answers', 'Answers & words'],
    ['languages', 'Languages'],
    ['window', '24-hour window'],
] as const;

/** Timers, retries, the words that always work, languages and the 24-hour window. Applies to the next published version. */
export function FlowSettingsDialog({
    open,
    onOpenChange,
    settings,
    options,
    readOnly,
    onSave,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    settings: FlowSettings;
    options: ChatbotOptions | undefined;
    readOnly: boolean;
    onSave: (s: FlowSettings) => void;
}) {
    const [form, setForm] = useState<FlowSettings>(settings);
    const [tab, setTab] = useState<(typeof TABS)[number][0]>('timing');
    const [loadedFor, setLoadedFor] = useState(false);
    if (open && !loadedFor) {
        setLoadedFor(true);
        setForm(settings);
    }
    if (!open && loadedFor) setLoadedFor(false);

    const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v || min))));
    const set = (patch: Partial<FlowSettings>) => setForm((f) => ({ ...f, ...patch }));
    const area = 'rounded-lg border border-input px-3 py-2 text-[13px] w-full';
    const templates = options?.templates ?? [];
    const reopenKey = form.reopen_template ? `${form.reopen_template.name}|${form.reopen_template.language}` : '__none__';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Flow settings</DialogTitle>
                    <DialogDescription>Saved with the draft; customers get them with the next published version.</DialogDescription>
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
                <fieldset disabled={readOnly} className="grid gap-5">
                    {tab === 'timing' && (
                        <section className="grid gap-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <Label htmlFor="fs-rem">Nudge when the customer stops answering</Label>
                                    <p className="text-[12px] text-muted-foreground">One reminder, inside the 24-hour window. 10–15 minutes works well.</p>
                                </div>
                                <Switch
                                    id="fs-rem"
                                    checked={form.reminder_minutes !== null}
                                    onCheckedChange={(v) => set({ reminder_minutes: v ? 12 : null })}
                                />
                            </div>
                            {form.reminder_minutes !== null && (
                                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                                    <div>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={720}
                                            value={form.reminder_minutes}
                                            onChange={(e) => set({ reminder_minutes: num(e.target.value, 1, 720) })}
                                            aria-label="Reminder after minutes"
                                        />
                                        <p className="mt-1 text-[11px] text-muted-foreground">minutes</p>
                                    </div>
                                    <textarea
                                        rows={2}
                                        value={form.reminder_text}
                                        maxLength={1000}
                                        onChange={(e) => set({ reminder_text: e.target.value })}
                                        className={area}
                                        aria-label="Reminder text"
                                    />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="fs-ab">Give up after (minutes)</Label>
                                    <Input
                                        id="fs-ab"
                                        type="number"
                                        min={5}
                                        max={1440}
                                        value={form.abandon_minutes}
                                        onChange={(e) => set({ abandon_minutes: num(e.target.value, 5, 1440) })}
                                    />
                                    <p className="text-[11.5px] text-muted-foreground">30–60 is typical. Marked Abandoned; the chat stays open in the inbox.</p>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="fs-res">Continue where they left within (minutes)</Label>
                                    <Input
                                        id="fs-res"
                                        type="number"
                                        min={0}
                                        max={1440}
                                        value={form.resume_minutes}
                                        onChange={(e) => set({ resume_minutes: num(e.target.value, 0, 1440) })}
                                    />
                                    <p className="text-[11.5px] text-muted-foreground">Later than that, they start again. Answers are kept up to 24 hours.</p>
                                </div>
                            </div>
                            <div className="grid gap-2 rounded-lg border p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <Label htmlFor="fs-auto">Auto-resume: give conversations back to the bot</Label>
                                        <p className="text-[12px] text-muted-foreground">
                                            After a handover, the bot stays quiet while your team handles the chat. With auto-resume on, once no agent has
                                            replied for this long, the customer’s next message goes to the bot again. Off: only “Hand back to bot” or closing
                                            the conversation returns it.
                                        </p>
                                    </div>
                                    <Switch
                                        id="fs-auto"
                                        checked={form.auto_resume_minutes !== null}
                                        onCheckedChange={(v) => set({ auto_resume_minutes: v ? 1440 : null })}
                                    />
                                </div>
                                {form.auto_resume_minutes !== null && (
                                    <AutoResumeDuration minutes={form.auto_resume_minutes} onChange={(m) => set({ auto_resume_minutes: m })} />
                                )}
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="fs-tag">Tag customers who leave midway (optional)</Label>
                                <Input
                                    id="fs-tag"
                                    list="fs-tags"
                                    value={form.abandoned_tag ?? ''}
                                    maxLength={40}
                                    onChange={(e) => set({ abandoned_tag: e.target.value || null })}
                                    placeholder="e.g. Bot abandoned"
                                />
                                <datalist id="fs-tags">
                                    {(options?.tags ?? []).map((t) => (
                                        <option key={t} value={t} />
                                    ))}
                                </datalist>
                            </div>
                        </section>
                    )}

                    {tab === 'answers' && (
                        <section className="grid gap-4">
                            <div className="grid gap-1.5">
                                <Label>Answers the bot does not understand</Label>
                                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                                    <div>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={5}
                                            value={form.retry_limit}
                                            onChange={(e) => set({ retry_limit: num(e.target.value, 0, 5) })}
                                            aria-label="Retries"
                                        />
                                        <p className="mt-1 text-[11px] text-muted-foreground">times asked again</p>
                                    </div>
                                    <textarea
                                        rows={2}
                                        value={form.invalid_text}
                                        maxLength={1000}
                                        onChange={(e) => set({ invalid_text: e.target.value })}
                                        className={area}
                                        aria-label="Retry message"
                                    />
                                </div>
                                <p className="text-[11.5px] text-muted-foreground">
                                    The default for every menu and question; each block can change it under “If the customer replies with something else”.
                                </p>
                            </div>
                            <div className="grid gap-1.5">
                                <Label>Reply to voice notes, stickers and emoji</Label>
                                <textarea
                                    rows={2}
                                    value={form.non_text_text}
                                    maxLength={1000}
                                    onChange={(e) => set({ non_text_text: e.target.value })}
                                    className={area}
                                    aria-label="Non-text reply"
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label>Said when the bot connects the customer to a person (and the flow has no Handoff block)</Label>
                                <textarea
                                    rows={2}
                                    value={form.escalate_text}
                                    maxLength={1000}
                                    onChange={(e) => set({ escalate_text: e.target.value })}
                                    className={area}
                                    aria-label="Escalation text"
                                />
                            </div>
                            <p className="text-[12px] font-bold tracking-wider text-muted-foreground uppercase">Words that always work</p>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="grid gap-1.5">
                                    <Label>Talk to a person</Label>
                                    <TagInput
                                        value={form.handoff_keywords}
                                        onChange={(v) => set({ handoff_keywords: v.map((w) => w.toLowerCase()) })}
                                        placeholder="agent, human…"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label>Main menu</Label>
                                    <TagInput
                                        value={form.menu_keywords}
                                        onChange={(v) => set({ menu_keywords: v.map((w) => w.toLowerCase()) })}
                                        placeholder="menu…"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label>Previous question</Label>
                                    <TagInput
                                        value={form.back_keywords}
                                        onChange={(v) => set({ back_keywords: v.map((w) => w.toLowerCase()) })}
                                        placeholder="back…"
                                    />
                                </div>
                            </div>
                            <p className="text-[11.5px] text-muted-foreground">
                                STOP always unsubscribes the customer and ends the bot conversation; the bot never answers it.
                            </p>
                        </section>
                    )}

                    {tab === 'languages' && (
                        <section className="grid gap-4">
                            <div className="grid gap-1.5">
                                <Label>Languages of this flow</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(LANGUAGES).map(([code, label]) => {
                                        const on = form.languages.includes(code);

                                        return (
                                            <button
                                                key={code}
                                                type="button"
                                                aria-pressed={on}
                                                onClick={() =>
                                                    set({
                                                        languages: on
                                                            ? form.languages.length > 1
                                                                ? form.languages.filter((l) => l !== code)
                                                                : form.languages
                                                            : [...form.languages, code],
                                                    })
                                                }
                                                className={cn(
                                                    'rounded-full border px-2.5 py-1 text-[12px] font-semibold',
                                                    on ? 'border-brand-500 bg-brand-50 text-brand-600' : 'text-muted-foreground',
                                                )}
                                            >
                                                {label}
                                                {form.languages[0] === code && ' · default'}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[11.5px] text-muted-foreground">
                                    The first is the default. Add the translations in each block (language tabs). Arabic and Urdu are shown right-to-left.
                                </p>
                            </div>
                            {form.languages.length > 1 && (
                                <>
                                    <div className="grid gap-1.5">
                                        <Label>Default language</Label>
                                        <Select
                                            value={form.languages[0]}
                                            onValueChange={(v) => set({ languages: [v, ...form.languages.filter((l) => l !== v)] })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {form.languages.map((l) => (
                                                    <SelectItem key={l} value={l}>
                                                        {LANGUAGES[l] ?? l}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label>The customer’s language comes from</Label>
                                        <Select
                                            value={form.language_field ?? '__script__'}
                                            onValueChange={(v) => set({ language_field: v === '__script__' ? null : v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__script__">The way they write (Arabic letters → Arabic)</SelectItem>
                                                <SelectItem value="language">The contact field “language”</SelectItem>
                                                {(options?.fields ?? [])
                                                    .filter((f) => f.key !== 'language')
                                                    .map((f) => (
                                                        <SelectItem key={f.key} value={f.key}>
                                                            The contact field “{f.label}”
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[11.5px] text-muted-foreground">
                                            If the field is empty, the way they write decides; otherwise the default language.
                                        </p>
                                    </div>
                                </>
                            )}
                        </section>
                    )}

                    {tab === 'window' && (
                        <section className="grid gap-3">
                            <p className="text-[12.5px] leading-relaxed text-ink-2">
                                WhatsApp delivers normal messages only within 24 hours of the customer’s last message. After that only approved templates
                                arrive. Pick a template the bot sends when the window has closed (e.g. after a long wait): it asks the customer to reply, and
                                the step runs as soon as they do.
                            </p>
                            <div className="grid gap-1.5">
                                <Label>Re-opening template</Label>
                                <Select
                                    value={reopenKey}
                                    onValueChange={(v) => {
                                        const t = templates.find((x) => `${x.name}|${x.language}` === v);
                                        set({
                                            reopen_template: t
                                                ? { name: t.name, language: t.language, body: t.variables.body.map(() => '{{contact.first_name}}') }
                                                : null,
                                        });
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">None — stop the bot when the window has closed</SelectItem>
                                        {templates.map((t) => (
                                            <SelectItem key={`${t.name}|${t.language}|${t.waba_account_id}`} value={`${t.name}|${t.language}`}>
                                                {t.name} · {t.language}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.reopen_template &&
                                form.reopen_template.body.map((v, i) => (
                                    <div key={i} className="grid gap-1.5">
                                        <Label>Body variable {i + 1}</Label>
                                        <Input
                                            value={v}
                                            onChange={(e) =>
                                                set({
                                                    reopen_template: form.reopen_template
                                                        ? {
                                                              ...form.reopen_template,
                                                              body: form.reopen_template.body.map((x, n) => (n === i ? e.target.value : x)),
                                                          }
                                                        : null,
                                                })
                                            }
                                        />
                                    </div>
                                ))}
                        </section>
                    )}
                </fieldset>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    {!readOnly && (
                        <Button
                            onClick={() => {
                                onSave(form);
                                onOpenChange(false);
                            }}
                        >
                            Save settings
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Auto-resume time in minutes, hours or days (5 minutes to 7 days, as the server allows). */
function AutoResumeDuration({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
    const unit = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;
    const clamp = (m: number) => Math.max(5, Math.min(10080, Math.round(m)));

    return (
        <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted-foreground">After</span>
            <Input
                type="number"
                min={1}
                value={minutes / unit}
                onChange={(e) => onChange(clamp(Number(e.target.value || 1) * unit))}
                className="h-8 w-20"
                aria-label="Auto-resume after (amount)"
            />
            <Select value={String(unit)} onValueChange={(u) => onChange(clamp((minutes / unit) * Number(u)))}>
                <SelectTrigger size="sm" className="w-28" aria-label="Auto-resume after (unit)">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="1">minutes</SelectItem>
                    <SelectItem value="60">hours</SelectItem>
                    <SelectItem value="1440">days</SelectItem>
                </SelectContent>
            </Select>
            <span className="text-[12.5px] text-muted-foreground">without an agent reply</span>
        </div>
    );
}
