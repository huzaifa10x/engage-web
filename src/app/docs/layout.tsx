import type { Metadata } from 'next';

// Public pages: unlike the rest of the app they are meant to be found and read without signing in.
export const metadata: Metadata = {
    title: 'API documentation · 10X Engage',
    description:
        'Send WhatsApp messages, manage contacts and receive webhooks with the 10X Engage API. Reference, examples and the official Postman collection.',
    robots: { index: true, follow: true },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
