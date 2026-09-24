import React, { useState, useEffect, useCallback } from 'react';
import { X, CalendarClock, MessageCircle, Users, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWorkspace } from '@/features/workspace';
import { quickScheduleMedia } from '../lib/storageApi';
import { getSavedApprovers } from '@/features/meta/lib/approvalApi';
import CaptionAssistant from '@/features/meta/components/CaptionAssistant';
import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

/** Format a Date as `YYYY-MM-DDTHH:mm` in local time for datetime-local input */
const toLocalInputValue = (date) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
};

/** Digits only; 10-digit Indian numbers get 91 prefix */
const normalizePhone = (p) => {
    const d = String(p || '').replace(/\D/g, '');
    if (!d) return null;
    return d.length === 10 ? `91${d}` : d;
};
const parsePhones = (text) =>
    [...new Set(String(text || '').split(/[,;\s]+/).map(normalizePhone).filter(Boolean))];

/**
 * Quick-schedule modal — opened from the MediaLibrary.
 *
 * Props:
 *   item      – media row from the library (must have .url, .mime_type, .file_name)
 *   onClose   – () => void
 *   onSuccess – () => void — called after a successful schedule
 */
const QuickScheduleModal = ({ item, onClose, onSuccess }) => {
    const { activeWorkspaceId } = useWorkspace();

    // Connected accounts/targets fetched from the API
    const [targets, setTargets] = useState([]);
    const [loadingTargets, setLoadingTargets] = useState(true);

    // Form state
    const [selectedTargetId, setSelectedTargetId] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState([]);
    const [content, setContent] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');
    const [approverPhones, setApproverPhones] = useState('');
    const [savedApprovers, setSavedApprovers] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    // Minimum allowed schedule time (now + 2 min)
    const minTime = toLocalInputValue(new Date(Date.now() + 2 * 60 * 1000));

    // ── Load connected accounts ───────────────────────────────────────────────

    const loadTargets = useCallback(async () => {
        setLoadingTargets(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const headers = { Authorization: `Bearer ${session.access_token}`, 'x-workspace-id': activeWorkspaceId };

            // Fetch Meta pages and LinkedIn actors in parallel
            const [metaRes, liRes] = await Promise.allSettled([
                fetch(`${API_BASE_URL}/api/meta/connection`, { headers }).then(r => r.json()),
                fetch(`${API_BASE_URL}/api/linkedin/connection`, { headers }).then(r => r.json()),
            ]);

            const metaTargets = metaRes.status === 'fulfilled' && metaRes.value?.pages
                ? metaRes.value.pages.map(p => ({
                    id: String(p.id),
                    name: p.name,
                    subtitle: p.category || 'Facebook Page',
                    provider: 'meta',
                    platforms: p.instagram_business_account ? ['facebook', 'instagram'] : ['facebook'],
                }))
                : [];

            const liTargets = liRes.status === 'fulfilled' && liRes.value?.actors
                ? liRes.value.actors.map(a => ({
                    id: a.urn,
                    name: a.name,
                    subtitle: a.type === 'org' ? 'LinkedIn Page' : 'LinkedIn profile',
                    provider: 'linkedin',
                    platforms: ['linkedin'],
                }))
                : [];

            const all = [...metaTargets, ...liTargets];
            setTargets(all);

            // Auto-select first
            if (all.length > 0) {
                setSelectedTargetId(all[0].id);
                setSelectedPlatforms([all[0].platforms[0]]);
            }
        } catch (err) {
            console.error('[QuickScheduleModal] loadTargets:', err);
        } finally {
            setLoadingTargets(false);
        }
    }, [activeWorkspaceId]);

    useEffect(() => { loadTargets(); }, [loadTargets]);

    // Load saved approver numbers for this workspace
    useEffect(() => {
        getSavedApprovers(activeWorkspaceId)
            .then(phones => {
                setSavedApprovers(phones);
                if (phones.length) setApproverPhones(phones.join(', '));
            })
            .catch(() => {});
    }, [activeWorkspaceId]);

    // When target changes, reset platform selection
    const handleTargetSelect = (id) => {
        const target = targets.find(t => t.id === id);
        setSelectedTargetId(id);
        setSelectedPlatforms(target ? [target.platforms[0]] : []);
    };

    const togglePlatform = (platform) => {
        const target = targets.find(t => t.id === selectedTargetId);
        const next = selectedPlatforms.includes(platform)
            ? selectedPlatforms.filter(p => p !== platform)
            : [...selectedPlatforms, platform];
        setSelectedPlatforms(next.length ? next : [target?.platforms[0] ?? 'facebook']);
    };

    const toggleSavedApprover = (phone) => {
        const current = parsePhones(approverPhones);
        const next = current.includes(phone)
            ? current.filter(p => p !== phone)
            : [...current, phone];
        setApproverPhones(next.join(', '));
    };

    const isImage = !item?.mime_type?.startsWith('video/');

    const handleSubmit = async () => {
        if (!selectedTargetId) { toast.error('Select an account to publish to'); return; }
        if (!scheduledTime) { toast.error('Pick a schedule time'); return; }
        if (!content.trim()) { toast.error('Add a caption'); return; }

        const target = targets.find(t => t.id === selectedTargetId);
        setSubmitting(true);
        try {
            const result = await quickScheduleMedia({
                targetId: selectedTargetId,
                provider: target?.provider || 'meta',
                platforms: selectedPlatforms,
                mediaUrl: item.url,
                content: content.trim(),
                scheduledTime: new Date(scheduledTime).toISOString(),
                approverPhones,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }, activeWorkspaceId);

            if (result.approval?.sent) {
                toast.success('Scheduled! WhatsApp approval request sent.', { duration: 7000 });
            } else {
                toast.success(result.message || 'Scheduled successfully!');
            }
            onSuccess?.();
            onClose();
        } catch (err) {
            toast.error(err.message || 'Could not schedule the post');
        } finally {
            setSubmitting(false);
        }
    };

    const selectedTarget = targets.find(t => t.id === selectedTargetId);
    const chosenPhones = parsePhones(approverPhones);

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center gap-3">
                        <CalendarClock className="h-5 w-5 text-[var(--accent)]" />
                        <div>
                            <h3 className="text-lg font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight">
                                Quick Schedule
                            </h3>
                            <p className="text-xs text-[var(--muted)] truncate max-w-xs">{item?.file_name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-[var(--muted)] hover:text-red-400 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    {/* Media preview */}
                    <div className="flex items-center gap-4 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                        {isImage ? (
                            <img src={item.url} alt={item.file_name} className="h-16 w-16 rounded-lg object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setShowPreview(true)} />
                        ) : (
                            <div className="h-16 w-16 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[var(--muted)] text-xs font-mono shrink-0 cursor-pointer hover:bg-[var(--border)] transition-colors" onClick={() => setShowPreview(true)}>
                                VIDEO
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--text)] truncate">{item.file_name}</p>
                            <p className="text-xs text-[var(--muted)]">{item.mime_type}</p>
                        </div>
                    </div>

                    {/* Account selection */}
                    <div>
                        <label className="flex items-center gap-2 text-xs text-[var(--accent)] font-semibold mb-3">
                            <Users className="h-3.5 w-3.5" /> Publish to
                        </label>
                        {loadingTargets ? (
                            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
                            </div>
                        ) : targets.length === 0 ? (
                            <p className="text-sm text-[var(--muted)]">No accounts connected. Connect from Social Profiles first.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {targets.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => handleTargetSelect(t.id)}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            selectedTargetId === t.id
                                                ? 'border-[var(--accent)] bg-[var(--accent)]/10 -translate-y-0.5 shadow-lg'
                                                : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-[var(--text)]">{t.name}</p>
                                                <p className="text-xs text-[var(--muted)]">{t.subtitle}</p>
                                            </div>
                                            {selectedTargetId === t.id && (
                                                <CheckCircle2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Platform toggles */}
                        {selectedTarget && selectedTarget.platforms.length > 1 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {selectedTarget.platforms.map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => togglePlatform(p)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                                            selectedPlatforms.includes(p)
                                                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]'
                                        }`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Caption */}
                    <div>
                        <label className="flex items-center gap-2 text-xs text-[var(--accent)] font-semibold mb-2">
                            <Sparkles className="h-3.5 w-3.5" /> Caption
                        </label>
                        <div className="mb-2">
                            <CaptionAssistant
                                platforms={selectedPlatforms}
                                hasContent={Boolean(content.trim())}
                                onCaption={setContent}
                                imageUrl={isImage ? item.url : undefined}
                            />
                        </div>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            rows={4}
                            placeholder="Write your caption…"
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none resize-none transition-colors text-sm"
                        />
                    </div>

                    {/* Date/time */}
                    <div>
                        <label htmlFor="qs-time" className="flex items-center gap-2 text-xs text-[var(--accent)] font-semibold mb-2">
                            <CalendarClock className="h-3.5 w-3.5" /> Schedule time
                        </label>
                        <input
                            id="qs-time"
                            type="datetime-local"
                            min={minTime}
                            value={scheduledTime}
                            onChange={e => setScheduledTime(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none transition-colors text-sm"
                        />
                        <p className="text-xs text-[var(--muted)] mt-1">Times are in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})</p>
                    </div>

                    {/* WhatsApp approver */}
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
                        <label htmlFor="qs-approvers" className="flex items-center gap-2 text-xs text-[var(--accent)] font-semibold">
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Approval <span className="text-[var(--muted)] font-normal">(optional)</span>
                        </label>
                        <p className="text-xs text-[var(--muted)] leading-relaxed">
                            The post will be held for WhatsApp approval before publishing. The first Approve/Reject wins.
                            The number will be saved for future posts.
                        </p>
                        <input
                            id="qs-approvers"
                            type="text"
                            inputMode="tel"
                            value={approverPhones}
                            onChange={e => setApproverPhones(e.target.value)}
                            placeholder="e.g. 9876543210, 919123456789"
                            className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                        />
                        {savedApprovers.length > 0 && (
                            <div>
                                <p className="text-xs text-[var(--muted)] mb-2">Previously used:</p>
                                <div className="flex flex-wrap gap-2">
                                    {savedApprovers.map(phone => (
                                        <button
                                            key={phone}
                                            type="button"
                                            onClick={() => toggleSavedApprover(phone)}
                                            className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                                                chosenPhones.includes(phone)
                                                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                                    : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]'
                                            }`}
                                        >
                                            +{phone}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {chosenPhones.length > 0 && (
                            <p className="text-xs text-[var(--text)]">
                                Will send approval to: <span className="font-medium">{chosenPhones.map(p => `+${p}`).join(', ')}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-4">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors text-sm disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !selectedTargetId || !scheduledTime || !content.trim()}
                        className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-bold font-['Space_Grotesk'] text-sm hover:shadow-[4px_4px_0_0_var(--border)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center gap-2"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                        {submitting ? 'Scheduling…' : 'Schedule Post'}
                    </button>
                </div>
            </div>
        </div>

            {/* Full-screen preview */}
            {showPreview && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
                    onClick={(e) => { e.stopPropagation(); setShowPreview(false); }}
                >
                    <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center">
                        <button
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 text-sm font-medium"
                            onClick={() => setShowPreview(false)}
                        >
                            Close
                        </button>
                        {item.mime_type?.startsWith('video/') ? (
                            <video
                                src={item.url}
                                controls
                                autoPlay
                                className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <img
                                src={item.url}
                                alt={item.file_name}
                                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default QuickScheduleModal;
