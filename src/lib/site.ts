/**
 * The public website's address for policy links (Terms, Privacy). The portal and the website sit side
 * by side: app.10xdigital.ae ↔ engage.10xdigital.ae, st-app.10xdigital.ae ↔ st-engage.10xdigital.ae.
 */
export function websiteUrl(path: string): string {
    const host = typeof window === 'undefined' ? '' : window.location.hostname;
    const origin = host.startsWith('st-') ? 'https://st-engage.10xdigital.ae' : 'https://engage.10xdigital.ae';

    return `${origin}${path}`;
}

export const TERMS_PATH = '/terms-of-service';
export const PRIVACY_PATH = '/privacy-policy';
