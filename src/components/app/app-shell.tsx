'use client';

import { MenuIcon, XIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';

import { ImpersonationBanner, TrialBanner } from './banners';
import { NumberSwitcher } from './number-switcher';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

export function AppShell({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    // The inbox is an app-within-the-app: full height, panes scroll independently.
    const fullBleed = usePathname().startsWith('/inbox');

    return (
        <div className={cn('flex flex-col', fullBleed ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
            <ImpersonationBanner />
            <div className={cn('flex flex-1', fullBleed && 'min-h-0')}>
                <aside className="sticky top-0 hidden h-dvh shrink-0 lg:block">
                    <Sidebar />
                </aside>

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
                        <WorkspaceSwitcher />
                        <div className="hidden sm:block">
                            <NumberSwitcher />
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <UserMenu />
                        </div>
                    </header>
                    <TrialBanner />
                    <main className={cn(fullBleed ? 'min-h-0 flex-1' : 'mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8')}>{children}</main>
                </div>
            </div>
        </div>
    );
}
