'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
    ['/chatbots', 'Flows'],
    ['/chatbots/runs', 'Runs & Activity'],
    ['/chatbots/start-rules', 'Start rules'],
] as const;

/** The Chatbots & Flows sections. */
export function ChatbotsTabs() {
    const path = usePathname();

    return (
        <nav className="mb-5 flex gap-1 border-b text-[13px] font-semibold" aria-label="Chatbots sections">
            {TABS.map(([href, label]) => (
                <Link
                    key={href}
                    href={href}
                    aria-current={path === href ? 'page' : undefined}
                    className={cn(
                        '-mb-px border-b-2 px-3 py-2',
                        path === href ? 'border-brand-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                >
                    {label}
                </Link>
            ))}
        </nav>
    );
}
