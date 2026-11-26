'use client';

import { ContactIcon, EllipsisIcon, HomeIcon, InboxIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { P } from '@/lib/permissions';
import { HAPTIC, buzz } from '@/lib/mobile';
import { useConversationCounts } from '@/lib/queries';
import { cn } from '@/lib/utils';

import { useSession } from './session';

/** Root screens of the phone app: Home, Inbox, Contacts, Agents, More. */
export const TABS = [
    { href: '/dashboard', label: 'Home', icon: HomeIcon },
    { href: '/inbox', label: 'Inbox', icon: InboxIcon, permission: P.InboxView },
    { href: '/contacts', label: 'Contacts', icon: ContactIcon, permission: P.ContactsView },
    { href: '/insights', label: 'Agents', icon: UsersIcon, permission: P.AnalyticsView },
    { href: '/more', label: 'More', icon: EllipsisIcon },
] as const;

/** Paths that belong to a tab (everything not listed under the first four belongs to More). */
export function tabFor(pathname: string): string {
    const hit = TABS.slice(0, 4).find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));

    return hit?.href ?? '/more';
}

/**
 * The phone's bottom tab bar (brief M1), below 1024 px. The red count on Inbox is the customers
 * waiting for a reply. Tapping the tab you are on scrolls back to the top.
 */
export function MobileTabBar({ hidden }: { hidden: boolean }) {
    const pathname = usePathname();
    const { can } = useSession();
    const counts = useConversationCounts(null, 30_000);
    const waiting = counts.data?.needs_reply ?? 0;
    const active = tabFor(pathname);

    return (
        <nav
            aria-label="Main"
            className={cn(
                'fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur transition-transform duration-250 ease-[cubic-bezier(.2,.8,.2,1)] lg:hidden',
                hidden && 'translate-y-full',
            )}
            aria-hidden={hidden}
        >
            <ul className="mx-auto flex h-16 max-w-xl items-stretch">
                {TABS.filter((t) => !('permission' in t) || can(t.permission)).map((t) => {
                    const on = active === t.href;
                    const Icon = t.icon;

                    return (
                        <li key={t.href} className="flex-1">
                            <Link
                                href={t.href}
                                aria-current={on ? 'page' : undefined}
                                tabIndex={hidden ? -1 : undefined}
                                onClick={(e) => {
                                    buzz(HAPTIC.tab);
                                    if (on && pathname === t.href) {
                                        e.preventDefault();
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                        document.querySelector<HTMLElement>('[data-scroll-root]')?.scrollTo({ top: 0, behavior: 'smooth' });
                                    }
                                }}
                                className={cn(
                                    'flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold active:scale-[.97]',
                                    on ? 'text-foreground' : 'text-muted-foreground',
                                )}
                            >
                                <span className="relative">
                                    {/* Active: a lime pill behind the icon. */}
                                    <span
                                        className={cn(
                                            'absolute -inset-x-3 -inset-y-1 rounded-full bg-primary/40 transition-[opacity,transform] duration-250',
                                            on ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
                                        )}
                                    />
                                    <Icon className="relative size-5" aria-hidden />
                                    {t.href === '/inbox' && waiting > 0 && (
                                        <span className="absolute -top-1.5 -right-3 min-w-4.5 rounded-full bg-bad px-1 text-center text-[10.5px] leading-4.5 text-white tabular-nums">
                                            {waiting > 99 ? '99+' : waiting}
                                        </span>
                                    )}
                                </span>
                                {t.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
