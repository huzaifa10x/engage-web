/**
 * Browser client for the Laravel API (Sanctum SPA cookie auth). Requests go to this origin and
 * are proxied by next.config.ts, so cookies are first-party. Mutations carry X-XSRF-TOKEN from
 * the XSRF-TOKEN cookie; a 419 refreshes the CSRF cookie once and retries.
 */

export type ApiErrorBody = {
    code: string;
    message: string;
    details?: Record<string, unknown> & { fields?: Record<string, string[]> };
    request_id?: string;
};

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly details: ApiErrorBody['details'] = {},
        public readonly requestId?: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }

    /** Laravel validation messages keyed by field ("email", "phone_number_ids.0", ...). */
    get fields(): Record<string, string[]> {
        return (this.details?.fields as Record<string, string[]>) ?? {};
    }

    firstFieldError(field: string): string | undefined {
        return this.fields[field]?.[0];
    }
}

type Options = {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    query?: Record<string, string | number | boolean | null | undefined>;
    signal?: AbortSignal;
    headers?: Record<string, string>;
};

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<void> | null = null;

export function ensureCsrfCookie(force = false): Promise<void> {
    if (!force && readCookie('XSRF-TOKEN')) return Promise.resolve();
    csrfPromise ??= fetch('/sanctum/csrf-cookie', { credentials: 'include', headers: { Accept: 'application/json' } })
        .then(() => undefined)
        .finally(() => {
            csrfPromise = null;
        });

    return csrfPromise;
}

function buildUrl(path: string, query?: Options['query']): string {
    const url = path.startsWith('/') ? path : `/api/v1/${path}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();

    return qs ? `${url}?${qs}` : url;
}

export async function api<T>(path: string, options: Options = {}, retried = false): Promise<T> {
    const method = options.method ?? 'GET';
    const mutating = method !== 'GET';

    if (mutating) await ensureCsrfCookie();

    const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const xsrf = readCookie('XSRF-TOKEN');
    if (mutating && xsrf) headers['X-XSRF-TOKEN'] = xsrf;

    const response = await fetch(buildUrl(path, options.query), {
        method,
        headers,
        credentials: 'include',
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
        cache: 'no-store',
    });

    if (response.status === 419 && !retried) {
        await ensureCsrfCookie(true);

        return api<T>(path, options, true);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const json = text ? safeJson(text) : null;

    if (!response.ok) {
        const err = (json as { error?: ApiErrorBody } | null)?.error;
        throw new ApiError(
            response.status,
            err?.code ?? (response.status >= 500 ? 'server_error' : 'request_failed'),
            err?.message ?? `Request failed (${response.status}).`,
            err?.details ?? {},
            err?.request_id ?? response.headers.get('X-Request-Id') ?? undefined,
        );
    }

    return json as T;
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/** Human message for any thrown value, with the request id for support when present. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (error instanceof ApiError) {
        if (error.code === 'validation_failed') {
            const first = Object.values(error.fields)[0]?.[0];
            if (first) return first;
        }

        return error.message || fallback;
    }

    return error instanceof Error && error.message ? error.message : fallback;
}

/** multipart/form-data POST (file uploads) with the same CSRF + error handling as api(). */
export async function upload<T>(path: string, form: FormData, retried = false): Promise<T> {
    await ensureCsrfCookie();
    const xsrf = readCookie('XSRF-TOKEN');
    const response = await fetch(buildUrl(path), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}) },
        body: form,
    });

    if (response.status === 419 && !retried) {
        await ensureCsrfCookie(true);

        return upload<T>(path, form, true);
    }

    const json = safeJson(await response.text());
    if (!response.ok) {
        const err = (json as { error?: ApiErrorBody } | null)?.error;
        throw new ApiError(
            response.status,
            err?.code ?? 'request_failed',
            err?.message ?? `Upload failed (${response.status}).`,
            err?.details ?? {},
            err?.request_id,
        );
    }

    return json as T;
}
