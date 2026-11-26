'use client';

import { DownloadIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, SlidersHorizontalIcon, UploadIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { usePhone } from '@/components/mobile/kit';
import { MobileContacts } from '@/components/mobile/mobile-contacts';
import { BulkEditDialog } from '@/components/contacts/bulk-edit-dialog';
import { usePeekedContact, useOpenContact } from '@/components/contacts/contact-sheet';
import { CrmSettingsDialog } from '@/components/contacts/crm-settings-dialog';
import { consentLabel, consentTone, LifePill, useSyncState, useTeamOwners } from '@/components/contacts/crm-fields';
import { CrmShell, type CrmTab } from '@/components/contacts/crm-shell';
import { CrmSyncTab } from '@/components/contacts/crm-sync-tab';
import { EnquiryBoardView } from '@/components/contacts/enquiry-board';
import { ExportContactsDialog } from '@/components/contacts/export-dialog';
import { ImportContactsDialog } from '@/components/contacts/import-dialog';
import { NewContactDialog } from '@/components/contacts/new-contact-dialog';
import { SegmentDialog } from '@/components/contacts/segment-dialog';
import { Chip, useNow } from '@/components/inbox/conversation-list';
import { OwnerAvatar, RingAvatar } from '@/components/inbox/window-ring';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { contactSource } from '@/lib/format';
import { aedK, engageId, fmtDay, fmtPhone } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import { type ContactFilters, useContactFunnel, useContacts, useSegments, useTags } from '@/lib/queries';
import type { Contact, LifecycleKey, Segment } from '@/lib/types';
import { cn } from '@/lib/utils';

const LIFE: ['' | LifecycleKey, string][] = [
    ['', 'All contacts'],
    ['subscriber', 'Subscriber'],
    ['lead', 'Lead'],
    ['opportunity', 'Opportunity'],
    ['customer', 'Customer'],
    ['other', 'Other'],
];
const th = 'border-b bg-[#f5f5f4] px-3 py-2.5 text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase';
const td = 'border-b border-line-2 px-3 py-2.5 align-middle';
const windowFor = (c: Contact) =>
    c.chat?.window_expires_at ?? (c.last_inbound_at ? new Date(new Date(c.last_inbound_at).getTime() + 86_400_000).toISOString() : null);

/** Contacts & CRM › Contacts (3.5): search any format or ID, lifecycle funnel, possible duplicates. */
function ContactsTab() {
    const { can } = useSession();
    const now = useNow();
    const openContact = useOpenContact();
    const peeked = usePeekedContact();
    const owners = useTeamOwners();
    const sync = useSyncState();
    const funnel = useContactFunnel().data;
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [life, setLife] = useState<'' | LifecycleKey>('');
    const [owner, setOwner] = useState('');
    const [dup, setDup] = useState(false);
    const [adding, setAdding] = useState(false);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [managing, setManaging] = useState(false);
    const [segmentEditing, setSegmentEditing] = useState<Segment | null | undefined>(undefined);
    const segments = useSegments(exporting);
    const tags = useTags(exporting);
    useEffect(() => {
        const t = setTimeout(() => setQ(search.trim()), 200);
        return () => clearTimeout(t);
    }, [search]);
    const filters: ContactFilters = {
        q: q || undefined,
        lifecycle: !dup && life ? life : undefined,
        owner: owner || undefined,
        duplicates: dup ? 1 : undefined,
        sort: 'activity',
    };
    const contacts = useContacts(filters);
    const rows = contacts.data?.pages.flatMap((p) => p.data) ?? [];
    const ids = rows.map((r) => r.id);
    // Select several and edit them together (tags, consent, owner…): kept from Engage beside the 3.5 table.
    const canBulk = can(P.ContactsUpdate);
    const MAX_SELECTED = 500;
    const [selected, setSelected] = useState<Map<string, Contact>>(new Map());
    const [bulkEditing, setBulkEditing] = useState(false);
    const allShown = rows.length > 0 && rows.every((c) => selected.has(c.id));
    const someShown = rows.some((c) => selected.has(c.id));
    const toggle = (c: Contact, on: boolean) =>
        setSelected((m) => {
            const next = new Map(m);
            if (on && next.size < MAX_SELECTED) next.set(c.id, c);
            if (!on) next.delete(c.id);
            return next;
        });
    const toggleAll = (on: boolean) =>
        setSelected((m) => {
            const next = new Map(m);
            for (const c of rows) {
                if (on && next.size < MAX_SELECTED) next.set(c.id, c);
                if (!on) next.delete(c.id);
            }
            return next;
        });
    const filterKey = JSON.stringify(filters);
    const [selectionFor, setSelectionFor] = useState(filterKey);
    if (selectionFor !== filterKey) {
        setSelectionFor(filterKey);
        if (selected.size > 0) setSelected(new Map());
    }
    const counts: Record<string, number | undefined> = { '': funnel?.all, ...funnel };

    return (
        <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="relative block w-full max-w-[360px] flex-1">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-faint" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Name, phone in any format, email, company, ID"
                        aria-label="Search contacts"
                        className="h-8 w-full rounded-md border border-input bg-card pr-2 pl-8 text-[13px] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                    />
                </label>
                <select
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    aria-label="Owner"
                    className="h-8 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                >
                    <option value="">All owners</option>
                    {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.name.split(' ')[0]}
                        </option>
                    ))}
                </select>
                <span className="flex-1" />
                {can(P.ContactsImport) && (
                    <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
                        <UploadIcon /> Import CSV
                    </Button>
                )}
                {can(P.ContactsCreate) && (
                    <Button size="sm" onClick={() => setAdding(true)}>
                        <PlusIcon /> New contact
                    </Button>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="More" title="More">
                            <MoreHorizontalIcon />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setManaging(true)}>
                            <SlidersHorizontalIcon /> Segments, tags, fields & stages
                        </DropdownMenuItem>
                        {can(P.ContactsExport) && (
                            <DropdownMenuItem onSelect={() => setExporting(true)}>
                                <DownloadIcon /> Export
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="mb-3 flex flex-wrap gap-2" aria-label="Lifecycle">
                {LIFE.map(([k, l]) => (
                    <button
                        key={k}
                        type="button"
                        aria-pressed={life === k && !dup}
                        onClick={() => {
                            setLife(k);
                            setDup(false);
                        }}
                        className={cn(
                            'flex min-w-24 flex-col items-start rounded-lg border bg-card px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:border-[#d6d3d1] motion-reduce:transition-none',
                            life === k && !dup && 'border-brand-500 bg-brand-50 text-brand-600 shadow-[0_0_0_1px_var(--brand-500)]',
                        )}
                    >
                        <b className="text-[17px] font-semibold tracking-tight text-foreground tabular-nums">{counts[k] ?? '–'}</b>
                        {l}
                    </button>
                ))}
                <button
                    type="button"
                    aria-pressed={dup}
                    onClick={() => {
                        setDup((d) => !d);
                        setLife('');
                    }}
                    className={cn(
                        'flex min-w-24 flex-col items-start rounded-lg border bg-card px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:border-[#d6d3d1] motion-reduce:transition-none',
                        dup && 'border-warn bg-warn-bg shadow-[0_0_0_1px_var(--warn)]',
                    )}
                >
                    <b className="text-[17px] font-semibold tracking-tight text-warn tabular-nums">{funnel?.duplicates ?? '–'}</b>
                    Possible duplicates
                </button>
            </div>

            {canBulk && selected.size > 0 && (
                <div
                    className="sticky top-2 z-10 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-50 px-3 py-2 text-[13px] shadow-sm"
                    role="region"
                    aria-label="Selected contacts"
                >
                    <span className="font-semibold tabular-nums">{selected.size} selected</span>
                    <div className="ml-auto flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelected(new Map())}>
                            Clear selection
                        </Button>
                        <Button size="sm" onClick={() => setBulkEditing(true)}>
                            <PencilIcon /> Edit {selected.size}
                        </Button>
                    </div>
                </div>
            )}
            <div className="overflow-x-auto rounded-[10px] border bg-card">
                <table className="w-full border-collapse text-[13px]">
                    <thead>
                        <tr>
                            {canBulk && (
                                <th className={cn(th, 'w-9 pr-0')}>
                                    <Checkbox
                                        aria-label="Select all contacts shown"
                                        checked={allShown ? true : someShown ? 'indeterminate' : false}
                                        onCheckedChange={(v) => toggleAll(v === true)}
                                    />
                                </th>
                            )}
                            {['Contact', 'WhatsApp', 'Company', 'Lifecycle', 'Lead status', 'Owner', 'Open deals', 'Source', 'Consent', 'Last activity'].map(
                                (h) => (
                                    <th key={h} className={th}>
                                        {h}
                                    </th>
                                ),
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {contacts.isLoading &&
                            [0, 1, 2, 3, 4].map((i) => (
                                <tr key={i}>
                                    <td colSpan={canBulk ? 11 : 10} className={td}>
                                        <Skeleton className="h-6" />
                                    </td>
                                </tr>
                            ))}
                        {!contacts.isLoading && rows.length === 0 && (
                            <tr>
                                <td colSpan={canBulk ? 11 : 10} className="p-8 text-center text-muted-foreground">
                                    No contacts match
                                </td>
                            </tr>
                        )}
                        {rows.map((c) => {
                            const on = peeked === c.id;
                            const od = c.open_deals ?? { count: 0, value: 0 };
                            const lead = c.lifecycle?.key === 'customer' ? '—' : (c.lead_status?.label ?? 'New');

                            return (
                                <tr
                                    key={c.id}
                                    tabIndex={0}
                                    aria-label={`${c.display_name}: press Enter to open`}
                                    onClick={() => openContact(c, { list: ids })}
                                    onKeyDown={(e) => {
                                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                                            e.preventDefault();
                                            openContact(c, { list: ids });
                                        }
                                    }}
                                    className={cn(
                                        'cursor-pointer transition-colors duration-150 hover:bg-[#f5f5f4] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none last:[&>td]:border-b-0',
                                        on && 'bg-brand-50 hover:bg-brand-50 [&>td:first-child]:shadow-[inset_3px_0_0_var(--brand-500)]',
                                    )}
                                >
                                    {canBulk && (
                                        <td className={cn(td, 'pr-0')} onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                aria-label={`Select ${c.display_name}`}
                                                checked={selected.has(c.id)}
                                                disabled={!selected.has(c.id) && selected.size >= MAX_SELECTED}
                                                onCheckedChange={(v) => toggle(c, v === true)}
                                            />
                                        </td>
                                    )}
                                    <td className={td}>
                                        <div className="flex items-center gap-2.5">
                                            <RingAvatar
                                                name={c.display_name}
                                                expiresAt={windowFor(c)}
                                                hasChat={!!c.chat || !!c.last_inbound_at}
                                                className="size-7 text-[11px]"
                                                now={now}
                                            />
                                            <span className="min-w-0">
                                                <b className="block font-semibold whitespace-nowrap" dir="auto">
                                                    {c.display_name}
                                                </b>
                                                <small className="block text-[11px] text-muted-foreground">
                                                    {engageId(c.id)}
                                                    {dup && <span className="text-warn"> · ⚠ duplicate?</span>}
                                                </small>
                                            </span>
                                        </div>
                                    </td>
                                    <td className={cn(td, 'whitespace-nowrap')}>
                                        {c.phone ? (
                                            fmtPhone(c.phone)
                                        ) : (
                                            <span className="text-muted-foreground">{c.username ? `@${c.username}` : 'Hidden'}</span>
                                        )}
                                        {!c.chat && <small className="block text-[11px] text-muted-foreground">No chat yet</small>}
                                    </td>
                                    <td className={td}>{c.company || '—'}</td>
                                    <td className={td}>
                                        <LifePill contact={c} />
                                    </td>
                                    <td className={cn(td, 'whitespace-nowrap')}>{lead}</td>
                                    <td className={td}>{c.owner ? <OwnerAvatar name={c.owner.name} /> : <span className="text-muted-foreground">—</span>}</td>
                                    <td className={cn(td, 'whitespace-nowrap')}>
                                        {od.count ? (
                                            <>
                                                <b className="font-semibold">{od.count}</b> · {aedK(od.value)}
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className={cn(td, 'text-[12px]')}>{contactSource(c.source, c.source_detail)}</td>
                                    <td className={td}>
                                        <Chip tone={consentTone(c.consent_state)}>{consentLabel(c.consent_state)}</Chip>
                                    </td>
                                    <td className={cn(td, 'text-[12px] whitespace-nowrap')}>
                                        {fmtDay(c.last_activity_at ?? c.created_at ?? new Date(now).toISOString(), now)}
                                        <span
                                            className={cn(
                                                'ml-1.5 inline-block size-[7px] rounded-full align-middle',
                                                sync.tone === 'good' ? 'bg-good' : sync.tone === 'warn' ? 'bg-warn' : 'bg-[#d6d3d1]',
                                            )}
                                            title={sync.label}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {contacts.hasNextPage && (
                <div className="mt-4 flex justify-center">
                    <Button variant="outline" onClick={() => contacts.fetchNextPage()} disabled={contacts.isFetchingNextPage}>
                        {contacts.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                </div>
            )}

            <NewContactDialog open={adding} onOpenChange={setAdding} />
            <BulkEditDialog open={bulkEditing} onOpenChange={setBulkEditing} contacts={[...selected.values()]} onDone={() => setSelected(new Map())} />
            <ImportContactsDialog open={importing} onOpenChange={setImporting} />
            <CrmSettingsDialog open={managing} onOpenChange={setManaging} canEdit={can(P.ContactsUpdate)} onEditSegment={setSegmentEditing} />
            <SegmentDialog open={segmentEditing !== undefined} onOpenChange={(o) => !o && setSegmentEditing(undefined)} segment={segmentEditing ?? null} />
            <ExportContactsDialog
                open={exporting}
                onOpenChange={setExporting}
                current={filters}
                segments={segments.data ?? []}
                tags={tags.data ?? []}
                syncNumbers={[]}
            />
        </>
    );
}

function ContactsArea() {
    const { can } = useSession();
    const params = useSearchParams();
    const t = params.get('tab') ?? (params.get('view') === 'pipeline' ? 'deals' : 'contacts');
    const tab: CrmTab = t === 'deals' || t === 'sync' ? t : 'contacts';
    const phone = usePhone();
    if (!can(P.ContactsView)) return <Forbidden />;
    // Phones: People or Pipeline as in the mobile prototype; Fields & sync stays the computer view.
    if (phone && tab !== 'sync') return <MobileContacts view={tab === 'deals' ? 'pipeline' : 'people'} />;

    return <CrmShell tab={tab}>{tab === 'deals' ? <EnquiryBoardView /> : tab === 'sync' ? <CrmSyncTab /> : <ContactsTab />}</CrmShell>;
}

export default function ContactsPage() {
    return (
        <Suspense>
            <ContactsArea />
        </Suspense>
    );
}
