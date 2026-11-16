/**
 * Shared Sentry settings for the browser, the Node server and the edge runtime. Error reporting is
 * off unless NEXT_PUBLIC_SENTRY_DSN is set at build time. Errors only: no performance tracing, no
 * session replay, no personal data (no IP, cookies, headers or request bodies), and query strings
 * are stripped from every URL before an event leaves the app.
 */
type SentryEvent = { request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: unknown; data?: unknown } };

const stripQuery = (url: string) => url.split(/[?#]/)[0];

export const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

export function sentryOptions() {
    return {
        dsn: sentryDsn,
        enabled: Boolean(sentryDsn),
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NEXT_PUBLIC_APP_ENV || 'production',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend<E extends SentryEvent>(event: E): E {
            if (event.request) {
                if (event.request.url) event.request.url = stripQuery(event.request.url);
                delete event.request.query_string;
                delete event.request.cookies;
                delete event.request.headers;
                delete event.request.data;
            }
            return event;
        },
        beforeBreadcrumb<B extends { data?: Record<string, unknown> }>(crumb: B): B {
            for (const key of ['url', 'from', 'to'] as const) {
                const value = crumb.data?.[key];
                if (typeof value === 'string') crumb.data![key] = stripQuery(value);
            }
            return crumb;
        },
    };
}
