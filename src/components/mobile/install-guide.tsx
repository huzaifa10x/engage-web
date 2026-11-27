'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';

import { BottomSheet } from '@/components/mobile/kit';
import { canPrompt, isInstalled, platform, type Platform, promptInstall } from '@/lib/install';

const STEPS: Record<'iphone' | 'android', string[]> = {
    iphone: [
        'Open the link in Safari (not Chrome, and not inside WhatsApp).',
        'Tap Share ⬆︎ (on newer iPhones, tap ••• first).',
        'Tap Add to Home Screen, then open engageX from your Home Screen.',
    ],
    android: ['Open the link in Chrome.', 'Tap Install when it’s offered, or ⋮ → Install app.', 'Open engageX from your home screen.'],
};

/**
 * Install the app, wherever the person is (audit MOB-005): one tap on Android Chrome when Chrome
 * offers it; otherwise a QR code and the link to open on the phone, with the steps for iPhone and
 * Android. Never a dead end.
 */
export function InstallGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    // Only read in the browser, and only shown once the sheet opens (never rendered on the server).
    const [where] = useState<Platform>(() => (typeof window === 'undefined' ? 'desktop' : platform()));
    const [url] = useState(() => (typeof window === 'undefined' ? '' : `${window.location.origin}/mobile`));
    const installed = typeof window !== 'undefined' && isInstalled();
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied');
        } catch {
            toast.message(url);
        }
    };

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange} title={installed ? 'engageX is installed' : 'Install the engageX app'}>
            <div className="grid gap-4 px-4 pt-1 pb-3 text-[14px]">
                {installed ? (
                    <p>You’re using the installed app. To install it on another phone, open the link below there.</p>
                ) : where === 'android' && canPrompt() ? (
                    <button
                        type="button"
                        onClick={() => void promptInstall().then((ok) => ok && (toast.success('engageX installed ✓'), onOpenChange(false)))}
                        className="h-12 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"
                    >
                        Install now
                    </button>
                ) : null}
                {(where === 'desktop' || installed) && url && (
                    <div className="flex items-center gap-4">
                        <div className="rounded-xl border bg-white p-2">
                            <QRCodeSVG value={url} size={112} aria-label="QR code to open engageX on your phone" />
                        </div>
                        <p className="text-[13.5px] text-muted-foreground">
                            Scan this with your phone’s camera to open engageX there, then follow the steps for your phone.
                        </p>
                    </div>
                )}
                <a href="/mobile" className="text-[13.5px] font-semibold text-brand-600 underline-offset-2 hover:underline">
                    Full install guide with help →
                </a>
                <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{url}</span>
                    <button type="button" onClick={() => void copy()} className="shrink-0 text-[13px] font-semibold text-brand-600">
                        Copy link
                    </button>
                </div>
                {(['iphone', 'android'] as const)
                    .filter(
                        (k) =>
                            where === 'desktop' ||
                            installed ||
                            (k === 'iphone' ? where.startsWith('ios') || where === 'inapp' : where === 'android' || where === 'inapp'),
                    )
                    .map((k) => (
                        <section key={k}>
                            <h3 className="mb-1.5 text-[12px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                                {k === 'iphone' ? 'iPhone' : 'Android'}
                            </h3>
                            <ol className="grid gap-1.5">
                                {STEPS[k].map((step, i) => (
                                    <li key={step} className="flex gap-2.5">
                                        <b className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] text-primary-foreground">
                                            {i + 1}
                                        </b>
                                        <span>{step}</span>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    ))}
            </div>
        </BottomSheet>
    );
}
