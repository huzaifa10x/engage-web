'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { RoleDialog } from '@/components/team/role-dialog';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { keys, useRoleCatalog } from '@/lib/queries';
import type { Role, RoleCatalog } from '@/lib/types';

/** Settings › Team › Roles: the built-in roles, custom roles, and who may see phone numbers. */
export function RolesTab({ roles, canManage }: { roles: Role[]; canManage: boolean }) {
    const qc = useQueryClient();
    const catalog = useRoleCatalog();
    const [editing, setEditing] = useState<Role | 'new' | null>(null);
    const [deleting, setDeleting] = useState<Role | null>(null);

    const privacy = useMutation({
        mutationFn: (hide: boolean) => api('team/privacy', { method: 'PUT', body: { hide_phone_from_agents: hide } }),
        onSuccess: (_, hide) => {
            toast.success(hide ? 'Agents no longer see phone numbers' : 'Agents see phone numbers again');
            void qc.invalidateQueries({ queryKey: keys.roleCatalog });
            void qc.invalidateQueries({ queryKey: ['contacts'] });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const remove = useMutation({
        mutationFn: (id: string) => api(`roles/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            toast.success('Role deleted');
            void qc.invalidateQueries({ queryKey: keys.roles });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (catalog.isLoading || !catalog.data) return <Skeleton className="h-40" />;
    const data: RoleCatalog = catalog.data;
    const labels = new Map(data.areas.flatMap((a) => a.permissions.map((p) => [p.key, p.label] as const)));

    return (
        <div className="grid gap-4">
            <Card className="flex items-start justify-between gap-4 p-5">
                <div>
                    <Label htmlFor="hide-phones" className="font-semibold">
                        Hide contact phone numbers from Agents
                    </Label>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        Agents still chat with contacts, but see numbers masked, like +97150 •••••67. Managers, Admins and the Owner always see them.
                    </p>
                </div>
                <Switch
                    id="hide-phones"
                    checked={data.hide_phone_from_agents}
                    disabled={!canManage || privacy.isPending}
                    onCheckedChange={(on) => privacy.mutate(on)}
                />
            </Card>

            <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-muted-foreground">
                    {data.custom_roles
                        ? 'Make your own roles when the built-in ones do not fit.'
                        : 'Custom roles are included in plans with full role-based access.'}
                </p>
                {canManage && data.custom_roles && (
                    <Button size="sm" onClick={() => setEditing('new')}>
                        <PlusIcon /> New role
                    </Button>
                )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                {roles.map((r) => (
                    <Card key={r.id} className="p-5">
                        <div className="flex items-center gap-2">
                            <p className="font-semibold">{r.name}</p>
                            {r.is_system ? <Badge tone="grey">Built-in</Badge> : <Badge tone="brand">Custom</Badge>}
                            {!r.is_system && canManage && data.custom_roles && (
                                <span className="ml-auto flex gap-1">
                                    <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                                        <PencilIcon />
                                    </Button>
                                    <Button size="icon" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
                                        <Trash2Icon />
                                    </Button>
                                </span>
                            )}
                        </div>
                        <p className="mt-2 text-[13px] text-muted-foreground">
                            {r.permissions.includes('*') ? 'Full access to everything, including billing.' : `${r.permissions.length} permissions`}
                            {(r.key === 'owner' || r.key === 'admin') && r.is_system ? ' · All numbers.' : ' · Only numbers granted to them.'}
                        </p>
                        {!r.permissions.includes('*') && (
                            <div className="mt-3 flex flex-wrap gap-1">
                                {r.permissions.map((p) => (
                                    <Badge key={p} tone="outline" className="text-[11px] font-normal">
                                        {labels.get(p) ?? p}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </Card>
                ))}
            </div>

            <RoleDialog open={editing !== null} role={editing === 'new' ? null : editing} catalog={data} onOpenChange={(o) => !o && setEditing(null)} />

            <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>A role can be deleted once nobody has it. The change is recorded in the Audit log.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction destructive onClick={() => deleting && remove.mutate(deleting.id)}>
                            Delete role
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
