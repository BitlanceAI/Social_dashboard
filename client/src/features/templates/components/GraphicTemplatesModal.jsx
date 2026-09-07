import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, ArrowLeft, Sparkles, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchTemplates, fetchNiches, generateFromTemplate } from '../lib/templatesApi';

/**
 * Graphic-template picker for the composer: gallery → form → generate.
 * On success the generated image URL is handed back via onUseImage so the
 * post composer can use it as media.
 */
const GraphicTemplatesModal = ({
    isOpen, onClose, onUseImage, workspaceId = null,
    initialNiche = 'all', initialSearch = '', scheduledDate = null,
}) => {
    const [step, setStep] = useState('gallery'); // gallery | form
    const [niches, setNiches] = useState([]);
    const [niche, setNiche] = useState('all');
    const [search, setSearch] = useState('');
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);

    const [active, setActive] = useState(null);       // chosen template
    const [values, setValues] = useState({});
    const [includeContact, setIncludeContact] = useState(true);
    const [language, setLanguage] = useState('en');
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState(null);       // { flyerUrl?, prompt, generationConfigured }

    // Reset on open. When opened for an occasion, deep-link into the matching
    // niche + name search instead of the default "all".
    useEffect(() => {
        if (!isOpen) return undefined;
        const t = setTimeout(() => {
            setStep('gallery'); setActive(null); setResult(null);
            setNiche(initialNiche || 'all'); setSearch(initialSearch || '');
            fetchNiches().then(setNiches).catch(() => {});
        }, 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        try {
            setTemplates(await fetchTemplates({ niche, search }));
        } catch (err) {
            toast.error(err.message || 'Could not load templates');
        } finally {
            setLoading(false);
        }
    }, [niche, search]);

    useEffect(() => {
        if (!isOpen || step !== 'gallery') return undefined;
        const t = setTimeout(loadTemplates, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [isOpen, step, loadTemplates, search]);

    if (!isOpen) return null;

    const openForm = (template) => {
        setActive(template);
        // Prefill each dynamic field with its default.
        const seed = {};
        for (const f of template.dynamicFields || []) seed[f.key] = f.default ?? '';
        setValues(seed);
        setResult(null);
        setStep('form');
    };

    const handleGenerate = async () => {
        if (generating) return;
        setGenerating(true);
        try {
            const res = await generateFromTemplate({
                templateKey: active.key,
                values,
                imageSize: active.canvasSize,
                language,
                includeContact,
            }, workspaceId);
            setResult(res);
            if (res.flyerUrl) {
                toast.success('Image generated');
            } else if (res.generationConfigured === false) {
                toast('Prompt built — image generation service is not configured on the server.');
            }
        } catch (err) {
            toast.error(err.message || 'Generation failed');
        } finally {
            setGenerating(false);
        }
    };

    const useThisImage = () => {
        if (result?.flyerUrl && onUseImage) {
            onUseImage(result.flyerUrl, { scheduledDate });
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
                className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-3">
                    {step === 'form' && (
                        <button onClick={() => setStep('gallery')} className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    )}
                    <div className="flex-1">
                        <h3 className="font-['Space_Grotesk'] text-lg font-extrabold tracking-tight text-[var(--text)]">
                            {step === 'gallery' ? 'Create from a template' : active?.title}
                        </h3>
                        <p className="text-xs text-[var(--muted)]">
                            {step === 'gallery' ? 'Pick a design, fill the details, generate an image.' : 'Fill the fields — everything else in the design is fixed.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {step === 'gallery' ? (
                    <>
                        {/* Filters */}
                        <div className="px-5 py-3 border-b border-[var(--border)] flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] w-56">
                                <Search className="h-4 w-4 text-[var(--muted)]" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]" />
                            </div>
                            <button onClick={() => setNiche('all')} className={`text-[11px] font-mono px-3 py-1.5 rounded-full ${niche === 'all' ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'border border-[var(--border)] text-[var(--muted)]'}`}>All</button>
                            {niches.map((n) => (
                                <button key={n.value} onClick={() => setNiche(n.value)} className={`text-[11px] font-mono px-3 py-1.5 rounded-full ${niche === n.value ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'border border-[var(--border)] text-[var(--muted)]'}`}>
                                    {n.label} · {n.count}
                                </button>
                            ))}
                        </div>

                        {/* Grid */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {loading ? (
                                <p className="text-sm text-[var(--muted)] text-center py-12">Loading…</p>
                            ) : templates.length === 0 ? (
                                <p className="text-sm text-[var(--muted)] text-center py-12">No templates match.</p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {templates.map((t) => (
                                        <button key={t.key} onClick={() => openForm(t)} className="text-left rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden hover:border-[var(--accent)] transition-colors">
                                            <div className="aspect-[4/5] bg-[var(--surface-2)] flex items-center justify-center overflow-hidden">
                                                {t.thumbnailUrl ? (
                                                    <img src={t.thumbnailUrl} alt={t.title} loading="lazy" className="w-full h-full object-cover" />
                                                ) : (
                                                    <ImageIcon className="h-8 w-8 text-[var(--muted-2)]" />
                                                )}
                                            </div>
                                            <div className="px-3 py-2">
                                                <p className="text-[13px] font-medium truncate">{t.title}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 overflow-y-auto p-5 grid md:grid-cols-2 gap-6">
                        {/* Form */}
                        <div className="space-y-4">
                            {(active?.dynamicFields || []).map((f) => (
                                <label key={f.key} className="block">
                                    <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">{f.label}</span>
                                    {f.type === 'textarea' ? (
                                        <textarea rows={3} value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none" />
                                    ) : (
                                        <input value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                                    )}
                                </label>
                            ))}

                            <div className="flex items-center gap-4 pt-1">
                                <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                                    <input type="checkbox" checked={includeContact} onChange={(e) => setIncludeContact(e.target.checked)} />
                                    Show contact details
                                </label>
                                <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                                    Language
                                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm">
                                        <option value="en">English</option>
                                        <option value="hi">Hindi</option>
                                        <option value="mr">Marathi</option>
                                    </select>
                                </label>
                            </div>

                            <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full rounded-xl py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                                <Sparkles className="h-4 w-4" />
                                {generating ? 'Generating…' : 'Generate image'}
                            </button>
                        </div>

                        {/* Preview / result */}
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-3">Result</span>
                            {result?.flyerUrl ? (
                                <>
                                    <img src={result.flyerUrl} alt="Generated" className="w-full rounded-xl border border-[var(--border)] mb-3" />
                                    <button onClick={useThisImage} className="btn-primary rounded-xl py-2 text-sm">Use in post</button>
                                </>
                            ) : result?.generationConfigured === false ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-[var(--muted)] gap-2">
                                    <p>Prompt built successfully.</p>
                                    <p className="text-xs text-[var(--muted-2)]">Image generation service isn't configured on the server yet (DESIGN_GENERATE_URL).</p>
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-sm text-[var(--muted)]">
                                    {generating ? 'Rendering…' : 'Fill the fields and generate.'}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GraphicTemplatesModal;
