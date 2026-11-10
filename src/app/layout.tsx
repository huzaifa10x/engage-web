import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';

import './globals.css';
import { Providers } from './providers';
import Script from 'next/script';

export const metadata: Metadata = {
    title: { default: '10X Engage', template: '%s · 10X Engage' },
    description: 'WhatsApp Business messaging, inbox and campaigns — by 10X Digital.',
    robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0A0D08', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
            <head>
                <Script
                    src="https://www.googletagmanager.com/gtm.js?id=GTM-5KZQPF5D"
                    strategy="beforeInteractive"
                />
                <Script id="google-tag-init" strategy="beforeInteractive">
                    {`
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
                    `}
                </Script>
            </head>
            <body className="min-h-dvh font-sans">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
