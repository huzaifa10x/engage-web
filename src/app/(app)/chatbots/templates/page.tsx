'use client';

import { useState } from 'react';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { TemplateGallery } from '@/components/chatbots/template-gallery';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { type FlowTemplate, useChatbotTemplates } from '@/lib/chatbots';
import { P } from '@/lib/permissions';

/** Templates (approved design): ready-made customer journeys; “Use this” asks a few questions and builds a working draft. */
export default function ChatbotTemplatesPage() {
    const { can } = useSession();
    const allowed = can(P.ChatbotsView);
    const canManage = can(P.ChatbotsManage);
    const templates = useChatbotTemplates(allowed);
    const [q, setQ] = useState('');
    const [industry, setIndustry] = useState('All');
    const [preview, setPreview] = useState<FlowTemplate | null>(null);
    const [using, setUsing] = useState<string | null>(null);
    if (!allowed) return <Forbidden />;

    const list = templates.data?.data ?? [];
    const industries = ['All', ...new Set(list.map((t) => t.industry))];
    const shown = list.filter(
        (t) =>
            (industry === 'All' || t.industry === industry) &&
            (q.trim() === '' || `${t.name} ${t.industry} ${t.description} ${t.steps.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())),
    );
    const youSet = (t: FlowTemplate) => t.fields.map((f) => f.label).join(', ');

    return (
        <>
            <div className="cb-pagehead">
                <div>
                    <h1>Templates</h1>
                    <p>Ready-made customer journeys. Preview the whole conversation, answer a few questions, and a working draft is built from your answers.</p>
                </div>
            </div>
            <div className="cb-row">
                <input
                    className="cb-in"
                    style={{ width: 260 }}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by business or goal"
                    aria-label="Search templates"
                />
                <div className="cb-seg" role="tablist" aria-label="Business">
                    {industries.map((i) => (
                        <button
                            key={i}
                            type="button"
                            role="tab"
                            aria-selected={industry === i}
                            className={industry === i ? 'on' : undefined}
                            onClick={() => setIndustry(i)}
                        >
                            {i}
                        </button>
                    ))}
                </div>
            </div>
            {templates.isLoading ? (
                <Skeleton className="h-96 w-full" />
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="templates">
                    {shown.map((t) => (
                        <div key={t.key} className="cb-card cb-col" style={{ padding: 16, gap: 10 }}>
                            <div className="cb-row">
                                <span className="cb-chip">{t.industry}</span>
                                {t.recommended && <span className="cb-chip ok">Start here</span>}
                                <span className="cb-spacer cb-small cb-muted">{t.steps.length} steps</span>
                            </div>
                            <h3>{t.name}</h3>
                            <p className="cb-small" style={{ color: 'var(--cb-ink-2)' }}>
                                {t.description}
                            </p>
                            <dl className="cb-small" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', margin: 0 }}>
                                <dt className="cb-muted">Starts with</dt>
                                <dd style={{ margin: 0 }}>{t.steps[0] ?? '—'}</dd>
                                <dt className="cb-muted">Ends with</dt>
                                <dd style={{ margin: 0 }}>{t.steps[t.steps.length - 1] ?? '—'}</dd>
                                {t.fields.length > 0 && (
                                    <>
                                        <dt className="cb-muted">You set</dt>
                                        <dd style={{ margin: 0 }}>{youSet(t)}</dd>
                                    </>
                                )}
                            </dl>
                            <div className="cb-row" style={{ marginTop: 'auto' }}>
                                <button type="button" className="cb-btn sm" onClick={() => setPreview(t)}>
                                    Preview the journey
                                </button>
                                {canManage && (
                                    <button type="button" className="cb-btn sm pri" onClick={() => setUsing(t.key)} aria-label={`Use ${t.name}`}>
                                        Use this
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {shown.length === 0 && <p className="cb-muted">No template matches. Try another word, or start from scratch on My Flows.</p>}
                </div>
            )}

            <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
                <DialogContent className="cbx sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{preview?.name}</DialogTitle>
                        <DialogDescription>{preview?.description}</DialogDescription>
                    </DialogHeader>
                    <ol className="cb-col" style={{ gap: 6, margin: 0, paddingLeft: 0, listStyle: 'none', maxHeight: '55vh', overflow: 'auto' }}>
                        {preview?.steps.map((s, i) => (
                            <li key={i} className="cb-row cb-small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                                <span className="cb-chip start" style={{ flex: 'none' }}>
                                    {i + 1}
                                </span>
                                {s}
                            </li>
                        ))}
                    </ol>
                    {canManage && preview && (
                        <button
                            type="button"
                            className="cb-btn pri"
                            onClick={() => {
                                setUsing(preview.key);
                                setPreview(null);
                            }}
                        >
                            Use this
                        </button>
                    )}
                </DialogContent>
            </Dialog>
            <TemplateGallery open={using !== null} onOpenChange={(o) => !o && setUsing(null)} initial={using} />
        </>
    );
}
