/**
 * "Someone is in the middle of something": a reply being typed, a voice note being recorded or a
 * message being sent. A new app version waits until nothing is busy before it takes over.
 */
const busy = new Set<string>();
const listeners = new Set<() => void>();

export function setBusy(key: string, on: boolean): void {
    const before = busy.size;
    if (on) busy.add(key);
    else busy.delete(key);
    if (busy.size !== before) listeners.forEach((l) => l());
}

export const isBusy = () => busy.size > 0;

export function onBusyChange(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}
