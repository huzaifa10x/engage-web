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
const TAG_COLORS = ['#689d0f', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#0e7490', '#0891b2'];

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

// ── Inbox 3.5: time, window tiers and labels used across the list, chat and panel ─────────

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "5m", "3h", "2d"; long: "3h 20m", "2d 4h". */
export function dur(ms: number, long = false): string {
    ms = Math.abs(ms);
    const d = Math.floor(ms / DAY);
    const h = Math.floor((ms % DAY) / HOUR);
    const m = Math.floor((ms % HOUR) / MIN);
    if (d) return long ? `${d}d ${h}h` : `${d}d`;
    if (h) return long ? `${h}h ${m}m` : `${h}h`;

    return `${Math.max(1, m)}m`;
}

/** Window tier as in the prototype: none (never wrote), closed, critical (< 2h), soon (2–6h), open. */
export type WindowTier = 'none' | 'closed' | 'critical' | 'soon' | 'open';

export function windowTier(expiresAt: string | null | undefined, now = Date.now(), everWrote = true): WindowTier {
    if (!expiresAt) return everWrote ? 'closed' : 'none';
    const left = new Date(expiresAt).getTime() - now;
    if (left <= 0) return 'closed';
    if (left <= 2 * HOUR) return 'critical';
    if (left <= 6 * HOUR) return 'soon';

    return 'open';
}

export const windowLeft = (expiresAt: string | null | undefined, now = Date.now()) => (expiresAt ? new Date(expiresAt).getTime() - now : 0);

export function ringTitle(expiresAt: string | null | undefined, now = Date.now(), everWrote = true): string {
    const t = windowTier(expiresAt, now, everWrote);
    if (t === 'none') return '';
    if (t === 'closed') return 'WhatsApp window closed · template only';

    return `WhatsApp window · ${dur(windowLeft(expiresAt, now), true)} left`;
}

export function fmtTime(iso: string | number): string {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(iso: string | number, now = Date.now()): string {
    const d = new Date(iso);
    const n = new Date(now);
    const days = Math.round((new Date(n.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / DAY);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days === -1) return 'Tomorrow';
    if (days > 1 && days < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });

    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const fmtWhen = (iso: string | number, now = Date.now()) => `${fmtDay(iso, now)} ${fmtTime(iso)}`;

/** List time: "4m" within the hour, a clock time today, "Yesterday", else "12 Nov". */
export function fmtListTime(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) return '';
    const diff = now - new Date(iso).getTime();
    if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MIN))}m`;
    const day = fmtDay(iso, now);
    if (day === 'Today') return fmtTime(iso);
    if (day === 'Yesterday') return 'Yesterday';

    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Money for a deal card: "AED 6.5k / month", "Value not set". */
export function fmtMoney(value: number | null | undefined, period?: 'once' | 'month' | 'year' | null): string {
    if (value === null || value === undefined || Number.isNaN(value)) return 'Value not set';
    const v = Number(value);
    const amount = v >= 10_000 ? `${(v / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k` : v.toLocaleString('en-GB');

    return `AED ${amount}${period === 'month' ? ' / month' : period === 'year' ? ' / year' : ''}`;
}

export const aedK = (v: number) => (v >= 1000 ? `AED ${(v / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k` : `AED ${v}`);

/** The engageX ID shown on a record: permanent, from the contact's id. */
export const engageId = (id: string) => `EX-${id.replace(/-/g, '').slice(-6).toUpperCase()}`;

/** "+971 50 123 4567" for UAE numbers, otherwise as given. */
export function fmtPhone(p: string | null | undefined): string {
    if (!p) return '';
    const digits = p.replace(/\D/g, '');
    const m = digits.match(/^971(\d{2})(\d{3})(\d{4})$/);

    return m ? `+971 ${m[1]} ${m[2]} ${m[3]}` : p.startsWith('+') ? p : `+${digits}`;
}

export const REPLY_LABEL: Record<string, string> = {
    needs_reply: 'Needs reply',
    waiting: 'Waiting for customer',
    snoozed: 'Snoozed',
    closed: 'Resolved',
    resolved: 'Resolved',
};

export const RESOLUTION_DESC: Record<string, string> = {
    resolved: 'The customer’s question or request was handled.',
    not_lead: 'Unsolicited pitch, spam or wrong number. Excluded from KPIs.',
    no_action: 'Legitimate message that needs no reply, e.g. “Thanks!”.',
};

export const STEP_TYPES = [
    { id: 'message', label: 'Follow up' },
    { id: 'call', label: 'Call' },
    { id: 'quote', label: 'Send quote' },
    { id: 'meeting', label: 'Schedule meeting' },
] as const;

/** Defaults for a quick next step: a call in 2 hours, anything else tomorrow at 10:00. */
export function nextDefault(type: string, now = Date.now()): Date {
    const d = new Date(now);
    if (type === 'call') d.setHours(d.getHours() + 2, 0, 0, 0);
    else {
        d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
    }

    return d;
}

/** Template body with its {{n}} filled in (or left as {{n}}). */
export function templateBody(t: { components: { type: string; text?: string | null }[] }): string {
    return t.components.find((c) => c.type === 'BODY')?.text ?? '';
}
