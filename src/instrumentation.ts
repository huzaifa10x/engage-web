import * as Sentry from '@sentry/nextjs';

import { sentryOptions } from '@/lib/sentry-options';

// Server-side rendering errors go to Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
export function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
        Sentry.init(sentryOptions());
    }
}

export const onRequestError = Sentry.captureRequestError;
