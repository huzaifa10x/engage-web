'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ContactIcon, MessageSquareIcon, MoreHorizontalIcon, PencilIcon, SearchIcon, Trash2Icon, UserPlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { ContactDialog } from '@/components/contacts/contact-dialog';
import { NewConversationDialog } from '@/components/inbox/new-conversation-dialog';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { humanize, relative } from '@/lib/format';
import { P } from '@/lib/permissions';
import { type ContactFilters, keys, useContacts } from '@/lib/queries';
import type { ConsentState, Contact } from '@/lib/types';

const ALL = '__all__';

export default function ContactsPage() {
    const { can } = useSession();
    const router = useRouter();
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<ContactFilters>({});
    const [editing, setEditing] = useState<Contact | null | undefined>(undefined); // undefined = closed, null = new
    const [messaging, setMessaging] = useState<Contact | null>(null);
    const [deleting, setDeleting] = useState<Contact | null>(null);

    const contacts = useContacts(filters);
    const rows = contacts.data?.pages.flatMap((p) => p.data) ?? [];

    const remove = useMutation({
        mutationFn: (id: string) => api(`contacts/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            toast.success('Contact deleted');
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!can(P.ContactsView)) return <Forbidden />;

    return (
        <>
            <PageHeader
                title="Contacts"
                description="Everyone who messaged your numbers or was added by your team. Consent is tracked per contact."
                actions={
                    can(P.ContactsCreate) && (
                        <Button onClick={() => setEditing(null)}>
                            <UserPlusIcon /> Add contact
                        </Button>
                    )
                }
            />

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setFilters((f) => ({ ...f, q: search.trim() || undefined }));
                    }}
                    className="relative w-full sm:w-72"
                >
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Name, number, email or @username"
                        className="pl-8"
                        aria-label="Search contacts"
                    />
                </form>
                <Select
                    value={filters.consent ?? ALL}
                    onValueChange={(v) => setFilters((f) => ({ ...f, consent: v === ALL ? undefined : (v as ConsentState) }))}
                >
                    <SelectTrigger className="w-44" aria-label="Consent">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>Any consent</SelectItem>
                        <SelectItem value="opted_in">Opted in</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                        <SelectItem value="opted_out">Opted out</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Card>
                {contacts.isLoading ? (
                    <div className="p-5">
                        <Skeleton className="h-48" />
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={<ContactIcon className="size-5" />}
                        title={filters.q || filters.consent ? 'No contacts match' : 'No contacts yet'}
                        description={
                            filters.q || filters.consent
                                ? 'Try a different search.'
                                : 'Customers who message your WhatsApp numbers are added here automatically.'
                        }
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Contact</TableHead>
                                <TableHead>WhatsApp</TableHead>
                                <TableHead>Consent</TableHead>
                                <TableHead>Last message</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((c) => (
                                <TableRow key={c.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar name={c.display_name} />
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold">{c.display_name}</div>
                                                {c.email && <div className="truncate text-[12.5px] text-muted-foreground">{c.email}</div>}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-mono text-[13px]">{c.phone ?? '—'}</div>
                                        {c.username && <div className="text-[12px] text-muted-foreground">@{c.username}</div>}
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={c.consent_state === 'opted_out' ? 'bad' : c.consent_state === 'opted_in' ? 'good' : 'grey'}>
                                            {humanize(c.consent_state)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{c.last_inbound_at ? relative(c.last_inbound_at) : '—'}</TableCell>
                                    <TableCell className="text-muted-foreground">{humanize(c.source)}</TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.display_name}`}>
                                                    <MoreHorizontalIcon />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {can(P.InboxReply) && c.consent_state !== 'opted_out' && (
                                                    <DropdownMenuItem onSelect={() => setMessaging(c)}>
                                                        <MessageSquareIcon /> Send message
                                                    </DropdownMenuItem>
                                                )}
                                                {can(P.ContactsUpdate) && (
                                                    <DropdownMenuItem onSelect={() => setEditing(c)}>
                                                        <PencilIcon /> Edit
                                                    </DropdownMenuItem>
                                                )}
                                                {can(P.ContactsDelete) && (
                                                    <DropdownMenuItem destructive onSelect={() => setDeleting(c)}>
                                                        <Trash2Icon className="!text-destructive" /> Delete
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
            {contacts.hasNextPage && (
                <div className="mt-4 flex justify-center">
                    <Button variant="outline" onClick={() => contacts.fetchNextPage()} disabled={contacts.isFetchingNextPage}>
                        {contacts.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                </div>
            )}

            <ContactDialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} contact={editing ?? null} />
            {messaging && (
                <NewConversationDialog
                    open
                    onOpenChange={(o) => !o && setMessaging(null)}
                    contact={messaging}
                    onStarted={(id) => router.push(`/inbox?c=${id}`)}
                />
            )}
            <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deleting?.display_name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The contact is hidden from lists. Their conversation history is kept, and they reappear automatically if they message you again.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction destructive onClick={() => deleting && remove.mutate(deleting.id)}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
