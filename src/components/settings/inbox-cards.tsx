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
import { deleteCannedResponse, saveCannedResponse, updateInboxSettings, useCannedResponses, useInboxSettings } from '@/lib/queries';
import type { CannedResponse, InboxSettings } from '@/lib/types';

const DAYS: [keyof InboxSettings['business_hours']['days'], string][] = [
    ['mon', 'Monday'],
    ['tue', 'Tuesday'],
    ['wed', 'Wednesday'],
    ['thu', 'Thursday'],
    ['fri', 'Friday'],
    ['sat', 'Saturday'],
    ['sun', 'Sunday'],
];

const firstError = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));

/** When the team is at work, and how new conversations are handed out. */
export function BusinessHoursCard({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const query = useInboxSettings();
    const [draft, setDraft] = useState<InboxSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const value = draft ?? query.data ?? null;

    if (!value) return <Skeleton className="h-64" />;

    const hours = value.business_hours;
    const setDay = (day: keyof typeof hours.days, patch: Partial<(typeof hours.days)['mon']>) =>
        setDraft({ ...value, business_hours: { ...hours, days: { ...hours.days, [day]: { ...hours.days[day], ...patch } } } });

    const save = async () => {
        setSaving(true);
        try {
            qc.setQueryData(['inbox-settings'], await updateInboxSettings({ business_hours: value.business_hours, routing: value.routing }));
            setDraft(null);
            toast.success('Inbox settings saved');
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
                        Business hours and routing
                        {hours.enabled && <Badge tone={value.open_now ? 'good' : 'grey'}>{value.open_now ? 'Open now' : 'Closed now'}</Badge>}
                    </CardTitle>
                    <CardDescription>
                        Times are in your workspace time zone ({value.timezone.replace(/_/g, ' ')}). Business hours let the auto reply answer only while the
                        team is away.
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
                <div className={`grid gap-2 ${hours.enabled ? '' : 'opacity-60'}`}>
                    {DAYS.map(([key, label]) => (
                        <div key={key} className="flex flex-wrap items-center gap-3 text-sm">
                            <label className="flex w-36 items-center gap-2">
                                <Switch
                                    checked={hours.days[key].open}
                                    disabled={!canManage || !hours.enabled}
                                    aria-label={`${label} open`}
                                    onCheckedChange={(open) => setDay(key, { open })}
                                />
                                {label}
                            </label>
                            {hours.days[key].open ? (
                                <>
                                    <Input
                                        type="time"
                                        className="w-32"
                                        aria-label={`${label} opens`}
                                        disabled={!canManage || !hours.enabled}
                                        value={hours.days[key].from}
                                        onChange={(e) => setDay(key, { from: e.target.value })}
                                    />
                                    <span className="text-muted-foreground">to</span>
                                    <Input
                                        type="time"
                                        className="w-32"
                                        aria-label={`${label} closes`}
                                        disabled={!canManage || !hours.enabled}
                                        value={hours.days[key].to}
                                        onChange={(e) => setDay(key, { to: e.target.value })}
                                    />
                                </>
                            ) : (
                                <span className="text-muted-foreground">Closed</span>
                            )}
                        </div>
                    ))}
                </div>
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
