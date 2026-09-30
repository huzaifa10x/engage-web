'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailIcon, MoreHorizontalIcon, PhoneIcon, UserPlusIcon, UserXIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { InviteDialog } from '@/components/team/invite-dialog';
import { NumberAccessDialog } from '@/components/team/number-access-dialog';
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
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { date, relative } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, useEntitlements, useInvitations, useMembers, useRoles } from '@/lib/queries';
import type { Membership, Role } from '@/lib/types';

export default function TeamPage() {
    const { can, membership: self } = useSession();
    const canView = can(P.TeamView);
    const canManage = can(P.TeamManage);
    const qc = useQueryClient();

    const members = useMembers(canView);
    const invitations = useInvitations(canView);
    const roles = useRoles(canView);
    const entitlements = useEntitlements();

    const [inviteOpen, setInviteOpen] = useState(false);
    const [accessFor, setAccessFor] = useState<Membership | null>(null);
    const [removing, setRemoving] = useState<Membership | null>(null);

    const changeRole = useMutation({
        mutationFn: ({ id, role_id }: { id: string; role_id: string }) => api(`team/members/${id}`, { method: 'PATCH', body: { role_id } }),
        onSuccess: () => {
            toast.success('Role updated');
            void qc.invalidateQueries({ queryKey: keys.members });
            void qc.invalidateQueries({ queryKey: keys.me });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const remove = useMutation({
        mutationFn: (id: string) => api(`team/members/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            toast.success('Member removed');
            void qc.invalidateQueries({ queryKey: keys.members });
            void qc.invalidateQueries({ queryKey: keys.entitlements });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const revoke = useMutation({
        mutationFn: (id: string) => api(`team/invitations/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            toast.success('Invitation revoked');
            void qc.invalidateQueries({ queryKey: keys.invitations });
            void qc.invalidateQueries({ queryKey: keys.entitlements });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!canView) return <Forbidden />;

    const seats = entitlements.data?.features.team_seats;
    const roleList: Role[] = roles.data ?? [];
    const pending = invitations.data ?? [];

    return (
        <>
            <PageHeader
                title="Team & Roles"
                description={
                    <>
                        Invite teammates, set their role and choose which numbers they can work on.
                        {seats && (
                            <span className="ml-1 font-medium text-foreground">
                                {seats.used ?? 0} of {seats.unlimited ? 'unlimited' : seats.limit} seats used.
                            </span>
                        )}
                    </>
                }
                actions={
                    canManage && (
                        <Button onClick={() => setInviteOpen(true)}>
                            <UserPlusIcon /> Invite teammate
                        </Button>
                    )
                }
            />

            <Tabs defaultValue="members">
                <TabsList>
                    <TabsTrigger value="members">Members {members.data && <Badge tone="grey">{members.data.data.length}</Badge>}</TabsTrigger>
                    <TabsTrigger value="invitations">Invitations {pending.length > 0 && <Badge tone="brand">{pending.length}</Badge>}</TabsTrigger>
                    <TabsTrigger value="roles">Roles</TabsTrigger>
                </TabsList>

                <TabsContent value="members">
                    <Card>
                        {members.isLoading ? (
                            <div className="p-5">
                                <Skeleton className="h-32" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>Member</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(members.data?.data ?? []).map((m) => {
                                        const isSelf = m.id === self.id;
                                        const isOwner = m.role?.key === 'owner' && m.role.is_system;

                                        return (
                                            <TableRow key={m.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <Avatar name={m.user?.name ?? '?'} />
                                                        <div className="min-w-0">
                                                            <div className="truncate font-semibold">
                                                                {m.user?.name} {isSelf && <span className="font-normal text-muted-foreground">(you)</span>}
                                                            </div>
                                                            <div className="truncate text-[12.5px] text-muted-foreground">{m.user?.email}</div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="w-48">
                                                    {canManage && !isSelf ? (
                                                        <Select value={m.role?.id} onValueChange={(role_id) => changeRole.mutate({ id: m.id, role_id })}>
                                                            <SelectTrigger size="sm" aria-label={`Role for ${m.user?.name}`}>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {roleList.map((r) => (
                                                                    <SelectItem key={r.id} value={r.id}>
                                                                        {r.name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <Badge tone={isOwner ? 'brand' : 'grey'}>{m.role?.name}</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge tone={m.status === 'active' ? 'good' : 'warn'}>
                                                        {m.status === 'active' ? 'Active' : 'Suspended'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">{date(m.joined_at)}</TableCell>
                                                <TableCell>
                                                    {canManage && (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.user?.name}`}>
                                                                    <MoreHorizontalIcon />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onSelect={() => setAccessFor(m)}>
                                                                    <PhoneIcon /> Number access
                                                                </DropdownMenuItem>
                                                                {!isSelf && (
                                                                    <DropdownMenuItem destructive onSelect={() => setRemoving(m)}>
                                                                        <UserXIcon className="!text-destructive" /> Remove from workspace
                                                                    </DropdownMenuItem>
                                                                )}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="invitations">
                    <Card>
                        {pending.length === 0 ? (
                            <EmptyState
                                icon={<MailIcon className="size-5" />}
                                title="No pending invitations"
                                description="Invitations you send appear here until they are accepted or expire."
                            />
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Sent</TableHead>
                                        <TableHead>Expires</TableHead>
                                        <TableHead className="w-24" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pending.map((i) => (
                                        <TableRow key={i.id}>
                                            <TableCell className="font-medium">{i.email}</TableCell>
                                            <TableCell>
                                                <Badge>{i.role?.name}</Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{relative(i.created_at)}</TableCell>
                                            <TableCell className="text-muted-foreground">{relative(i.expires_at)}</TableCell>
                                            <TableCell className="text-right">
                                                {canManage && (
                                                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)} disabled={revoke.isPending}>
                                                        Revoke
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="roles">
                    <div className="grid gap-3 md:grid-cols-2">
                        {roleList.map((r) => (
                            <Card key={r.id} className="p-5">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold">{r.name}</p>
                                    {r.is_system && <Badge tone="grey">Built-in</Badge>}
                                </div>
                                <p className="mt-2 text-[13px] text-muted-foreground">
                                    {r.permissions.includes('*') ? 'Full access to everything, including billing.' : `${r.permissions.length} permissions`}
                                    {(r.key === 'owner' || r.key === 'admin') && r.is_system ? ' · All numbers.' : ' · Only numbers granted to them.'}
                                </p>
                                {!r.permissions.includes('*') && (
                                    <div className="mt-3 flex flex-wrap gap-1">
                                        {r.permissions.map((p) => (
                                            <Badge key={p} tone="outline" className="font-mono text-[11px] font-normal">
                                                {p}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roleList} />
            <NumberAccessDialog member={accessFor} onOpenChange={(o) => !o && setAccessFor(null)} />

            <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove {removing?.user?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            They lose access to this workspace immediately. Their past activity stays in the audit log.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction destructive onClick={() => removing && remove.mutate(removing.id)}>
                            Remove member
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
