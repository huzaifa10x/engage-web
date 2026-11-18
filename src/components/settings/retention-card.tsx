'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { updateComplianceSettings, useComplianceSettings } from '@/lib/queries';

/** "keep" or a number of days. */
const OPTIONS: [string, string][] = [
    ['keep', 'Keep'],
    ['90', '90 days'],
    ['365', '1 year'],
    ['730', '2 years'],
];

/** Settings › Data: how long message text is kept. After that it is removed; the timeline line stays, marked "message removed". */
export function RetentionCard({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const settings = useComplianceSettings();
    const [asking, setAsking] = useState<string | null>(null);

    const save = useMutation({
        mutationFn: (value: string) =>
            updateComplianceSettings(value === 'keep' ? { retention_enabled: false } : { retention_enabled: true, message_retention_days: Number(value) }),
        onSuccess: () => {
            toast.success('Message retention saved');
            void qc.invalidateQueries({ queryKey: ['compliance'] });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!settings.data) return <Skeleton className="h-28" />;
    const s = settings.data;
    const current = !s.retention_enabled ? 'keep' : String(s.message_retention_days);
    const options = OPTIONS.some(([v]) => v === current) ? OPTIONS : [...OPTIONS, [current, `${current} days`] as [string, string]];
    const label = (v: string) => options.find(([o]) => o === v)?.[1] ?? v;

    return (
        <Card className="gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                    <Label htmlFor="retention" className="font-semibold">
                        Message retention
                    </Label>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        How long message text is kept. After that it is removed every night; the contact&apos;s timeline still shows the message, marked
                        “message removed”. Consent records and the Audit log are always kept.
                    </p>
                </div>
                <Select value={current} disabled={!canManage || save.isPending} onValueChange={(v) => (v === 'keep' ? save.mutate(v) : setAsking(v))}>
                    <SelectTrigger id="retention" className="w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map(([v, l]) => (
                            <SelectItem key={v} value={v}>
                                {l}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <AlertDialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove message text after {asking && label(asking)}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Starting tonight, the text of messages older than {asking && label(asking)} is removed for good. It cannot be brought back.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction destructive onClick={() => asking && save.mutate(asking)}>
                            Remove old message text
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
