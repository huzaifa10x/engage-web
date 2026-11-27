'use client';

import Link from 'next/link';

import { useSession } from '@/components/app/session';
import { Skeleton } from '@/components/ui/skeleton';
import { P } from '@/lib/permissions';
import type { DashboardSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

import { SectionLabel } from './kit';

/** A count that hasn't arrived shows a dash, never a 0 that looks real (audit APP-006). */
const shown = (v: number | null | undefined): string | number => (v === null || v === undefined ? '—' : v);

type Tile = { label: string; value: string | number; href: string; tone?: 'warn' | 'bad' | 'good' };

/**
 * Home › Action Centre (mobile brief v5): four counts for the person's role, each opening the whole
 * filtered list (never just the first chat). Role comes from the account: the Owner sees the
 * business, people who assign chats see the team, everyone else sees their own work.
 */
export function ActionCentre({ s }: { s: DashboardSummary | undefined }) {
    const { membership, can } = useSession();
    const role = membership.role?.key === 'owner' ? 'owner' : can(P.InboxAssign) ? 'manager' : 'agent';
    const a = s?.action;
    const w = s?.week;
    const followups = (a?.followups_today ?? 0) + (a?.followups_overdue ?? 0);

    const tiles: Tile[] =
        role === 'agent'
            ? [
                  {
                      label: 'My chats needing a reply',
                      value: shown(s?.needs_reply_mine),
                      href: '/inbox?tab=needs_reply&assigned=me',
                      tone: (s?.needs_reply_mine ?? 0) > 0 ? 'warn' : undefined,
                  },
                  {
                      label: 'Windows closing within 2 h',
                      value: shown(a?.closing_soon),
                      href: '/inbox?tab=needs_reply&assigned=me&window=closing',
                      tone: (a?.closing_soon ?? 0) > 0 ? 'bad' : undefined,
                  },
                  {
                      label: 'Follow-ups today and overdue',
                      value: a ? followups : shown(undefined),
                      href: (a?.followups_overdue ?? 0) > 0 ? '/next-steps?bucket=overdue' : '/next-steps?bucket=today',
                      tone: (a?.followups_overdue ?? 0) > 0 ? 'bad' : undefined,
                  },
                  { label: 'Unread mentions', value: shown(a?.mentions_unread), href: '/notifications' },
              ]
            : role === 'manager'
              ? [
                    {
                        label: 'Team needs reply',
                        value: shown(s?.needs_reply),
                        href: '/inbox?tab=needs_reply',
                        tone: (s?.needs_reply ?? 0) > 0 ? 'warn' : undefined,
                    },
                    { label: 'Unassigned', value: shown(s?.needs_reply_unassigned), href: '/inbox?tab=needs_reply&assigned=unassigned' },
                    {
                        label: 'Windows closing within 2 h',
                        value: shown(a?.closing_soon),
                        href: '/inbox?tab=needs_reply&window=closing',
                        tone: (a?.closing_soon ?? 0) > 0 ? 'bad' : undefined,
                    },
                    {
                        label: 'Overdue follow-ups',
                        value: shown(a?.followups_overdue),
                        href: '/next-steps?bucket=overdue',
                        tone: (a?.followups_overdue ?? 0) > 0 ? 'bad' : undefined,
                    },
                ]
              : [
                    { label: 'New enquiries yesterday', value: shown(w?.new_enquiries.at(-2)), href: '/insights' },
                    { label: 'Open deals', value: shown(a?.open_deals), href: '/contacts?tab=deals' },
                    {
                        label: 'Answered on time · 7 days',
                        value: w?.on_time_pct === null || w?.on_time_pct === undefined ? '—' : `${w.on_time_pct}%`,
                        href: '/insights',
                        tone: 'good',
                    },
                    {
                        label: 'Overdue follow-ups',
                        value: shown(a?.followups_overdue),
                        href: '/next-steps?bucket=overdue',
                        tone: (a?.followups_overdue ?? 0) > 0 ? 'bad' : undefined,
                    },
                ];

    return (
        <section aria-label="Action Centre">
            <SectionLabel>Action Centre</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
                {!s
                    ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px] rounded-2xl" />)
                    : tiles.map((t) => (
                          <Link
                              key={t.label}
                              href={t.href}
                              className="min-w-0 rounded-2xl bg-card p-3.5 shadow-[0_1px_2px_rgba(13,17,9,.05)] transition-transform active:scale-[.97] motion-reduce:transition-none"
                          >
                              <b
                                  className={cn(
                                      'block text-[26px] leading-tight font-extrabold tracking-[-0.5px] tabular-nums',
                                      t.tone === 'warn' && 'text-warn',
                                      t.tone === 'bad' && 'text-bad',
                                  )}
                              >
                                  {t.value}
                              </b>
                              <small className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{t.label}</small>
                          </Link>
                      ))}
            </div>
        </section>
    );
}
