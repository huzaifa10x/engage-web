import type { Tone } from '@/components/ui/badge';
import type { PhoneNumber } from '@/lib/types';

import { humanize } from './format';

export const qualityTone = (q: PhoneNumber['quality_rating']): Tone => (q === 'GREEN' ? 'good' : q === 'YELLOW' ? 'warn' : q === 'RED' ? 'bad' : 'grey');

export const qualityLabel = (q: PhoneNumber['quality_rating']): string =>
    q === 'GREEN' ? 'High quality' : q === 'YELLOW' ? 'Medium quality' : q === 'RED' ? 'Low quality' : 'Not rated yet';

/** TIER_250 → "250 / 24h", TIER_UNLIMITED → "Unlimited". */
export function tierLabel(tier: string | null): string {
    if (!tier) return '—';
    if (tier === 'TIER_UNLIMITED') return 'Unlimited';
    if (tier === 'TIER_NOT_SET') return 'Not set';
    const m = /TIER_(\d+)(K?)/.exec(tier);

    return m ? `${m[1]}${m[2]} customers / 24h` : humanize(tier);
}

export const statusTone = (s: PhoneNumber['status']): Tone => (s === 'connected' ? 'good' : s === 'pending' ? 'info' : 'grey');

export const statusLabel = (s: PhoneNumber['status']): string => (s === 'connected' ? 'Connected' : s === 'pending' ? 'Setting up' : 'Disconnected');

export const onboardingLabel = (t: PhoneNumber['onboarding_type']): string =>
    t === 'coexistence' ? 'WhatsApp Business app + API' : t === 'migrated' ? 'Migrated number' : 'Cloud API';

export function coexistenceLabel(s: PhoneNumber['coexistence_status']): string | null {
    switch (s) {
        case 'sync_pending':
            return 'Waiting to sync app data';
        case 'history_syncing':
            return 'Syncing chat history';
        case 'synced':
            return 'App data synced';
        case 'sync_failed':
            return 'History sync failed';
        case 'offboarded':
            return 'Disconnected from the app';
        default:
            return null;
    }
}
