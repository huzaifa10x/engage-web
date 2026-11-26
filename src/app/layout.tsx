import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';

import './globals.css';
import { ServiceWorker } from '@/components/app/service-worker';

import { Providers } from './providers';

export const metadata: Metadata = {
    title: { default: '10X Engage', template: '%s · 10X Engage' },
    description: 'WhatsApp Business messaging, inbox and campaigns — by 10X Digital.',
    robots: { index: false, follow: false },
};

// viewport-fit=cover: the app draws under the notch and home bar (padded with safe-area insets);
// resizes-content: the page shrinks above the on-screen keyboard, so the composer stays visible.
export const viewport: Viewport = { themeColor: '#0A0D08', width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
            <body className="min-h-dvh font-sans">
                <Providers>{children}</Providers>
                <ServiceWorker />
            </body>
        </html>
    );
}
