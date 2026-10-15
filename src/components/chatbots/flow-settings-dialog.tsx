'use client';

import { useState } from 'react';

import { TagInput } from '@/components/contacts/tag-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { FlowSettings } from '@/lib/chatbots';

/** Timers, retries and the words that always work. Applies to the next published version. */
export function FlowSettingsDialog({
    open,
    onOpenChange,
    settings,
    tags,
    readOnly,
    onSave,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    settings: FlowSettings;
    tags: string[];
    readOnly: boolean;
    onSave: (s: FlowSettings) => void;
}) {
    const [form, setForm] = useState<FlowSettings>(settings);
    const [loadedFor, setLoadedFor] = useState(false);
    if (open && !loadedFor) {
        setLoadedFor(true);
        setForm(settings);
    }
    if (!open && loadedFor) setLoadedFor(false);

    const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v || min))));
    const set = (patch: Partial<FlowSettings>) => setForm((f) => ({ ...f, ...patch }));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Flow settings</DialogTitle>
                    <DialogDescription>Saved with the draft; customers get them with the next published version.</DialogDescription>
                </DialogHeader>
                <fieldset disabled={readOnly} className="grid gap-5">
                    <section className="grid gap-3">
                        <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Timers</p>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <Label htmlFor="fs-rem">Reminder when the customer stops answering</Label>
                                <p className="text-[12px] text-muted-foreground">One nudge, inside the 24-hour window.</p>
                            </div>
                            <Switch id="fs-rem" checked={form.reminder_minutes !== null} onCheckedChange={(v) => set({ reminder_minutes: v ? 12 : null })} />
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
                                    className="rounded-md border border-input px-3 py-2 text-[13px]"
                                    aria-label="Reminder text"
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="fs-ab">Stop the bot after (minutes)</Label>
                                <Input
                                    id="fs-ab"
                                    type="number"
                                    min={5}
                                    max={1440}
                                    value={form.abandon_minutes}
                                    onChange={(e) => set({ abandon_minutes: num(e.target.value, 5, 1440) })}
                                />
                                <p className="text-[11.5px] text-muted-foreground">Marked Abandoned; the chat stays open in the inbox.</p>
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
                                <p className="text-[11.5px] text-muted-foreground">Later than that, they start from the main menu.</p>
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="fs-auto">Give a conversation back to the bot after a person has been silent for (minutes)</Label>
                            <Input
                                id="fs-auto"
                                type="number"
                                min={0}
                                max={10080}
                                placeholder="Never (only “Hand back to bot” or closing the chat)"
                                value={form.auto_resume_minutes ?? ''}
                                onChange={(e) =>
                                    set({ auto_resume_minutes: e.target.value === '' || Number(e.target.value) === 0 ? null : num(e.target.value, 5, 10080) })
                                }
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="fs-tag">Tag abandoned contacts (optional)</Label>
                            <Input
                                id="fs-tag"
                                list="fs-tags"
                                value={form.abandoned_tag ?? ''}
                                maxLength={40}
                                onChange={(e) => set({ abandoned_tag: e.target.value || null })}
                                placeholder="e.g. Bot abandoned"
                            />
                            <datalist id="fs-tags">
                                {tags.map((t) => (
                                    <option key={t} value={t} />
                                ))}
                            </datalist>
                        </div>
                    </section>

                    <section className="grid gap-3">
                        <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Answers the bot does not understand</p>
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
                                <p className="mt-1 text-[11px] text-muted-foreground">retries, then “No match”</p>
                            </div>
                            <textarea
                                rows={2}
                                value={form.invalid_text}
                                maxLength={1000}
                                onChange={(e) => set({ invalid_text: e.target.value })}
                                className="rounded-md border border-input px-3 py-2 text-[13px]"
                                aria-label="Retry message"
                            />
                        </div>
                    </section>

                    <section className="grid gap-3">
                        <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Words that always work</p>
                        <div className="grid gap-1.5">
                            <Label>Talk to a person</Label>
                            <TagInput
                                value={form.handoff_keywords}
                                onChange={(v) => set({ handoff_keywords: v.map((w) => w.toLowerCase()) })}
                                placeholder="agent, human…"
                            />
                            <p className="text-[11.5px] text-muted-foreground">Typed at any step, these go to the flow&apos;s Handoff block.</p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Back to the main menu</Label>
                            <TagInput value={form.menu_keywords} onChange={(v) => set({ menu_keywords: v.map((w) => w.toLowerCase()) })} placeholder="menu…" />
                        </div>
                        <p className="text-[11.5px] text-muted-foreground">
                            STOP always unsubscribes the customer and ends the bot conversation; the bot never answers it.
                        </p>
                    </section>
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
