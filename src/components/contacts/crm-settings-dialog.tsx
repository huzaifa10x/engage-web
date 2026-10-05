'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { createContactField, deleteContactField, deleteSegment, deleteTag, keys, useContactFields, useSegments, useTags } from '@/lib/queries';
import type { ContactField, Segment } from '@/lib/types';

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
    const fields = useContactFields(open);
    const [label, setLabel] = useState('');
    const [type, setType] = useState<ContactField['type']>('text');

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
                        {(fields.data ?? []).length === 0 && empty('No custom fields yet. Use them for things like membership tier or renewal date.')}
                        {(fields.data ?? []).map((f) => (
                            <div key={f.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{f.label}</p>
                                    <p className="font-mono text-[12px] text-muted-foreground">
                                        {f.key} · {f.type}
                                    </p>
                                </div>
                                {canEdit && (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => run.mutate(() => deleteContactField(f.id))}
                                        aria-label={`Delete ${f.label}`}
                                    >
                                        <Trash2Icon />
                                    </Button>
                                )}
                            </div>
                        ))}
                        {canEdit && (
                            <div className="flex gap-2 pt-1">
                                <Input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="Field name, e.g. Membership tier"
                                    maxLength={60}
                                    aria-label="New field name"
                                />
                                <Select value={type} onValueChange={(v) => setType(v as ContactField['type'])}>
                                    <SelectTrigger className="w-28" aria-label="Field type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    disabled={!label.trim() || run.isPending}
                                    onClick={() =>
                                        run.mutate(async () => {
                                            await createContactField(label.trim(), type);
                                            setLabel('');
                                        })
                                    }
                                >
                                    Add
                                </Button>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
