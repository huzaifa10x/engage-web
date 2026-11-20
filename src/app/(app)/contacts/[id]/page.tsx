'use client';

import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { RecordBody } from '@/components/contacts/contact-record';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { P } from '@/lib/permissions';
import { useContact } from '@/lib/queries';

/** The contact's full record (3.5): the same record as the slide-in panel, on its own page. */
export default function ContactRecordPage() {
    const { id } = useParams<{ id: string }>();
    const { can } = useSession();
    const contact = useContact(id ?? null);
    const [editing, setEditing] = useState<string | null>(null);

    if (!can(P.ContactsView)) return <Forbidden />;

    return (
        <div className="mx-auto flex h-full max-w-6xl min-w-0 flex-col">
            <div className="flex items-center gap-2 px-4 pt-4 sm:px-6">
                <Button asChild variant="ghost" size="sm">
                    <Link href="/contacts">
                        <ArrowLeftIcon /> Contacts & CRM
                    </Link>
                </Button>
            </div>
            <div
                className="m-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-card sm:mx-6"
                onKeyDown={(e) => e.key === 'Escape' && editing && (e.stopPropagation(), setEditing(null))}
            >
                {contact.data ? (
                    <RecordBody contact={contact.data} editing={editing} setEditing={setEditing} />
                ) : contact.isError ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">This contact was not found, or it was deleted.</p>
                ) : (
                    <div className="grid gap-3 p-6">
                        <Skeleton className="h-12 w-72" />
                        <Skeleton className="h-40" />
                    </div>
                )}
            </div>
        </div>
    );
}
