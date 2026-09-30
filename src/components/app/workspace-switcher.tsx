'use client';

import { ChevronsUpDownIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Avatar } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuCheckItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { errorMessage } from '@/lib/api';
import { useSwitchTenant } from '@/lib/queries';

import { useSession } from './session';

export function WorkspaceSwitcher() {
    const { me, membership } = useSession();
    const router = useRouter();
    const switchTenant = useSwitchTenant();
    const locked = me.impersonation !== null; // support sessions are pinned to one workspace
    const others = me.memberships.filter((m) => m.status === 'active');

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                disabled={locked}
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
            >
                <Avatar name={membership.tenant?.name ?? '?'} className="size-7 rounded-md text-[11px]" />
                <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-[180px] truncate text-[13.5px] font-semibold">{membership.tenant?.name}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{membership.role?.name}</span>
                </span>
                {!locked && <ChevronsUpDownIcon className="size-4 text-muted-foreground" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                {others.map((m) => (
                    <DropdownMenuCheckItem
                        key={m.id}
                        checked={m.tenant?.id === me.active_tenant_id}
                        disabled={switchTenant.isPending || m.tenant?.status === 'suspended'}
                        onSelect={() => {
                            if (!m.tenant || m.tenant.id === me.active_tenant_id) return;
                            switchTenant.mutate(m.tenant.id, {
                                onSuccess: () => {
                                    toast.success(`Switched to ${m.tenant?.name}`);
                                    router.push('/dashboard');
                                },
                                onError: (e) => toast.error(errorMessage(e)),
                            });
                        }}
                    >
                        <Avatar name={m.tenant?.name ?? '?'} className="size-6 rounded-md text-[10px]" />
                        <span className="truncate">{m.tenant?.name}</span>
                    </DropdownMenuCheckItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push('/register')}>Create a new workspace</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
