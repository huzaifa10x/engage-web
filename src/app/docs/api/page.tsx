'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, DownloadIcon, KeyRoundIcon, MenuIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

/**
 * Public API documentation.
 *
 * Nothing about the API is written in this file. The page renders the description the API
 * publishes about itself (GET /api/public/v1/spec), which is the same data the Postman
 * collection and the OpenAPI file are generated from, and which the backend's tests check
 * against the real routes and responses. Deploy the API and this page is up to date.
 */

type Field = { name: string; type: string; required: boolean | string; description: string };
type Endpoint = {
    id: string;
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    path: string;
    scope: string | null;
    summary: string;
    description: string;
    content_type?: string;
    headers?: Field[];
    path_params?: Field[];
    query?: Field[];
    body?: Field[];
    request?: { example?: Record<string, unknown>; more?: { title: string; example: Record<string, unknown> }[] };
    response: { status: number; example: unknown };
    errors?: string[];
};
type Spec = {
    title: string;
    version: string;
    base_url: string;
    introduction: string;
    authentication: { summary: string; header: string; notes: string[]; scopes: { key: string; label: string }[] };
    conventions: { title: string; body: string }[];
    messaging_rules: string[];
    errors: { summary: string; format: unknown; codes: { status: number; code: string; meaning: string }[] };
    rate_limits: { plan: string; requests_per_minute: number | null }[];
    groups: { name: string; description: string; endpoints: Endpoint[] }[];
    webhooks: {
        summary: string;
        delivery: string[];
        headers: { name: string; description: string }[];
        signature: string;
        events: { key: string; label: string; example: unknown }[];
    };
};

const json = (value: unknown) => JSON.stringify(value, null, 2);
const slug = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

const METHOD: Record<string, string> = {
    GET: 'bg-info-bg text-info',
    POST: 'bg-brand-100 text-brand-600',
    PATCH: 'bg-warn-bg text-warn',
    PUT: 'bg-warn-bg text-warn',
    DELETE: 'bg-bad-bg text-bad',
};

// ── Request examples in several languages, built from the documented example body ────────────

type Lang = 'curl' | 'node' | 'python' | 'php';
const LANGS: [Lang, string][] = [
    ['curl', 'cURL'],
    ['node', 'Node.js'],
    ['python', 'Python'],
    ['php', 'PHP'],
];

function sample(lang: Lang, base: string, e: Endpoint, body: Record<string, unknown> | undefined): string {
    const url = `${base}${e.path.replace('{id}', 'ID')}`;
    const upload = e.content_type === 'multipart/form-data';
    const idempotent = e.id === 'messages.send';

    if (lang === 'curl') {
        const lines = [`curl${e.method === 'GET' ? '' : ` -X ${e.method}`} "${url}"`, '  -H "Authorization: Bearer $ENGAGE_API_KEY"'];
        if (upload) lines.push('  -F "file=@/path/to/Invoice-1001.pdf"');
        else if (body) {
            lines.push('  -H "Content-Type: application/json"');
            if (idempotent) lines.push('  -H "Idempotency-Key: order-1001"');
            lines.push(`  -d '${json(body).replace(/'/g, "'\\''")}'`);
        }

        return lines.join(' \\\n');
    }
    if (lang === 'node') {
        if (upload) {
            return `import { openAsBlob } from 'node:fs';\n\nconst form = new FormData();\nform.append('file', await openAsBlob('/path/to/Invoice-1001.pdf'), 'Invoice-1001.pdf');\n\nconst response = await fetch('${url}', {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${process.env.ENGAGE_API_KEY}\` },\n  body: form,\n});\nconsole.log(await response.json());`;
        }
        const headers = [`Authorization: \`Bearer \${process.env.ENGAGE_API_KEY}\``];
        if (body) headers.push("'Content-Type': 'application/json'");
        if (body && idempotent) headers.push("'Idempotency-Key': 'order-1001'");
        const options = [
            e.method === 'GET' ? null : `  method: '${e.method}',`,
            `  headers: { ${headers.join(', ')} },`,
            body ? `  body: JSON.stringify(${json(body).replace(/\n/g, '\n  ')}),` : null,
        ].filter(Boolean);

        return `const response = await fetch('${url}', {\n${options.join('\n')}\n});\nconsole.log(response.status, await response.json());`;
    }
    if (lang === 'python') {
        const head = `import os\nimport requests\n\nheaders = {"Authorization": f"Bearer {os.environ['ENGAGE_API_KEY']}"${body && idempotent ? ', "Idempotency-Key": "order-1001"' : ''}}\n`;
        if (upload)
            return `${head}with open("/path/to/Invoice-1001.pdf", "rb") as f:\n    response = requests.post("${url}", headers=headers, files={"file": f})\nprint(response.status_code, response.json())`;
        const py = body
            ? json(body)
                  .replace(/\btrue\b/g, 'True')
                  .replace(/\bfalse\b/g, 'False')
                  .replace(/\bnull\b/g, 'None')
            : null;

        return `${head}response = requests.${e.method.toLowerCase()}(\n    "${url}",\n    headers=headers,${py ? `\n    json=${py.replace(/\n/g, '\n    ')},` : ''}\n)\nprint(response.status_code, response.json())`;
    }
    // php
    const opts = [`    CURLOPT_RETURNTRANSFER => true,`, e.method === 'GET' ? null : `    CURLOPT_CUSTOMREQUEST => '${e.method}',`];
    const headers = [`'Authorization: Bearer ' . getenv('ENGAGE_API_KEY')`];
    if (upload) opts.push(`    CURLOPT_POSTFIELDS => ['file' => new CURLFile('/path/to/Invoice-1001.pdf')],`);
    else if (body) {
        headers.push(`'Content-Type: application/json'`);
        if (idempotent) headers.push(`'Idempotency-Key: order-1001'`);
        opts.push(`    CURLOPT_POSTFIELDS => json_encode(${phpArray(body, 1)}),`);
    }
    opts.push(`    CURLOPT_HTTPHEADER => [${headers.join(', ')}],`);

    return `<?php\n$ch = curl_init('${url}');\ncurl_setopt_array($ch, [\n${opts.filter(Boolean).join('\n')}\n]);\n$result = json_decode(curl_exec($ch), true);\necho curl_getinfo($ch, CURLINFO_HTTP_CODE), PHP_EOL;\nprint_r($result);`;
}

function phpArray(value: unknown, depth: number): string {
    const pad = '    '.repeat(depth + 1);
    if (Array.isArray(value)) return `[${value.map((v) => phpArray(v, depth)).join(', ')}]`;
    if (value && typeof value === 'object') {
        const rows = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${pad}'${k}' => ${phpArray(v, depth + 1)},`);

        return `[\n${rows.join('\n')}\n${'    '.repeat(depth)}]`;
    }
    if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

    return value === null ? 'null' : String(value);
}

// ── Building blocks ────────────────────────────────────────────────────────────────────────

function Copy({ value }: { value: string }) {
    const [done, setDone] = useState(false);

    return (
        <button
            type="button"
            aria-label="Copy"
            onClick={async () => {
                await navigator.clipboard.writeText(value).catch(() => undefined);
                setDone(true);
                setTimeout(() => setDone(false), 1500);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-[11.5px] font-medium text-white/80 hover:bg-white/20"
        >
            {done ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />} {done ? 'Copied' : 'Copy'}
        </button>
    );
}

function Code({ children, label }: { children: string; label?: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded-xl bg-[#0d1109]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-2">
                <div className="min-w-0 text-[12px] font-medium text-white/60">{label}</div>
                <Copy value={children} />
            </div>
            <pre className="max-h-[28rem] overflow-auto p-4 font-mono text-[12.5px] leading-relaxed text-[#d7e9b0]">{children}</pre>
        </div>
    );
}

function Fields({ title, fields }: { title: string; fields: Field[] }) {
    return (
        <div>
            <h4 className="mb-2 text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h4>
            <dl className="divide-y rounded-xl border bg-card">
                {fields.map((f) => (
                    <div key={f.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
                        <dt className="min-w-0">
                            <code className="font-mono text-[13px] font-semibold break-all">{f.name}</code>
                            <span className="mt-0.5 block text-[12px] text-muted-foreground">
                                {f.type}
                                {f.required === true ? (
                                    <span className="ml-1.5 font-semibold text-bad">required</span>
                                ) : typeof f.required === 'string' ? (
                                    <span className="ml-1.5 font-medium text-warn">{f.required}</span>
                                ) : null}
                            </span>
                        </dt>
                        <dd className="text-[14px] leading-relaxed text-ink-2">{f.description}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-24 border-t pt-10 first:border-t-0 first:pt-0">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <div className="mt-4 grid gap-5 text-[15px] leading-relaxed text-ink-2">{children}</div>
        </section>
    );
}

function EndpointBlock({ e, base, lang, setLang }: { e: Endpoint; base: string; lang: Lang; setLang: (l: Lang) => void }) {
    const variants = [...(e.request?.example ? [{ title: 'Example', example: e.request.example }] : []), ...(e.request?.more ?? [])];
    const [variant, setVariant] = useState(0);
    const body = variants[variant]?.example;

    return (
        <article id={e.id} className="scroll-mt-24 border-t pt-8">
            <div className="grid gap-6 xl:grid-cols-2 xl:gap-8">
                <div className="grid content-start gap-5">
                    <div>
                        <h3 className="text-xl font-semibold tracking-tight">{e.summary}</h3>
                        <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[13.5px]">
                            <span className={cn('rounded-md px-2 py-0.5 text-[12px] font-bold', METHOD[e.method])}>{e.method}</span>
                            <span className="break-all">{e.path}</span>
                        </p>
                        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{e.description}</p>
                        <p className="mt-2 text-[13.5px] text-muted-foreground">
                            Permission:{' '}
                            {e.scope ? (
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">{e.scope}</code>
                            ) : (
                                'any valid key'
                            )}
                        </p>
                    </div>
                    {e.path_params && <Fields title="Path parameters" fields={e.path_params} />}
                    {e.query && <Fields title="Query parameters" fields={e.query} />}
                    {e.headers && <Fields title="Headers" fields={e.headers} />}
                    {e.body && (
                        <Fields title={e.content_type === 'multipart/form-data' ? 'Form fields (multipart/form-data)' : 'Body (JSON)'} fields={e.body} />
                    )}
                    {e.errors && e.errors.length > 0 && (
                        <p className="text-[13.5px] text-muted-foreground">
                            Errors to handle:{' '}
                            {e.errors.map((code, i) => (
                                <span key={code}>
                                    {i > 0 && ', '}
                                    <a href="#errors" className="font-mono text-[12.5px] text-brand-600 hover:underline">
                                        {code}
                                    </a>
                                </span>
                            ))}
                        </p>
                    )}
                </div>

                <div className="grid content-start gap-4 xl:sticky xl:top-24 xl:self-start">
                    {variants.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {variants.map((v, i) => (
                                <button
                                    key={v.title}
                                    onClick={() => setVariant(i)}
                                    className={cn(
                                        'rounded-full border px-3 py-1 text-[12.5px] font-medium',
                                        i === variant ? 'border-brand-500 bg-brand-50 text-brand-600' : 'text-muted-foreground hover:bg-muted',
                                    )}
                                >
                                    {i === 0 ? 'Text' : v.title}
                                </button>
                            ))}
                        </div>
                    )}
                    <Code
                        label={
                            <div className="flex gap-1">
                                {LANGS.map(([key, name]) => (
                                    <button
                                        key={key}
                                        onClick={() => setLang(key)}
                                        className={cn('rounded px-2 py-0.5', lang === key ? 'bg-white/15 text-white' : 'hover:text-white')}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        {sample(lang, base, e, body)}
                    </Code>
                    <Code label={`Response · ${e.response.status}`}>{json(e.response.example)}</Code>
                </div>
            </div>
        </article>
    );
}

export default function ApiDocsPage() {
    const spec = useQuery({
        queryKey: ['public-api-spec'],
        queryFn: async () => {
            const response = await fetch('/api/public/v1/spec', { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('unavailable');

            return ((await response.json()) as { data: Spec }).data;
        },
        staleTime: 300_000,
        retry: 1,
    });
    const [lang, setLang] = useState<Lang>('curl');
    const [menu, setMenu] = useState(false);
    const [event, setEvent] = useState(0);
    const doc = spec.data;

    const nav = doc
        ? [
              {
                  title: 'Getting started',
                  links: [
                      ['introduction', 'Introduction'],
                      ['authentication', 'Authentication'],
                      ['conventions', 'Requests and responses'],
                      ['rate-limits', 'Rate limits'],
                      ['errors', 'Errors'],
                      ['messaging-rules', 'WhatsApp rules'],
                      ['postman', 'Postman collection'],
                  ],
              },
              ...doc.groups.map((g) => ({ title: g.name, links: g.endpoints.map((e) => [e.id, e.summary]) })),
              {
                  title: 'Webhooks',
                  links: [
                      ['webhooks', 'Overview'],
                      ['webhook-signature', 'Verifying a webhook'],
                      ['webhook-events', 'Events'],
                  ],
              },
          ]
        : [];

    const sidebar = (
        <nav aria-label="Documentation" className="grid gap-6 text-[14px]">
            {nav.map((group) => (
                <div key={group.title}>
                    <p className="mb-2 text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">{group.title}</p>
                    <ul className="grid gap-0.5">
                        {group.links.map(([id, label]) => (
                            <li key={id}>
                                <a
                                    href={`#${id}`}
                                    onClick={() => setMenu(false)}
                                    className="block rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-muted hover:text-foreground"
                                >
                                    {label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </nav>
    );

    return (
        <div className="min-h-dvh bg-background">
            <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 sm:px-6">
                    <Link href="/" aria-label="10X Engage">
                        <Logo />
                    </Link>
                    <span className="hidden rounded-full bg-brand-100 px-2.5 py-0.5 text-[12px] font-semibold text-brand-600 sm:inline">
                        API {doc?.version ?? 'v1'}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <a
                            href="/api/public/v1/postman.json"
                            download
                            className="hidden h-9 items-center gap-2 rounded-lg border bg-card px-3 text-[13.5px] font-semibold hover:bg-muted sm:inline-flex"
                        >
                            <DownloadIcon className="size-4" /> Postman collection
                        </a>
                        <Link
                            href="/developer"
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-[13.5px] font-semibold text-primary-foreground hover:bg-primary-hover"
                        >
                            <KeyRoundIcon className="size-4" /> Get an API key
                        </Link>
                        <button
                            onClick={() => setMenu((m) => !m)}
                            aria-label={menu ? 'Close menu' : 'Open menu'}
                            aria-expanded={menu}
                            className="inline-flex size-9 items-center justify-center rounded-lg border lg:hidden"
                        >
                            {menu ? <XIcon className="size-4" /> : <MenuIcon className="size-4" />}
                        </button>
                    </div>
                </div>
                {menu && <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-card px-4 py-5 lg:hidden">{sidebar}</div>}
            </header>

            <div className="mx-auto flex max-w-[90rem] gap-10 px-4 py-8 sm:px-6 lg:py-12">
                <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] w-60 shrink-0 self-start overflow-y-auto pr-2 lg:block">{sidebar}</aside>

                <main className="min-w-0 flex-1">
                    {spec.isLoading && <p className="text-muted-foreground">Loading the documentation…</p>}
                    {spec.isError && (
                        <div className="rounded-xl border bg-card p-6">
                            <h1 className="text-xl font-semibold">The documentation could not be loaded</h1>
                            <p className="mt-2 text-muted-foreground">Please refresh in a moment.</p>
                        </div>
                    )}
                    {doc && (
                        <div className="grid gap-10">
                            <Section id="introduction" title={doc.title}>
                                <p className="max-w-3xl text-[17px]">{doc.introduction}</p>
                                <div className="max-w-3xl">
                                    <Code label="Base URL">{doc.base_url}</Code>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <a
                                        href="/api/public/v1/postman.json"
                                        download
                                        className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-semibold hover:bg-muted"
                                    >
                                        <DownloadIcon className="size-4" /> Download the Postman collection
                                    </a>
                                    <a
                                        href="/api/public/v1/openapi.json"
                                        className="inline-flex h-10 items-center rounded-lg border bg-card px-4 text-sm font-semibold hover:bg-muted"
                                    >
                                        OpenAPI (JSON)
                                    </a>
                                </div>
                            </Section>

                            <Section id="authentication" title="Authentication">
                                <p className="max-w-3xl">{doc.authentication.summary}</p>
                                <div className="max-w-3xl">
                                    <Code label="Every request">{doc.authentication.header}</Code>
                                </div>
                                <ul className="grid max-w-3xl list-disc gap-1.5 pl-5">
                                    {doc.authentication.notes.map((n) => (
                                        <li key={n}>{n}</li>
                                    ))}
                                </ul>
                                <div className="max-w-3xl overflow-x-auto rounded-xl border bg-card">
                                    <table className="w-full text-left text-[14px]">
                                        <thead>
                                            <tr className="border-b text-[12.5px] text-muted-foreground uppercase">
                                                <th className="px-4 py-2.5 font-semibold">Permission</th>
                                                <th className="px-4 py-2.5 font-semibold">Allows</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {doc.authentication.scopes.map((s) => (
                                                <tr key={s.key} className="border-b last:border-b-0">
                                                    <td className="px-4 py-2.5 font-mono text-[13px] whitespace-nowrap">{s.key}</td>
                                                    <td className="px-4 py-2.5">{s.label}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Section>

                            <Section id="conventions" title="Requests and responses">
                                <dl className="grid max-w-3xl gap-4">
                                    {doc.conventions.map((c) => (
                                        <div key={c.title} id={slug(c.title)} className="scroll-mt-24">
                                            <dt className="font-semibold text-foreground">{c.title}</dt>
                                            <dd className="mt-1">{c.body}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </Section>

                            <Section id="rate-limits" title="Rate limits">
                                <p className="max-w-3xl">Limits apply per workspace, across all its keys. They come from the workspace&apos;s plan:</p>
                                <div className="max-w-md overflow-x-auto rounded-xl border bg-card">
                                    <table className="w-full text-left text-[14px]">
                                        <thead>
                                            <tr className="border-b text-[12.5px] text-muted-foreground uppercase">
                                                <th className="px-4 py-2.5 font-semibold">Plan</th>
                                                <th className="px-4 py-2.5 font-semibold">Requests per minute</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {doc.rate_limits.map((r) => (
                                                <tr key={r.plan} className="border-b last:border-b-0">
                                                    <td className="px-4 py-2.5 font-medium">{r.plan}</td>
                                                    <td className="px-4 py-2.5 tabular-nums">{r.requests_per_minute?.toLocaleString() ?? 'Unlimited'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="max-w-3xl">
                                    <Code label="Headers on every answer">
                                        {'X-RateLimit-Limit: 1200\nX-RateLimit-Remaining: 1187\n\n# when the limit is reached (429):\nRetry-After: 23'}
                                    </Code>
                                </div>
                            </Section>

                            <Section id="errors" title="Errors">
                                <p className="max-w-3xl">{doc.errors.summary}</p>
                                <div className="max-w-3xl">
                                    <Code label="Error format">{json(doc.errors.format)}</Code>
                                </div>
                                <div className="overflow-x-auto rounded-xl border bg-card">
                                    <table className="w-full min-w-[36rem] text-left text-[14px]">
                                        <thead>
                                            <tr className="border-b text-[12.5px] text-muted-foreground uppercase">
                                                <th className="px-4 py-2.5 font-semibold">Status</th>
                                                <th className="px-4 py-2.5 font-semibold">Code</th>
                                                <th className="px-4 py-2.5 font-semibold">What it means</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {doc.errors.codes.map((c) => (
                                                <tr key={c.code} className="border-b last:border-b-0">
                                                    <td className="px-4 py-2.5 tabular-nums">{c.status}</td>
                                                    <td className="px-4 py-2.5 font-mono text-[13px] whitespace-nowrap">{c.code}</td>
                                                    <td className="px-4 py-2.5">{c.meaning}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Section>

                            <Section id="messaging-rules" title="WhatsApp rules the API applies">
                                <ul className="grid max-w-3xl list-disc gap-1.5 pl-5">
                                    {doc.messaging_rules.map((r) => (
                                        <li key={r}>{r}</li>
                                    ))}
                                </ul>
                            </Section>

                            <Section id="postman" title="Postman collection">
                                <p className="max-w-3xl">
                                    The official collection has every endpoint with example bodies and saved example responses. It is generated from the same
                                    description as this page, so it always matches the API you download it from.
                                </p>
                                <ol className="grid max-w-3xl list-decimal gap-1.5 pl-5">
                                    <li>Download the collection, or in Postman choose Import and paste its link.</li>
                                    <li>
                                        Open the collection&apos;s Variables and set{' '}
                                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px]">api_key</code> to your key.
                                    </li>
                                    <li>Send “Check your key”. For requests that need an id, paste one from an earlier response into the matching variable.</li>
                                </ol>
                                <div className="max-w-3xl">
                                    <Code label="Import link">{`${doc.base_url}/postman.json`}</Code>
                                </div>
                            </Section>

                            {doc.groups.map((group) => (
                                <section key={group.name} id={slug(group.name)} className="scroll-mt-24 border-t pt-10">
                                    <h2 className="text-2xl font-semibold tracking-tight">{group.name}</h2>
                                    <p className="mt-2 max-w-3xl text-[15px] text-ink-2">{group.description}</p>
                                    <div className="mt-8 grid gap-8">
                                        {group.endpoints.map((e) => (
                                            <EndpointBlock key={e.id} e={e} base={doc.base_url} lang={lang} setLang={setLang} />
                                        ))}
                                    </div>
                                </section>
                            ))}

                            <Section id="webhooks" title="Webhooks">
                                <p className="max-w-3xl">{doc.webhooks.summary}</p>
                                <ul className="grid max-w-3xl list-disc gap-1.5 pl-5">
                                    {doc.webhooks.delivery.map((d) => (
                                        <li key={d}>{d}</li>
                                    ))}
                                </ul>
                                <dl className="max-w-3xl divide-y rounded-xl border bg-card">
                                    {doc.webhooks.headers.map((h) => (
                                        <div key={h.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
                                            <dt className="font-mono text-[13px] font-semibold">{h.name}</dt>
                                            <dd className="text-[14px]">{h.description}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </Section>

                            <Section id="webhook-signature" title="Verifying a webhook">
                                <p className="max-w-3xl">{doc.webhooks.signature}</p>
                                <div className="max-w-3xl">
                                    <Code label="Node.js">{`const crypto = require('crypto');\n\n// rawBody: the request body exactly as received (a string or Buffer), before any JSON parsing.\nfunction isFromEngage(rawBody, signatureHeader, secret) {\n  const { t, v1 } = Object.fromEntries(signatureHeader.split(',').map((part) => part.split('=')));\n  const expected = crypto.createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex');\n  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;\n  return fresh && expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));\n}`}</Code>
                                </div>
                                <div className="max-w-3xl">
                                    <Code label="PHP">{`<?php\n$raw = file_get_contents('php://input');\nparse_str(str_replace(',', '&', $_SERVER['HTTP_X_ENGAGE_SIGNATURE'] ?? ''), $sig);\n$expected = hash_hmac('sha256', ($sig['t'] ?? '') . '.' . $raw, getenv('ENGAGE_WEBHOOK_SECRET'));\n\nif (! hash_equals($expected, $sig['v1'] ?? '') || abs(time() - (int) ($sig['t'] ?? 0)) > 300) {\n    http_response_code(400);\n    exit;\n}\n\n$event = json_decode($raw, true);\nhttp_response_code(200); // answer first, then do the work`}</Code>
                                </div>
                            </Section>

                            <Section id="webhook-events" title="Webhook events">
                                <div className="grid gap-5 xl:grid-cols-2 xl:gap-8">
                                    <ul className="divide-y rounded-xl border bg-card">
                                        {doc.webhooks.events.map((ev, i) => (
                                            <li key={ev.key}>
                                                <button
                                                    onClick={() => setEvent(i)}
                                                    className={cn(
                                                        'flex w-full flex-col items-start px-4 py-3 text-left hover:bg-muted',
                                                        i === event && 'bg-brand-50',
                                                    )}
                                                >
                                                    <code className="font-mono text-[13px] font-semibold">{ev.key}</code>
                                                    <span className="text-[13.5px] text-muted-foreground">{ev.label}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="xl:sticky xl:top-24 xl:self-start">
                                        <Code label={`Payload · ${doc.webhooks.events[event]?.key}`}>{json(doc.webhooks.events[event]?.example)}</Code>
                                    </div>
                                </div>
                            </Section>

                            <footer className="border-t pt-6 text-[13px] text-muted-foreground">
                                {doc.title} {doc.version} · This page is generated from the live API. Questions? Contact us from your workspace or at
                                info@10xdigital.ae.
                            </footer>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
