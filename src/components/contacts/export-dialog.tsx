'use client';

import { useQuery } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';

import { Field } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { ContactFilters } from '@/lib/queries';
import type { PhoneNumber, Segment, Tag } from '@/lib/types';

const ALL = '__all__';

type ExportFilters = {
    segment_id?: string;
    tag?: string;
    consent?: string;
    synced_from?: string;
    q?: string;
    added_from?: string;
    added_to?: string;
    filter?: string;
};

const query = (f: ExportFilters) => Object.fromEntries(Object.entries(f).filter((e): e is [string, string] => Boolean(e[1])));

/**
 * Choose which contacts go into the CSV: all of them, or narrowed by segment, tag, consent, the
 * number they were synced from, the date they were added and a search. Starts from the filters on
 * screen and shows how many contacts the file will contain.
 */
export function ExportContactsDialog({
    open,
    onOpenChange,
    current,
    segments,
    tags,
    syncNumbers,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    current: ContactFilters;
    segments: Segment[];
    tags: Tag[];
    syncNumbers: PhoneNumber[];
}) {
    const fromScreen = (): ExportFilters => ({
        segment_id: current.segment_id,
        tag: current.tag,
        consent: current.consent,
        synced_from: current.synced_from,
        q: current.q,
        filter: current.filter,
    });
    const [f, setF] = useState<ExportFilters>(fromScreen);
    const [wasOpen, setWasOpen] = useState(open);
    // Each time the dialog opens it starts from what the list shows right now.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setF(fromScreen());
    }

    const set = (patch: Partial<ExportFilters>) => setF((prev) => ({ ...prev, ...patch }));
    const params = query(f);
    const count = useQuery({
        queryKey: ['contacts-export-count', params],
        queryFn: () => api<{ data: { count: number } }>('contacts/export/count', { query: params }).then((r) => r.data.count),
        enabled: open,
    });
    const badRange = Boolean(f.added_from && f.added_to && f.added_to < f.added_from);
    const href = `/api/v1/contacts/export?${new URLSearchParams(params).toString()}`;
    const narrowed = Object.keys(params).length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Export contacts</DialogTitle>
                    <DialogDescription>
                        A CSV file with phone, name, email, tags, consent and every custom field. Leave everything on “All” to export all contacts.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Segment" htmlFor="ex-segment">
                        <Select value={f.segment_id ?? ALL} onValueChange={(v) => set({ segment_id: v === ALL ? undefined : v })}>
                            <SelectTrigger id="ex-segment">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>All contacts</SelectItem>
                                {segments.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Tag" htmlFor="ex-tag">
                        <Select value={f.tag ?? ALL} onValueChange={(v) => set({ tag: v === ALL ? undefined : v })}>
                            <SelectTrigger id="ex-tag">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>Any tag</SelectItem>
                                {tags.map((t) => (
                                    <SelectItem key={t.id} value={t.name}>
                                        {t.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Consent" htmlFor="ex-consent">
                        <Select value={f.consent ?? ALL} onValueChange={(v) => set({ consent: v === ALL ? undefined : v })}>
                            <SelectTrigger id="ex-consent">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>Any consent</SelectItem>
                                <SelectItem value="opted_in">Opted in</SelectItem>
                                <SelectItem value="unknown">Unknown</SelectItem>
                                <SelectItem value="opted_out">Opted out</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    {syncNumbers.length > 0 ? (
                        <Field label="Synced from" htmlFor="ex-synced">
                            <Select value={f.synced_from ?? ALL} onValueChange={(v) => set({ synced_from: v === ALL ? undefined : v })}>
                                <SelectTrigger id="ex-synced">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>Any source</SelectItem>
                                    {syncNumbers.map((n) => (
                                        <SelectItem key={n.id} value={n.id}>
                                            {n.verified_name ?? n.display_phone_number}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    ) : (
                        <Field label="Search" htmlFor="ex-q">
                            <Input
                                id="ex-q"
                                value={f.q ?? ''}
                                placeholder="Name, phone or email"
                                maxLength={100}
                                onChange={(e) => set({ q: e.target.value || undefined })}
                            />
                        </Field>
                    )}
                    {syncNumbers.length > 0 && (
                        <Field label="Search" htmlFor="ex-q" className="sm:col-span-2">
                            <Input
                                id="ex-q"
                                value={f.q ?? ''}
                                placeholder="Name, phone or email"
                                maxLength={100}
                                onChange={(e) => set({ q: e.target.value || undefined })}
                            />
                        </Field>
                    )}
                    <Field label="Added from" htmlFor="ex-from">
                        <Input id="ex-from" type="date" value={f.added_from ?? ''} onChange={(e) => set({ added_from: e.target.value || undefined })} />
                    </Field>
                    <Field label="Added until" htmlFor="ex-to" error={badRange ? 'Choose a date after “Added from”.' : undefined}>
                        <Input id="ex-to" type="date" value={f.added_to ?? ''} onChange={(e) => set({ added_to: e.target.value || undefined })} />
                    </Field>
                </div>
                {current.filter && (
                    <div className="flex items-start gap-2">
                        <Checkbox
                            id="ex-fields"
                            checked={Boolean(f.filter)}
                            onCheckedChange={(v) => set({ filter: v === true ? current.filter : undefined })}
                            className="mt-0.5"
                        />
                        <Label htmlFor="ex-fields" className="text-[13px] leading-snug font-normal">
                            Only contacts that match the field conditions set on the contact list
                        </Label>
                    </div>
                )}

                <p className="rounded-md bg-muted px-3 py-2 text-[13px]" aria-live="polite">
                    {badRange ? (
                        'Fix the dates to see the count.'
                    ) : count.isLoading ? (
                        'Counting…'
                    ) : count.data !== undefined ? (
                        <>
                            <span className="font-semibold">{count.data.toLocaleString()}</span> contact{count.data === 1 ? '' : 's'} will be exported
                            {narrowed ? '.' : ' (all contacts).'}
                        </>
                    ) : (
                        'The file includes every contact that matches.'
                    )}
                </p>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setF({})} disabled={!narrowed}>
                        Clear filters
                    </Button>
                    {badRange || count.data === 0 ? (
                        <Button disabled>
                            <DownloadIcon /> Download CSV
                        </Button>
                    ) : (
                        <Button asChild>
                            <a href={href} download onClick={() => onOpenChange(false)}>
                                <DownloadIcon /> Download CSV
                            </a>
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
