import type { MetadataRoute } from 'next';

/** Install / home-screen metadata: name, colours and the Engage mark. */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: '10X Engage',
        short_name: 'Engage',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#0A0D08',
        icons: [
            { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
    };
}
