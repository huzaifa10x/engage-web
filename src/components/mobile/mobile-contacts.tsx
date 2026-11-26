'use client';

import { PlusIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';

import { useSession } from '@/components/app/session';
import { useOpenContact } from '@/components/contacts/contact-sheet';
import { MobileBoard } from '@/components/contacts/enquiry-board';
import { NewContactDialog } from '@/components/contacts/new-contact-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtPhone } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import { useContactFunnel, useContacts } from '@/lib/queries';

import { LargeTitle, Row, RowCard, RowText, Segmented } from './kit';

type View = 'people' | 'pipeline';

/**
 * Contacts on a phone (mobile prototype): People A to Z with a search, or the Pipeline one stage per
 * screen. Fields & sync and the bulk tools stay on a computer.
 */
export function MobileContacts({ view }: { view: View }) {
    const { can } = useSession();
    const router = useRouter();
    const [adding, setAdding] = useState(false);

    return (
        // The Contacts area is full-width (no page padding): the title supplies its own.
        <div className="min-w-0 flex-1 px-4 pt-6 pb-4">
            <LargeTitle
                title="Contacts"
                actions={
                    can(P.ContactsCreate) ? (
                        <button
                            type="button"
                            onClick={() => setAdding(true)}
                            aria-label="Add contact"
                            className="grid size-10 place-items-center rounded-full text-ink-2 active:bg-muted"
                        >
                            <PlusIcon className="size-5" />
                        </button>
                    ) : null
                }
            >
                <Segmented
                    value={view}
                    onChange={(v) => router.replace(v === 'pipeline' ? '/contacts?tab=deals' : '/contacts', { scroll: false })}
                    options={[
                        ['people', 'People'],
                        ['pipeline', 'Pipeline'],
                    ]}
                    label="Contacts view"
                />
            </LargeTitle>
            {view === 'people' ? <People /> : <MobileBoard />}
            <NewContactDialog open={adding} onOpenChange={setAdding} />
        </div>
    );
}

const letterOf = (name: string) => {
    const l = name.trim().charAt(0).toUpperCase();

    return /\p{L}/u.test(l) ? l : '#';
};

function People() {
    const openContact = useOpenContact();
    const funnel = useContactFunnel().data;
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setQ(search.trim()), 250);
        return () => clearTimeout(t);
    }, [search]);
    const contacts = useContacts({ q: q || undefined, sort: q ? 'activity' : 'name' });
    const rows = contacts.data?.pages.flatMap((p) => p.data) ?? [];

    return (
        <>
            <label className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-muted px-3 text-muted-foreground">
                <SearchIcon className="size-4 shrink-0" aria-hidden />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={funnel?.all ? `Search ${funnel.all.toLocaleString()} contacts` : 'Search name, number or email'}
                    aria-label="Search contacts"
                    className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                />
            </label>
            <RowCard className="mt-2.5">
                {contacts.isLoading && <Skeleton className="h-56 rounded-none" />}
                {rows.map((c, i) => {
                    const l = letterOf(c.display_name);
                    const heading = !q && (i === 0 || l !== letterOf(rows[i - 1]!.display_name));
                    const sub = [c.phone ? fmtPhone(c.phone) : c.username ? `@${c.username}` : null, c.stage?.name ?? c.lifecycle?.label]
                        .filter(Boolean)
                        .join(' · ');

                    return (
                        <Fragment key={c.id}>
                            {heading && <div className="px-3.5 pt-2.5 pb-0.5 text-[12px] font-bold tracking-[0.06em] text-muted-foreground">{l}</div>}
                            <Row onClick={() => openContact(c)} chevron>
                                <Avatar name={c.display_name} />
                                <RowText title={c.display_name} sub={sub || 'No number'} />
                            </Row>
                        </Fragment>
                    );
                })}
                {contacts.isSuccess && rows.length === 0 && (
                    <Row>
                        <span className="text-[13px] text-muted-foreground">{q ? 'No contact matches that search' : 'No contacts yet'}</span>
                    </Row>
                )}
            </RowCard>
            {contacts.hasNextPage && (
                <div className="mt-3 flex justify-center">
                    <Button variant="outline" onClick={() => contacts.fetchNextPage()} disabled={contacts.isFetchingNextPage}>
                        {contacts.isFetchingNextPage ? 'Loading…' : 'Show more'}
                    </Button>
                </div>
            )}
        </>
    );
}
