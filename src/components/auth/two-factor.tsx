'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CopyIcon, DownloadIcon, RefreshCwIcon, ShieldCheckIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError, errorMessage } from '@/lib/api';
import { date, relative } from '@/lib/format';
import { keys } from '@/lib/queries';
import type { Me, TwoFactorStatus } from '@/lib/types';

const firstError = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
    const text = codes.join('\n');

    return (
        <div className="grid gap-3">
            <p className="text-sm">
                Save these recovery codes somewhere safe. Each one signs you in once if you lose your phone. <b>They are shown only now.</b>
            </p>
            <pre className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-muted px-4 py-3 font-mono text-[13px]">
                {codes.map((c) => (
                    <span key={c}>{c}</span>
                ))}
            </pre>
            <div className="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(text);
                            toast.success('Copied');
                        } catch {
                            toast.error('Copy failed. Select the codes and copy them.');
                        }
                    }}
                >
                    <CopyIcon /> Copy
                </Button>
                <Button asChild variant="outline" size="sm">
                    <a
                        href={`data:text/plain;charset=utf-8,${encodeURIComponent(`10X Engage recovery codes\n\n${text}\n`)}`}
                        download="10x-engage-recovery-codes.txt"
                    >
                        <DownloadIcon /> Download
                    </a>
                </Button>
            </div>
            <Button onClick={onDone}>I saved them</Button>
        </div>
    );
}

type NewSecret = { secret: string; otpauth_uri: string };
type Confirmed = TwoFactorStatus & { recovery_codes: string[] };

/** Scan the new secret, enter the code the app shows, then save the new recovery codes. */
function ScanAndConfirm({ setup, confirmLabel, onDone }: { setup: NewSecret; confirmLabel: string; onDone: () => void }) {
    const [code, setCode] = useState('');
    const [codes, setCodes] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const confirm = async () => {
        setBusy(true);
        setError(null);
        try {
            setCodes(
                (await api<{ data: Confirmed }>('auth/two-factor/confirm', { method: 'POST', body: { code: code.replace(/\s/g, '') } })).data.recovery_codes,
            );
        } catch (e) {
            setError(firstError(e));
        } finally {
            setBusy(false);
        }
    };

    if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;

    return (
        <div className="grid gap-4">
            <ol className="grid gap-3 text-sm">
                <li>1. Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password…) and scan this code.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-lg border bg-white p-3">
                    <QRCodeSVG value={setup.otpauth_uri} size={156} level="M" />
                </div>
                <p className="max-w-56 text-[12.5px] text-muted-foreground">
                    Can’t scan? Enter this key in the app: <span className="block font-mono text-[13px] break-all text-foreground">{setup.secret}</span>
                </p>
            </div>
            <Field label="2. Enter the 6-digit code from the app" htmlFor="tf-code">
                <Input
                    id="tf-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="w-40 font-mono tracking-widest"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))}
                    onKeyDown={(e) => e.key === 'Enter' && code.replace(/\s/g, '').length === 6 && confirm()}
                    autoFocus
                />
            </Field>
            <FormError message={error} />
            <Button onClick={confirm} disabled={busy || code.replace(/\s/g, '').length !== 6} className="w-fit">
                {busy ? 'Checking…' : confirmLabel}
            </Button>
        </div>
    );
}

/**
 * Turn on two-factor sign-in: scan the QR code with an authenticator app (Google Authenticator,
 * Microsoft Authenticator, 1Password…), enter the code it shows, then save the recovery codes.
 */
export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
    const [setup, setSetup] = useState<NewSecret | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const start = async () => {
        setBusy(true);
        setError(null);
        try {
            setSetup((await api<{ data: NewSecret }>('auth/two-factor/setup', { method: 'POST' })).data);
        } catch (e) {
            setError(firstError(e));
        } finally {
            setBusy(false);
        }
    };

    if (setup) return <ScanAndConfirm setup={setup} confirmLabel="Turn on" onDone={onDone} />;

    return (
        <div className="grid gap-3">
            <FormError message={error} />
            <Button onClick={start} disabled={busy} className="w-fit">
                <ShieldCheckIcon /> {busy ? 'Preparing…' : 'Set up two-factor sign-in'}
            </Button>
        </div>
    );
}

/** Proof of the current factor: the app code, or (lost phone) one of the recovery codes. */
function CurrentFactor({
    label,
    tone = 'default',
    onSubmit,
    onCancel,
}: {
    label: string;
    tone?: 'default' | 'destructive';
    onSubmit: (body: { code: string } | { recovery_code: string }) => Promise<void>;
    onCancel: () => void;
}) {
    const [recovery, setRecovery] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const ready = recovery ? value.trim().length >= 6 : value.length === 6;
    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await onSubmit(recovery ? { recovery_code: value.trim() } : { code: value });
        } catch (e) {
            setError(firstError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-3">
            <Field label={recovery ? 'Enter one of your recovery codes' : 'Enter the current code from your authenticator app'} htmlFor="tf-current">
                <Input
                    id="tf-current"
                    inputMode={recovery ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    className="w-56 font-mono tracking-widest"
                    value={value}
                    onChange={(e) => setValue(recovery ? e.target.value.slice(0, 30) : e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && ready && !busy && submit()}
                    autoFocus
                />
            </Field>
            <button
                type="button"
                className="w-fit text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => (setRecovery(!recovery), setValue(''), setError(null))}
            >
                {recovery ? 'Use the app code instead' : 'No access to the app? Use a recovery code'}
            </button>
            <FormError message={error} />
            <div className="flex gap-2">
                <Button onClick={submit} disabled={busy || !ready} variant={tone}>
                    {busy ? 'Checking…' : label}
                </Button>
                <Button variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

/** Sign-in step 2 when two-factor sign-in is on: the app code, or a recovery code. */
export function TwoFactorChallenge({ onSignedIn, onCancel }: { onSignedIn: (me: Me) => void; onCancel: () => void }) {
    const [recovery, setRecovery] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const body = recovery ? { recovery_code: value.trim() } : { code: value.replace(/\s/g, '') };
            onSignedIn((await api<{ data: Me }>('auth/login/two-factor', { method: 'POST', body })).data);
        } catch (e) {
            setError(firstError(e));
            setBusy(false);
        }
    };

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight">Two-factor sign-in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                {recovery
                    ? 'Enter one of your recovery codes. Each code works once. Lost your phone? After signing in you can replace your authenticator straight away.'
                    : 'Enter the 6-digit code from your authenticator app.'}
            </p>
            <form
                className="mt-8 grid gap-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                <FormError message={error} />
                <Field label={recovery ? 'Recovery code' : 'Code'} htmlFor="tf-login">
                    <Input
                        id="tf-login"
                        inputMode={recovery ? 'text' : 'numeric'}
                        autoComplete="one-time-code"
                        className="font-mono tracking-widest"
                        value={value}
                        onChange={(e) => setValue(recovery ? e.target.value.slice(0, 30) : e.target.value.replace(/[^\d ]/g, '').slice(0, 7))}
                        autoFocus
                    />
                </Field>
                <Button type="submit" disabled={busy || (recovery ? value.trim().length < 6 : value.replace(/\s/g, '').length !== 6)}>
                    {busy ? 'Signing in…' : 'Verify and sign in'}
                </Button>
            </form>
            <p className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <button
                    type="button"
                    className="font-semibold text-foreground hover:underline"
                    onClick={() => {
                        setRecovery(!recovery);
                        setValue('');
                        setError(null);
                    }}
                >
                    {recovery ? 'Use the app code' : 'Use a recovery code'}
                </button>
                <button type="button" className="font-semibold text-foreground hover:underline" onClick={onCancel}>
                    Use a different account
                </button>
            </p>
            {recovery && (
                <p className="mt-3 text-[12.5px] text-muted-foreground">
                    Lost your phone and your recovery codes? Contact 10X Engage support: after confirming who you are, they can reset two-factor sign-in for
                    you.
                </p>
            )}
        </>
    );
}

/**
 * Settings › Your sign-in: two-factor status; turn on; replace the authenticator (new phone or app,
 * the old one keeps working until the new one is confirmed); new recovery codes; turn off (not for
 * Owners while required). Opened with ?security=replace right after a recovery-code sign-in.
 */
export function TwoFactorCard({ status }: { status: TwoFactorStatus }) {
    const qc = useQueryClient();
    // Opened from the sign-in with ?security=replace (after a recovery code): go straight to the replacement.
    const [fromSignIn] = useState(
        () => typeof window !== 'undefined' && status.enabled && new URLSearchParams(window.location.search).get('security') === 'replace',
    );
    const [mode, setMode] = useState<'idle' | 'setup' | 'replace' | 'renew' | 'off'>(fromSignIn ? 'replace' : 'idle');
    const [replacement, setReplacement] = useState<NewSecret | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const refresh = () => void qc.invalidateQueries({ queryKey: keys.me });
    const reset = () => (setMode('idle'), setReplacement(null), setCodes(null), setError(null));

    const startReplace = async (body: Record<string, string> = {}) => {
        setReplacement((await api<{ data: NewSecret }>('auth/two-factor/replace', { method: 'POST', body })).data);
    };

    // Signed in with a recovery code a moment ago (probably a lost phone): no other code is needed.
    const begin = async () => {
        setMode('replace');
        if (!status.recovery_sign_in) return;
        setBusy(true);
        setError(null);
        try {
            await startReplace();
        } catch (e) {
            setError(firstError(e));
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (fromSignIn) document.getElementById('two-factor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [fromSignIn]);

    const lowCodes = status.enabled && status.recovery_codes_left <= 2;

    return (
        <Card id="two-factor" className="scroll-mt-20">
            <CardHeader>
                <div>
                    <CardTitle className="flex items-center gap-2">
                        Two-factor sign-in
                        {status.enabled ? (
                            <Badge tone="good" dot>
                                On
                            </Badge>
                        ) : (
                            <Badge tone={status.required ? 'warn' : 'grey'} dot>
                                {status.required ? 'Required' : 'Off'}
                            </Badge>
                        )}
                    </CardTitle>
                    <CardDescription>
                        A code from an authenticator app on your phone, asked at every sign-in.{' '}
                        {status.required ? 'Required for workspace Owners.' : 'Recommended for everyone.'}
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="grid gap-4">
                {codes ? (
                    <RecoveryCodes codes={codes} onDone={() => (reset(), refresh())} />
                ) : !status.enabled ? (
                    mode === 'setup' ? (
                        <TwoFactorSetup onDone={() => (reset(), refresh())} />
                    ) : (
                        <Button className="w-fit" onClick={() => setMode('setup')}>
                            <ShieldCheckIcon /> Turn on
                        </Button>
                    )
                ) : mode === 'replace' ? (
                    <div className="grid gap-4">
                        <div className="rounded-md border bg-muted/50 px-3.5 py-3 text-[13px]">
                            <b>Replace authenticator</b> — for a new phone or a different app. Your current authenticator keeps working until you confirm a code
                            from the new one, and your recovery codes are renewed at the end.
                        </div>
                        {replacement ? (
                            <ScanAndConfirm
                                setup={replacement}
                                confirmLabel="Replace authenticator"
                                onDone={() => {
                                    toast.success('Authenticator replaced');
                                    reset();
                                    refresh();
                                }}
                            />
                        ) : status.recovery_sign_in ? (
                            <div className="grid gap-3">
                                <p className="text-[13px] text-muted-foreground">
                                    You signed in with a recovery code a moment ago, so no other code is needed.
                                </p>
                                <FormError message={error} />
                                <div className="flex gap-2">
                                    <Button onClick={begin} disabled={busy}>
                                        {busy ? 'Preparing…' : 'Continue'}
                                    </Button>
                                    <Button variant="ghost" onClick={reset}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <CurrentFactor label="Continue" onSubmit={startReplace} onCancel={reset} />
                        )}
                        {replacement && (
                            <Button variant="ghost" className="w-fit" onClick={reset}>
                                Cancel and keep the current authenticator
                            </Button>
                        )}
                    </div>
                ) : mode === 'renew' || mode === 'off' ? (
                    <CurrentFactor
                        label={mode === 'renew' ? 'Make new codes' : 'Turn off'}
                        tone={mode === 'off' ? 'destructive' : 'default'}
                        onCancel={reset}
                        onSubmit={async (body) => {
                            if (mode === 'renew') {
                                setCodes((await api<{ data: Confirmed }>('auth/two-factor/recovery-codes', { method: 'POST', body })).data.recovery_codes);
                            } else {
                                await api('auth/two-factor', { method: 'DELETE', body });
                                toast.success('Two-factor sign-in turned off');
                                reset();
                                refresh();
                            }
                        }}
                    />
                ) : (
                    <>
                        {status.recovery_sign_in && (
                            <div className="rounded-md border border-warn/30 bg-warn-bg px-3.5 py-3 text-[13px]">
                                You signed in with a recovery code. If you lost your phone or no longer use that app, replace your authenticator now — no other
                                code is needed for the next few minutes.
                            </div>
                        )}
                        <dl className="grid gap-x-8 gap-y-1 text-[13px] sm:grid-cols-3">
                            <div>
                                <dt className="text-muted-foreground">Authenticator set up</dt>
                                <dd>{date(status.confirmed_at)}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Last used</dt>
                                <dd>{status.last_used_at ? relative(status.last_used_at) : '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Recovery codes left</dt>
                                <dd className={lowCodes ? 'font-semibold text-warn' : undefined}>
                                    {status.recovery_codes_left} of 10{lowCodes ? ' — make new ones' : ''}
                                </dd>
                            </div>
                        </dl>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={begin}>
                                <RefreshCwIcon /> Replace authenticator
                            </Button>
                            <Button variant="outline" onClick={() => setMode('renew')}>
                                New recovery codes
                            </Button>
                            {!status.required && (
                                <Button variant="outline" className="text-bad" onClick={() => setMode('off')}>
                                    Turn off
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
