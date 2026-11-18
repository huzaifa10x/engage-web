'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { keys } from '@/lib/queries';
import type { Role, RoleCatalog } from '@/lib/types';

/** Make or change a custom role: a name, and permissions ticked by area (optionally starting from a system role). */
export function RoleDialog({
    open,
    role,
    catalog,
    onOpenChange,
}: {
    open: boolean;
    /** null: a new role */
    role: Role | null;
    catalog: RoleCatalog;
    onOpenChange: (o: boolean) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && <RoleEditor key={role?.id ?? 'new'} role={role} catalog={catalog} onDone={() => onOpenChange(false)} />}
        </Dialog>
    );
}

function RoleEditor({ role, catalog, onDone }: { role: Role | null; catalog: RoleCatalog; onDone: () => void }) {
    const qc = useQueryClient();
    const [name, setName] = useState(role?.name ?? '');
    const [picked, setPicked] = useState<string[]>(role?.permissions ?? []);
    const [error, setError] = useState<string | null>(null);

    const save = useMutation({
        mutationFn: () => api(role ? `roles/${role.id}` : 'roles', { method: role ? 'PUT' : 'POST', body: { name: name.trim(), permissions: picked } }),
        onSuccess: () => {
            toast.success(role ? 'Role updated' : 'Role created');
            void qc.invalidateQueries({ queryKey: keys.roles });
            void qc.invalidateQueries({ queryKey: keys.me });
            onDone();
        },
        onError: (e) => setError(errorMessage(e)),
    });

    const startFrom = (key: string) => {
        const system = catalog.system_roles.find((r) => r.key === key);
        if (!system) return;
        const all = catalog.areas.flatMap((a) => a.permissions.map((p) => p.key));
        setPicked(system.permissions.includes('*') ? all : system.permissions);
    };
    const toggle = (key: string, on: boolean) => setPicked((now) => (on ? [...new Set([...now, key])] : now.filter((k) => k !== key)));

    return (
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>{role ? `Edit ${role.name}` : 'New role'}</DialogTitle>
                <DialogDescription>Choose what people with this role can do. Which WhatsApp numbers they work on is set per teammate.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role name" htmlFor="role-name">
                    <Input id="role-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Start from" htmlFor="role-start" hint="Copies that role's permissions. You can change them below.">
                    <Select onValueChange={startFrom}>
                        <SelectTrigger id="role-start">
                            <SelectValue placeholder="A built-in role" />
                        </SelectTrigger>
                        <SelectContent>
                            {catalog.system_roles
                                .filter((r) => r.key !== 'owner')
                                .map((r) => (
                                    <SelectItem key={r.key} value={r.key}>
                                        {r.name}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {catalog.areas.map((area) => (
                    <fieldset key={area.area} className="rounded-md border p-3">
                        <legend className="px-1 text-[13px] font-semibold">{area.area}</legend>
                        <div className="grid gap-2">
                            {area.permissions.map((p) => (
                                <label key={p.key} className="flex items-start gap-2 text-[13px]">
                                    <Checkbox className="mt-0.5" checked={picked.includes(p.key)} onCheckedChange={(on) => toggle(p.key, on === true)} />
                                    <span>{p.label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}
            </div>

            <FormError message={error} />
            <DialogFooter>
                <Button variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending || name.trim() === ''}>
                    {role ? 'Save role' : 'Create role'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
