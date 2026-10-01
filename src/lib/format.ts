export function dateTime(iso: string | null | undefined): string {
    if (!iso) return '—';

    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function date(iso: string | null | undefined): string {
    if (!iso) return '—';

    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}

export function relative(iso: string | null | undefined): string {
    if (!iso) return 'never';
    const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }

    return 'just now';
}

export function daysUntil(iso: string | null | undefined): number | null {
    if (!iso) return null;

    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function humanize(value: string | null | undefined): string {
    if (!value) return '—';
    const s = value.replace(/[._]/g, ' ').toLowerCase();

    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function number(n: number | null | undefined): string {
    return n === null || n === undefined ? '—' : new Intl.NumberFormat().format(n);
}

/** 14:05 today, "Mon" this week, 12 Sep otherwise — for conversation lists. */
export function shortTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
    if (now.getTime() - d.getTime() < 6 * 86_400_000) return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);

    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(d);
}

export function clockTime(iso: string | null | undefined): string {
    return iso ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';
}

export function dayLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

/** "3h 12m" until a timestamp (customer service window). */
export function timeLeft(iso: string | null | undefined): string {
    if (!iso) return '';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'closed';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);

    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fileSize(bytes: number | null | undefined): string {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }

    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
