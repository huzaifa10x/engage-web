'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { deleteContactField, deleteSegment, deleteTag, keys, useContactFieldsInfo, useSegments, useTags } from '@/lib/queries';
import type { ContactField, Segment } from '@/lib/types';

import { ContactFieldDialog, typeLabel } from './contact-field-dialog';

/** One place to manage what contacts are organised by: segments, tags and custom fields. */
export function CrmSettingsDialog({
    open,
    onOpenChange,
    canEdit,
    onEditSegment,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    canEdit: boolean;
    onEditSegment: (segment: Segment | null) => void;
}) {
    const qc = useQueryClient();
    const segments = useSegments(open);
    const tags = useTags(open);
    const info = useContactFieldsInfo(open);
    const fields = { data: info.data?.data };
    const allowance = info.data?.meta;
    const full =
        !!allowance &&
        ((allowance.limit !== null && allowance.used >= allowance.limit) || (allowance.fair_use !== null && allowance.used >= allowance.fair_use));
    // undefined = closed, null = new field, otherwise the field being edited.
    const [editingField, setEditingField] = useState<ContactField | null | undefined>(undefined);

    const refresh = () => {
        void qc.invalidateQueries({ queryKey: keys.segments });
        void qc.invalidateQueries({ queryKey: keys.tags });
        void qc.invalidateQueries({ queryKey: keys.contactFields });
        void qc.invalidateQueries({ queryKey: keys.contactsAll });
    };
    const run = useMutation({
        mutationFn: (action: () => Promise<unknown>) => action(),
        onSuccess: refresh,
        onError: (e) => toast.error(errorMessage(e)),
    });

    const empty = (text: string) => <p className="py-6 text-center text-[13px] text-muted-foreground">{text}</p>;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Segments, tags and fields</DialogTitle>
                    <DialogDescription>Organise contacts so campaigns reach the right people.</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="segments">
                    <TabsList>
                        <TabsTrigger value="segments">Segments</TabsTrigger>
                        <TabsTrigger value="tags">Tags</TabsTrigger>
                        <TabsTrigger value="fields">Custom fields</TabsTrigger>
                    </TabsList>

                    <TabsContent value="segments" className="grid gap-2">
                        {(segments.data ?? []).length === 0 && empty('No segments yet. A segment is a saved rule such as “tag is VIP and opted in”.')}
                        {(segments.data ?? []).map((s) => (
                            <div key={s.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{s.name}</p>
                                    <p className="text-[12.5px] text-muted-foreground">
                                        {s.counts?.matched.toLocaleString() ?? '—'} match · {s.counts?.eligible_marketing.toLocaleString() ?? '—'} can receive
                                        marketing
                                    </p>
                                </div>
                                {canEdit && (
                                    <>
                                        <Button variant="ghost" size="icon-sm" onClick={() => onEditSegment(s)} aria-label={`Edit ${s.name}`}>
                                            <PencilIcon />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => run.mutate(() => deleteSegment(s.id))}
                                            aria-label={`Delete ${s.name}`}
                                        >
                                            <Trash2Icon />
                                        </Button>
                                    </>
                                )}
                            </div>
                        ))}
                        {canEdit && (
                            <Button variant="outline" size="sm" className="w-fit" onClick={() => onEditSegment(null)}>
                                <PlusIcon /> New segment
                            </Button>
                        )}
                    </TabsContent>

                    <TabsContent value="tags" className="grid gap-2">
                        {(tags.data ?? []).length === 0 && empty('No tags yet. Add tags when you create, edit or import contacts.')}
                        <div className="flex flex-wrap gap-2">
                            {(tags.data ?? []).map((t) => (
                                <Badge key={t.id} tone="info" className="gap-1.5 py-1">
                                    {t.name} <span className="opacity-70">{t.contacts}</span>
                                    {canEdit && (
                                        <button
                                            onClick={() =>
                                                window.confirm(`Delete the tag “${t.name}” and remove it from ${t.contacts} contact(s)?`) &&
                                                run.mutate(() => deleteTag(t.id))
                                            }
                                            aria-label={`Delete tag ${t.name}`}
                                        >
                                            <Trash2Icon className="size-3" />
                                        </button>
                                    )}
                                </Badge>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="fields" className="grid gap-2">
                        {allowance && (
                            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-[13px]">
                                <span>
                                    <span className="font-semibold tabular-nums">{allowance.used}</span>
                                    {allowance.limit !== null ? ` of ${allowance.limit}` : ''} custom field
                                    {allowance.used === 1 && allowance.limit === null ? '' : 's'}
                                    {allowance.limit === null && (
                                        <span className="text-muted-foreground"> · unlimited{allowance.fair_use ? ' (fair use)' : ''}</span>
                                    )}
                                </span>
                                {allowance.advanced && <Badge tone="brand">Custom types and validation</Badge>}
                                {full && (
                                    <Link href="/billing" className="ml-auto font-medium text-brand-600 underline">
                                        Upgrade for more fields
                                    </Link>
                                )}
                            </div>
                        )}
                        {(fields.data ?? []).length === 0 && empty('No custom fields yet. Use them for things like membership tier or renewal date.')}
                        {(fields.data ?? []).map((f) => (
                            <div key={f.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                        {f.label}
                                        {f.rules?.required && <span className="text-bad"> *</span>}
                                    </p>
                                    <p className="font-mono text-[12px] text-muted-foreground">
                                        {f.key} · {typeLabel(f.type)}
                                        {f.options && f.options.length > 0 ? ` · ${f.options.length} choices` : ''}
                                    </p>
                                </div>
                                {canEdit && (
                                    <>
                                        <Button variant="ghost" size="icon-sm" onClick={() => setEditingField(f)} aria-label={`Edit ${f.label}`}>
                                            <PencilIcon />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() =>
                                                window.confirm(`Delete the field “${f.label}”? Values already saved on contacts are kept.`) &&
                                                run.mutate(() => deleteContactField(f.id))
                                            }
                                            aria-label={`Delete ${f.label}`}
                                        >
                                            <Trash2Icon />
                                        </Button>
                                    </>
                                )}
                            </div>
                        ))}
                        {canEdit && (
                            <Button variant="outline" size="sm" className="w-fit" disabled={full} onClick={() => setEditingField(null)}>
                                <PlusIcon /> New field
                            </Button>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
            <ContactFieldDialog
                open={editingField !== undefined}
                onOpenChange={(o) => !o && setEditingField(undefined)}
                field={editingField ?? null}
                allowance={allowance}
                onSaved={refresh}
            />
        </Dialog>
    );
}
