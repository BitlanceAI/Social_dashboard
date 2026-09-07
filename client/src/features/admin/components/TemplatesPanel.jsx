import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Pencil, X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    fetchAdminTemplates, createTemplate, updateTemplate, deleteTemplate,
} from '../lib/adminApi';

const inputClass =
    'w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors';
const labelClass =
    'block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1';

const FIELD_TYPES = ['text', 'textarea'];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const emptyDraft = () => ({
    key: '',
    number: '',
    title: '',
    niche: 'occasion',
    canvasSize: '1080x1350',
    thumbnailUrl: '',
    tags: '',
    promptTemplate: '',
    dynamicFields: [
        { key: 'brand', label: 'Brand / business name', type: 'text', default: 'Your Brand' },
        { key: 'greeting', label: 'Greeting / message', type: 'textarea', default: '' },
    ],
    isActive: true,
});

/**
 * Admin Templates tab — create and manage graphic templates (the designs the
 * composer's "Create from a template" flow generates from). A template is a
 * prompt with {{token}} placeholders plus the dynamic fields that fill them.
 *
 * To add e.g. a Teacher's Day design that doesn't exist yet: click "New
 * template", give it a key + prompt, list the fields users fill, save.
 */
const TemplatesPanel = () => {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [editingKey, setEditingKey] = useState(null); // null = closed, '__new__' = create
    const [draft, setDraft] = useState(emptyDraft());

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchAdminTemplates();
            setTemplates(data.templates || []);
        } catch (err) {
            toast.error(err.message || 'Could not load templates');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

    const openNew = () => {
        const nextNumber = templates.reduce((m, t) => Math.max(m, t.number || 0), 0) + 1;
        setDraft({ ...emptyDraft(), number: String(nextNumber) });
        setEditingKey('__new__');
    };

    const openEdit = (t) => {
        setDraft({
            key: t.key,
            number: String(t.number ?? ''),
            title: t.title || '',
            niche: t.niche || 'occasion',
            canvasSize: t.canvasSize || '1080x1350',
            thumbnailUrl: t.thumbnailUrl || '',
            tags: (t.tags || []).join(', '),
            promptTemplate: t.promptTemplate || '',
            dynamicFields: (t.dynamicFields || []).map((f) => ({
                key: f.key || '', label: f.label || '', type: f.type || 'text', default: f.default ?? '',
            })),
            isActive: t.isActive !== false,
        });
        setEditingKey(t.key);
    };

    const close = () => { setEditingKey(null); setDraft(emptyDraft()); };

    const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

    const setDynField = (i, k, v) =>
        setDraft((d) => ({ ...d, dynamicFields: d.dynamicFields.map((f, idx) => idx === i ? { ...f, [k]: v } : f) }));
    const addDynField = () =>
        setDraft((d) => ({ ...d, dynamicFields: [...d.dynamicFields, { key: '', label: '', type: 'text', default: '' }] }));
    const removeDynField = (i) =>
        setDraft((d) => ({ ...d, dynamicFields: d.dynamicFields.filter((_, idx) => idx !== i) }));

    const save = async () => {
        const key = editingKey === '__new__' ? slugify(draft.key || draft.title) : draft.key;
        if (!key) { toast.error('A key (or a title to derive it) is required'); return; }
        if (!draft.title.trim()) { toast.error('A title is required'); return; }
        if (!draft.promptTemplate.trim()) { toast.error('A prompt is required'); return; }
        if (draft.number === '' || Number.isNaN(parseInt(draft.number, 10))) { toast.error('A number is required'); return; }

        const body = {
            key,
            number: parseInt(draft.number, 10),
            title: draft.title.trim(),
            niche: slugify(draft.niche) || 'occasion',
            canvasSize: draft.canvasSize.trim() || '1080x1350',
            thumbnailUrl: draft.thumbnailUrl.trim() || null,
            tags: draft.tags.split(',').map((s) => s.trim()).filter(Boolean),
            promptTemplate: draft.promptTemplate,
            dynamicFields: draft.dynamicFields
                .filter((f) => f.key.trim())
                .map((f) => ({ key: slugify(f.key), label: f.label.trim() || f.key, type: f.type, default: f.default })),
            isActive: draft.isActive,
        };

        setSaving(true);
        try {
            if (editingKey === '__new__') {
                await createTemplate(body);
                toast.success('Template created');
            } else {
                await updateTemplate(key, body);
                toast.success('Template updated');
            }
            close();
            load();
        } catch (err) {
            toast.error(err.message || 'Could not save the template');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (t) => {
        if (!confirm(`Delete template "${t.title}"? This cannot be undone.`)) return;
        try {
            await deleteTemplate(t.key);
            toast.success('Template deleted');
            load();
        } catch (err) {
            toast.error(err.message || 'Could not delete');
        }
    };

    const toggleActive = async (t) => {
        try {
            await updateTemplate(t.key, { isActive: !t.isActive });
            load();
        } catch (err) {
            toast.error(err.message || 'Could not update');
        }
    };

    const q = search.trim().toLowerCase();
    const visible = templates.filter((t) =>
        !q || t.title.toLowerCase().includes(q) || t.key.includes(q) || (t.niche || '').includes(q));

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <input
                    className={`${inputClass} max-w-[220px]`}
                    placeholder="Search templates…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <div className="flex-1" />
                <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] transition-colors">
                    <Plus className="h-4 w-4" /> New template
                </button>
                <button onClick={load} className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Editor */}
            {editingKey && (
                <div className="rounded-2xl border border-[var(--accent)] bg-[var(--surface)] p-5 space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight text-[var(--text)] flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                            {editingKey === '__new__' ? 'New template' : `Editing “${draft.title || draft.key}”`}
                        </h3>
                        <button onClick={close} className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <label className="block">
                            <span className={labelClass}>Title</span>
                            <input className={inputClass} placeholder="Happy Teacher's Day" value={draft.title}
                                onChange={(e) => setField('title', e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={labelClass}>Key (slug)</span>
                            <input className={inputClass} placeholder="teachers-day" value={draft.key}
                                disabled={editingKey !== '__new__'}
                                onChange={(e) => setField('key', e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={labelClass}>Niche</span>
                            <input className={inputClass} placeholder="occasion" value={draft.niche}
                                onChange={(e) => setField('niche', e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={labelClass}>Order no.</span>
                            <input type="number" className={inputClass} value={draft.number}
                                onChange={(e) => setField('number', e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={labelClass}>Canvas size</span>
                            <input className={inputClass} placeholder="1080x1350" value={draft.canvasSize}
                                onChange={(e) => setField('canvasSize', e.target.value)} />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className={labelClass}>Thumbnail URL (optional)</span>
                            <input className={inputClass} placeholder="https://…" value={draft.thumbnailUrl}
                                onChange={(e) => setField('thumbnailUrl', e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={labelClass}>Tags (comma-sep)</span>
                            <input className={inputClass} placeholder="teacher, school" value={draft.tags}
                                onChange={(e) => setField('tags', e.target.value)} />
                        </label>
                    </div>

                    <label className="block">
                        <span className={labelClass}>Prompt</span>
                        <textarea rows={5} className={`${inputClass} resize-y font-mono text-[13px]`}
                            placeholder="Design a Teacher's Day greeting for {{brand}}. Message: {{greeting}}. Warm, respectful, classroom theme."
                            value={draft.promptTemplate}
                            onChange={(e) => setField('promptTemplate', e.target.value)} />
                        <span className="block text-[11px] text-[var(--muted)] mt-1">
                            Use <code className="font-mono">{'{{key}}'}</code> placeholders that match the field keys below — they get replaced with what the user types.
                        </span>
                    </label>

                    {/* Dynamic fields */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className={labelClass}>Fields the user fills</span>
                            <button onClick={addDynField} className="flex items-center gap-1 text-xs text-[var(--accent)] hover:opacity-80">
                                <Plus className="h-3.5 w-3.5" /> Add field
                            </button>
                        </div>
                        <div className="space-y-2">
                            {draft.dynamicFields.map((f, i) => (
                                <div key={i} className="grid grid-cols-[1fr_1fr_auto_1fr_auto] gap-2 items-center">
                                    <input className={inputClass} placeholder="key (e.g. brand)" value={f.key}
                                        onChange={(e) => setDynField(i, 'key', e.target.value)} />
                                    <input className={inputClass} placeholder="Label shown to user" value={f.label}
                                        onChange={(e) => setDynField(i, 'label', e.target.value)} />
                                    <select className={inputClass} value={f.type} onChange={(e) => setDynField(i, 'type', e.target.value)}>
                                        {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <input className={inputClass} placeholder="Default value" value={f.default}
                                        onChange={(e) => setDynField(i, 'default', e.target.value)} />
                                    <button onClick={() => removeDynField(i)} className="p-2 rounded-lg text-[var(--muted)] hover:text-red-500" title="Remove field">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                            {draft.dynamicFields.length === 0 && (
                                <p className="text-xs text-[var(--muted)]">No fields — the prompt will be used as-is.</p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                            <input type="checkbox" checked={draft.isActive} onChange={(e) => setField('isActive', e.target.checked)} />
                            Active (visible in the gallery)
                        </label>
                        <div className="flex items-center gap-2">
                            <button onClick={close} className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)]">Cancel</button>
                            <button onClick={save} disabled={saving} className="btn-primary rounded-xl px-5 py-2 text-sm disabled:opacity-50">
                                {saving ? 'Saving…' : editingKey === '__new__' ? 'Create template' : 'Save changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[var(--surface-2)]">
                                {['#', 'Template', 'Niche', 'Fields', 'Active', ''].map((h, i) => (
                                    <th key={i} className="px-5 py-2.5 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((t) => (
                                <tr key={t.key} className="border-t border-[var(--border)]">
                                    <td className="px-5 py-3 text-xs font-mono text-[var(--muted)]">{t.number}</td>
                                    <td className="px-5 py-3">
                                        <span className="block text-sm font-medium">{t.title}</span>
                                        <span className="block text-[11px] font-mono text-[var(--muted)]">{t.key}</span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-[var(--muted)]">{t.niche}</td>
                                    <td className="px-5 py-3 text-xs text-[var(--muted)]">{(t.dynamicFields || []).length}</td>
                                    <td className="px-5 py-3">
                                        <button
                                            onClick={() => toggleActive(t)}
                                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${t.isActive ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--muted)]'}`}
                                            title="Toggle visibility"
                                        >
                                            {t.isActive ? 'Active' : 'Hidden'}
                                        </button>
                                    </td>
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2 justify-end">
                                            <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors" title="Edit">
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={() => remove(t)} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-red-500 hover:border-red-500/40 transition-colors" title="Delete">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && visible.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">No templates yet — click “New template”.</td>
                                </tr>
                            )}
                            {loading && templates.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">Loading templates…</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TemplatesPanel;
