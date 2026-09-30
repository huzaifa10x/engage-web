/** Only same-origin relative paths are allowed as post-login redirects (no open redirects). */
export function safeNext(next: string | null): string {
    return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/dashboard';
}
