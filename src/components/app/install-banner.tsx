'use client';

import { DownloadIcon, ShareIcon, XIcon } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { BottomSheet } from '@/components/mobile/kit';
import { canPrompt, isInstalled, onInstallChange, platform, type Platform, promptInstall } from '@/lib/install';

const HIDE_KEY = 'engage.install-banner.hidden-until';
const WEEK = 7 * 86_400_000;

const COPY: Record<Exclude<Platform, 'desktop'>, { title: string; button: string }> = {
    android: { title: 'Install the engageX app', button: 'Install' },
    'ios-safari': { title: 'Get the engageX app', button: 'Show me' },
    'ios-other': { title: 'Install engageX from Safari', button: 'Copy link' },
    inapp: { title: 'Open engageX in your browser', button: 'Copy link' },
};

function hiddenNow(): boolean {
    try {
        return Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now();
    } catch {
        return false;
    }
}

/**
 * The install banner (mobile brief): turns a phone visit into the installed app. Android Chrome
 * installs in one tap; iPhone Safari gets a guide (Apple allows no install button); iPhone Chrome is
 * told to use Safari; inside WhatsApp, Instagram or Facebook it says to open the browser. Never on a
 * computer or when already installed. Close hides it for 7 days.
 */
export function InstallBanner() {
    const [show, setShow] = useState(false);
    const [guide, setGuide] = useState(false);
    const [where, setWhere] = useState<Platform>('desktop');
    const promptable = useSyncExternalStore(onInstallChange, canPrompt, () => false);

    useEffect(() => {
        const p = platform();
        if (p === 'desktop' || isInstalled() || hiddenNow()) return;
        const t = setTimeout(() => {
            setWhere(p);
            setShow(true);
        }, 1200);

        return () => clearTimeout(t);
    }, []);
    // Android: Chrome only offers installing once it has decided the app qualifies.
    if (!show || where === 'desktop' || (where === 'android' && !promptable)) return null;

    const close = () => {
        try {
            localStorage.setItem(HIDE_KEY, String(Date.now() + WEEK));
        } catch {
            // fine
        }
        setShow(false);
    };
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(window.location.origin);
            toast.success('Link copied. Paste it in Safari or Chrome.');
        } catch {
            toast.message(window.location.origin);
        }
    };
    const act = async () => {
        if (where === 'android') {
            if (await promptInstall()) {
                setShow(false);
                toast.success('engageX installed ✓');
            }
            return;
        }
        if (where === 'ios-safari') return setGuide(true);
        await copy();
    };
    const c = COPY[where];

    return (
        <>
            <div
                role="region"
                aria-label="Install the app"
                className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[60] flex animate-in items-center gap-3 rounded-2xl border bg-card p-3 shadow-[0_12px_32px_rgba(13,17,9,.18)] duration-400 slide-in-from-top-4 lg:hidden"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-semibold">{c.title}</b>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                        {where === 'inapp'
                            ? '⋮ or ••• → Open in browser'
                            : where === 'ios-safari'
                              ? 'Add it to your Home Screen · Free'
                              : 'Alerts when a customer is waiting · Free'}
                    </span>
                </span>
                <button
                    type="button"
                    onClick={() => void act()}
                    className="h-9 shrink-0 rounded-[10px] bg-primary px-3.5 text-[13px] font-bold text-primary-foreground active:scale-[.97]"
                >
                    {c.button}
                </button>
                <button
                    type="button"
                    onClick={close}
                    aria-label="Not now"
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
                >
                    <XIcon className="size-4" />
                </button>
            </div>
            <BottomSheet open={guide} onOpenChange={setGuide} title="Add engageX to your Home Screen">
                <ol className="grid gap-3 px-4 pt-1 pb-3 text-[14.5px]">
                    <li className="flex gap-3">
                        <b className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[13px] text-primary-foreground">1</b>
                        <span>
                            Tap <ShareIcon className="inline size-4 align-[-2px]" aria-label="Share" /> <b>Share</b> at the bottom of Safari (on newer iPhones,
                            tap ••• first)
                        </span>
                    </li>
                    <li className="flex gap-3">
                        <b className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[13px] text-primary-foreground">2</b>
                        <span>
                            Tap <b>Add to Home Screen</b> and keep “Open as Web App” on
                        </span>
                    </li>
                    <li className="flex gap-3">
                        <b className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[13px] text-primary-foreground">3</b>
                        <span>Open engageX from your Home Screen and sign in. Then turn on notifications from Home.</span>
                    </li>
                </ol>
                <div className="flex justify-center pb-2 text-muted-foreground" aria-hidden>
                    <DownloadIcon className="size-6 animate-bounce" />
                </div>
            </BottomSheet>
        </>
    );
}
