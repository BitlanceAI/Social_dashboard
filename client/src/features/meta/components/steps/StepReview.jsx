import React, { useState } from 'react';
import { CheckCircle2, Eye, Calendar, Users, Image, FileText, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Step 5: Review & Confirm
 * Final review before scheduling
 */
const StepReview = ({ formData, pages }) => {
    const [previewIndex, setPreviewIndex] = useState(0);
    const selectedPage = pages?.find(p => p.id === formData.pageId);
    const visibleMedia = (formData.mediaUrls || []).filter(Boolean);
    const hasMedia = visibleMedia.length > 0;
    const safePreviewIndex = Math.min(previewIndex, Math.max(0, visibleMedia.length - 1));
    const previewMediaUrl = visibleMedia[safePreviewIndex];
    const previewBlobIndex = previewMediaUrl?.startsWith('blob:')
        ? formData.mediaUrls.slice(0, formData.mediaUrls.indexOf(previewMediaUrl) + 1).filter((url) => url.startsWith('blob:')).length - 1
        : -1;
    const previewMediaIsVideo = Boolean(previewMediaUrl) && (
        /\.(mp4|mov|m4v|avi|mkv|webm)(?:[?#]|$)/i.test(previewMediaUrl)
        || (previewBlobIndex >= 0 && formData.mediaFiles?.[previewBlobIndex]?.type.startsWith('video/'))
    );
    const scheduledDate = formData.scheduledTime
        ? new Date(formData.scheduledTime)
        : null;
    // Same normalization the server applies: digits only, 10 digits → +91.
    const approvers = [...new Set(String(formData.approverPhones || '')
        .split(/[,;\s]+/)
        .map((p) => p.replace(/\D/g, ''))
        .filter(Boolean)
        .map((d) => (d.length === 10 ? `91${d}` : d)))];

    return (
        <div className="space-y-8">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight flex items-center gap-3 border-l-4 border-[var(--accent)] pl-3 mb-6">
                <Eye className="h-5 w-5 text-[var(--accent)]" /> Review
            </h4>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Summary Card */}
                <div className="space-y-4">
                    {/* Page */}
                    <div className="p-5 bg-[var(--bg)] border border-[var(--border)] flex flex-col">
                        <div className="flex items-center gap-4">
                            <div className="p-3 border border-[var(--border)] bg-[var(--surface)]">
                                <Users className="h-5 w-5 text-[var(--accent)]" />
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs text-[var(--muted)] mb-1">Publishing to</p>
                                <p className="font-bold text-[var(--text)] tracking-tight mt-1 truncate">
                                    {selectedPage?.name || 'No node selected'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Schedule */}
                    <div className="p-5 bg-[var(--bg)] border border-[var(--border)] flex flex-col">
                        <div className="flex items-center gap-4">
                            <div className="p-3 border border-[var(--border)] bg-[var(--surface)]">
                                <Calendar className="h-5 w-5 text-[var(--accent)]" />
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs text-[var(--muted)] mb-1">Publish time</p>
                                <p className="font-bold text-[var(--text)] tracking-tight mt-1 truncate">
                                    {scheduledDate
                                        ? scheduledDate.toLocaleString('en-IN', {
                                            weekday: 'short',
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })
                                        : 'Not scheduled'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Post Type */}
                    <div className="p-5 bg-[var(--bg)] border border-[var(--border)] flex flex-col">
                        <div className="flex items-center gap-4">
                            <div className="p-3 border border-[var(--border)] bg-[var(--surface)]">
                                {hasMedia ? (
                                    <Image className="h-5 w-5 text-[var(--accent)]" />
                                ) : (
                                    <FileText className="h-5 w-5 text-[var(--accent)]" />
                                )}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs text-[var(--muted)] mb-1">Post type</p>
                                <p className="font-bold text-[var(--text)] tracking-tight mt-1 truncate">
                                    {hasMedia
                                        ? visibleMedia.length > 1 ? `CAROUSEL (${visibleMedia.length})` : previewMediaIsVideo ? 'VIDEO' : 'IMAGE'
                                        : 'TEXT'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* WhatsApp approval — only when approver numbers were entered */}
                    {approvers.length > 0 && (
                        <div className="p-5 bg-[var(--bg)] border border-[var(--border)] flex flex-col">
                            <div className="flex items-center gap-4">
                                <div className="p-3 border border-[var(--border)] bg-[var(--surface)]">
                                    <MessageCircle className="h-5 w-5 text-[var(--accent)]" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-xs text-[var(--muted)] mb-1">WhatsApp approval</p>
                                    <p className="font-bold text-[var(--text)] tracking-tight mt-1 truncate">
                                        {approvers.map((p) => `+${p}`).join(', ')}
                                    </p>
                                    <p className="text-[11px] text-[var(--muted)] mt-1">
                                        Held until one of them taps Approve.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Post Preview Card */}
                <div className="bg-[var(--bg)] border border-[var(--border)] shadow-xl rounded-xl flex flex-col drop-shadow-lg max-h-[500px] overflow-auto custom-scrollbar">
                    {/* Header */}
                    <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 border border-[var(--accent)] bg-[var(--accent)]/20 shrink-0"></div>
                            <div>
                                <p className="font-bold font-['Space_Grotesk'] text-[var(--text)] truncate">
                                    {selectedPage?.name || 'Your Page'}
                                </p>
                                <p className="text-xs text-[var(--accent)] mt-1">
                                    &gt; SCHEDULED •{' '}
                                    {scheduledDate?.toLocaleDateString('en-IN', {
                                        month: 'short',
                                        day: 'numeric'
                                    })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 flex-1 bg-[var(--bg)]">
                        <p className="text-[var(--muted)] text-sm whitespace-pre-wrap leading-relaxed">
                            {formData.content || 'Nothing written yet'}
                        </p>
                    </div>

                    {/* Media — full image, no crop (matches how the network renders it) */}
                    {hasMedia && (
                        <div className="relative bg-[var(--surface)] border-y border-[var(--border)] flex justify-center shrink-0">
                            {previewMediaIsVideo ? (
                                <video
                                    src={previewMediaUrl}
                                    controls
                                    preload="metadata"
                                    className="w-full max-h-[360px] object-contain"
                                />
                            ) : (
                                <img
                                    src={previewMediaUrl}
                                    alt={`Post media ${safePreviewIndex + 1}`}
                                    className="w-full max-h-[360px] object-contain"
                                />
                            )}
                            {visibleMedia.length > 1 && (
                                <span className="absolute right-3 top-3 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-white">
                                    {safePreviewIndex + 1} / {visibleMedia.length}
                                </span>
                            )}
                            {visibleMedia.length > 1 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setPreviewIndex((index) => (index - 1 + visibleMedia.length) % visibleMedia.length)}
                                        aria-label="Show previous carousel item"
                                        className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPreviewIndex((index) => (index + 1) % visibleMedia.length)}
                                        aria-label="Show next carousel item"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Engagement */}
                    <div className="p-4 bg-[var(--surface)] flex justify-between text-[var(--muted)] text-xs font-bold shrink-0">
                        <span className="hover:text-[var(--text)] cursor-pointer transition-colors">Like</span>
                        <span className="hover:text-[var(--text)] cursor-pointer transition-colors">Comment</span>
                        <span className="hover:text-[var(--text)] cursor-pointer transition-colors">Share</span>
                    </div>
                </div>
            </div>

            {/* Confirmation Notice */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10">
                    <CheckCircle2 className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                    <p className="font-semibold text-[var(--text)] text-sm mb-1">
                        Ready to schedule
                    </p>
                    <p className="text-[var(--muted)] text-xs leading-relaxed">
                        Review the account, content, and publish time above. When everything looks right, schedule your post.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StepReview;
