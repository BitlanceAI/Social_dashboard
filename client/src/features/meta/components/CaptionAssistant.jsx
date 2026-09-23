import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, X, Image as ImageIcon, Type } from 'lucide-react';

import toast from 'react-hot-toast';
import { fetchAiStatus, generateCaption } from '@/features/meta/lib/captionApi';

const TONES = ['friendly', 'professional', 'playful', 'inspirational', 'bold', 'informative'];

/**
 * AI caption writer for the composer.
 *
 * Supports two modes:
 *   • Text prompt  — user types what the post is about (Perplexity)
 *   • Image        — AI analyses the attached image (OpenAI Vision)
 *
 * Props:
 *   platforms  – ['facebook','instagram',…]
 *   hasContent – whether the composer already has a caption
 *   onCaption  – (string) => void
 *   imageUrl   – URL of an already-selected image for vision mode
 */
const CaptionAssistant = ({ platforms = [], hasContent = false, onCaption, imageUrl }) => {
    const [aiStatus, setAiStatus] = useState({ textAi: false, imageAi: false });
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState('text'); // 'image' | 'text'
    const [topic, setTopic] = useState('');
    const [tone, setTone] = useState('friendly');
    const [language, setLanguage] = useState('en');
    const [includeHashtags, setIncludeHashtags] = useState(true);
    const [includeEmojis, setIncludeEmojis] = useState(true);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchAiStatus().then((status) => {
            if (!cancelled) {
                setAiStatus(status);
                if (imageUrl && status.imageAi) setMode('image');
            }
        });
        return () => { cancelled = true; };
    }, [imageUrl]);

    useEffect(() => {
        if (imageUrl && aiStatus.imageAi) setMode('image');
    }, [imageUrl, aiStatus.imageAi]);

    const anyAvailable = aiStatus.textAi || aiStatus.imageAi;
    if (!anyAvailable) return null;

    const write = async () => {
        if (loading) return;
        const useImage = mode === 'image' && imageUrl && aiStatus.imageAi;
        if (!useImage && !topic.trim()) { toast.error('Tell the AI what the post is about'); return; }
        setLoading(true);
        try {
            const caption = await generateCaption({
                platforms, tone, language, includeHashtags, includeEmojis,
                ...(useImage ? { imageUrl, topic: topic.trim() || undefined } : { topic }),
            });
            onCaption(caption);
            toast.success('Caption written');
            setOpen(false);
        } catch (err) {
            toast.error(err.message || 'Could not write the caption');
        } finally {
            setLoading(false);
        }
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:opacity-80 transition-opacity"
            >
                <Sparkles className="h-3.5 w-3.5" />
                {hasContent ? 'Rewrite with AI' : 'Write with AI'}
            </button>
        );
    }

    const canUseImage = aiStatus.imageAi && Boolean(imageUrl);
    const canUseText = aiStatus.textAi;

    return (
        <div className="rounded-xl border border-[var(--accent)] bg-[var(--accent-muted)] p-3 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> AI caption writer
                </span>
                <button type="button" onClick={() => setOpen(false)} className="text-[var(--muted)] hover:text-[var(--text)]">
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Mode tabs — only when both modes are available */}
            {canUseImage && canUseText && (
                <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                    <button type="button" onClick={() => setMode('image')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            mode === 'image' ? 'bg-[var(--accent)] text-[var(--bg)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}>
                        <ImageIcon className="h-3.5 w-3.5" /> From Image
                    </button>
                    <button type="button" onClick={() => setMode('text')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            mode === 'text' ? 'bg-[var(--accent)] text-[var(--bg)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}>
                        <Type className="h-3.5 w-3.5" /> From Prompt
                    </button>
                </div>
            )}

            {/* Image mode */}
            {mode === 'image' && canUseImage && (
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <img src={imageUrl} alt="Selected" className="h-14 w-14 rounded-lg object-cover border border-[var(--border)] shrink-0" />
                        <p className="text-xs text-[var(--muted)] leading-relaxed">
                            AI will analyse this image. Optionally add extra context below.
                        </p>
                    </div>
                    <input value={topic} onChange={(e) => setTopic(e.target.value)}
                        placeholder="Extra context (optional) — e.g. Diwali sale, 30% off"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                </div>
            )}

            {/* Text mode */}
            {mode === 'text' && (
                <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); write(); } }}
                    placeholder="What is this post about? e.g. Diwali sale — 30% off all sofas"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                />
            )}


            <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--muted)]">
                <label className="flex items-center gap-1.5">
                    Tone
                    <select value={tone} onChange={(e) => setTone(e.target.value)} className="px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm capitalize">
                        {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <label className="flex items-center gap-1.5">
                    Language
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm">
                        <option value="en">English</option>
                        <option value="hi">Hindi</option>
                        <option value="mr">Marathi</option>
                    </select>
                </label>
                <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={includeHashtags} onChange={(e) => setIncludeHashtags(e.target.checked)} />
                    Hashtags
                </label>
                <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={includeEmojis} onChange={(e) => setIncludeEmojis(e.target.checked)} />
                    Emojis
                </label>
            </div>

            <button
                type="button"
                onClick={write}
                disabled={loading}
                className="btn-primary w-full rounded-lg py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? 'Writing…' : hasContent ? 'Rewrite caption' : 'Write caption'}
            </button>
        </div>
    );
};

export default CaptionAssistant;
