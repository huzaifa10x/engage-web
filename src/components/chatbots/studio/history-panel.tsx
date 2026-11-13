'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { blockOf, type ChatbotFlowDetail, type FlowGraph, useChatbotHistory, useChatbotRevisions, useChatbotVersion } from '@/lib/chatbots';

const ACTIONS: Record<string, string> = {
    'chatbot.created': 'Created',
    'chatbot.published': 'Published',
    'chatbot.activated': 'Switched on',
    'chatbot.deactivated': 'Switched off',
    'chatbot.version_restored': 'Rolled back',
    'chatbot.archived': 'Archived',
    'chatbot.unarchived': 'Restored from the archive',
    'chatbot.scheduled': 'Scheduled',
    'chatbot.exported': 'Exported',
    'chatbot.imported': 'Imported',
    'chatbot.review_request': 'Asked for a review',
    'chatbot.review_approve': 'Approved',
    'chatbot.review_changes': 'Asked for changes',
    'chatbot.review_cancel': 'Cancelled the review',
    'chatbot.webhook_created': 'Created the webhook URL',
    'chatbot.webhook_removed': 'Removed the webhook URL',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Builder › History (approved design): the draft and its revision, published versions, saved drafts and the activity log. */
export function HistoryPanel({
    detail,
    canRestore,
    onRestore,
    canEdit,
    onLoadDraft,
    draft,
    onRestoreDraft,
}: {
    detail: ChatbotFlowDetail;
    canRestore: boolean;
    onRestore: (v: number) => void;
    canEdit: boolean;
    onLoadDraft: (revision: number) => void;
    /** The draft as it is in the editor now. */
    draft: FlowGraph;
    /** A published version becomes the draft again (nothing is published). */
    onRestoreDraft: (version: number) => void;
}) {
    const published = useChatbotVersion(detail.id, detail.published_version);
    const changes = published.data ? diff(published.data.graph, draft) : null;
    const history = useChatbotHistory(detail.id, true);
    const drafts = useChatbotRevisions(detail.id, true);
    const versions = [...detail.versions].sort((a, b) => b.version - a.version);

    return (
        <div className="cb-col" style={{ gap: 14 }} data-testid="history-panel">
            <div className="cb-card cb-col" style={{ padding: 14, gap: 6 }}>
                <b>Draft · revision {detail.draft_revision}</b>
                <p className="cb-small cb-muted">
                    Last saved{detail.draft_updated_by ? ` by ${detail.draft_updated_by}` : ''} {when(detail.draft_updated_at)}. Every save carries the
                    revision; a save made on an older revision is refused instead of overwriting someone, and you can merge the two.
                </p>
                {detail.published_version !== null && (
                    <p className="cb-small">
                        {detail.has_unpublished_changes ? (
                            <span className="cb-chip warn">Changed since version {detail.published_version}</span>
                        ) : (
                            <span className="cb-chip ok">Same as version {detail.published_version}</span>
                        )}
                    </p>
                )}
            </div>

            {detail.published_version !== null && (
                <>
                    <h3>Changes since version {detail.published_version}</h3>
                    {!changes ? (
                        <Skeleton className="h-12 w-full" />
                    ) : changes.length === 0 ? (
                        <p className="cb-small cb-muted">None: the draft is the same as the published version.</p>
                    ) : (
                        <ul className="cb-col" style={{ gap: 6, listStyle: 'none', margin: 0, padding: 0 }} data-testid="changes">
                            {changes.map((c) => (
                                <li key={c.id} className="cb-row cb-small" style={{ flexWrap: 'nowrap', alignItems: 'stretch' }}>
                                    <span
                                        style={{
                                            width: 4,
                                            flex: 'none',
                                            borderRadius: 2,
                                            background: c.kind === 'added' ? 'var(--cb-brand-deep)' : c.kind === 'removed' ? 'var(--cb-bad-i)' : '#8a4b05',
                                        }}
                                    />
                                    <span>
                                        {c.kind === 'added' ? 'Added' : c.kind === 'removed' ? 'Removed' : 'Changed'} “{c.title}” ({c.type})
                                        {c.what ? `: ${c.what}` : ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {canEdit && changes && changes.length > 0 && (
                        <button
                            type="button"
                            className="cb-btn sm danger"
                            style={{ alignSelf: 'flex-start' }}
                            onClick={() => detail.published_version !== null && onRestoreDraft(detail.published_version)}
                        >
                            Discard my edits since version {detail.published_version}
                        </button>
                    )}
                </>
            )}

            <h3>Published versions</h3>
            {versions.length === 0 ? (
                <p className="cb-small cb-muted">Not published yet.</p>
            ) : (
                versions.map((v) => (
                    <div key={v.version} className="cb-card cb-col" style={{ padding: 14, gap: 4 }}>
                        <div className="cb-row">
                            <b>Version {v.version}</b>
                            {v.version === detail.published_version && <span className="cb-chip live">{detail.is_active ? 'Live' : 'Published'}</span>}
                            <span className="cb-spacer cb-small cb-muted">{when(v.created_at)}</span>
                        </div>
                        <p className="cb-small cb-muted">Each chat finishes on the version it started on.</p>
                        <div className="cb-row">
                            {canEdit && v.version !== detail.published_version && (
                                <button type="button" className="cb-link cb-small" onClick={() => onRestoreDraft(v.version)}>
                                    Restore as the draft
                                </button>
                            )}
                            {canRestore && v.version !== detail.published_version && (
                                <button type="button" className="cb-link cb-small" onClick={() => onRestore(v.version)}>
                                    Roll back live to this version
                                </button>
                            )}
                        </div>
                    </div>
                ))
            )}

            <h3>Saved drafts</h3>
            <ul className="cb-card" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 260, overflow: 'auto' }} data-testid="saved-drafts">
                {(drafts.data ?? []).map((d) => (
                    <li key={d.revision} className="cb-row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--cb-line-2)', flexWrap: 'nowrap' }}>
                        <span className="cb-grow cb-small">
                            <b>Draft {d.revision}</b> {d.revision === detail.draft_revision && <span className="cb-chip start">current</span>}
                            <span className="cb-muted" style={{ display: 'block' }}>
                                {d.by ?? 'Someone'} · {d.steps} steps · {when(d.created_at)}
                            </span>
                        </span>
                        {canEdit && d.revision !== detail.draft_revision && (
                            <button type="button" className="cb-btn xs" onClick={() => onLoadDraft(d.revision)}>
                                Load
                            </button>
                        )}
                    </li>
                ))}
                {drafts.data?.length === 0 && (
                    <li className="cb-small cb-muted" style={{ padding: '8px 12px' }}>
                        No saved drafts yet.
                    </li>
                )}
            </ul>

            <h3>Activity</h3>
            <ul className="cb-col" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }}>
                {(history.data ?? []).map((h, i) => (
                    <li key={i} className="cb-small">
                        <b>{ACTIONS[h.action] ?? h.action.replace(/^chatbot\./, '').replace(/_/g, ' ')}</b>
                        {typeof h.meta?.version === 'number' && ` v${h.meta.version}`} <span className="cb-muted">· {h.actor}</span>
                        <span className="cb-tiny cb-muted" style={{ display: 'block' }}>
                            {when(h.created_at)}
                        </span>
                    </li>
                ))}
                {history.isLoading && <Skeleton className="h-20 w-full" />}
            </ul>
        </div>
    );
}

type Change = { id: string; kind: 'added' | 'removed' | 'changed'; title: string; type: string; what: string | null };

/** What the draft changed compared with a published version, step by step. */
function diff(before: FlowGraph, after: FlowGraph): Change[] {
    const old = new Map(before.nodes.map((n) => [n.id, n]));
    const now = new Map(after.nodes.map((n) => [n.id, n]));
    const out: Change[] = [];
    for (const n of after.nodes) {
        const o = old.get(n.id);
        if (!o) {
            out.push({ id: n.id, kind: 'added', title: n.title, type: blockOf(n.type).label, what: null });
            continue;
        }
        const what = [
            JSON.stringify(o.config) !== JSON.stringify(n.config) ? 'settings or wording' : null,
            JSON.stringify(o.outputs.map((x) => [x.id, x.to])) !== JSON.stringify(n.outputs.map((x) => [x.id, x.to])) ? 'paths' : null,
            o.title !== n.title ? 'name' : null,
        ].filter(Boolean);
        if (what.length) out.push({ id: n.id, kind: 'changed', title: n.title, type: blockOf(n.type).label, what: `${what.join(', ')} changed` });
    }
    for (const n of before.nodes) if (!now.has(n.id)) out.push({ id: n.id, kind: 'removed', title: n.title, type: blockOf(n.type).label, what: null });

    return out;
}
