import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Install engageX on your phone',
    description: 'Reply to customers from your home screen, with a notification the moment someone is waiting. Takes under a minute. No app store.',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
    return children;
}
