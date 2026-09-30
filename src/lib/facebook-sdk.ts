/**
 * Loads the Facebook JavaScript SDK once (Embedded Signup relies on FB.login).
 * Meta: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation
 */

type FbAuthResponse = { code?: string; userID?: string } | null;
type FbLoginResponse = { authResponse: FbAuthResponse; status?: string };

export type FacebookSdk = {
    init(options: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
    login(callback: (response: FbLoginResponse) => void, options: Record<string, unknown>): void;
};

declare global {
    interface Window {
        FB?: FacebookSdk;
        fbAsyncInit?: () => void;
    }
}

let loading: Promise<FacebookSdk> | null = null;
let initialisedFor: string | null = null;

export function loadFacebookSdk(appId: string, version: string): Promise<FacebookSdk> {
    const init = (fb: FacebookSdk) => {
        if (initialisedFor !== appId) {
            fb.init({ appId, autoLogAppEvents: true, xfbml: false, version });
            initialisedFor = appId;
        }

        return fb;
    };

    if (window.FB) return Promise.resolve(init(window.FB));

    loading ??= new Promise<FacebookSdk>((resolve, reject) => {
        window.fbAsyncInit = () => (window.FB ? resolve(window.FB) : reject(new Error('Facebook SDK failed to initialise.')));

        const script = document.createElement('script');
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        script.onerror = () => {
            loading = null;
            reject(new Error('Could not load the Facebook SDK. Check your connection or ad blocker.'));
        };
        document.body.appendChild(script);
    });

    return loading.then(init);
}
