'use client';

import Link from 'next/link';

import { useContactFunnel, useCrmSync, useEnquiryBoard } from '@/lib/queries';
import { cn } from '@/lib/utils';

export type CrmTab = 'contacts' | 'deals' | 'sync';

/** Contacts & CRM: the header with its three tabs, around whichever tab (or a full record) is open. */
export function CrmShell({ tab, children }: { tab: CrmTab; children: React.ReactNode }) {
    const funnel = useContactFunnel();
    const board = useEnquiryBoard({});
    const sync = useCrmSync();
    const provider = sync.data?.provider ?? 'none';
    const tabs: [CrmTab, string, number | null, string][] = [
        ['contacts', 'Contacts', funnel.data?.all ?? null, '/contacts'],
        ['deals', 'Deals pipeline', board.data?.stats.open_count ?? null, '/contacts?tab=deals'],
        ['sync', 'Fields & sync', null, '/contacts?tab=sync'],
    ];

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b bg-card px-6 pt-4">
                <div className="pb-2">
                    <h1 className="text-[17px] font-semibold tracking-tight">Contacts &amp; CRM</h1>
                    <span className="text-[12px] text-muted-foreground">
                        Same records as the Team Inbox · {provider === 'none' ? 'No CRM connected' : 'HubSpot connected'}
                    </span>
                </div>
                <nav className="flex gap-0.5 pb-2" aria-label="Contacts & CRM">
                    {tabs.map(([k, l, n, href]) => (
                        <Link
                            key={k}
                            href={href}
                            scroll={false}
                            aria-current={tab === k ? 'page' : undefined}
                            className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors duration-150 motion-reduce:transition-none',
                                tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                        >
                            {l}
                            {n !== null && (
                                <span
                                    className={cn(
                                        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] tabular-nums',
                                        tab === k ? 'bg-white/30 text-primary-foreground' : 'bg-muted text-ink-2',
                                    )}
                                >
                                    {n}
                                </span>
                            )}
                        </Link>
                    ))}
                </nav>
            </div>
            <div className="min-h-0 min-w-0 flex-1 px-4 pt-4 pb-16 sm:px-6">{children}</div>
        </div>
    );
}
