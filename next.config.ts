import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this origin. /api/* and /sanctum/* are proxied to Laravel, so
 * Sanctum's session cookies are first-party (no CORS, no SameSite surprises) — locally and in
 * production alike. Set BACKEND_URL to the Laravel base URL (no trailing slash).
 */
const backend = (process.env.BACKEND_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    output: 'standalone',
    // Dev only: hosts allowed to load the dev server (e.g. your ngrok domain for Embedded Signup).
    allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? '')
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean),
    async rewrites() {
        return [
            { source: '/api/:path*', destination: `${backend}/api/:path*` },
            { source: '/sanctum/:path*', destination: `${backend}/sanctum/:path*` },
        ];
    },
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    // The Embedded Signup popup needs to postMessage back to this window.
                    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
                ],
            },
            {
                // Pages must never be cached by a CDN or the browser: after a deploy, a cached page
                // points at script files of the previous build, which no longer exist (404s and a
                // broken screen). The hashed files under /_next/static stay cacheable forever.
                source: '/((?!_next/static|_next/image|favicon.ico).*)',
                headers: [
                    { key: 'Cache-Control', value: 'private, no-cache, no-store, max-age=0, must-revalidate' },
                    { key: 'CDN-Cache-Control', value: 'no-store' },
                    { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
                ],
            },
        ];
    },
};

export default nextConfig;
