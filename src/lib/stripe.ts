/**
 * Stripe.js, loaded from Stripe's own domain (required by Stripe: card details go straight from
 * the browser to Stripe and never touch our servers). Only the small surface we use is typed.
 */
export type StripeError = { message?: string; code?: string };

export type StripeCardElement = {
    mount: (el: HTMLElement) => void;
    unmount: () => void;
    destroy: () => void;
    on: (event: 'change', cb: (e: { error?: StripeError; complete: boolean }) => void) => void;
};

export type StripeInstance = {
    elements: (options?: Record<string, unknown>) => { create: (type: 'card', options?: Record<string, unknown>) => StripeCardElement };
    confirmCardSetup: (
        clientSecret: string,
        data: { payment_method: { card: StripeCardElement; billing_details?: Record<string, unknown> } },
    ) => Promise<{ error?: StripeError; setupIntent?: { status: string; payment_method: string | null } }>;
    confirmCardPayment: (clientSecret: string, data?: { payment_method?: string }) => Promise<{ error?: StripeError; paymentIntent?: { status: string } }>;
};

declare global {
    interface Window {
        Stripe?: (publishableKey: string) => StripeInstance;
    }
}

let loading: Promise<void> | null = null;
const instances = new Map<string, StripeInstance>();

function loadScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('Stripe can only load in the browser.'));
    if (window.Stripe) return Promise.resolve();

    loading ??= new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            loading = null;
            reject(new Error('The secure payment form could not be loaded. Check your connection or ad blocker and try again.'));
        };
        document.head.appendChild(script);
    });

    return loading;
}

export async function getStripe(publishableKey: string): Promise<StripeInstance> {
    await loadScript();
    const existing = instances.get(publishableKey);
    if (existing) return existing;
    if (!window.Stripe) throw new Error('The secure payment form could not be loaded.');
    const stripe = window.Stripe(publishableKey);
    instances.set(publishableKey, stripe);

    return stripe;
}
