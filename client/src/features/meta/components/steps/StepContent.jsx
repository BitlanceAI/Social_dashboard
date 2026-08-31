import React from 'react';
import { FileText, Link2 } from 'lucide-react';
import { charLimitFor } from '@/features/meta/lib/providers';
import MediaSelector from '@/features/meta/components/MediaSelector';

/**
 * Step 2: Content Creation
 * Post text, media, and link URL
 */
const StepContent = ({
    platforms = [],
    content,
    linkUrl,
    mediaUrls,
    mediaFiles,
    onContentChange,
    onLinkChange,
    onMediaUpdate,
}) => {
    // Facebook allows 63,206 characters, Instagram 2,200, LinkedIn 3,000 --
    // show whichever selected network is strictest.
    const charLimit = charLimitFor(platforms);

    return (
        <div className="space-y-6">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight flex items-center gap-3 border-l-4 border-[var(--accent)] pl-3 mb-6">
                <FileText className="h-5 w-5 text-[var(--accent)]" /> Write your post
            </h4>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: Form */}
                <div className="space-y-6">
                    {/* Post Content */}
                    <div>
                        <label className="block text-xs text-[var(--accent)] mb-2">
                            Post text
                        </label>
                        <textarea
                            value={content}
                            onChange={(e) => onContentChange(e.target.value)}
                            rows={6}
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
                <div className="flex flex-col">
                    <label className="block text-xs text-[var(--muted)] mb-2">
                        Preview
                    </label>
                    <div className="bg-[var(--bg)] border border-[var(--border)] shadow-xl rounded-xl flex flex-col self-start w-full overflow-hidden">
                        {/* Post Header */}
                        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 border border-[var(--accent)] bg-[var(--accent)]/20"></div>
                                <div>
                                    <p className="font-bold font-['Space_Grotesk'] text-[var(--text)] text-sm">
                                        Your Page
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

                        {/* Media Preview */}
                        {mediaUrls[0] && (
                            <div className="aspect-video bg-[var(--surface)] border-y border-[var(--border)] overflow-hidden">
                                <img
                                    src={mediaUrls[0]}
                                    alt="Preview"
                                    className="w-full h-full object-cover"
                                />
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
