import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Link2 } from 'lucide-react';
import { charLimitFor } from '@/features/meta/lib/providers';
import MediaSelector from '@/features/meta/components/MediaSelector';
import CaptionAssistant from '@/features/meta/components/CaptionAssistant';

/**
 * Step 2: Content Creation
 * Post text, media, and link URL
 */
const StepContent = ({
    platforms = [],
    account,
    content,
    linkUrl,
    mediaUrls,
    mediaFiles,
    onContentChange,
    onLinkChange,
    onMediaUpdate,
}) => {
    const [previewIndex, setPreviewIndex] = useState(0);
    // Facebook allows 63,206 characters, Instagram 2,200, LinkedIn 3,000 --
    // show whichever selected network is strictest.
    const charLimit = charLimitFor(platforms);
    const accountName = platforms.includes('instagram') && account?.igUsername
        ? `@${account.igUsername}`
        : account?.name || 'Your Page';
    const accountInitial = accountName.replace(/^@/, '').trim().charAt(0).toUpperCase() || 'Y';
    const visibleMedia = mediaUrls.filter(Boolean);
    const safePreviewIndex = Math.min(previewIndex, Math.max(0, visibleMedia.length - 1));
    const previewMediaUrl = visibleMedia[safePreviewIndex];
    const previewBlobIndex = previewMediaUrl?.startsWith('blob:')
        ? mediaUrls.slice(0, mediaUrls.indexOf(previewMediaUrl) + 1).filter((url) => url.startsWith('blob:')).length - 1
        : -1;
    const previewMediaIsVideo = Boolean(previewMediaUrl) && (
        /\.(mp4|mov|m4v|avi|mkv|webm)(?:[?#]|$)/i.test(previewMediaUrl)
        || (previewBlobIndex >= 0 && mediaFiles[previewBlobIndex]?.type.startsWith('video/'))
    );
    const showPreviousMedia = () => setPreviewIndex((index) => (index - 1 + visibleMedia.length) % visibleMedia.length);
    const showNextMedia = () => setPreviewIndex((index) => (index + 1) % visibleMedia.length);

    return (
        <div className="space-y-4">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight flex items-center gap-3 border-l-4 border-[var(--accent)] pl-3 mb-4">
                <FileText className="h-5 w-5 text-[var(--accent)]" /> Write your post
            </h4>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Form */}
                <div className="space-y-4">
                    {/* Post Content */}
                    <div>
                        <label className="block text-xs text-[var(--accent)] mb-2">
                            Post text
                        </label>
                        <div className="mb-2">
                            <CaptionAssistant
                                platforms={platforms}
                                hasContent={Boolean(content?.trim())}
                                onCaption={onContentChange}
                            />
                        </div>
                        <textarea
                            value={content}
                            onChange={(e) => onContentChange(e.target.value)}
                            rows={4}
                            placeholder="&gt; Write your transmission body here... Use #hashtags and @mentions"
                            className="w-full px-4 py-3 border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--accent)] focus:ring-0 focus:outline-none resize-none transition-colors rounded-xl text-sm placeholder-gray-600"
                        />
                        <p className="text-xs text-[var(--muted)] text-right mt-2">
                            {(content?.length || 0).toLocaleString()} / {charLimit.toLocaleString()} characters
                        </p>
                    </div>

                    {/* Media Selector Component */}
                    <MediaSelector
                        mediaUrls={mediaUrls}
                        mediaFiles={mediaFiles}
                        onUpdate={onMediaUpdate}
                    />

                    {/* Link URL */}
                    <div>
                        <label className="block text-xs text-[var(--accent)] mb-2">
                            Link (optional)
                        </label>
                        <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-within:border-[var(--accent)] transition-colors">
                            <Link2 className="h-4 w-4 text-[var(--muted)]" />
                            <input
                                type="url"
                                value={linkUrl}
                                onChange={(e) => onLinkChange(e.target.value)}
                                placeholder="https://..."
                                className="flex-1 bg-transparent text-[var(--text)] text-sm focus:outline-none placeholder-gray-600"
                            />
                        </div>
                    </div>
                </div>

                {/* Right: Preview */}
                <div className="flex flex-col lg:sticky lg:top-6 lg:self-start">
                    <label className="block text-xs text-[var(--muted)] mb-2">
                        Preview
                    </label>
                    <div className="bg-[var(--bg)] border border-[var(--border)] shadow-xl rounded-xl flex flex-col self-start w-full overflow-hidden">
                        {/* Post Header */}
                        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex items-center gap-4">
                                <div
                                    aria-hidden="true"
                                    className="relative w-10 h-10 shrink-0 rounded-full border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center font-bold font-['Space_Grotesk'] overflow-hidden"
                                >
                                    {accountInitial}
                                    {account?.avatarUrl && (
                                        <img
                                            src={account.avatarUrl}
                                            alt=""
                                            onError={(event) => event.currentTarget.remove()}
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                    )}
                                </div>
                                <div>
                                    <p className="font-bold font-['Space_Grotesk'] text-[var(--text)] text-sm">
                                        {accountName}
                                    </p>
                                    <p className="text-xs text-[var(--muted)] mt-1">Just now</p>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-5 bg-[var(--bg)]">
                            <p className="text-[var(--muted)] text-sm whitespace-pre-wrap leading-relaxed">
                                {content || 'Nothing written yet'}
                            </p>
                        </div>

                        {/* Media Preview — show the whole image (no crop), as the
                            network does; cap height so tall flyers stay readable. */}
                        {previewMediaUrl && (
                            <div className="relative bg-[var(--surface)] border-y border-[var(--border)] flex justify-center">
                                {previewMediaIsVideo ? (
                                    <video
                                        src={previewMediaUrl}
                                        controls
                                        preload="metadata"
                                        className="w-full max-h-[300px] object-contain"
                                    />
                                ) : (
                                    <img
                                        src={previewMediaUrl}
                                        alt={`Preview media ${safePreviewIndex + 1}`}
                                        className="w-full max-h-[300px] object-contain"
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
                                            onClick={showPreviousMedia}
                                            aria-label="Show previous carousel item"
                                            className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={showNextMedia}
                                            aria-label="Show next carousel item"
                                            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                        >
                                            <ChevronRight className="h-5 w-5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Engagement Bar */}
                        <div className="p-4 bg-[var(--surface)] flex gap-6 text-[var(--muted)] text-xs font-bold border-t border-[var(--border)]">
                            <span className="hover:text-[var(--text)] cursor-pointer transition-colors">Like</span>
                            <span className="hover:text-[var(--text)] cursor-pointer transition-colors">Comment</span>
                            <span className="hover:text-[var(--text)] cursor-pointer transition-colors">Share</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StepContent;
