'use client';

import { useEffect, useRef, useState } from 'react';

import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';

const LENGTH = 6;

/**
 * Six-box one-time-code entry: typing moves forward, Backspace moves back, and a whole code can
 * be pasted into any box. Submits by itself once all six digits are in.
 */
export function OtpForm({
    onSubmit,
    onResend,
    submitLabel,
    initialWait = 60,
}: {
    /** Resolves to an error message, or null when the code was accepted. */
    onSubmit: (code: string) => Promise<string | null>;
    /** Resolves to { wait } seconds until the next resend, or { error }. */
    onResend: () => Promise<{ wait?: number; error?: string }>;
    submitLabel: string;
    initialWait?: number;
}) {
    const [digits, setDigits] = useState<string[]>(() => Array<string>(LENGTH).fill(''));
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [wait, setWait] = useState(initialWait);
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);

        return () => clearTimeout(timer);
    }, [wait]);

    const clear = () => {
        setDigits(Array<string>(LENGTH).fill(''));
        inputs.current[0]?.focus();
    };

    const submit = async (code: string) => {
        setBusy(true);
        setError(null);
        setNotice(null);
        const problem = await onSubmit(code);
        setBusy(false);
        if (problem) {
            setError(problem);
            clear();
        }
    };

    const change = (index: number, raw: string) => {
        const clean = raw.replace(/\D/g, '');
        if (clean === '' && raw !== '') return;
        const next = [...digits];
        if (clean.length <= 1) {
            next[index] = clean;
        } else {
            clean
                .slice(0, LENGTH - index)
                .split('')
                .forEach((d, i) => (next[index + i] = d));
        }
        setDigits(next);
        setError(null);

        const empty = next.findIndex((d) => d === '');
        inputs.current[empty === -1 ? LENGTH - 1 : empty]?.focus();
        if (empty === -1) void submit(next.join(''));
    };

    const resend = async () => {
        setSending(true);
        setError(null);
        const result = await onResend();
        setSending(false);
        if (result.error) {
            setError(result.error);
        } else {
            setWait(result.wait ?? 60);
            setNotice('A new code is on its way.');
            clear();
        }
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (digits.every(Boolean)) void submit(digits.join(''));
            }}
            className="grid gap-4"
        >
            <FormError message={error} />
            {notice && !error && <p className="rounded-md border border-good/20 bg-good-bg px-3 py-2 text-[13px] text-good">{notice}</p>}
            <div className="flex justify-between gap-2" role="group" aria-label="Verification code">
                {digits.map((digit, i) => (
                    <input
                        key={i}
                        ref={(el) => {
                            inputs.current[i] = el;
                        }}
                        value={digit}
                        onChange={(e) => change(i, e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Backspace' && !digit && i > 0) inputs.current[i - 1]?.focus();
                        }}
                        onFocus={(e) => e.target.select()}
                        inputMode="numeric"
                        autoComplete={i === 0 ? 'one-time-code' : 'off'}
                        autoFocus={i === 0}
                        maxLength={LENGTH}
                        disabled={busy}
                        aria-label={`Digit ${i + 1}`}
                        className="h-12 w-full min-w-0 rounded-lg border border-input bg-card text-center font-mono text-xl outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-60"
                    />
                ))}
            </div>
            <Button type="submit" disabled={busy || !digits.every(Boolean)}>
                {busy ? 'Checking…' : submitLabel}
            </Button>
            <p className="text-[13px] text-muted-foreground">
                Didn’t get it? Check your spam folder, or{' '}
                <button
                    type="button"
                    onClick={resend}
                    disabled={wait > 0 || sending}
                    className="font-semibold text-foreground underline-offset-2 hover:underline disabled:font-normal disabled:text-muted-foreground disabled:no-underline"
                >
                    {sending ? 'sending…' : wait > 0 ? `send a new code in ${wait}s` : 'send a new code'}
                </button>
                .
            </p>
        </form>
    );
}
