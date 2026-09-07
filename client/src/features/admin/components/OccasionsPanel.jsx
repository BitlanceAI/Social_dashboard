import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchOccasions, saveOccasionDate, deleteOccasionDate } from '../lib/adminApi';
import StatusChip from './StatusChip';

const inputClass =
    'w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors';

const KIND_LABEL = {
    fixed: 'fixed',
    'nth-weekday': 'weekday rule',
    movable: 'movable',
    undated: 'undated',
    custom: 'custom',
};

const fmtDate = (iso) =>
    iso
        ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
        : '—';

/**
 * Admin Occasions tab — the editable half of the occasion calendar.
 *
 * Fixed and weekday-rule dates resolve on their own; MOVABLE occasions
 * (lunar/Islamic festivals) have no date until an admin enters a verified one
 * here, per year. Admins can also override any rule for a single year, or add
 * an occasion the dataset doesn't know at all.
 */
const OccasionsPanel = () => {
    const [year, setYear] = useState(new Date().getFullYear());
    const [occasions, setOccasions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingSlug, setSavingSlug] = useState(null);
    const [edits, setEdits] = useState({});       // slug -> { date?, notes? }
    const [filter, setFilter] = useState('all');  // all | unresolved | admin
    const [search, setSearch] = useState('');
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState({ name: '', date: '', notes: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchOccasions(year);
            setOccasions(data.occasions);
            setEdits({});
        } catch (err) {
            toast.error(err.message || 'Could not load occasions');
        } finally {
            setLoading(false);
        }
    }, [year]);

    useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

    const unresolvedCount = useMemo(() => occasions.filter((o) => !o.date).length, [occasions]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return occasions.filter((o) => {
            if (filter === 'unresolved' && o.date) return false;
            if (filter === 'admin' && o.source !== 'admin') return false;
            if (q && !o.name.toLowerCase().includes(q) && !o.slug.includes(q)) return false;
            return true;
        });
    }, [occasions, filter, search]);

    const setField = (slug, field, value) =>
        setEdits((e) => ({ ...e, [slug]: { ...e[slug], [field]: value } }));

    const save = async (o) => {
        const patch = edits[o.slug];
        const date = patch?.date ?? o.date;
        if (!date) { toast.error('Pick a date first'); return; }
        setSavingSlug(o.slug);
        try {
            await saveOccasionDate(o.slug, year, {
                date,
                name: o.source === 'admin' || o.kind === 'custom' ? o.name : undefined,
                notes: patch?.notes ?? o.notes ?? undefined,
            });
            toast.success(`${o.name} saved for ${year}`);
            load();
        } catch (err) {
            toast.error(err.message || 'Could not save');
        } finally {
            setSavingSlug(null);
        }
    };

    const remove = async (o) => {
        setSavingSlug(o.slug);
        try {
            await deleteOccasionDate(o.slug, year);
            toast.success(`Entry removed — ${o.name} falls back to its rule`);
            load();
        } catch (err) {
            toast.error(err.message || 'Could not remove');
        } finally {
            setSavingSlug(null);
        }
    };

    const addOccasion = async () => {
        const name = draft.name.trim();
        if (!name || !draft.date) { toast.error('A name and a date are required'); return; }
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!slug) { toast.error('The name must contain letters or digits'); return; }
        setSavingSlug('__new__');
        try {
            await saveOccasionDate(slug, year, { date: draft.date, name, notes: draft.notes.trim() || undefined });
            toast.success(`${name} added for ${year}`);
            setDraft({ name: '', date: '', notes: '' });
            setAdding(false);
            load();
        } catch (err) {
            toast.error(err.message || 'Could not add the occasion');
        } finally {
            setSavingSlug(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-xl border border-[var(--border)] overflow-hidden">
                    <button onClick={() => setYear((y) => y - 1)} className="p-2 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors" title="Previous year">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-3 text-sm font-mono">{year}</span>
                    <button onClick={() => setYear((y) => y + 1)} className="p-2 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors" title="Next year">
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex items-center gap-1">
                    {[['all', 'All'], ['unresolved', `Needs a date (${unresolvedCount})`], ['admin', 'Admin-set']].map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setFilter(id)}
                            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                filter === id
                                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                    : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <input
                    className={`${inputClass} max-w-[200px]`}
                    placeholder="Search occasions…"
                    value={search}
                    onChange={(ev) => setSearch(ev.target.value)}
                />

                <div className="flex-1" />
                <button onClick={() => setAdding((a) => !a)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors">
                    <Plus className="h-4 w-4" /> Add occasion
                </button>
                <button onClick={load} className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {unresolvedCount > 0 && (
                <div className="flex items-start gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[13px] text-[var(--muted)]">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                    <span>
                        {unresolvedCount} movable occasion{unresolvedCount === 1 ? '' : 's'} (lunar / Islamic calendars) have no
                        verified date for {year}. Until a date is entered here, the planner treats them as unknown rather than
                        guessing. Enter dates from a panchang or an official holiday list only.
                    </span>
                </div>
            )}

            {/* Add form */}
            {adding && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 grid sm:grid-cols-[2fr_1fr_2fr_auto] gap-3 items-end">
                    <label className="block">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">Name</span>
                        <input className={inputClass} placeholder="e.g. Founder's Day" value={draft.name}
                            onChange={(ev) => setDraft((d) => ({ ...d, name: ev.target.value }))} />
                    </label>
                    <label className="block">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">Date ({year})</span>
                        <input type="date" className={inputClass} min={`${year}-01-01`} max={`${year}-12-31`} value={draft.date}
                            onChange={(ev) => setDraft((d) => ({ ...d, date: ev.target.value }))} />
                    </label>
                    <label className="block">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">Notes / source</span>
                        <input className={inputClass} placeholder="Where the date was verified" value={draft.notes}
                            onChange={(ev) => setDraft((d) => ({ ...d, notes: ev.target.value }))} />
                    </label>
                    <button onClick={addOccasion} disabled={savingSlug === '__new__'} className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50">
                        {savingSlug === '__new__' ? 'Adding…' : 'Add'}
                    </button>
                </div>
            )}

            {/* Calendar table */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[var(--surface-2)]">
                                {['Occasion', 'Kind', 'Resolved date', 'Set / override date', 'Notes', ''].map((h, i) => (
                                    <th key={i} className="px-5 py-2.5 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((o) => {
                                const patch = edits[o.slug] || {};
                                const dirty = patch.date !== undefined || patch.notes !== undefined;
                                return (
                                    <tr key={o.slug} className="border-t border-[var(--border)]">
                                        <td className="px-5 py-3">
                                            <span className="block text-sm font-medium">{o.name}</span>
                                            <span className="block text-[11px] font-mono text-[var(--muted)]">{o.slug}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <StatusChip
                                                status={o.date ? (o.source === 'admin' ? 'active' : 'no-connection') : 'token-expired'}
                                                label={o.source === 'admin' ? 'admin-set' : KIND_LABEL[o.kind]}
                                            />
                                        </td>
                                        <td className="px-5 py-3 text-xs font-mono whitespace-nowrap text-[var(--muted)]">
                                            {o.date ? fmtDate(o.date) : <span className="text-amber-500">needs a date</span>}
                                        </td>
                                        <td className="px-5 py-3">
                                            <input
                                                type="date"
                                                className={`${inputClass} min-w-[150px]`}
                                                min={`${year}-01-01`}
                                                max={`${year}-12-31`}
                                                value={patch.date ?? (o.source === 'admin' ? o.date : '')}
                                                onChange={(ev) => setField(o.slug, 'date', ev.target.value)}
                                            />
                                        </td>
                                        <td className="px-5 py-3">
                                            <input
                                                className={`${inputClass} min-w-[160px]`}
                                                placeholder="Source of the date"
                                                value={patch.notes ?? o.notes ?? ''}
                                                onChange={(ev) => setField(o.slug, 'notes', ev.target.value)}
                                            />
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-2 justify-end">
                                                <button
                                                    onClick={() => save(o)}
                                                    disabled={savingSlug === o.slug || !dirty || !(patch.date ?? o.date)}
                                                    className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                                                >
                                                    {savingSlug === o.slug ? 'Saving…' : 'Save'}
                                                </button>
                                                {o.source === 'admin' && (
                                                    <button
                                                        onClick={() => remove(o)}
                                                        disabled={savingSlug === o.slug}
                                                        className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-red-500 hover:border-red-500/40 transition-colors disabled:opacity-40"
                                                        title="Remove the admin entry (falls back to the rule, or to unresolved)"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && visible.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                                        No occasions match.
                                    </td>
                                </tr>
                            )}
                            {loading && occasions.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                                        Loading the {year} calendar…
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default OccasionsPanel;
