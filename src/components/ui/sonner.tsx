'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
    // On phones toasts sit above the bottom tab bar (--tabbar), never behind it.
    return (
        <Sonner
            theme="light"
            position="bottom-right"
            richColors
            closeButton
            mobileOffset={{ bottom: 'calc(16px + var(--tabbar))' }}
            toastOptions={{ classNames: { toast: 'font-sans' } }}
            {...props}
        />
    );
}

export { Toaster };
