'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { dateTime, date } from '@/lib/format';
import type { WorkspaceDeletion } from '@/lib/types';

/**
 * Settings › Data (Owner): delete the workspace. Typing its name confirms; deletion happens after a
 * waiting period and can be cancelled until then. API keys and webhooks stop at once.
 */
export function WorkspaceDeletionCard({ workspaceName }: { workspaceName: string }) {
    const qc = useQueryClient();
    const deletion = useQuery({ queryKey: ['tenant', 'deletion'], queryFn: () => api<{ data: WorkspaceDeletion }>('tenant/deletion').then((r) => r.data) });
    const [open, setOpen] = useState(false);
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);

    const refresh = () => void qc.invalidateQueries({ queryKey: ['tenant', 'deletion'] });
    const request = useMutation({
        mutationFn: () => api('tenant/deletion', { method: 'POST', body: { confirm } }),
        onSuccess: () => {
            toast.success('Workspace deletion scheduled');
            setOpen(false);
            refresh();
        },
        onError: (e) => setError(errorMessage(e)),
    });
    const cancel = useMutation({
        mutationFn: () => api('tenant/deletion', { method: 'DELETE' }),
        onSuccess: () => {
            toast.success('Deletion cancelled. Create new API keys if you need them.');
            refresh();
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!deletion.data) return <Skeleton className="h-28" />;
    const d = deletion.data;

    return (
        <Card className="gap-3 border-destructive/40 p-5">
            <p className="text-sm font-semibold">Delete workspace</p>
            {d.scheduled_for ? (
                <>
                    <p className="text-[13px]">
                        This workspace and all its data will be deleted on <strong>{date(d.scheduled_for)}</strong>. Requested by{' '}
                        {d.requested_by ?? 'the Owner'} on {dateTime(d.requested_at)}. API keys were revoked and webhooks paused.
                    </p>
                    <div>
                        <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                            Cancel deletion
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <p className="text-[13px] text-muted-foreground">
                        Deletes contacts, chats, flows, reports and settings after a {d.waiting_days}-day waiting period, and disconnects WhatsApp, stores and
                        other integrations. You can cancel during the waiting period. Export anything you need first.
                    </p>
                    <div>
                        <Button variant="destructive" onClick={() => setOpen(true)}>
                            Delete workspace…
                        </Button>
                    </div>
                </>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {workspaceName}?</DialogTitle>
                        <DialogDescription>
                            The workspace is deleted for good after {d.waiting_days} days. API keys stop working and webhooks pause straight away. Our team is
                            told.
                        </DialogDescription>
                    </DialogHeader>
                    <FormError message={error} />
                    <Field label={`Type “${workspaceName}” to confirm`} htmlFor="delete-confirm">
                        <Input id="delete-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                    </Field>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Keep workspace
                        </Button>
                        <Button variant="destructive" disabled={confirm.trim() !== workspaceName.trim() || request.isPending} onClick={() => request.mutate()}>
                            Schedule deletion
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
