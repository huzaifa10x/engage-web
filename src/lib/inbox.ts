import type { LifecycleKey, ResolutionReason } from './types';

/** How long the customer's 24-hour WhatsApp window has left, and the tone it is shown in. */
export type WindowTone = 'open' | 'soon' | 'closing' | 'closed' | 'none';

export function windowState(expiresAt: string | null | undefined, now = Date.now()): { tone: WindowTone; left: number; label: string } {
    if (!expiresAt) return { tone: 'none', left: 0, label: 'No WhatsApp window yet: only a template can start the chat' };
    const left = new Date(expiresAt).getTime() - now;
    if (left <= 0) return { tone: 'closed', left: 0, label: 'WhatsApp window closed: only a template can reach the customer' };
    const h = Math.floor(left / 3_600_000);
    const m = Math.floor((left % 3_600_000) / 60_000);
    const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const tone: WindowTone = left > 6 * 3_600_000 ? 'open' : left > 2 * 3_600_000 ? 'soon' : 'closing';

    return { tone, left, label: `WhatsApp window open · ${text} left to reply freely` };
}

/** Ring colours: brand over 6h, amber 2–6h, red under 2h, grey dashed when closed. */
export const RING: Record<WindowTone, string> = {
    open: 'ring-2 ring-brand-500 ring-offset-2 ring-offset-card',
    soon: 'ring-2 ring-warn ring-offset-2 ring-offset-card',
    closing: 'ring-2 ring-bad ring-offset-2 ring-offset-card',
    closed: 'outline-2 outline-dashed outline-faint outline-offset-2',
    none: '',
};

/** Badge tones that match the ring. */
export const WINDOW_BADGE: Record<WindowTone, 'good' | 'warn' | 'bad' | 'grey'> = { open: 'good', soon: 'warn', closing: 'bad', closed: 'grey', none: 'grey' };

/**
 * Tag dots: a colour picked from the tag's name, so a tag looks the same everywhere. A palette of its
 * own: status colours (green, amber, red) are kept for status.
 */
const TAG_COLORS = ['#689d0f', '#2b5fa8', '#7c4dcc', '#0e8a8a', '#c2410c', '#be185d', '#4d5b8c', '#8a6d1d'];

export function tagColor(name: string): string {
    let h = 0;
    for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;

    return TAG_COLORS[h % TAG_COLORS.length];
}

export const REASONS: { id: ResolutionReason; label: string; hint: string }[] = [
    { id: 'resolved', label: 'Resolved', hint: 'The customer got what they needed' },
    { id: 'not_lead', label: 'Not a lead / spam', hint: 'Left out of response figures; managers can review it' },
    { id: 'no_action', label: 'No action needed', hint: 'A thank-you, an emoji, a wrong number' },
];

export const LIFECYCLE: { id: LifecycleKey; label: string }[] = [
    { id: 'subscriber', label: 'Subscriber' },
    { id: 'lead', label: 'Lead' },
    { id: 'opportunity', label: 'Opportunity' },
    { id: 'customer', label: 'Customer' },
];

export const LIFECYCLE_TONE: Record<LifecycleKey, 'grey' | 'info' | 'warn' | 'good' | 'brand'> = {
    subscriber: 'grey',
    lead: 'info',
    opportunity: 'warn',
    customer: 'good',
    other: 'grey',
};

export const LEAD_STATUSES = [
    { id: 'new', label: 'New' },
    { id: 'attempted', label: 'Attempted to contact' },
    { id: 'connected', label: 'Connected' },
    { id: 'open_deal', label: 'Open deal' },
    { id: 'bad_timing', label: 'Bad timing' },
    { id: 'unqualified', label: 'Unqualified' },
] as const;

export const PERMISSION_VIA = [
    { id: 'form', label: 'Website or app form' },
    { id: 'call', label: 'Phone call' },
    { id: 'in_person', label: 'In store or in person' },
    { id: 'email', label: 'Email' },
    { id: 'other', label: 'Other' },
] as const;

/** A local UAE number typed without the country code ("050 123 4567") gets +971. */
export function withCountryCode(raw: string): string {
    const t = raw.trim();
    if (t.startsWith('+')) return t;
    const digits = t.replace(/\D/g, '');
    if (digits.startsWith('00')) return `+${digits.slice(2)}`;
    if (/^05\d{8}$/.test(digits)) return `+971${digits.slice(1)}`;
    if (/^5\d{8}$/.test(digits)) return `+971${digits}`;
    if (digits.startsWith('971')) return `+${digits}`;

    return digits ? `+${digits}` : '';
}

export const looksLikePhone = (value: string) => value.replace(/\D/g, '').length >= 7 && /^[+\d\s()-]+$/.test(value.trim());

/** A name: at least two letters and no digits. */
export const validName = (v: string) => (v.match(/\p{L}/gu) ?? []).length >= 2 && !/\d/.test(v);
