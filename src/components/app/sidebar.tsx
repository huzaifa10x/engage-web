'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

import { NAV } from './nav';
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
                    const items = section.items.filter((i) => !i.permission || can(i.permission));
                    if (items.length === 0) return null;

                    return (
                        <div key={section.title} className="mt-4">
                            <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{section.title}</p>
                            <ul className="grid gap-0.5">
                                {items.map((item) => {
                                    const Icon = item.icon;
                                    const base = item.href?.split('?')[0];
                                    const active = !!base && (pathname === base || pathname.startsWith(`${base}/`)) && !(item.label === 'Billing');

                                    if (!item.href) {
                                        return (
                                            <li key={item.label}>
                                                <span
                                                    className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] text-sidebar-muted"
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
                                        <li key={item.label}>
                                            <Link
                                                href={item.href}
                                                onClick={onNavigate}
                                                aria-current={active ? 'page' : undefined}
                                                className={cn(
                                                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] font-medium transition-colors hover:bg-sidebar-2 hover:text-white',
                                                    active && 'bg-primary text-white hover:bg-primary',
                                                )}
                                            >
                                                <Icon className="size-4" />
                                                {item.label}
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
                {me.entitlements ? `${me.entitlements.plan_name} plan` : '—'}
            </div>
        </nav>
    );
}
