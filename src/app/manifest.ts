import type { MetadataRoute } from 'next';

/**
 * The installed app (mobile brief): name, start screen, colours and icons. Opens on the Inbox; the
 * colours are the app's own (no separate brand palette for the phone).
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: '/inbox',
        name: 'engageX by 10X Digital',
        short_name: 'engageX',
        description: 'Reply to your WhatsApp customers fast, from your phone.',
        start_url: '/inbox?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F6F7F3',
        theme_color: '#0A0D08',
        lang: 'en',
        categories: ['business', 'productivity'],
        icons: [
            { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
            { name: 'Needs reply', url: '/inbox?tab=needs_reply', icons: [{ src: '/brand/icon-192.png', sizes: '192x192' }] },
            { name: 'Agents', url: '/insights', icons: [{ src: '/brand/icon-192.png', sizes: '192x192' }] },
        ],
    };
}
