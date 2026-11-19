'use client';

import { MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PinIcon, PinOffIcon, XIcon } from 'lucide-react';
import { notFound, usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';

import { Logo } from '@/components/brand/logo';
import { ContactSheetProvider } from '@/components/contacts/contact-sheet';
import { useStored } from '@/hooks/use-stored';
import { SHOW_UNRELEASED } from '@/lib/release';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';

import { ChannelDisconnectedBanner, ImpersonationBanner, TrialBanner } from './banners';
import { NotificationBell } from './notification-bell';
import { numberScope, UNRELEASED_ROUTES } from './nav';
import { NumberSwitcher } from './number-switcher';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

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
    const [mobileOpen, setMobileOpen] = useState(false);
    // Remembered per browser, so the extra room stays after a reload.
    const [collapsed, setCollapsed] = useStored<boolean>('engage.sidebar.collapsed', false);
    // The inbox is an app-within-the-app: full height, panes scroll independently.
    const pathname = usePathname();
    const fullBleed = pathname.startsWith('/inbox');
    // Chatbots & Flows has its own section menu beside the app sidebar, flush with it.
    const flush = pathname === '/chatbots' || pathname.startsWith('/chatbots/');
    // Opening Chatbots & Flows folds the main menu to icons so the section's own menu (its submenu)
    // stays open with room for the work; the toggle shows the full menu again for this visit only,
    // and the person's own choice for every other page is left alone.
    const [expandedIn, setExpandedIn] = useState<string | null>(null);
    // Opening a chat folds the menu to icons too (3.3), unless the person pinned it open.
    const [chatOpen, setChatOpen] = useState(false);
    const [pinned, setPinned] = useStored<boolean>('engage.inbox.menu-pinned', false);
    const chatFold = fullBleed && chatOpen && !pinned;
    const section = flush ? 'chatbots' : chatFold ? 'inbox' : null;
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

                        {mobileOpen && (
                            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
                                <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
                                <div className="absolute inset-y-0 left-0 shadow-xl">
                                    <Sidebar onNavigate={() => setMobileOpen(false)} />
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="absolute top-3 left-[17rem] text-white hover:bg-white/10"
                                    onClick={() => setMobileOpen(false)}
                                    aria-label="Close menu"
                                >
                                    <XIcon />
                                </Button>
                            </div>
                        )}

                        <div className="flex min-w-0 flex-1 flex-col">
                            <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-6">
                                <Button size="icon-sm" variant="ghost" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                                    <MenuIcon />
                                </Button>
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
                                    <div className="hidden sm:block">
                                        <NumberSwitcher scope={numberScope(pathname)!} />
                                    </div>
                                )}
                                <div className="ml-auto flex items-center gap-2">
                                    <NotificationBell />
                                    <UserMenu />
                                </div>
                            </header>
                            <TrialBanner />
                            <ChannelDisconnectedBanner />
                            <main
                                className={cn(
                                    fullBleed ? 'min-h-0 flex-1' : flush ? 'flex min-w-0 flex-1' : 'mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8',
                                )}
                            >
                                {children}
                            </main>
                        </div>
                    </div>
                </div>
            </ContactSheetProvider>
        </ShellContext.Provider>
    );
}
