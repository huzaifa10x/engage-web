'use client';

import { useParams, useRouter } from 'next/navigation';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { FullRecord } from '@/components/contacts/contact-record';
import { CrmShell } from '@/components/contacts/crm-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { P } from '@/lib/permissions';
import { useContact } from '@/lib/queries';

/** A contact's full record (Contacts & CRM 3.5), under the Contacts tab. */
export default function ContactRecordPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { can } = useSession();
    const contact = useContact(id ?? null);

    if (!can(P.ContactsView)) return <Forbidden />;

    return (
        <CrmShell tab="contacts">
            {contact.data ? (
                <FullRecord contact={contact.data} onReview={(other) => router.push(`/contacts/${other}`)} />
            ) : contact.isError ? (
                <p className="p-8 text-center text-sm text-muted-foreground">This contact was not found, or it was deleted.</p>
            ) : (
                <div className="grid gap-3">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-80" />
                </div>
            )}
        </CrmShell>
    );
}
