'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { useSession } from '@/components/app/session';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { humanize } from '@/lib/format';
import { P } from '@/lib/permissions';
import { useContact } from '@/lib/queries';
import type { Contact } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ContactRecordSheet } from './contact-record';
import { RecordConsentDialog } from './record-consent-dialog';
import { StageBadge } from './stage-badge';

/** Name, number, stage and consent at the top of the slide-in contact record. */
export function ContactSheetHeader({ contact }: { contact: Contact }) {
    const { can } = useSession();
    const [consentOpen, setConsentOpen] = useState(false);

    return (
        <div className="flex shrink-0 items-center gap-3 border-b bg-card px-5 py-4 pr-14">
            <Avatar name={contact.display_name} className="size-11 text-[15px]" />
            <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">{contact.display_name}</SheetTitle>
                <SheetDescription className="truncate">
                    {contact.phone ?? (contact.username ? `@${contact.username}` : 'WhatsApp user')}
                    {contact.email ? ` · ${contact.email}` : ''}
                </SheetDescription>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StageBadge stage={contact.stage} />
                    <Badge tone={contact.consent_state === 'opted_out' ? 'bad' : contact.consent_state === 'opted_in' ? 'good' : 'grey'}>
                        Consent: {humanize(contact.consent_state)}
                    </Badge>
                    {contact.tags.slice(0, 4).map((t) => (
                        <Badge key={t} tone="outline">
                            {t}
                        </Badge>
                    ))}
                </div>
            </div>
            {can(P.ContactsUpdate) && (
                <Button size="sm" variant="outline" onClick={() => setConsentOpen(true)}>
                    Record consent
                </Button>
            )}
            <RecordConsentDialog
                contact={contact}
                open={consentOpen}
                onOpenChange={setConsentOpen}
                initialState={contact.consent_state === 'opted_in' ? 'opted_out' : 'opted_in'}
            />
        </div>
    );
}

type Opener = (contact: Contact | string, options?: { list?: string[] }) => void;
const ContactSheetContext = createContext<Opener | null>(null);
/** The contact open in the panel right now (the Contacts table highlights its row). */
const PeekedContext = createContext<string | null>(null);
export const usePeekedContact = () => useContext(PeekedContext);

/**
 * Opening a contact anywhere (the contacts list, the deals board, the inbox, reports) slides its
 * record in over the current page: view or edit it there, close it, and the page is just as it was.
 * Opened from a list (Contacts), it steps to the previous and next contact of that list.
 */
export function ContactSheetProvider({ children }: { children: React.ReactNode }) {
    const [target, setTarget] = useState<Contact | string | null>(null);
    const [list, setList] = useState<string[] | null>(null);
    const [open, setOpen] = useState(false);
    const [opener, setOpener] = useState<HTMLElement | null>(null);
    const id = typeof target === 'string' ? target : (target?.id ?? null);
    // Always the latest copy: a change saved in the panel shows at once.
    const fetched = useContact(open ? id : null);
    const contact = fetched.data ?? (typeof target === 'object' && target?.id === id ? target : null);
    const openContact = useCallback<Opener>((c, options) => {
        setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null);
        setTarget(c);
        setList(options?.list ?? null);
        setOpen(true);
    }, []);
    const value = useMemo(() => openContact, [openContact]);
    const index = list && id ? list.indexOf(id) : -1;
    const nav =
        list && index >= 0
            ? {
                  index,
                  total: list.length,
                  prev: index > 0 ? () => setTarget(list[index - 1]) : null,
                  next: index < list.length - 1 ? () => setTarget(list[index + 1]) : null,
              }
            : null;

    return (
        <ContactSheetContext.Provider value={value}>
            <PeekedContext.Provider value={open ? id : null}>
                {children}
                {contact && (
                    <ContactRecordSheet
                        open={open}
                        onOpenChange={setOpen}
                        contact={contact}
                        nav={nav}
                        returnFocus={opener}
                        onReview={(other) => {
                            setList(null);
                            setTarget(other);
                        }}
                    />
                )}
            </PeekedContext.Provider>
        </ContactSheetContext.Provider>
    );
}

export function useOpenContact(): Opener {
    const open = useContext(ContactSheetContext);
    if (!open) throw new Error('useOpenContact must be used inside ContactSheetProvider');

    return open;
}

/** A contact's name that opens their record in the slide-in panel. */
export function ContactLink({ contact, children, className }: { contact: Contact | string; children: React.ReactNode; className?: string }) {
    const openContact = useOpenContact();
    const { can } = useSession();
    if (!can(P.ContactsView)) return <span className={className}>{children}</span>;

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                openContact(contact);
            }}
            className={cn('text-left font-medium text-primary underline-offset-2 hover:underline', className)}
        >
            {children}
        </button>
    );
}
