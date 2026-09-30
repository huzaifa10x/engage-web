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
