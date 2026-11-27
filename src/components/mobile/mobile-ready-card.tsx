'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { PUSH_KEY, usePushState } from '@/components/settings/phone-notifications-card';
import { InstallGuide } from '@/components/mobile/install-guide';
import { useStored } from '@/hooks/use-stored';
import { api, errorMessage } from '@/lib/api';
import { canPrompt, isInstalled, onInstallChange, platform, promptInstall } from '@/lib/install';
import { REPLIED_KEY } from '@/lib/outbox';
import { currentSubscription, enablePush, permission, pushSupport } from '@/lib/push';
import { cn } from '@/lib/utils';

const HOW: Record<string, string> = {
    'ios-safari': 'Tap Share ⬆︎ at the bottom of Safari, then Add to Home Screen, and open engageX from your Home Screen.',
    'ios-other': 'Open this page in Safari, tap Share ⬆︎, then Add to Home Screen.',
    inapp: 'Open this page in Chrome or Safari (⋮ or ••• → Open in browser), then install it from there.',
    android: 'In Chrome, tap ⋮ → Install app (or Add to Home screen).',
    desktop: 'Open engageX on your phone to install it.',
};

const replied = () => {
    try {
        return localStorage.getItem(REPLIED_KEY) === '1';
    } catch {
        return false;
    }
};

/**
 * Home › Get mobile-ready (mobile brief v5): five steps, each ticked only when confirmed: installed,
 * notifications allowed, push registered (the server has this phone), a test sent by the server and
 * tapped, and a first reply from this phone accepted by the server. A notification the phone shows by
 * itself doesn't count. Collapsible; "You're mobile-ready" at 5 of 5. If notifications are later turned
 * off, a warning replaces it.
 */
export function MobileReadyCard() {
    const qc = useQueryClient();
    const push = usePushState();
    const [hidden, setHidden] = useStored<boolean>('engage.mobile-ready.hidden', false);
    const [open, setOpen] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [how, setHow] = useState(false);
    const [guide, setGuide] = useState(false);
    const promptable = useSyncExternalStore(onInstallChange, canPrompt, () => false);
    const [env, setEnv] = useState({ installed: false, allowed: false, replied: false, support: 'unsupported' as ReturnType<typeof pushSupport> });
    useEffect(() => {
        const read = () => setEnv({ installed: isInstalled(), allowed: permission() === 'granted', replied: replied(), support: pushSupport() });
        read();
        window.addEventListener('focus', read);
        window.addEventListener('storage', read);

        return () => {
            window.removeEventListener('focus', read);
            window.removeEventListener('storage', read);
        };
    }, [push.data]);

    const device = push.data?.this_device ?? null;
    const steps = [
        { key: 'install', label: 'Install the app', done: env.installed },
        { key: 'allow', label: 'Allow notifications', done: env.allowed },
        { key: 'register', label: 'Notifications reach this phone', done: env.allowed && !!device },
        { key: 'test', label: 'Test notification tapped', done: !!device?.test_tapped_at },
        { key: 'reply', label: 'First reply sent from this phone', done: env.replied },
    ];
    const done = steps.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done);

    if (push.data && !push.data.enabled) return null;
    // Was ready, then notifications were turned off on the phone: say so.
    if (hidden && env.installed && !env.allowed && device) {
        return (
            <Link href="/settings?tab=notifications" className="mt-2.5 block rounded-2xl border border-warn/40 bg-warn-bg p-3.5 text-[13.5px] text-warn">
                <b className="block font-semibold">Notifications are off on this phone</b>
                You won’t hear about waiting customers. Tap to turn them back on.
            </Link>
        );
    }
    if (hidden) return null;

    const run = async (key: string, fn: () => Promise<unknown>) => {
        setBusy(key);
        try {
            await fn();
        } catch (e) {
            toast.error(e instanceof Error && !('status' in e) ? e.message : errorMessage(e));
        } finally {
            setBusy(null);
            void qc.invalidateQueries({ queryKey: PUSH_KEY });
            setEnv({ installed: isInstalled(), allowed: permission() === 'granted', replied: replied(), support: pushSupport() });
        }
    };
    const act = () => {
        if (!next) return;
        if (next.key === 'install') {
            if (promptable) return void run('install', promptInstall);
            // Can't install from here: QR code, link and steps (audit MOB-005).
            return setGuide(true);
        }
        if (next.key === 'allow' || next.key === 'register') {
            if (env.support !== 'supported') return setHow(true);
            return void run('allow', async () => {
                if (!push.data?.public_key) throw new Error('Phone notifications are not set up on the server yet.');
                await enablePush(push.data.public_key);
                push.setEndpoint((await currentSubscription())?.endpoint ?? null);
            });
        }
        if (next.key === 'test') {
            return void run('test', async () => {
                await api('push/test', { method: 'POST', body: { endpoint: push.endpoint } });
                toast.success('Test sent. Tap it when it arrives.');
            });
        }
    };
    const cta = !next ? null : next.key === 'install' ? 'Install' : next.key === 'test' ? 'Send test' : next.key === 'reply' ? null : 'Turn on';
    const pct = (done / steps.length) * 100;

    return (
        <section className="mt-2.5 rounded-2xl border border-primary/60 bg-card p-3.5 shadow-[0_1px_2px_rgba(13,17,9,.05)]" aria-label="Get mobile-ready">
            <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-left" aria-expanded={open}>
                <span
                    className="relative grid size-11 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums"
                    style={{ background: `conic-gradient(var(--primary) ${pct}%, var(--line-2) 0)` }}
                    aria-hidden
                >
                    <span className="absolute inset-[4px] grid place-items-center rounded-full bg-card">{done}/5</span>
                </span>
                <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-semibold">{done === 5 ? 'You’re mobile-ready ✓' : 'Get mobile-ready'}</b>
                    <span className="block text-[12.5px] text-muted-foreground">
                        {done === 5 ? 'Customers can reach you wherever you are.' : (next?.label ?? '')}
                    </span>
                </span>
                <ChevronDownIcon className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden />
            </button>
            {open && (
                <>
                    <ol className="mt-3 grid gap-1.5">
                        {steps.map((s) => (
                            <li key={s.key} className="flex items-center gap-2.5 text-[13.5px]">
                                <span
                                    className={cn(
                                        'grid size-5 shrink-0 place-items-center rounded-full border',
                                        s.done ? 'border-good bg-good text-white' : 'border-line-2 text-transparent',
                                    )}
                                >
                                    <CheckIcon className="size-3" aria-hidden />
                                </span>
                                <span className={cn(s.done && 'text-muted-foreground line-through')}>{s.label}</span>
                            </li>
                        ))}
                    </ol>
                    {how && next && (next.key === 'install' || env.support !== 'supported') && (
                        <p className="mt-3 rounded-xl bg-muted p-3 text-[13px]">
                            {next.key === 'install' || env.support === 'needs-install'
                                ? HOW[platform()]
                                : 'This browser can’t show notifications. Use Chrome on Android, or the installed app on iPhone.'}
                        </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                        {cta && (
                            <button
                                type="button"
                                onClick={act}
                                disabled={busy !== null}
                                className="h-9 rounded-[10px] bg-primary px-3.5 text-[13px] font-bold text-primary-foreground active:scale-[.97]"
                            >
                                {busy ? '…' : cta}
                            </button>
                        )}
                        {next?.key === 'reply' && (
                            <Link
                                href="/inbox?tab=needs_reply"
                                className="inline-flex h-9 items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-bold text-primary-foreground"
                            >
                                Reply to a customer
                            </Link>
                        )}
                        <button type="button" onClick={() => setHidden(true)} className="ml-auto h-9 px-2 text-[13px] font-semibold text-muted-foreground">
                            {done === 5 ? 'Hide' : 'Not now'}
                        </button>
                    </div>
                </>
            )}
            <InstallGuide open={guide} onOpenChange={setGuide} />
        </section>
    );
}
