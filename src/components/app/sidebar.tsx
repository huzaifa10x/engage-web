'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

import { isVisible, NAV } from './nav';
import { useSession } from './session';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
    const pathname = usePathname();
    const { can, me } = useSession();

    return (
        <nav aria-label="Main" className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
            <div className="flex h-14 items-center px-4">
                <Logo dark />
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
                {NAV.map((section) => {
                    const growth = me.growth?.tier === 'full';
                    const growthAny = growth || me.growth?.tier === 'chip';
                    const items = section.items.filter(
                        (i) => isVisible(i) && (!i.permission || can(i.permission)) && (!i.growth || growth) && (!i.growthAny || growthAny),
                    );
                    if (items.length === 0) return null;

                    return (
                        <div key={section.title} className="mt-4">
                            <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{section.title}</p>
                            <ul className="grid gap-0.5">
                                {items.map((item) => {
                                    const Icon = item.icon;
                                    const base = item.href?.split('?')[0];
                                    // The most specific link wins: /analytics/marketing highlights Marketing, not Analytics.
                                    const matches = (h?: string) => {
                                        const b = h?.split('?')[0];
                                        return !!b && (pathname === b || pathname.startsWith(`${b}/`));
                                    };
                                    const deeper = items.some(
                                        (o) =>
                                            o !== item &&
                                            o.href &&
                                            o.href.length > (item.href?.length ?? 0) &&
                                            matches(o.href) &&
                                            o.href.startsWith(item.href ?? ''),
                                    );
                                    const active = matches(item.href) && !deeper && !(item.label === 'Billing');

                                    if (item.heading) {
                                        return (
                                            <li key={item.label}>
                                                <span className="flex cursor-default items-center gap-2.5 px-2.5 py-1.5 text-[13.5px] font-semibold text-white">
                                                    <Icon className="size-4" />
                                                    <span className="flex-1">{item.label}</span>
                                                </span>
                                            </li>
                                        );
                                    }

                                    // Sub-items sit under their parent (Growth Hub › Leads, Tracking Setup; Analytics ›
                                    // Marketing) with a guide line, so the nesting is visible.
                                    const nested = item.sub ? '-mt-0.5 ml-[17px] border-l border-white/15 pt-0.5 pl-2' : undefined;

                                    if (!item.href) {
                                        return (
                                            <li key={item.label} className={nested}>
                                                <span
                                                    className={cn(
                                                        'flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] text-sidebar-muted',
                                                    )}
                                                    title="Coming soon"
                                                >
                                                    <Icon className="size-4" />
                                                    <span className="flex-1">{item.label}</span>
                                                    <span className="rounded bg-sidebar-2 px-1.5 py-0.5 text-[10px] font-semibold">Soon</span>
                                                </span>
                                            </li>
                                        );
                                    }

                                    return (
                                        <li key={item.label} className={nested}>
                                            <Link
                                                href={item.href}
                                                onClick={onNavigate}
                                                aria-current={active ? 'page' : undefined}
                                                className={cn(
                                                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-colors hover:bg-sidebar-2 hover:text-white',
                                                    item.sub && 'text-[13px]',
                                                    active && 'bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                                                )}
                                            >
                                                <Icon className="size-4" />
                                                {item.label}
                                                {item.preview && (
                                                    <span
                                                        className="ml-auto rounded bg-sidebar-2 px-1.5 py-0.5 text-[10px] font-semibold"
                                                        title="In review: hidden in production"
                                                    >
                                                        Preview
                                                    </span>
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </div>
            <div className="border-t border-white/5 px-4 py-3 text-[12px] text-sidebar-muted">
                {me.entitlements?.plan?.name ? `${me.entitlements.plan.name} plan` : '—'}
            </div>
        </nav>
    );
}
