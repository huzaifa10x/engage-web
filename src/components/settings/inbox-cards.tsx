'use client';

import { useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError, errorMessage } from '@/lib/api';
import { deleteCannedResponse, saveCannedResponse, updateInboxSettings, useCannedResponses, useInboxSettings, usePhoneNumbers } from '@/lib/queries';
import type { CannedResponse, InboxSettings, WeekHours } from '@/lib/types';

const DAYS: [keyof InboxSettings['business_hours']['days'], string][] = [
    ['mon', 'Monday'],
    ['tue', 'Tuesday'],
    ['wed', 'Wednesday'],
    ['thu', 'Thursday'],
    ['fri', 'Friday'],
    ['sat', 'Saturday'],
    ['sun', 'Sunday'],
];

// UAE businesses differ: one click sets the days off, then adjust hours per day.
const WEEKENDS: [string, (keyof WeekHours)[]][] = [
    ['Saturday–Sunday off', ['sat', 'sun']],
    ['Friday–Saturday off', ['fri', 'sat']],
    ['Friday off', ['fri']],
    ['Sunday off', ['sun']],
];

const firstError = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));

/** Seven days, each open or closed with its hours, plus weekend presets. */
function WeekEditor({ week, onChange, disabled }: { week: WeekHours; onChange: (w: WeekHours) => void; disabled: boolean }) {
    const setDay = (day: keyof WeekHours, patch: Partial<WeekHours['mon']>) => onChange({ ...week, [day]: { ...week[day], ...patch } });
    const weekend = (off: (keyof WeekHours)[]) => {
        const next = { ...week };
        for (const [key] of DAYS) next[key] = { ...next[key], open: !off.includes(key) };
        onChange(next);
    };

    return (
        <div className="grid gap-2">
            <div className="flex flex-wrap gap-1.5">
                {WEEKENDS.map(([label, off]) => (
                    <Button key={label} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => weekend(off)}>
                        {label}
                    </Button>
                ))}
            </div>
            {DAYS.map(([key, label]) => (
                <div key={key} className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex w-36 items-center gap-2">
                        <Switch checked={week[key].open} disabled={disabled} aria-label={`${label} open`} onCheckedChange={(open) => setDay(key, { open })} />
                        {label}
                    </label>
                    {week[key].open ? (
                        <>
                            <Input
                                type="time"
                                className="w-32"
                                aria-label={`${label} opens`}
                                disabled={disabled}
                                value={week[key].from}
                                onChange={(e) => setDay(key, { from: e.target.value })}
                            />
                            <span className="text-muted-foreground">to</span>
                            <Input
                                type="time"
                                className="w-32"
                                aria-label={`${label} closes`}
                                disabled={disabled}
                                value={week[key].to}
                                onChange={(e) => setDay(key, { to: e.target.value })}
                            />
                        </>
                    ) : (
                        <span className="text-muted-foreground">Closed</span>
                    )}
                </div>
            ))}
        </div>
    );
}

/** When the team is at work, and how new conversations are handed out. */
/** Saves inbox settings: the card's own fields on top of the latest saved values (two cards share the endpoint). */
function useSaveInboxSettings() {
    const qc = useQueryClient();

    return async (own: Partial<InboxSettings>, label: string) => {
        const base = { ...(qc.getQueryData<InboxSettings>(['inbox-settings']) ?? {}), ...own } as InboxSettings;
        qc.setQueryData(
            ['inbox-settings'],
            await updateInboxSettings({
                business_hours: base.business_hours,
                routing: base.routing,
                ...(base.can.business_hours ? { number_hours: base.number_hours, holidays: base.holidays } : {}),
                reply_target_minutes: base.reply_target_minutes,
                reply_warn_minutes: base.reply_warn_minutes,
                window_warning_minutes: base.window_warning_minutes,
            }),
        );
        toast.success(`${label} saved`);
    };
}

/** Settings › Business hours: opening hours, per-number hours and holidays. */
export function BusinessHoursCard({ canManage }: { canManage: boolean }) {
    const query = useInboxSettings();
    const saveSettings = useSaveInboxSettings();
    const [draft, setDraft] = useState<InboxSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const value = draft ?? query.data ?? null;

    if (!value) return <Skeleton className="h-64" />;

    const hours = value.business_hours;
    const off = !canManage || !hours.enabled;

    const save = async () => {
        setSaving(true);
        try {
            await saveSettings({ business_hours: value.business_hours, number_hours: value.number_hours, holidays: value.holidays }, 'Business hours');
            setDraft(null);
        } catch (e) {
            toast.error(firstError(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle className="flex items-center gap-2">
                        Business hours
                        {hours.enabled && <Badge tone={value.open_now ? 'good' : 'grey'}>{value.open_now ? 'Open now' : 'Closed now'}</Badge>}
                        {hours.enabled && !value.open_now && value.next_open && (
                            <span className="text-[12.5px] font-normal text-muted-foreground">back {value.next_open}</span>
                        )}
                    </CardTitle>
                    <CardDescription>
                        Times are in your workspace time zone ({value.timezone.replace(/_/g, ' ')}). Outside these hours chats are tagged “Arrived after hours”,
                        the after-hours chatbot flow answers, and response times only count opening hours.
                    </CardDescription>
                </div>
                <Switch
                    checked={hours.enabled}
                    disabled={!canManage || !value.can.business_hours}
                    aria-label="Use business hours"
                    onCheckedChange={(enabled) => setDraft({ ...value, business_hours: { ...hours, enabled } })}
                />
            </CardHeader>
            <CardContent className="grid gap-4">
                {!value.can.business_hours && <p className="text-[13px] text-muted-foreground">Business hours are not included in your plan.</p>}
                <div className={hours.enabled ? '' : 'opacity-60'}>
                    <WeekEditor week={hours.days} disabled={off} onChange={(days) => setDraft({ ...value, business_hours: { ...hours, days } })} />
                </div>
                {value.can.business_hours && <NumberHours value={value} disabled={off} onChange={(number_hours) => setDraft({ ...value, number_hours })} />}
                {value.can.business_hours && <Holidays value={value} disabled={off} onChange={(holidays) => setDraft({ ...value, holidays })} />}
                {canManage && (
                    <div className="flex justify-end">
                        <Button onClick={save} disabled={saving || draft === null}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/** Settings › Inbox: automatic assignment and the reply timers. */
export function InboxRulesCard({ canManage }: { canManage: boolean }) {
    const query = useInboxSettings();
    const saveSettings = useSaveInboxSettings();
    const [draft, setDraft] = useState<InboxSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const value = draft ?? query.data ?? null;

    if (!value) return <Skeleton className="h-64" />;

    const save = async () => {
        setSaving(true);
        try {
            await saveSettings(
                {
                    routing: value.routing,
                    reply_target_minutes: value.reply_target_minutes,
                    reply_warn_minutes: value.reply_warn_minutes,
                    window_warning_minutes: value.window_warning_minutes,
                },
                'Inbox settings',
            );
            setDraft(null);
        } catch (e) {
            toast.error(firstError(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Assignment and timers</CardTitle>
                    <CardDescription>Who gets new conversations, and when the waiting timer on a chat turns amber and red.</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field
                    label="New conversations"
                    htmlFor="routing"
                    className="sm:max-w-md"
                    hint={
                        value.can.auto_routing
                            ? 'Automatic assignment picks the teammate who can reply on that number and has the fewest open conversations.'
                            : 'Automatic assignment is not included in your plan.'
                    }
                >
                    <Select
                        value={value.routing}
                        onValueChange={(v) => setDraft({ ...value, routing: v as InboxSettings['routing'] })}
                        disabled={!canManage || !value.can.auto_routing}
                    >
                        <SelectTrigger id="routing">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="manual">Stay unassigned until someone takes them</SelectItem>
                            <SelectItem value="round_robin">Assign automatically to the team</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Waiting timer turns amber after (minutes)" htmlFor="reply-warn" hint="The live “Waiting …” timer on chats that need a reply.">
                        <Input
                            id="reply-warn"
                            type="number"
                            min={0}
                            max={1440}
                            disabled={!canManage}
                            value={value.reply_warn_minutes}
                            onChange={(e) => setDraft({ ...value, reply_warn_minutes: Math.max(0, Number(e.target.value) || 0) })}
                        />
                    </Field>
                    <Field
                        label="Reply target (minutes, in opening hours)"
                        htmlFor="reply-target"
                        hint="The timer turns red after this; Insights › Messages & Team shows the share answered within it."
                    >
                        <Input
                            id="reply-target"
                            type="number"
                            min={1}
                            max={1440}
                            disabled={!canManage}
                            value={value.reply_target_minutes}
                            onChange={(e) => setDraft({ ...value, reply_target_minutes: Math.max(1, Number(e.target.value) || 1) })}
                        />
                    </Field>
                    <Field
                        label="Warn before the 24 h window closes (minutes)"
                        htmlFor="window-warning"
                        hint="Chats that still need a reply show “Reply before window closes”. After the window only a paid template reaches the customer."
                    >
                        <Input
                            id="window-warning"
                            type="number"
                            min={15}
                            max={720}
                            disabled={!canManage}
                            value={value.window_warning_minutes}
                            onChange={(e) => setDraft({ ...value, window_warning_minutes: Math.max(15, Number(e.target.value) || 15) })}
                        />
                    </Field>
                </div>
                {canManage && (
                    <div className="flex justify-end">
                        <Button onClick={save} disabled={saving || draft === null}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/** Different hours for some WhatsApp numbers (e.g. a sales line open later). */
function NumberHours({ value, disabled, onChange }: { value: InboxSettings; disabled: boolean; onChange: (v: InboxSettings['number_hours']) => void }) {
    const numbers = usePhoneNumbers().data ?? [];
    const custom = Object.keys(value.number_hours);
    const free = numbers.filter((n) => !custom.includes(n.id));
    if (numbers.length < 2 && custom.length === 0) return null;

    return (
        <div className="grid gap-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-[13.5px] font-semibold">Different hours for a number</p>
                    <p className="text-[12.5px] text-muted-foreground">Numbers without their own hours use the hours above.</p>
                </div>
                {free.length > 0 && (
                    <Select value="" onValueChange={(id) => onChange({ ...value.number_hours, [id]: value.business_hours.days })} disabled={disabled}>
                        <SelectTrigger size="sm" className="w-56" aria-label="Add hours for a number">
                            <SelectValue placeholder="Add hours for a number…" />
                        </SelectTrigger>
                        <SelectContent>
                            {free.map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                    {[n.display_phone_number, n.verified_name].filter(Boolean).join(' · ')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>
            {custom.map((id) => {
                const n = numbers.find((x) => x.id === id);

                return (
                    <div key={id} className="grid gap-2 border-t pt-3">
                        <div className="flex items-center justify-between">
                            <p className="font-mono text-[13px]">
                                {n ? [n.display_phone_number, n.verified_name].filter(Boolean).join(' · ') : 'Removed number'}
                            </p>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={disabled}
                                onClick={() => {
                                    const next = { ...value.number_hours };
                                    delete next[id];
                                    onChange(next);
                                }}
                            >
                                Use the workspace hours
                            </Button>
                        </div>
                        <WeekEditor week={value.number_hours[id]} disabled={disabled} onChange={(w) => onChange({ ...value.number_hours, [id]: w })} />
                    </div>
                );
            })}
        </div>
    );
}

/** Closed dates, added in advance (Eid, National Day…). */
function Holidays({ value, disabled, onChange }: { value: InboxSettings; disabled: boolean; onChange: (v: InboxSettings['holidays']) => void }) {
    const [date, setDate] = useState('');
    const [name, setName] = useState('');
    const today = new Date().toISOString().slice(0, 10);
    const add = () => {
        if (!date || value.holidays.some((h) => h.date === date)) return;
        onChange([...value.holidays, { date, name: name.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
        setDate('');
        setName('');
    };

    return (
        <div className="grid gap-2 rounded-md border p-3">
            <div>
                <p className="text-[13.5px] font-semibold">Holidays</p>
                <p className="text-[12.5px] text-muted-foreground">Closed all day. The after-hours reply says the next opening day.</p>
            </div>
            {value.holidays.length === 0 && <p className="text-[12.5px] text-muted-foreground">No holidays added.</p>}
            <ul className="grid gap-1">
                {value.holidays.map((h) => (
                    <li key={h.date} className={`flex items-center gap-3 text-[13px] ${h.date < today ? 'text-muted-foreground' : ''}`}>
                        <span className="w-28 font-mono">{h.date}</span>
                        <span className="flex-1">{h.name || 'Holiday'}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${h.date}`}
                            disabled={disabled}
                            onClick={() => onChange(value.holidays.filter((x) => x.date !== h.date))}
                        >
                            <Trash2Icon />
                        </Button>
                    </li>
                ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
                <Input type="date" className="w-44" aria-label="Holiday date" value={date} disabled={disabled} onChange={(e) => setDate(e.target.value)} />
                <Input
                    className="w-56"
                    placeholder="Eid Al Adha"
                    aria-label="Holiday name"
                    value={name}
                    disabled={disabled}
                    maxLength={60}
                    onChange={(e) => setName(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" disabled={disabled || !date} onClick={add}>
                    <PlusIcon /> Add
                </Button>
            </div>
        </div>
    );
}

/** Saved replies the team inserts from the message box. */
export function CannedResponsesCard({ canManage, limit }: { canManage: boolean; limit: number | null }) {
    const qc = useQueryClient();
    const responses = useCannedResponses();
    const [editing, setEditing] = useState<CannedResponse | 'new' | null>(null);
    const [shortcut, setShortcut] = useState('');
    const [body, setBody] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const list = responses.data ?? [];
    const refresh = () => qc.invalidateQueries({ queryKey: ['canned-responses'] });

    const open = (item: CannedResponse | 'new') => {
        setEditing(item);
        setShortcut(item === 'new' ? '' : item.shortcut);
        setBody(item === 'new' ? '' : item.body);
        setError(null);
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            await saveCannedResponse(editing === 'new' || editing === null ? null : editing.id, { shortcut: shortcut.trim(), body: body.trim() });
            setEditing(null);
            void refresh();
        } catch (e) {
            setError(firstError(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Canned responses</CardTitle>
                    <CardDescription>
                        Saved replies for common questions. In the inbox, press the lightning button next to the message box to insert one.
                        {limit !== null && ` ${list.length} of ${limit} used.`}
                    </CardDescription>
                </div>
                {canManage && (
                    <Button variant="outline" onClick={() => open('new')} disabled={limit !== null && list.length >= limit}>
                        <PlusIcon /> Add
                    </Button>
                )}
            </CardHeader>
            <CardContent className="grid gap-2">
                {responses.isLoading && <Skeleton className="h-12" />}
                {!responses.isLoading && list.length === 0 && <p className="text-[13px] text-muted-foreground">No saved replies yet.</p>}
                {list.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 rounded-md border px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <p className="font-mono text-[12.5px] font-semibold text-brand-600">/{r.shortcut}</p>
                            <p className="line-clamp-2 text-[13px] text-muted-foreground">{r.body}</p>
                        </div>
                        {canManage && (
                            <>
                                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.shortcut}`} onClick={() => open(r)}>
                                    <PencilIcon />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Delete ${r.shortcut}`}
                                    onClick={async () => {
                                        if (!window.confirm(`Delete the saved reply “/${r.shortcut}”?`)) return;
                                        await deleteCannedResponse(r.id).catch((e: unknown) => toast.error(errorMessage(e)));
                                        void refresh();
                                    }}
                                >
                                    <Trash2Icon />
                                </Button>
                            </>
                        )}
                    </div>
                ))}
            </CardContent>

            <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing === 'new' ? 'New canned response' : 'Edit canned response'}</DialogTitle>
                        <DialogDescription>Emoji and line breaks are kept exactly as you type them.</DialogDescription>
                    </DialogHeader>
                    <FormError message={error} />
                    <Field label="Shortcut" htmlFor="cr-shortcut" hint="Lowercase letters, numbers, dashes. Example: opening-hours">
                        <Input
                            id="cr-shortcut"
                            value={shortcut}
                            maxLength={40}
                            onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                        />
                    </Field>
                    <Field label="Reply" htmlFor="cr-body">
                        <textarea
                            id="cr-body"
                            value={body}
                            maxLength={4096}
                            onChange={(e) => setBody(e.target.value)}
                            className="field-sizing-content min-h-28 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                        />
                    </Field>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={saving || !shortcut.trim() || !body.trim()}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
