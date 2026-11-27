'use client';

import { CopyIcon } from 'lucide-react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { Logo } from '@/components/brand/logo';
import { canPrompt, isInstalled, onInstallChange, platform, promptInstall } from '@/lib/install';
import { cn } from '@/lib/utils';

type Device = 'iphone' | 'ipad' | 'android';
type Step = { title: React.ReactNode; hint?: string };

const FAQ: [string, string][] = [
    [
        'I don’t see “Add to Home Screen”',
        'You’re probably in Chrome or inside WhatsApp. On iPhone it only works in Safari. Copy the link above, open Safari, paste it, then tap Share.',
    ],
    [
        'I opened the link from WhatsApp',
        'WhatsApp opens links in its own small browser, which can’t install apps. Tap ⋮ or ••• at the top and choose “Open in Chrome” (Android) or “Open in Safari” (iPhone).',
    ],
    [
        'Notifications don’t arrive on iPhone',
        'They only work in the app opened from your Home Screen, on iOS 16.4 or later. Open engageX from the icon, go to More → Notification settings and tap Turn on. Check Settings → Notifications → engageX too.',
    ],
    [
        'Android didn’t show an Install button',
        'In Chrome, tap ⋮ at the top right and choose “Install app” or “Add to Home screen”. Samsung Internet: tap ☰ → Add page to → Home screen.',
    ],
    [
        'Is it a real app? Is it safe?',
        'It’s engageX itself, installed from the same address you sign in at. It updates itself, takes almost no space and uses the same sign-in as the website. Remove it like any app.',
    ],
];

const kbd = (t: string) => <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[13px] font-semibold">{t}</span>;

const AFTER: Step[] = [
    { title: 'Open engageX from your home screen', hint: 'Look for the black icon with the lime X. Sign in with your work email and the 6-digit code.' },
    { title: 'Turn on notifications', hint: 'Tap “Turn on” on the Home card, then Allow.' },
    { title: 'Send your first reply', hint: 'Open a waiting chat and reply. That’s it: alerts now reach this phone.' },
];

/**
 * The install page (mobile brief M6): one address for every "install the app" link, QR code and
 * email. Picks the device it's opened on (iPhone, iPad, Android), shows the numbered steps, offers
 * one-tap install where Chrome allows it, and answers the usual "stuck on a step" questions. Public:
 * no sign-in needed.
 */
export default function MobileInstallPage() {
    const where = useSyncExternalStore(
        () => () => {},
        () => platform(),
        () => 'desktop' as const,
    );
    const promptable = useSyncExternalStore(onInstallChange, canPrompt, () => false);
    const installed = useSyncExternalStore(
        () => () => {},
        () => isInstalled(),
        () => false,
    );
    const ipad = useSyncExternalStore(
        () => () => {},
        () => /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
        () => false,
    );
    const auto: Device = where === 'android' ? 'android' : ipad ? 'ipad' : 'iphone';
    const [picked, setPicked] = useState<Device | null>(null);
    const device = picked ?? auto;
    const url = useSyncExternalStore(
        () => () => {},
        () => `${window.location.origin}/mobile`,
        () => '',
    );
    const inApp = where === 'inapp';
    const notSafari = where === 'ios-other';

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied · paste it in Safari or Chrome');
        } catch {
            toast.message(url);
        }
    };
    const install = async () => {
        if (await promptInstall()) toast.success('Installed ✓ Open engageX from your home screen');
    };

    const steps: Step[] =
        device === 'android'
            ? [
                  {
                      title: promptable ? <>Tap {kbd('Install engageX now')} above</> : <>Tap {kbd('Install')} on the banner at the bottom</>,
                      hint: 'No banner? Tap ⋮ at the top right of Chrome and choose “Install app”.',
                  },
                  { title: <>Tap {kbd('Install')} to confirm</>, hint: 'The icon appears on your home screen and in your app drawer.' },
                  ...AFTER,
              ]
            : [
                  {
                      title: <>Open this page in {kbd('Safari')}</>,
                      hint:
                          where === 'desktop'
                              ? 'Scan the QR code above with your phone, or type the address below into Safari on it.'
                              : inApp
                                ? 'You’re inside another app now. Copy the link above and paste it in Safari.'
                                : notSafari
                                  ? 'You’re in Chrome. iPhone and iPad apps install from Safari.'
                                  : 'You’re in the right place.',
                  },
                  {
                      title: <>Tap {kbd('Share ⬆︎')}</>,
                      hint: device === 'ipad' ? 'At the top right, next to the address bar.' : 'At the bottom of the screen. On newer iPhones tap ••• first.',
                  },
                  {
                      title: <>Tap {kbd('Add to Home Screen')}</>,
                      hint: 'Scroll down the list if you don’t see it. Keep “Open as Web App” switched on, then tap Add.',
                  },
                  ...AFTER,
              ];

    return (
        <main className="min-h-dvh bg-background px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto grid max-w-[560px] gap-6">
                <Logo className="h-8 self-start" />
                <header>
                    <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.6px]">
                        {installed ? 'engageX is installed' : 'Put engageX on your phone'}
                    </h1>
                    <p className="mt-2 text-[15.5px] text-muted-foreground">
                        {installed
                            ? 'You’re using the app. To put it on another phone, open this page there.'
                            : 'Reply to customers from your home screen, full screen, with a notification the moment someone is waiting. Takes under a minute. No app store.'}
                    </p>
                </header>

                {where === 'desktop' && url && (
                    <section className="flex items-center gap-4 rounded-2xl border bg-card p-4">
                        <div className="rounded-xl border bg-white p-2">
                            <QRCodeSVG value={url} size={120} aria-label="QR code to open this page on your phone" />
                        </div>
                        <p className="text-[14px] text-muted-foreground">
                            <b className="block text-foreground">On a computer?</b>Scan this with your phone’s camera, then follow the steps for your phone.
                        </p>
                    </section>
                )}

                <div role="tablist" aria-label="Your device" className="flex gap-[3px] rounded-[11px] bg-muted p-[3px]">
                    {(
                        [
                            ['iphone', 'iPhone'],
                            ['ipad', 'iPad'],
                            ['android', 'Android'],
                        ] as [Device, string][]
                    ).map(([d, l]) => (
                        <button
                            key={d}
                            type="button"
                            role="tab"
                            aria-selected={device === d}
                            onClick={() => setPicked(d)}
                            className={cn(
                                'h-10 flex-1 rounded-[9px] text-[14px] font-bold',
                                device === d ? 'bg-card shadow-[0_1px_3px_rgba(13,17,9,.12)]' : 'text-muted-foreground',
                            )}
                        >
                            {l}
                        </button>
                    ))}
                </div>
                <p className="-mt-3 text-[13px] text-muted-foreground">
                    {inApp ? 'You opened this inside another app. ' : ''}
                    {where === 'desktop' ? 'Pick the phone you’ll use.' : 'We picked your device. Tap another if it’s wrong.'}
                </p>

                <section className="rounded-2xl border bg-card p-4">
                    <h2 className="text-[19px] font-bold">{device === 'iphone' ? 'iPhone' : device === 'ipad' ? 'iPad' : 'Android'}</h2>
                    <p className="text-[13.5px] text-muted-foreground">
                        {device === 'android'
                            ? 'Chrome, Samsung Internet or Edge.'
                            : `Use Safari. ${device === 'ipad' ? 'iPadOS' : 'iOS'} 16.4 or later for notifications.`}
                    </p>
                    {device === 'android' && promptable && (
                        <button
                            type="button"
                            onClick={() => void install()}
                            className="mt-3 h-12 w-full rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"
                        >
                            Install engageX now
                        </button>
                    )}
                    {(inApp || (notSafari && device !== 'android')) && (
                        <button
                            type="button"
                            onClick={() => void copy()}
                            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"
                        >
                            <CopyIcon className="size-4" aria-hidden /> Copy the app link
                        </button>
                    )}
                    <ol className="mt-4 grid gap-3.5">
                        {steps.map((s, i) => (
                            <li key={i} className="flex gap-3">
                                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
                                    {i + 1}
                                </span>
                                <span className="min-w-0 pt-0.5">
                                    <b className="block text-[15px] font-semibold">{s.title}</b>
                                    {s.hint && <span className="mt-0.5 block text-[13.5px] text-muted-foreground">{s.hint}</span>}
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>

                <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{url}</span>
                    <button type="button" onClick={() => void copy()} className="shrink-0 text-[13px] font-semibold text-brand-600">
                        Copy link
                    </button>
                </div>

                <section>
                    <h2 className="mb-2 text-[12px] font-bold tracking-[0.06em] text-muted-foreground uppercase">Stuck on a step?</h2>
                    <div className="divide-y rounded-2xl border bg-card">
                        {FAQ.map(([q, a]) => (
                            <details key={q} className="group px-4 py-3">
                                <summary className="cursor-pointer list-none text-[15px] font-semibold">{q}</summary>
                                <p className="mt-1.5 text-[14px] text-muted-foreground">{a}</p>
                            </details>
                        ))}
                    </div>
                    <p className="mt-3 text-[13.5px] text-muted-foreground">
                        Still stuck?{' '}
                        <a href="https://engage.10xdigital.ae/contact" className="font-semibold text-brand-600 underline-offset-2 hover:underline">
                            Contact us
                        </a>
                        {' · '}
                        <Link href="/login" className="font-semibold text-brand-600 underline-offset-2 hover:underline">
                            Sign in
                        </Link>
                    </p>
                </section>
            </div>
        </main>
    );
}
