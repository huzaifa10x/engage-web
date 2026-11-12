# End-to-end tests (web app + API)

These tests drive the real web app in Chromium against a real engage-backend: real API, PostgreSQL
with row-level security, queue worker, fake Meta (no WhatsApp account; messages are "sent" and their
ticks move like real ones). Customer messages are injected with `php artisan engage:demo:inbound`,
which runs the same inbound pipeline as a Meta webhook.

What they cover (Chatbots & Flows):

| Spec | Checks |
|---|---|
| `chatbots-journey.spec.ts` | Create flow → add step → configure (save the chosen option to a contact field, hand over to an inbox team, outcome) → test → publish refused → fix → publish → live → customer messages → contact field and name saved → handed over to the team → inbox team filter → Runs & Activity replay → Flow insights |
| `chatbots-features.spec.ts` | Two editors: refused save, merge, nothing lost · engine level 1 flows keep their behaviour until upgraded and published · booking window, sample answer, outcome, date refusal in the test chat, live-call confirmation and refusal without test endpoints · Start rules overlaps, reorder and tester · test endpoints validation |

## Run

1. Backend (engage-backend), local environment with demo data:

    ```
    ./dev setup
    ./dev start
    ```

    or by hand: `.env` with `APP_ENV=local`, `META_FAKE=true`, `LOGIN_OTP_ENABLED=false`, `MAIL_MAILER=log`,
    a queue worker on every queue (`php artisan queue:work --queue=critical,webhooks,messaging,default,notifications,maintenance`),
    `php artisan migrate:fresh --seed`, and the demo owner's email marked as verified.

    `account-settings.spec.ts` (remember this device, email notifications) switches sign-in codes on in that
    `.env` while it runs and reads the codes and emails from `storage/logs/laravel.log`; it needs `php artisan serve`
    (which reads `.env` on every request) rather than a cached config.

2. Web app on http://localhost:3000 (`npm run dev`, or `npm run build && npm start`).

3. Run:

    ```
    E2E_BACKEND_DIR=../engage-backend E2E_PHP=php npm run e2e
    ```

    `E2E_BACKEND_DIR` is required: the tests run artisan there to simulate customer messages.
    Use a fresh demo database; the tests create flows, teams and contacts.
