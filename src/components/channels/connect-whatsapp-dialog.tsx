'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, ExternalLinkIcon, Loader2Icon, SmartphoneIcon, XCircleIcon, ZapIcon } from 'lucide-react';
import { useState } from 'react';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEmbeddedSignup, type SignupPhase } from '@/hooks/use-embedded-signup';
import { keys } from '@/lib/queries';
import type { SignupAttempt, SignupConflict } from '@/lib/types';
import { cn } from '@/lib/utils';

type Flow = 'standard' | 'coexistence';

const STEP_LABELS: Record<string, string> = {
    exchange_code: 'Secure connection with Meta',
    check_other_apps: 'Check the number is not connected to another application',
    fetch_waba: 'Read your WhatsApp Business Account',
    subscribe_webhooks: 'Subscribe to message events',
    verify_subscription: 'Confirm the subscription is active',
    register_number: 'Register the number with Cloud API',
    fetch_number: 'Check number status and quality',
    coexistence_sync: 'Start syncing contacts and chat history',
};

function stepsFor(flow: Flow, attempt: SignupAttempt | null): string[] {
    const base = ['exchange_code', 'check_other_apps', 'fetch_waba', 'subscribe_webhooks', 'verify_subscription'];
    if (attempt?.event === 'FINISH_ONLY_WABA') return base;

    return flow === 'coexistence' ? [...base, 'fetch_number', 'coexistence_sync'] : [...base, 'register_number', 'fetch_number'];
}

export function ConnectWhatsappDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const qc = useQueryClient();
    const [flow, setFlow] = useState<Flow>('standard');
    const signup = useEmbeddedSignup(() => {
        void qc.invalidateQueries({ queryKey: keys.accounts });
        void qc.invalidateQueries({ queryKey: keys.numbers });
        void qc.invalidateQueries({ queryKey: keys.me });
    });

    const busy = ['starting', 'popup', 'completing', 'provisioning'].includes(signup.phase);

    const close = (next: boolean) => {
        if (!next && busy && signup.phase !== 'popup') return; // don't lose the progress view mid-setup
        onOpenChange(next);
        if (!next) setTimeout(signup.reset, 200);
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-xl" onInteractOutside={(e) => busy && e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Connect a WhatsApp number</DialogTitle>
                    <DialogDescription>
                        Meta opens a secure popup where you choose or create your business, WhatsApp account and phone number.
                    </DialogDescription>
                </DialogHeader>

                {signup.phase === 'idle' || signup.phase === 'cancelled' ? (
                    <ChooseFlow flow={flow} setFlow={setFlow} cancelled={signup.phase === 'cancelled'} />
                ) : signup.phase === 'failed' && signup.conflict ? (
                    <RegisteredElsewhere conflict={signup.conflict} />
                ) : signup.phase === 'failed' ? (
                    <Failure message={signup.error} />
                ) : signup.phase === 'completed' ? (
                    <Success attempt={signup.attempt} flow={flow} />
                ) : (
                    <Progress phase={signup.phase} flow={flow} attempt={signup.attempt} />
                )}

                <DialogFooter>
                    {signup.phase === 'completed' ? (
                        <Button onClick={() => close(false)}>Done</Button>
                    ) : signup.phase === 'failed' ? (
                        <>
                            <Button variant="outline" onClick={() => close(false)}>
                                Close
                            </Button>
                            <Button onClick={() => signup.launch({ coexistence: flow === 'coexistence' })}>
                                {signup.conflict ? 'I have disconnected it — check again' : 'Try again'}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => close(false)} disabled={busy && signup.phase !== 'popup'}>
                                Cancel
                            </Button>
                            <Button variant="whatsapp" onClick={() => signup.launch({ coexistence: flow === 'coexistence' })} disabled={busy}>
                                {busy ? <Loader2Icon className="animate-spin" /> : null}
                                {signup.phase === 'popup' ? 'Waiting for Meta…' : busy ? 'Connecting…' : 'Continue with Facebook'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ChooseFlow({ flow, setFlow, cancelled }: { flow: Flow; setFlow: (f: Flow) => void; cancelled: boolean }) {
    const { feature } = useSession();
    // Decided by the plan (and any per-workspace override); the server enforces the same rule.
    const coexistence = feature('coexistence');
    const options: { id: Flow; icon: React.ReactNode; title: string; body: string; disabled?: boolean }[] = [
        {
            id: 'standard',
            icon: <ZapIcon className="size-5" />,
            title: 'New number or existing API number',
            body: 'Use a number that is not on WhatsApp yet, or one already on the Cloud API. Full throughput, all features.',
        },
        {
            id: 'coexistence',
            icon: <SmartphoneIcon className="size-5" />,
            title: 'My WhatsApp Business app number',
            body: !coexistence.enabled
                ? 'Not available on this workspace. Contact support to connect a number that stays on the WhatsApp Business app.'
                : 'Keep chatting from the app on your phone while your team uses 10X Engage. Your contacts and recent chat history are imported. Sending on this number is limited to 20 messages per second on every plan.',
            disabled: !coexistence.enabled,
        },
    ];

    return (
        <div className="grid gap-3">
            {cancelled && (
                <p className="rounded-md bg-grey-bg px-3 py-2 text-[13px] text-muted-foreground">
                    The popup was closed before finishing. Nothing was connected.
                </p>
            )}
            <div role="radiogroup" aria-label="Number type" className="grid gap-2">
                {options.map((o) => (
                    <button
                        key={o.id}
                        role="radio"
                        aria-checked={flow === o.id}
                        aria-disabled={o.disabled}
                        disabled={o.disabled}
                        onClick={() => setFlow(o.id)}
                        className={cn(
                            'flex gap-3 rounded-lg border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                            flow === o.id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'hover:bg-muted',
                        )}
                    >
                        <span
                            className={cn(
                                'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md',
                                flow === o.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            )}
                        >
                            {o.icon}
                        </span>
                        <span>
                            <span className="block text-sm font-semibold">{o.title}</span>
                            <span className="mt-0.5 block text-[13px] text-muted-foreground">{o.body}</span>
                        </span>
                    </button>
                ))}
            </div>
            <ul className="grid gap-1 text-[12.5px] text-muted-foreground">
                <li>• You need a Facebook account with admin access to your Meta business portfolio.</li>
                {flow === 'standard' ? (
                    <li>• The phone number must receive an SMS or voice call for verification.</li>
                ) : (
                    <>
                        <li>• Keep the WhatsApp Business app (v2.24.17 or later) open on your phone: you will scan a QR code with it.</li>
                        <li>• The number stays on your phone. Messages you send from the app also appear in the team inbox.</li>
                        <li>• Agree to share chat history when the app asks. This can only be done once, during setup.</li>
                    </>
                )}
                <li>• Allow popups for this site.</li>
            </ul>
        </div>
    );
}

function Progress({ phase, flow, attempt }: { phase: SignupPhase; flow: Flow; attempt: SignupAttempt | null }) {
    if (phase === 'starting' || phase === 'popup') {
        return (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
                <Loader2Icon className="size-5 animate-spin text-brand-600" />
                <div>
                    <p className="font-semibold">{phase === 'starting' ? 'Preparing secure signup…' : 'Complete the steps in the Meta popup'}</p>
                    <p className="text-muted-foreground">Keep this window open. If no popup appeared, allow popups and try again.</p>
                </div>
            </div>
        );
    }

    const steps = stepsFor(flow, attempt);
    const current = steps.find((s) => attempt?.steps?.[s]?.state !== 'done');

    return (
        <ol className="grid gap-2.5">
            {steps.map((s) => {
                const state = attempt?.steps?.[s]?.state;
                const running = s === current;

                return (
                    <li key={s} className="flex items-center gap-3 text-sm">
                        {state === 'done' ? (
                            <CheckCircle2Icon className="size-5 text-good" />
                        ) : state === 'failed' ? (
                            <XCircleIcon className="size-5 text-bad" />
                        ) : running ? (
                            <Loader2Icon className="size-5 animate-spin text-brand-600" />
                        ) : (
                            <CircleIcon className="size-5 text-faint" />
                        )}
                        <span className={cn(!state && !running && 'text-muted-foreground')}>{STEP_LABELS[s] ?? s}</span>
                    </li>
                );
            })}
        </ol>
    );
}

function Success({ attempt, flow }: { attempt: SignupAttempt | null; flow: Flow }) {
    return (
        <div className="grid gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-good/20 bg-good-bg p-4">
                <CheckCircle2Icon className="mt-0.5 size-5 text-good" />
                <div className="text-sm">
                    <p className="font-semibold text-good">Number connected</p>
                    <p className="text-ink-2">
                        {attempt?.event === 'FINISH_ONLY_WABA'
                            ? 'Your WhatsApp Business Account is connected. Add a phone number from WhatsApp Manager, then refresh Channels.'
                            : flow === 'coexistence'
                              ? 'Your app number is connected. Contacts and chat history are syncing in the background — keep the WhatsApp Business app open for a few minutes.'
                              : 'Your number is registered with the WhatsApp Cloud API and ready for the next step.'}
                    </p>
                </div>
            </div>
            <div className="rounded-lg border p-4 text-sm">
                <p className="font-semibold">Last step: add a payment method in Meta</p>
                <p className="mt-1 text-muted-foreground">
                    Conversations are billed by Meta directly to your business. Add a card in WhatsApp Manager so paid messages (templates) can be delivered.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                    <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noreferrer">
                        Open WhatsApp Manager <ExternalLinkIcon />
                    </a>
                </Button>
            </div>
        </div>
    );
}

function Failure({ message }: { message: string | null }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-bad/20 bg-bad-bg p-4 text-sm">
            <XCircleIcon className="mt-0.5 size-5 text-bad" />
            <div>
                <p className="font-semibold text-bad">We could not connect this number</p>
                <p className="mt-0.5 text-ink-2">{message ?? 'Something went wrong while talking to Meta.'}</p>
            </div>
        </div>
    );
}

function RegisteredElsewhere({ conflict }: { conflict: SignupConflict }) {
    const names = conflict.apps.map((a) => a.name).filter((n): n is string => Boolean(n));
    const where = names.length ? names.join(', ') : 'another application';

    return (
        <div className="grid gap-3">
            <div className="flex items-start gap-3 rounded-lg border border-bad/20 bg-bad-bg p-4 text-sm">
                <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-bad" />
                <div>
                    <p className="font-semibold text-bad">
                        {conflict.sameApp
                            ? 'This number is already connected to another 10X Engage environment'
                            : 'This number is already registered with another application'}
                    </p>
                    <p className="mt-0.5 text-ink-2">
                        {conflict.sameApp ? (
                            'It is live on a different 10X Engage site (for example production), which uses the same Meta app.'
                        ) : names.length ? (
                            <>
                                It is currently connected to <span className="font-semibold">{where}</span>.
                            </>
                        ) : (
                            'It is currently connected to another WhatsApp platform.'
                        )}{' '}
                        Nothing was connected here. A number can only be onboarded once it has been disconnected there.
                    </p>
                </div>
            </div>
            <div className="rounded-lg border p-4 text-sm">
                <p className="font-semibold">How to fix it</p>
                {conflict.sameApp ? (
                    <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-[13px] text-muted-foreground">
                        <li>Sign in to the 10X Engage site where this number is currently working.</li>
                        <li>Open Channels and disconnect the number there.</li>
                        <li>Wait a minute, then come back here and check again.</li>
                    </ol>
                ) : (
                    <>
                        <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-[13px] text-muted-foreground">
                            <li>
                                Sign in to {where} and disconnect or remove this WhatsApp number (usually under Settings, Channels or WhatsApp). If you cannot
                                find the option, ask their support to unsubscribe your WhatsApp Business Account.
                            </li>
                            <li>
                                Or remove the application yourself in Meta Business Settings: open WhatsApp accounts, select your account, and remove {where}{' '}
                                from the partners / connected apps.
                            </li>
                            <li>Wait a minute, then come back here and check again.</li>
                        </ol>
                        <Button asChild variant="outline" size="sm" className="mt-3">
                            <a href="https://business.facebook.com/settings/whatsapp-business-accounts" target="_blank" rel="noreferrer">
                                Open Meta Business Settings <ExternalLinkIcon />
                            </a>
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
