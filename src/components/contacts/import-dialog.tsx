'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, FileSpreadsheetIcon, UploadIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { fileSize } from '@/lib/format';
import { importContacts, keys, useContactFields, useTags } from '@/lib/queries';
import type { ImportResult } from '@/lib/types';

import { TagInput } from './tag-input';

/** CSV import: existing numbers are updated (never duplicated) and an opt-out is never overridden. */
export function ImportContactsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const qc = useQueryClient();
    const tagList = useTags(open);
    const fields = useContactFields(open);
    const fileRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [optedIn, setOptedIn] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ImportResult | null>(null);

    const close = (o: boolean) => {
        if (!o) {
            setFile(null);
            setTags([]);
            setOptedIn(false);
            setError(null);
            setResult(null);
        }
        onOpenChange(o);
    };

    const submit = async () => {
        if (!file) return setError('Choose a CSV file.');
        setPending(true);
        setError(null);
        try {
            setResult(await importContacts(file, tags, optedIn));
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            void qc.invalidateQueries({ queryKey: keys.tags });
            void qc.invalidateQueries({ queryKey: keys.segments });
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setPending(false);
        }
    };

    const columns = ['phone', 'name', 'email', 'tags', 'opted_in', ...(fields.data ?? []).map((f) => f.key)];
    const sample = `data:text/csv;charset=utf-8,${encodeURIComponent(`${columns.join(',')}\n+971501234567,Sara Ahmed,sara@example.com,VIP;Member,yes${','.repeat(Math.max(0, columns.length - 5))}\n`)}`;

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Import contacts</DialogTitle>
                    <DialogDescription>
                        Upload a CSV file with a header row. Numbers that already exist are updated, not duplicated, and contacts who opted out stay opted out.
                    </DialogDescription>
                </DialogHeader>
                <FormError message={error} />

                {result ? (
                    <div className="grid gap-3">
                        <div className="flex items-start gap-3 rounded-lg border border-good/20 bg-good-bg p-4 text-sm">
                            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-good" />
                            <div>
                                <p className="font-semibold">Import finished</p>
                                <p className="mt-0.5 text-ink-2">
                                    {result.created} added · {result.updated} updated · {result.skipped} skipped (of {result.total} rows)
                                </p>
                            </div>
                        </div>
                        {result.errors.length > 0 && (
                            <div className="rounded-lg border p-3 text-[13px]">
                                <p className="font-semibold">Rows that were skipped</p>
                                <ul className="mt-1.5 grid gap-1 text-muted-foreground">
                                    {result.errors.map((e) => (
                                        <li key={e.row}>
                                            Row {e.row}: {e.message}
                                        </li>
                                    ))}
                                </ul>
                                {result.skipped > result.errors.length && (
                                    <p className="mt-1.5 text-muted-foreground">…and {result.skipped - result.errors.length} more.</p>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-4">
                        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-6 text-[13px] text-muted-foreground hover:bg-muted"
                        >
                            {file ? <FileSpreadsheetIcon className="size-5" /> : <UploadIcon className="size-5" />}
                            {file ? `${file.name} · ${fileSize(file.size)}` : 'Choose a CSV file (up to 10,000 contacts, 5 MB)'}
                        </button>
                        <div className="rounded-md bg-muted px-3 py-2.5 text-[12.5px] text-muted-foreground">
                            <p>
                                <span className="font-semibold text-ink-2">Columns:</span> <code>phone</code> (required, with country code), <code>name</code>,{' '}
                                <code>email</code>, <code>tags</code> (separate with <code>;</code>), <code>opted_in</code> (yes / no)
                                {(fields.data ?? []).length > 0 && <>, and your custom fields: {(fields.data ?? []).map((f) => f.key).join(', ')}</>}.
                            </p>
                            <a
                                href={sample}
                                download="contacts-sample.csv"
                                className="mt-1 inline-block font-medium text-info underline-offset-2 hover:underline"
                            >
                                Download a sample file
                            </a>
                        </div>
                        <Field label="Add these tags to every imported contact" htmlFor="imp-tags">
                            <TagInput id="imp-tags" value={tags} onChange={setTags} suggestions={(tagList.data ?? []).map((t) => t.name)} />
                        </Field>
                        <div className="flex items-start gap-2">
                            <Checkbox id="imp-optin" checked={optedIn} onCheckedChange={(v) => setOptedIn(v === true)} className="mt-0.5" />
                            <Label htmlFor="imp-optin" className="leading-snug font-normal text-muted-foreground">
                                Everyone in this file agreed to receive marketing messages from us on WhatsApp. This is recorded in each contact’s consent
                                history. Leave unticked if you are not sure: marketing campaigns only go to contacts with consent.
                            </Label>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => close(false)}>
                        {result ? 'Close' : 'Cancel'}
                    </Button>
                    {!result && (
                        <Button onClick={submit} disabled={pending || !file}>
                            {pending ? 'Importing…' : 'Import'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
