'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CopyIcon, DownloadIcon, ShieldCheckIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError, errorMessage } from '@/lib/api';
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

/**
 * Turn on two-factor sign-in: scan the QR code with an authenticator app (Google Authenticator,
 * Microsoft Authenticator, 1Password…), enter the code it shows, then save the recovery codes.
 */
export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
    const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
    const [code, setCode] = useState('');
    const [codes, setCodes] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const start = async () => {
        setBusy(true);
        setError(null);
        try {
            setSetup((await api<{ data: { secret: string; otpauth_uri: string } }>('auth/two-factor/setup', { method: 'POST' })).data);
        } catch (e) {
            setError(firstError(e));
        } finally {
            setBusy(false);
        }
    };
    const confirm = async () => {
        setBusy(true);
        setError(null);
        try {
            setCodes(
                (
                    await api<{ data: TwoFactorStatus & { recovery_codes: string[] } }>('auth/two-factor/confirm', {
                        method: 'POST',
                        body: { code: code.replace(/\s/g, '') },
                    })
                ).data.recovery_codes,
            );
        } catch (e) {
            setError(firstError(e));
        } finally {
            setBusy(false);
        }
    };

    if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;
    if (!setup)
        return (
            <div className="grid gap-3">
                <FormError message={error} />
                <Button onClick={start} disabled={busy} className="w-fit">
                    <ShieldCheckIcon /> {busy ? 'Preparing…' : 'Set up two-factor sign-in'}
                </Button>
            </div>
        );

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
                {busy ? 'Checking…' : 'Turn on'}
            </Button>
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
                {recovery ? 'Enter one of your recovery codes. Each code works once.' : 'Enter the 6-digit code from your authenticator app.'}
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
        </>
    );
}

/** Settings › Your sign-in: two-factor status, turn on, new recovery codes, turn off (not for Owners while required). */
export function TwoFactorCard({ status }: { status: TwoFactorStatus }) {
    const qc = useQueryClient();
    const [mode, setMode] = useState<'idle' | 'setup' | 'renew' | 'off'>('idle');
    const [code, setCode] = useState('');
    const [codes, setCodes] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const refresh = () => void qc.invalidateQueries({ queryKey: keys.me });

    const act = async () => {
        setError(null);
        try {
            if (mode === 'renew') {
                setCodes(
                    (await api<{ data: { recovery_codes: string[] } }>('auth/two-factor/recovery-codes', { method: 'POST', body: { code } })).data
                        .recovery_codes,
                );
            } else {
                await api('auth/two-factor', { method: 'DELETE', body: { code } });
                toast.success('Two-factor sign-in turned off');
                setMode('idle');
                refresh();
            }
            setCode('');
        } catch (e) {
            setError(firstError(e));
        }
    };

    return (
        <Card>
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
                    <RecoveryCodes codes={codes} onDone={() => (setCodes(null), setMode('idle'), refresh())} />
                ) : !status.enabled ? (
                    mode === 'setup' ? (
                        <TwoFactorSetup onDone={() => (setMode('idle'), refresh())} />
                    ) : (
                        <Button className="w-fit" onClick={() => setMode('setup')}>
                            <ShieldCheckIcon /> Turn on
                        </Button>
                    )
                ) : mode === 'idle' ? (
                    <>
                        <p className="text-[13px] text-muted-foreground">{status.recovery_codes_left} recovery codes left.</p>
                        <div className="flex flex-wrap gap-2">
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
                ) : (
                    <div className="grid gap-3">
                        <Field label="Enter the current code from your authenticator app" htmlFor="tf-confirm">
                            <Input
                                id="tf-confirm"
                                inputMode="numeric"
                                className="w-40 font-mono tracking-widest"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                autoFocus
                            />
                        </Field>
                        <FormError message={error} />
                        <div className="flex gap-2">
                            <Button onClick={act} disabled={code.length !== 6} variant={mode === 'off' ? 'destructive' : 'default'}>
                                {mode === 'renew' ? 'Make new codes' : 'Turn off'}
                            </Button>
                            <Button variant="ghost" onClick={() => (setMode('idle'), setCode(''), setError(null))}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
