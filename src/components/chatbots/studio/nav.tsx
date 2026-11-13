'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useSession } from '@/components/app/session';
import { useStartRules } from '@/lib/chatbots';
import { P } from '@/lib/permissions';

const LINKS = [
    ['/chatbots', 'My Flows'],
    ['/chatbots/templates', 'Templates'],
    ['/chatbots/runs', 'Runs & Activity'],
    ['/chatbots/insights', 'Flow insights'],
    ['/chatbots/start-rules', 'Start rules'],
    ['/chatbots/settings', 'Bot settings'],
] as const;

/** The Chatbots & Flows section menu (approved design): beside the app sidebar on every page except the builder. */
export function ChatbotsNav() {
    const path = usePathname();
    const { can } = useSession();
    const rules = useStartRules(can(P.ChatbotsView));
    const overlaps = (rules.data ?? []).reduce((n, r) => n + r.overlaps.length, 0);

    return (
        <nav className="cb-subnav max-md:hidden" aria-label="Chatbots & Flows">
            <span className="cb-eyebrow">AUTOMATE</span>
            <span className="cb-title">Chatbots &amp; Flows</span>
            {LINKS.map(([href, label]) => (
                <Link key={href} href={href} className={path === href ? 'cb-on' : undefined} aria-current={path === href ? 'page' : undefined}>
                    {label}
                    {href === '/chatbots/start-rules' && overlaps > 0 && (
                        <span className="cb-chip warn" style={{ height: 20, fontSize: 11 }}>
                            {overlaps} overlap{overlaps === 1 ? '' : 's'}
                        </span>
                    )}
                </Link>
            ))}
            <p className="cb-foot">
                Business name, hours and address come from Settings › Company and Settings › Business hours. Results across all flows are in Insights.
            </p>
        </nav>
    );
}

/** Mobile: the same sections as a scrolling row. */
export function ChatbotsNavMobile() {
    const path = usePathname();

    return (
        <nav className="cb-seg md:hidden" aria-label="Chatbots & Flows sections" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
            {LINKS.map(([href, label]) => (
                <Link key={href} href={href} className={path === href ? 'on' : undefined} style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {label}
                </Link>
            ))}
        </nav>
    );
}
