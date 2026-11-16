'use client';

import * as Sentry from '@sentry/nextjs';
import { GeistSans } from 'geist/font/sans';
import { useEffect } from 'react';

import './globals.css';
import { Button } from '@/components/ui/button';

/** Last-resort screen when the whole app fails to render. The error goes to Sentry when it is set up. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="en" className={GeistSans.variable}>
            <body className="min-h-dvh font-sans">
                <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm font-semibold text-brand-600">Something went wrong</p>
                    <h1 className="text-2xl font-semibold">This page could not be shown</h1>
                    <p className="text-muted-foreground">We have been told about it. Try again, or reload the page.</p>
                    {error.digest ? <p className="text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
                    <Button className="mt-2" onClick={() => (retry ? retry() : window.location.reload())}>
                        Try again
                    </Button>
                </main>
            </body>
        </html>
    );
}
