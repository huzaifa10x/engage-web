'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError, errorMessage } from '@/lib/api';
import { loadFacebookSdk } from '@/lib/facebook-sdk';
import { startSignup } from '@/lib/queries';
import type { SignupAttempt, SignupConflict, SignupLaunch, SubscribedApp } from '@/lib/types';

/**
 * Embedded Signup v4 (Tech Provider).
 *
 * Two independent signals come back from the popup, in no guaranteed order:
 *   1. FB.login callback            → authResponse.code (exchangeable, TTL 30 SECONDS)
 *   2. window "message" event       → { type: 'WA_EMBEDDED_SIGNUP', event, data: { waba_id, phone_number_id, business_id } }
 * We POST /complete as soon as both are present. The server exchanges the code synchronously,
 * then provisions in a queued job; we poll the attempt until it is terminal.
 */

export type SignupPhase = 'idle' | 'starting' | 'popup' | 'completing' | 'provisioning' | 'completed' | 'failed' | 'cancelled';

type SessionInfo = {
    event: string;
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
};

const FINISH_EVENTS = ['FINISH', 'FINISH_ONLY_WABA', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'];
const SESSION_WAIT_MS = 10_000; // how long to wait for session info after the code arrives
const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000;

export function useEmbeddedSignup(onFinished?: (attempt: SignupAttempt) => void) {
    const [phase, setPhase] = useState<SignupPhase>('idle');
    const [attempt, setAttempt] = useState<SignupAttempt | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [numbers, setNumbers] = useState<SignupLaunch['numbers'] | null>(null);
    // Set when the server refuses the number because it is still registered with another application.
    const [conflict, setConflict] = useState<SignupConflict | null>(null);

    const attemptId = useRef<string | null>(null);
    const code = useRef<string | null>(null);
    const userId = useRef<string | null>(null);
    const session = useRef<SessionInfo | null>(null);
    const completing = useRef(false);
    const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const finishedRef = useRef(onFinished);
    useEffect(() => {
        finishedRef.current = onFinished;
    }, [onFinished]);

    const clearTimers = () => {
        if (sessionTimer.current) clearTimeout(sessionTimer.current);
        if (pollTimer.current) clearTimeout(pollTimer.current);
    };

    const fail = useCallback((message: string) => {
        clearTimers();
        setError(message);
        setPhase('failed');
    }, []);

    const poll = useCallback(
        (startedAt: number) => {
            const tick = () => {
                const id = attemptId.current;
                if (!id) return;

                api<{ data: SignupAttempt }>(`whatsapp/signups/${id}`)
                    .then(({ data }) => {
                        setAttempt(data);
                        if (data.status === 'completed') {
                            setPhase('completed');
                            finishedRef.current?.(data);
                        } else if (data.status === 'failed') {
                            fail(data.error?.message ?? 'Meta could not finish connecting this number.');
                            finishedRef.current?.(data);
                        } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
                            fail('Setup is taking longer than expected. It will keep running in the background — check Channels in a few minutes.');
                        } else {
                            pollTimer.current = setTimeout(tick, POLL_MS);
                        }
                    })
                    .catch((e) => fail(errorMessage(e)));
            };

            tick();
        },
        [fail],
    );

    const complete = useCallback(async () => {
        if (completing.current || !attemptId.current || !code.current || !session.current) return;
        completing.current = true;
        if (sessionTimer.current) clearTimeout(sessionTimer.current);

        const info = session.current;
        if (!info.waba_id) {
            fail('Meta did not return a WhatsApp Business Account. Please try again.');

            return;
        }

        setPhase('completing');
        try {
            const { data } = await api<{ data: SignupAttempt }>(`whatsapp/signups/${attemptId.current}/complete`, {
                method: 'POST',
                body: {
                    code: code.current,
                    event: info.event,
                    waba_id: info.waba_id,
                    phone_number_id: info.phone_number_id ?? null,
                    business_id: info.business_id ?? null,
                    meta_user_id: userId.current,
                },
            });
            code.current = null; // single use
            setAttempt(data);

            if (data.status === 'completed') {
                setPhase('completed');
                finishedRef.current?.(data);
            } else if (data.status === 'failed') {
                fail(data.error?.message ?? 'Meta could not finish connecting this number.');
                finishedRef.current?.(data);
            } else {
                setPhase('provisioning');
                poll(Date.now());
            }
        } catch (e) {
            if (e instanceof ApiError && e.code === 'number_subscribed_elsewhere') {
                setConflict({
                    apps: Array.isArray(e.details?.apps) ? (e.details.apps as SubscribedApp[]) : [],
                    sameApp: e.details?.same_app === true,
                });
                fail(e.message);
            } else if (e instanceof ApiError && e.code === 'plan_limit_reached') {
                fail('Your plan has no free WhatsApp number slots. Upgrade or disconnect a number, then connect again.');
            } else {
                fail(errorMessage(e));
            }
        }
    }, [fail, poll]);

    // Session-logging listener (must be registered before the popup opens).
    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (typeof event.origin !== 'string' || !event.origin.endsWith('facebook.com')) return;
            let payload: { type?: string; event?: string; data?: Record<string, string> };
            try {
                payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch {
                return;
            }
            if (payload?.type !== 'WA_EMBEDDED_SIGNUP' || !attemptId.current) return;

            const ev = String(payload.event ?? '');
            if (FINISH_EVENTS.includes(ev)) {
                session.current = { event: ev, ...(payload.data ?? {}) };
                void complete();
            } else if (ev === 'CANCEL' || ev === 'ERROR') {
                const d = payload.data ?? {};
                void api(`whatsapp/signups/${attemptId.current}/cancel`, {
                    method: 'POST',
                    body: {
                        current_step: d.current_step ?? null,
                        error_code: d.error_code ?? null,
                        error_message: d.error_message ?? null,
                        session_id: d.session_id ?? null,
                    },
                }).catch(() => undefined);
                clearTimers();
                if (d.error_message) {
                    setError(d.error_message);
                    setPhase('failed');
                } else {
                    setPhase('cancelled');
                }
            } else if (ev.startsWith('FINISH')) {
                // FINISH_OBO_MIGRATION / FINISH_GRANT_ONLY_API_ACCESS: not offered by our configuration.
                fail('This type of WhatsApp signup is not supported yet.');
            }
        };

        window.addEventListener('message', onMessage);

        return () => {
            window.removeEventListener('message', onMessage);
            clearTimers();
        };
    }, [complete, fail]);

    const launch = useCallback(
        async (options: { coexistence: boolean }) => {
            clearTimers();
            setError(null);
            setConflict(null);
            setAttempt(null);
            code.current = null;
            session.current = null;
            userId.current = null;
            completing.current = false;
            setPhase('starting');

            let started: SignupLaunch;
            try {
                started = await startSignup(options.coexistence);
            } catch (e) {
                fail(errorMessage(e));

                return;
            }

            attemptId.current = started.attempt.id;
            setAttempt(started.attempt);
            setNumbers(started.numbers);

            let fb;
            try {
                fb = await loadFacebookSdk(started.launch.app_id, started.launch.graph_version);
            } catch (e) {
                fail(errorMessage(e));

                return;
            }

            setPhase('popup');
            // The callback must be synchronous (the SDK rejects async functions).
            fb.login((response) => {
                const auth = response?.authResponse;
                if (auth?.code) {
                    code.current = auth.code;
                    userId.current = auth.userID ?? null;
                    if (session.current) {
                        void complete();
                    } else {
                        sessionTimer.current = setTimeout(() => {
                            if (!completing.current) fail('The popup closed before Meta confirmed which account to connect. Please try again.');
                        }, SESSION_WAIT_MS);
                    }
                } else if (!session.current) {
                    // Closed without finishing and without a CANCEL message (e.g. popup blocked).
                    setPhase((p) => (p === 'popup' ? 'cancelled' : p));
                }
            }, started.launch.login_options);
        },
        [complete, fail],
    );

    const reset = useCallback(() => {
        clearTimers();
        attemptId.current = null;
        setPhase('idle');
        setAttempt(null);
        setError(null);
        setConflict(null);
    }, []);

    return { phase, attempt, error, conflict, numbers, launch, reset };
}
