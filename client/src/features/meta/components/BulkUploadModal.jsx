import React, { useState, useMemo, useEffect } from 'react';
import { X, Upload, Download, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, ImagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { platformMeta, providerOf, prefixFor } from '@/features/meta/lib/providers';
import API_BASE_URL from '@/shared/config';

/**
 * Bulk CSV scheduling. Each row becomes a scheduled post on ONE chosen target,
 * reusing the same /posts/schedule endpoint (and its validation) as the single
 * composer — so caps, billing and native FB scheduling all apply per row.
 *
 * Media is referenced by NAME, not URL: the `media` column takes a Media Library
 * filename (or a file attached here in the modal), which is resolved to its URL.
 * A full http(s) URL is still accepted for anyone who prefers it.
 *
 * CSV columns (header row required, order-independent, case-insensitive):
 *   content   — the caption/text                (required unless media given)
 *   datetime  — when to publish, e.g. 2026-09-08 09:00 or ISO   (required)
 *   media     — Library filename(s) or URL(s), ; or | separated (optional)
 *   link      — a link URL                                       (optional)
 *   platforms — facebook / instagram / linkedin, comma-sep       (optional)
 */

const HEADER_ALIASES = {
    content: 'content', caption: 'content', text: 'content', message: 'content',
    datetime: 'datetime', date: 'datetime', time: 'datetime', when: 'datetime', scheduled_time: 'datetime', 'scheduled time': 'datetime',
    media: 'media', media_url: 'media', media_urls: 'media', 'media urls': 'media', image: 'media', images: 'media', file: 'media', url: 'media',
    link: 'link', link_url: 'link', 'link url': 'link',
    platforms: 'platforms', platform: 'platforms', networks: 'platforms', network: 'platforms',
};

/** Minimal RFC-4180 CSV parser: handles quotes, escaped "", commas and newlines in quoted fields. */
const parseCSV = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const s = text.replace(/\r\n?/g, '\n');
    for (let i = 0; i < s.length; i += 1) {
        const c = s[i];
        if (inQuotes) {
            if (c === '"') {
                if (s[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
            } else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
};

const SAMPLE_CSV = `content,datetime,media,link,platforms
"Happy Monday! New week, new goals.",2026-09-08 09:00,,,facebook
"Check out our latest flyer 🎉",2026-09-09 18:30,flyer.jpg,,facebook;instagram
"Read our new blog post",2026-09-10 12:00,,https://example.com/blog,facebook`;

const parseWhen = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(t) ? t.replace(' ', 'T') : t;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
};

const splitList = (raw) => String(raw || '').split(/[;|\n]/).map((x) => x.trim()).filter(Boolean);
const isUrl = (s) => /^https?:\/\//i.test(s);
const nameKey = (s) => s.trim().toLowerCase();
const stripExt = (s) => s.replace(/\.[a-z0-9]+$/i, '');

const BulkUploadModal = ({ isOpen, onClose, targets = [], authHeaders, onDone }) => {
    const apiBase = API_BASE_URL;
    const [targetId, setTargetId] = useState(targets[0]?.id || '');
    const [rawRows, setRawRows] = useState([]);   // parsed CSV objects (strings)
    const [mediaMap, setMediaMap] = useState({}); // name → url (Library + attached)
    const [libraryLoaded, setLibraryLoaded] = useState(false);
    const [fileName, setFileName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [results, setResults] = useState(null);

    const target = useMemo(() => targets.find((t) => t.id === targetId) || null, [targets, targetId]);

    // Load the workspace's Media Library so a filename in the CSV resolves to a URL.
    useEffect(() => {
        if (!isOpen) return;
        setLibraryLoaded(false);
        (async () => {
            try {
                const res = await fetch(`${apiBase}/api/storage/media`, { headers: authHeaders() });
                const data = await res.json().catch(() => ({}));
                const map = {};
                for (const m of data.media || []) {
                    if (!m.file_name || !m.url) continue;
                    map[nameKey(m.file_name)] = m.url;
                    map[nameKey(stripExt(m.file_name))] = m.url; // allow name without extension
                }
                setMediaMap((prev) => ({ ...map, ...prev })); // keep attached uploads on top
            } catch { /* library optional; URLs still work */ }
            finally { setLibraryLoaded(true); }
        })();
    }, [isOpen, apiBase, authHeaders]);

    const resolveMedia = (token, map) => {
        if (isUrl(token)) return token;
        return map[nameKey(token)] || map[nameKey(stripExt(token))] || null;
    };

    // Rows are derived, so they re-validate whenever the CSV, target, or media map changes.
    const rows = useMemo(() => rawRows.map((r, idx) => {
        const platforms = r.platforms
            ? splitList(r.platforms).filter((p) => platformMeta(p))
            : (target?.platforms || ['facebook']);
        const rawMedia = splitList(r.media);
        const resolved = rawMedia.map((tok) => ({ tok, url: resolveMedia(tok, mediaMap) }));
        const missing = resolved.filter((m) => !m.url).map((m) => m.tok);
        const media = resolved.filter((m) => m.url).map((m) => m.url);
        const when = parseWhen(r.datetime);
        const errors = [];
        if (!target) errors.push('no target selected');
        if (!r.content?.trim() && rawMedia.length === 0) errors.push('needs content or media');
        if (!when) errors.push('bad date');
        else if (when.getTime() <= Date.now()) errors.push('date is in the past');
        if (missing.length) errors.push(`media not found: ${missing.join(', ')}`);
        const usable = platforms.filter((p) => target?.platforms.includes(p));
        if (target && usable.length === 0) errors.push(`target can't post to ${platforms.join('/')}`);
        if (usable.some((p) => platformMeta(p).requiresMedia) && media.length === 0 && !missing.length) errors.push('Instagram needs media');
        return { idx, content: r.content?.trim() || '', media, link: r.link?.trim() || '', platforms: usable, when, errors };
    }), [rawRows, target, mediaMap]);

    const valid = rows.filter((r) => r.errors.length === 0);

    const ingest = (text) => {
        const grid = parseCSV(text);
        if (grid.length < 2) { toast.error('CSV needs a header row and at least one row'); return; }
        const header = grid[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || h.trim().toLowerCase());
        const parsed = grid.slice(1).map((cells) => {
            const obj = {};
            header.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
            return obj;
        });
        setResults(null);
        setRawRows(parsed);
    };

    const onFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = () => ingest(String(reader.result || ''));
        reader.readAsText(file);
    };

    // Attach media files here → upload → reference them by filename in the CSV.
    const onAttach = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploading(true);
        try {
            const form = new FormData();
            files.forEach((f) => form.append('files', f));
            const headers = authHeaders();
            delete headers['Content-Type'];
            const res = await fetch(`${apiBase}/api/meta/posts/upload-media`, { method: 'POST', headers, body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
            // urls come back in the same order the files were appended.
            const add = {};
            (data.urls || []).forEach((url, i) => {
                const nm = files[i]?.name;
                if (nm && url) { add[nameKey(nm)] = url; add[nameKey(stripExt(nm))] = url; }
            });
            setMediaMap((prev) => ({ ...prev, ...add }));
            toast.success(`Attached ${files.length} file${files.length === 1 ? '' : 's'} — reference them by filename`);
        } catch (err) {
            toast.error(err.message || 'Could not upload the files');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const downloadSample = () => {
        const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'bulk-posts-sample.csv';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    };

    const submit = async () => {
        if (!target) { toast.error('Pick a profile to publish to'); return; }
        if (valid.length === 0) { toast.error('No valid rows to schedule'); return; }
        setSubmitting(true);
        setProgress({ done: 0, total: valid.length });
        const failed = [];
        let ok = 0;

        for (let n = 0; n < valid.length; n += 1) {
            const r = valid[n];
            const provider = providerOf(r.platforms);
            try {
                const res = await fetch(`${apiBase}${prefixFor(provider)}/posts/schedule`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        pageId: target.id,
                        platforms: r.platforms,
                        content: r.content,
                        mediaUrls: r.media,
                        linkUrl: r.link || null,
                        scheduledTime: r.when.toISOString(),
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) ok += 1;
                else failed.push({ row: r.idx + 2, error: data.error || `HTTP ${res.status}` });
            } catch (err) {
                failed.push({ row: r.idx + 2, error: err.message });
            }
            setProgress({ done: n + 1, total: valid.length });
        }

        setResults({ ok, failed });
        setSubmitting(false);
        if (ok) { toast.success(`Scheduled ${ok} post${ok === 1 ? '' : 's'}`); onDone?.(); }
        if (failed.length) toast.error(`${failed.length} row${failed.length === 1 ? '' : 's'} failed`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-3">
                    <div className="flex-1">
                        <h3 className="font-['Space_Grotesk'] text-lg font-extrabold tracking-tight text-[var(--text)]">Bulk schedule from CSV</h3>
                        <p className="text-xs text-[var(--muted)]">One row per post. They all publish to the profile you pick below.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Target + actions */}
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="block">
                            <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">Publish to</span>
                            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] min-w-[220px]">
                                <option value="">Select a profile…</option>
                                {targets.map((t) => (
                                    <option key={`${t.provider}-${t.id}`} value={t.id}>{t.name} — {t.subtitle}</option>
                                ))}
                            </select>
                        </label>
                        <div className="flex-1" />
                        <button onClick={downloadSample} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors">
                            <Download className="h-4 w-4" /> Sample CSV
                        </button>
                        <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-sm cursor-pointer transition-colors ${uploading ? 'opacity-60' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]'}`}>
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Attach images
                            <input type="file" accept="image/*,video/*" multiple onChange={onAttach} disabled={uploading} className="hidden" />
                        </label>
                        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm cursor-pointer hover:bg-[var(--accent-hover)] transition-colors">
                            <Upload className="h-4 w-4" /> {fileName || 'Choose CSV'}
                            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
                        </label>
                    </div>

                    <p className="text-[11px] text-[var(--muted)]">
                        In the <code className="font-mono">media</code> column just put the <b>filename</b> — e.g. <code className="font-mono">flyer.jpg</code> —
                        of a file in your Media Library or one you attached above. A full URL still works too.
                        {' '}{libraryLoaded ? `${Object.keys(mediaMap).length / 2 | 0} media available by name.` : 'Loading your library…'}
                        {' '}Times are local. Instagram rows need media.
                    </p>

                    {/* Preview */}
                    {rows.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface-2)] text-[11px] font-mono uppercase tracking-widest text-[var(--muted)]">
                                <span>{rows.length} rows · {valid.length} valid</span>
                                {rows.length - valid.length > 0 && <span className="text-red-500">{rows.length - valid.length} skipped</span>}
                            </div>
                            <div className="max-h-[260px] overflow-y-auto divide-y divide-[var(--border)]">
                                {rows.map((r) => {
                                    const bad = r.errors.length > 0;
                                    const sent = results && !r.errors.length;
                                    const failedRow = results?.failed.find((f) => f.row === r.idx + 2);
                                    return (
                                        <div key={r.idx} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                                            <div className="shrink-0 mt-0.5">
                                                {bad || failedRow ? <AlertCircle className="h-4 w-4 text-red-500" />
                                                    : sent ? <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
                                                    : <CheckCircle2 className="h-4 w-4 text-[var(--muted-2)]" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[var(--text)]">{r.content || <span className="text-[var(--muted-2)]">(media only)</span>}</p>
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)] mt-0.5">
                                                    <span>{r.when ? r.when.toLocaleString() : '—'}</span>
                                                    {r.platforms.length > 0 && <span>· {r.platforms.join(', ')}</span>}
                                                    {r.media.length > 0 && <span>· {r.media.length} media</span>}
                                                    {bad && <span className="text-red-500">· {r.errors.join('; ')}</span>}
                                                    {failedRow && <span className="text-red-500">· {failedRow.error}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-3">
                    <span className="text-xs text-[var(--muted)]">
                        {submitting ? `Scheduling ${progress.done}/${progress.total}…`
                            : results ? `Done — ${results.ok} scheduled, ${results.failed.length} failed`
                            : valid.length ? `${valid.length} post${valid.length === 1 ? '' : 's'} ready` : 'Upload a CSV to begin'}
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)]">Close</button>
                        <button onClick={submit} disabled={submitting || valid.length === 0 || !target}
                            className="btn-primary rounded-xl px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                            {submitting ? 'Scheduling…' : `Schedule ${valid.length || ''} posts`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkUploadModal;
