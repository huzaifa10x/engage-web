import * as Sentry from '@sentry/nextjs';

import { sentryOptions } from '@/lib/sentry-options';

// Browser errors go to Sentry when NEXT_PUBLIC_SENTRY_DSN is set (see src/lib/sentry-options.ts).
Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
