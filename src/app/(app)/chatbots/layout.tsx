'use client';

import '@/components/chatbots/studio/studio.css';

import { usePathname } from 'next/navigation';

import { ChatbotsNav, ChatbotsNavMobile } from '@/components/chatbots/studio/nav';

/** Chatbots & Flows: the section menu beside every page; the builder takes the whole screen. */
export default function ChatbotsLayout({ children }: { children: React.ReactNode }) {
    const path = usePathname();
    if (path.startsWith('/chatbots/builder')) return <div className="cbx flex min-h-0 w-full min-w-0 flex-1">{children}</div>;

    return (
        <div className="cbx flex min-h-[calc(100dvh-3.5rem)] w-full min-w-0 flex-1" style={{ background: 'var(--cb-bg)' }}>
            <ChatbotsNav />
            <div className="min-w-0 flex-1">
                <div className="cb-page">
                    <ChatbotsNavMobile />
                    {children}
                </div>
            </div>
        </div>
    );
}
