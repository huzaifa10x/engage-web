# 10X Engage — client app

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui (Radix) · TanStack Query.
Talks only to the Laravel `/api/v1` API ([engage-backend](https://github.com/huzaifa10x/engage-backend)).

## How it connects to Laravel

The browser only ever calls **this** origin. `next.config.ts` proxies `/api/*` and `/sanctum/*`
to `BACKEND_URL`, so Sanctum session cookies are first-party: no CORS, no SameSite issues, and the
same setup works locally and in production. Mutations send `X-XSRF-TOKEN` from the `XSRF-TOKEN`
cookie (see `src/lib/api.ts`).

## Run locally

Backend running via Docker on `localhost:8000`, then:

```bash
cp .env.example .env.local        # BACKEND_URL=http://127.0.0.1:8000
npm install
npm run dev                       # http://localhost:3000
```

Backend `.env` must contain (defaults already do):

```
FRONTEND_URL=http://localhost:3000
SANCTUM_STATEFUL_DOMAINS=localhost:3000,127.0.0.1:3000
SESSION_DOMAIN=null
```

Seeded login: `owner@engage.test` / `Password123!` (after `php artisan migrate:fresh --seed`).

## Testing Connect WhatsApp (Embedded Signup) locally

Meta only runs Embedded Signup on HTTPS domains listed in your app. One tunnel covers both the
client and the API (the webhook goes through the same proxy):

```bash
ngrok http 3000                   # → https://abc123.ngrok-free.app
```

- `.env.local`: `ALLOWED_DEV_ORIGINS=abc123.ngrok-free.app`, restart `npm run dev`
- Backend `.env`: `FRONTEND_URL=https://abc123.ngrok-free.app`,
  `SANCTUM_STATEFUL_DOMAINS=localhost:3000,abc123.ngrok-free.app`, `SESSION_SECURE_COOKIE=true`,
  `META_DELETION_STATUS_URL=https://abc123.ngrok-free.app/deletion-status`, then restart app/horizon
- Meta App Dashboard → Facebook Login for Business → Settings: add the ngrok domain to
  **Allowed domains** and **Valid OAuth redirect URIs**
- Meta App Dashboard → WhatsApp → Configuration → Callback URL `https://abc123.ngrok-free.app/api/webhooks/meta`

## Realtime inbox

Team Inbox updates live through Laravel Reverb. Set `NEXT_PUBLIC_REVERB_KEY` (the backend's
`REVERB_APP_KEY`) plus host/port; the browser connects to Reverb directly and authorises private
channels through `/api/broadcasting/auth` (same-origin, session cookie). Without a key the inbox
polls (list every 15 s, open thread every 5 s) — everything still works, just less instantly.

## Structure

```
src/app/(auth)            login, register
src/app/(app)             authenticated shell: dashboard, inbox, contacts, channels, team, settings, audit-log
src/app/select-workspace  src/app/invitations/[token]  src/app/impersonate  src/app/deletion-status
src/components/ui         shadcn/ui primitives (add more with `npx shadcn@latest add <name>`)
src/components/app        shell: sidebar, switchers, banners, session context
src/hooks/use-embedded-signup.ts   Meta Embedded Signup v4 flow
src/hooks/use-inbox-realtime.ts    Reverb subscriptions → batched query refresh
src/components/inbox      conversation list, thread, composer, contact panel, templates
src/lib                   api client, query hooks, types, permissions, formatting
```

Permissions come from `/api/v1/me` (`permissions`, `'*'` = owner). The UI hides what a role
cannot do; Laravel enforces it regardless.

## Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run format`

## Production

`docker build -t engage-web .` then run with `BACKEND_URL=https://api.engage.10xdigital.ae`.
