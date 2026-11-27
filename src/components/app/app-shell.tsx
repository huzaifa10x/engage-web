'use client';

import { PanelLeftCloseIcon, PanelLeftOpenIcon, PinIcon, PinOffIcon } from 'lucide-react';
import { notFound, usePathname } from 'next/navigation';
import { createContext, Suspense, useContext, useEffect, useState } from 'react';

import { Logo } from '@/components/brand/logo';
import { ContactSheetProvider } from '@/components/contacts/contact-sheet';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useStored } from '@/hooks/use-stored';
import { reduceMotion } from '@/lib/mobile';
import { SHOW_UNRELEASED } from '@/lib/release';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';

import { ChannelDisconnectedBanner, ImpersonationBanner, PaymentFailedBanner, TrialBanner } from './banners';
import { MobileTabBar, TABS } from './mobile-tab-bar';
import { OfflineBar } from './offline-bar';
import { OutboxRunner } from './outbox-runner';
import { PushBridge } from './push-bridge';
import { NotificationBell } from './notification-bell';
import { numberScope, UNRELEASED_ROUTES } from './nav';
import { NumberSwitcher } from './number-switcher';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

const ROOT_PATHS = new Set<string>(TABS.map((t) => t.href));

const ShellContext = createContext<{ setChatOpen: (open: boolean) => void }>({ setChatOpen: () => {} });

/** The inbox tells the shell a chat is open, so the main menu folds to icons (unless pinned). */
export function useChatOpen(open: boolean) {
    const { setChatOpen } = useContext(ShellContext);
    useEffect(() => {
        setChatOpen(open);

        return () => setChatOpen(false);
    }, [open, setChatOpen]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
    // The person's "Reduce motion" switch (More) applies from the first screen.
    useEffect(() => {
        if (reduceMotion()) document.documentElement.classList.add('reduce-motion');
    }, []);
    // Remembered per browser, so the extra room stays after a reload.
    const [collapsed, setCollapsed] = useStored<boolean>('engage.sidebar.collapsed', false);
    // The inbox is an app-within-the-app: full height, panes scroll independently.
    const pathname = usePathname();
    const fullBleed = pathname.startsWith('/inbox');
    // Chatbots & Flows has its own section menu beside the app sidebar, flush with it.
    // Contacts & CRM (3.5) spans the page under its own header and tabs.
    const chatbotsPage = pathname === '/chatbots' || pathname.startsWith('/chatbots/');
    const flush = chatbotsPage || pathname === '/contacts' || pathname.startsWith('/contacts/');
    // Opening Chatbots & Flows folds the main menu to icons so the section's own menu (its submenu)
    // stays open with room for the work; the toggle shows the full menu again for this visit only,
    // and the person's own choice for every other page is left alone.
    const [expandedIn, setExpandedIn] = useState<string | null>(null);
    // Opening a chat folds the menu to icons too (3.3), unless the person pinned it open.
    const [chatOpen, setChatOpen] = useState(false);
    const [pinned, setPinned] = useStored<boolean>('engage.inbox.menu-pinned', false);
    const chatFold = fullBleed && chatOpen && !pinned;
    // Phones: inside a chat the composer owns the bottom of the screen.
    const tabBarHidden = fullBleed && chatOpen;
    useKeyboardInset(tabBarHidden);
    const section = chatbotsPage ? 'chatbots' : chatFold ? 'inbox' : null;
    if (section === null && expandedIn !== null) setExpandedIn(null); // leaving the section: next visit folds again
    const rail = section !== null && expandedIn !== section;
    const menuHidden = section !== null ? rail : collapsed;
    const toggleMenu = () => (section !== null ? setExpandedIn(rail ? section : null) : setCollapsed(!collapsed));

    // A module still in review is not reachable in production, not even by typing its address.
    if (!SHOW_UNRELEASED && UNRELEASED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) notFound();

    // The chatbot builder takes the whole screen: its own top bar replaces the app's sidebar and header.
    if (pathname.startsWith('/chatbots/builder')) {
        return (
            <div className="flex h-dvh flex-col overflow-hidden">
                <ImpersonationBanner />
                <main className="flex min-h-0 flex-1">{children}</main>
            </div>
        );
    }

    return (
        <ShellContext.Provider value={{ setChatOpen }}>
            <ContactSheetProvider>
                <div className={cn('flex flex-col', fullBleed ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
                    <ImpersonationBanner />
                    <div className={cn('flex flex-1', fullBleed && 'min-h-0')}>
                        {rail ? (
                            <aside className="sticky top-0 hidden h-dvh shrink-0 lg:block">
                                <Sidebar rail />
                            </aside>
                        ) : (
                            !menuHidden && (
                                <aside className="sticky top-0 hidden h-dvh shrink-0 lg:block">
                                    <Sidebar />
                                </aside>
                            )
                        )}

                        <div className="flex min-w-0 flex-1 flex-col">
                            {/* On phones the top bar sits below the notch; the bottom tab bar (More) replaces the menu. */}
                            <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b bg-card/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6">
                                <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    className="hidden lg:inline-flex"
                                    onClick={toggleMenu}
                                    aria-label={menuHidden ? 'Show the full menu' : 'Hide the menu'}
                                    aria-pressed={menuHidden}
                                    title={menuHidden ? 'Show the full menu' : 'Hide the menu for more room'}
                                >
                                    {menuHidden ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
                                </Button>
                                {fullBleed && (
                                    <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        className="hidden lg:inline-flex"
                                        onClick={() => setPinned(!pinned)}
                                        aria-pressed={pinned}
                                        aria-label={pinned ? 'Unpin the menu' : 'Pin the menu open'}
                                        title={
                                            pinned
                                                ? 'The menu stays open when you open a chat. Click to fold it to icons again.'
                                                : 'Keep the full menu open when you open a chat'
                                        }
                                    >
                                        {pinned ? <PinOffIcon /> : <PinIcon />}
                                    </Button>
                                )}
                                {menuHidden && !rail && (
                                    <span className="hidden lg:inline-flex">
                                        <Logo />
                                    </span>
                                )}
                                <WorkspaceSwitcher />
                                {/* Switches the inbox, filters Dashboard, Campaigns, Leads, Orders and Insights; hidden elsewhere (CN-02). */}
                                {numberScope(pathname) && (
                                    // Phones too: the number decides which chats show and which number new chats are sent from.
                                    <div className="min-w-0">
                                        <NumberSwitcher scope={numberScope(pathname)!} />
                                    </div>
                                )}
                                <div className="ml-auto flex items-center gap-2">
                                    <NotificationBell />
                                    <UserMenu />
                                </div>
                            </header>
                            <PaymentFailedBanner />
                            <TrialBanner />
                            <ChannelDisconnectedBanner />
                            <OfflineBar />
                            {/* Phones: tab roots fade in, inner screens slide in from the right (keyed by page). */}
                            <main
                                key={pathname}
                                data-screen={ROOT_PATHS.has(pathname) ? 'root' : 'push'}
                                className={cn(
                                    fullBleed
                                        ? 'min-h-0 flex-1'
                                        : flush
                                          ? 'flex min-w-0 flex-1'
                                          : 'mx-auto mb-6 w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8',
                                    // Room for the phone's tab bar (and the home bar) under the content.
                                    !tabBarHidden && 'pb-[var(--tabbar)]',
                                    // In a chat: the composer sits on the keyboard (iPhone) or the home bar.
                                    tabBarHidden && 'max-lg:pb-[max(var(--kb,0px),env(safe-area-inset-bottom))]',
                                )}
                            >
                                {children}
                            </main>
                            <MobileTabBar hidden={tabBarHidden} />
                            <Suspense>
                                <PushBridge />
                            </Suspense>
                            <OutboxRunner />
                        </div>
                    </div>
                </div>
            </ContactSheetProvider>
        </ShellContext.Provider>
    );
}
