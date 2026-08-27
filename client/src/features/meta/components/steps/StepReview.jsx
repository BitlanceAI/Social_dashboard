import React from 'react';
import { CheckCircle2, Eye, Calendar, Users, Image, FileText } from 'lucide-react';

/**
 * Step 5: Review & Confirm
 * Final review before scheduling
 */
const StepReview = ({ formData, pages }) => {
    const selectedPage = pages?.find(p => p.id === formData.pageId);
    const hasMedia = formData.mediaUrls?.[0];
    const scheduledDate = formData.scheduledTime
        ? new Date(formData.scheduledTime)
        : null;

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
                                    {hasMedia ? 'MEDIA_BLOCK' : 'TEXT_BLOCK'}
                                </p>
                            </div>
                        </div>
                    </div>

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

                    {/* Media */}
                    {hasMedia && (
                        <div className="aspect-video bg-[var(--surface)] border-y border-[var(--border)] overflow-hidden shrink-0">
                            <img
                                src={formData.mediaUrls[0]}
                                alt="Post media"
                                className="w-full h-full object-cover"
                            />
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
            <div className="p-6 bg-[var(--accent)]/10 border border-[var(--accent)] flex items-start gap-4 shadow-xl">
                <CheckCircle2 className="h-6 w-6 text-[var(--accent)] shrink-0 mt-0.5 animate-pulse" />
                <div>
                    <p className="text-[var(--accent)] font-bold text-[12px] md:text-sm mb-1">
                        Ready
                    </p>
                    <p className="text-[var(--accent)] text-xs">
                        &gt; AUTHORIZE "SCHEDULE POST" TO FINALIZE TRANSACTION.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StepReview;
