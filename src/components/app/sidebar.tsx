'use client';

import { ChevronDownIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo, LogoMark } from '@/components/brand/logo';
import { useStored } from '@/hooks/use-stored';
import { cn } from '@/lib/utils';

import { isVisible, NAV, type NavItem, roleAllows } from './nav';
import { useSession } from './session';

/** "Growth Hub:1,Analytics:0" — groups the person opened or closed; the rest follow the current page. */
function parseGroups(raw: string): Record<string, boolean> {
    return Object.fromEntries(
        raw
            .split(',')
            .filter(Boolean)
            .map((p) => {
                const i = p.lastIndexOf(':');
                return [p.slice(0, i), p.slice(i + 1) === '1'] as const;
            }),
    );
}

/**
 * The app's main menu. `rail`: icons only (64px), for sections with a menu of their own (Chatbots &
 * Flows), so the section's submenu stays open beside it with room for the work.
 */
export function Sidebar({ onNavigate, rail = false }: { onNavigate?: () => void; rail?: boolean }) {
    const pathname = usePathname();
    const { can, me, membership } = useSession();
    const roleKey = membership.role?.key;
    // "Pro" marks what the Pro plan adds (store orders and revenue need integrations at Pro level).
    // Workspaces that already have it, on any plan, do not see the badge.
    const integrations = me.entitlements?.features?.integrations;
    const level = integrations && !Array.isArray(integrations.config) ? integrations.config.level : null;
    const showPro = !(integrations?.enabled && (level === 'all' || level === 'custom'));
    // Groups with sub-items (Growth Hub) fold: open when the current page is inside them,
    // or as the person last left them (remembered in this browser).
    const [storedGroups, setStoredGroups] = useStored<string>('engage:nav:groups', '');
    const groups = parseGroups(storedGroups);
    const setGroup = (label: string, open: boolean) =>
        setStoredGroups(
            Object.entries({ ...groups, [label]: open })
                .map(([k, v]) => `${k}:${v ? 1 : 0}`)
                .join(','),
        );
    const matches = (h?: string) => {
        const b = h?.split('?')[0];
        return !!b && (pathname === b || pathname.startsWith(`${b}/`));
    };

    if (rail) {
        const growth = me.growth?.tier === 'full';
        const growthAny = growth || me.growth?.tier === 'chip';

        return (
            <nav aria-label="Main" className="flex h-full w-16 flex-col items-center bg-sidebar text-sidebar-foreground">
                <div className="flex h-14 items-center">
                    <LogoMark dark />
                </div>
                <div className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-2 pb-4">
                    {NAV.map((section, si) => {
                        const items = section.items.filter(
                            (i) =>
                                i.href &&
                                !i.heading &&
                                isVisible(i) &&
                                (!i.permission || can(i.permission)) &&
                                (!i.growth || growth) &&
                                (!i.growthAny || growthAny) &&
                                roleAllows(i, roleKey),
                        );
                        if (items.length === 0) return null;

                        return (
                            <ul
                                key={section.title}
                                className={cn('grid w-full gap-0.5', si > 0 && 'mt-2 border-t border-white/10 pt-2')}
                                aria-label={section.title}
                            >
                                {items.map((item) => {
                                    const Icon = item.icon;
                                    const deeper = items.some(
                                        (o) =>
                                            o !== item &&
                                            o.href &&
                                            o.href.length > (item.href?.length ?? 0) &&
                                            matches(o.href) &&
                                            o.href.startsWith(item.href ?? ''),
                                    );
                                    const active = matches(item.href) && !deeper && item.label !== 'Billing';

                                    return (
                                        <li key={item.label}>
                                            <Link
                                                href={item.href!}
                                                onClick={onNavigate}
                                                aria-current={active ? 'page' : undefined}
                                                aria-label={item.label}
                                                title={item.label}
                                                className={cn(
                                                    'mx-auto flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-2 hover:text-white',
                                                    active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                                                )}
                                            >
                                                <Icon className="size-[18px]" />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        );
                    })}
                </div>
            </nav>
        );
    }

    return (
        <nav aria-label="Main" className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
            <div className="flex h-14 items-center px-4">
                <Logo dark />
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
                {NAV.map((section) => {
                    const growth = me.growth?.tier === 'full';
                    const growthAny = growth || me.growth?.tier === 'chip';
                    const allowed = section.items.filter(
                        (i) => isVisible(i) && (!i.permission || can(i.permission)) && (!i.growth || growth) && (!i.growthAny || growthAny),
                    );
                    // The role's menu (CN-02): a group stays when any of its sub-items does.
                    const items = allowed.filter((i, idx) => {
                        if (!i.heading) return roleAllows(i, roleKey);
                        const subs: NavItem[] = [];
                        for (const next of allowed.slice(idx + 1)) {
                            if (!next.sub) break;
                            subs.push(next);
                        }

                        return roleAllows(i, roleKey, subs);
                    });
                    if (items.length === 0) return null;

                    // Each sub-item belongs to the nearest item above it that is not a sub-item.
                    const parentOf = new Map<NavItem, NavItem>();
                    const childrenOf = new Map<NavItem, NavItem[]>();
                    let parent: NavItem | null = null;
                    for (const i of items) {
                        if (!i.sub) parent = i;
                        else if (parent) {
                            parentOf.set(i, parent);
                            childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), i]);
                        }
                    }
                    const isOpen = (p: NavItem) => groups[p.label] ?? (childrenOf.get(p) ?? []).some((c) => matches(c.href));

                    return (
                        <div key={section.title} className="mt-4">
                            <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{section.title}</p>
                            <ul className="grid gap-0.5">
                                {items.map((item) => {
                                    const Icon = item.icon;
                                    const owner = parentOf.get(item);
                                    if (owner && !isOpen(owner)) return null; // folded away
                                    const kids = childrenOf.get(item);
                                    const open = kids ? isOpen(item) : false;
                                    // Folded with the current page inside: a small dot keeps "where am I" visible.
                                    const hiddenHere = !!kids && !open && kids.some((c) => matches(c.href));
                                    const here = hiddenHere ? (
                                        <span className="size-1.5 rounded-full bg-primary" aria-label="Current page is in this group" />
                                    ) : null;
                                    const toggle = kids ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setGroup(item.label, !open);
                                            }}
                                            aria-expanded={open}
                                            aria-label={`${open ? 'Collapse' : 'Expand'} ${item.label}`}
                                            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
                                        >
                                            <ChevronDownIcon className={cn('size-4 transition-transform', !open && '-rotate-90')} />
                                        </button>
                                    ) : null;
                                    // The most specific link wins: /insights/marketing highlights Marketing, not Messages & Team.
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
                                        // A group label: the whole row folds and unfolds its sub-items.
                                        return (
                                            <li key={item.label}>
                                                <button
                                                    type="button"
                                                    onClick={() => kids && setGroup(item.label, !open)}
                                                    aria-expanded={kids ? open : undefined}
                                                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] font-semibold text-white transition-colors hover:bg-sidebar-2"
                                                >
                                                    <Icon className="size-4" />
                                                    <span className="flex-1">{item.label}</span>
                                                    {here}
                                                    {kids && (
                                                        <ChevronDownIcon
                                                            className={cn('size-4 text-sidebar-muted transition-transform', !open && '-rotate-90')}
                                                        />
                                                    )}
                                                </button>
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
                                        <li key={item.label} className={cn(nested, kids && 'relative')}>
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
                                                {item.pro && showPro && (
                                                    <span
                                                        className="ml-auto rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                                                        title="Included in the Pro plan"
                                                    >
                                                        Pro
                                                    </span>
                                                )}
                                                {item.preview && (
                                                    <span
                                                        className="ml-auto rounded bg-sidebar-2 px-1.5 py-0.5 text-[10px] font-semibold"
                                                        title="In review: hidden in production"
                                                    >
                                                        Preview
                                                    </span>
                                                )}
                                                {here && <span className="mr-6 ml-auto">{here}</span>}
                                            </Link>
                                            {toggle}
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
