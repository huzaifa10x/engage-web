'use client';

import { WifiOffIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/** "No connection": shown while the device is offline (brief M1). Replies typed meanwhile stay as drafts. */
export function OfflineBar() {
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        const update = () => setOffline(!navigator.onLine);
        const back = () => {
            setOffline(false);
            toast.success('Back online');
        };
        update();
        window.addEventListener('offline', update);
        window.addEventListener('online', back);

        return () => {
            window.removeEventListener('offline', update);
            window.removeEventListener('online', back);
        };
    }, []);

    if (!offline) return null;

    return (
        <div role="status" className="flex items-center gap-2 bg-sidebar px-4 py-2 text-[13px] text-white sm:px-6">
            <WifiOffIcon className="size-4" aria-hidden />
            No connection · replies you send now go out as soon as you’re back online.
        </div>
    );
}
