'use client';

import type Echo from 'laravel-echo';

import { api } from './api';

/**
 * Laravel Reverb (Pusher protocol). The socket goes straight to Reverb; channel authorisation
 * goes through this origin (/api/broadcasting/auth → Laravel) so the SPA session cookie is used.
 * Not configured (no NEXT_PUBLIC_REVERB_KEY) → the inbox falls back to polling.
 */

const KEY = process.env.NEXT_PUBLIC_REVERB_KEY ?? '';
const HOST = process.env.NEXT_PUBLIC_REVERB_HOST ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
const PORT = Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 8080);
const SCHEME = process.env.NEXT_PUBLIC_REVERB_SCHEME ?? 'http';

export const realtimeConfigured = KEY !== '';

let instance: Promise<Echo<'reverb'>> | null = null;

export function getEcho(): Promise<Echo<'reverb'>> | null {
    if (!realtimeConfigured || typeof window === 'undefined') return null;

    instance ??= Promise.all([import('laravel-echo'), import('pusher-js')]).then(([{ default: EchoCtor }, { default: Pusher }]) => {
        (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

        return new EchoCtor({
            broadcaster: 'reverb',
            key: KEY,
            wsHost: HOST,
            wsPort: PORT,
            wssPort: PORT,
            forceTLS: SCHEME === 'https',
            enabledTransports: ['ws', 'wss'],
            authorizer: (channel: { name: string }) => ({
                authorize: (socketId: string, callback: (error: Error | null, data: { auth: string } | null) => void) => {
                    api<{ auth: string }>('/api/broadcasting/auth', { method: 'POST', body: { socket_id: socketId, channel_name: channel.name } })
                        .then((data) => callback(null, data))
                        .catch((e) => callback(e instanceof Error ? e : new Error('Channel authorisation failed'), null));
                },
            }),
        });
    });

    return instance;
}
