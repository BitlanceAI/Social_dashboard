import React, { useState } from 'react';
import { UploadCloud, Trash2, PlusCircle } from 'lucide-react';

/**
 * Media Selector Component
 * Handles file upload and URL input for post media
 */
const MediaSelector = ({
    mediaUrls,
    mediaFiles,
    onUpdate
}) => {
    const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'url'

    // Handle file selection
    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        const newBlobs = files.map(file => URL.createObjectURL(file));
        onUpdate({
            mediaFiles: [...mediaFiles, ...files],
            mediaUrls: [...mediaUrls, ...newBlobs]
        });
    };

    // Remove file at index
    const removeFile = (idx) => {
        const newFiles = [...mediaFiles];
        const newUrls = [...mediaUrls];
        newFiles.splice(idx, 1);
        newUrls.splice(idx, 1);
        onUpdate({ mediaFiles: newFiles, mediaUrls: newUrls });
    };

    // Update URL at index
    const updateUrlAtIndex = (idx, value) => {
        const newUrls = [...mediaUrls];
        newUrls[idx] = value;
        onUpdate({ mediaUrls: newUrls });
    };

    // Add empty URL field
    const addUrlField = () => {
        onUpdate({ mediaUrls: [...mediaUrls, ''] });
    };

    return (
        <div>
            <label className="block text-xs text-[var(--accent)] mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-[var(--accent)]"></span> Media
            </label>

            {/* Mode Toggle */}
            <div className="grid grid-cols-2 p-1 bg-[var(--surface)] border border-[var(--border)] mb-6">
                <button
                    onClick={() => setUploadMode('file')}
                    className={`py-3 text-xs transition-all ${uploadMode === 'file'
                            ? 'bg-[var(--accent)] text-[var(--bg)] font-bold shadow-[2px_2px_0_0_var(--border)] -translate-y-0.5 rounded-xl'
                            : 'bg-transparent text-[var(--muted)] hover:text-[var(--text)] border border-transparent hover:border-[var(--border)] rounded-xl'
                        }`}
                >
                    Upload
                </button>
                <button
                    onClick={() => {
                        setUploadMode('url');
                        if (mediaUrls.length === 0) {
                            onUpdate({ mediaFiles: [], mediaUrls: [''] });
                        }
                    }}
                    className={`py-3 text-xs transition-all ${uploadMode === 'url'
                            ? 'bg-[var(--accent)] text-[var(--bg)] font-bold shadow-[2px_2px_0_0_var(--border)] -translate-y-0.5 rounded-xl'
                            : 'bg-transparent text-[var(--muted)] hover:text-[var(--text)] border border-transparent hover:border-[var(--border)] rounded-xl'
                        }`}
                >
                    Media URL
                </button>
            </div>

            {/* Upload Mode */}
            {uploadMode === 'file' && (
                <div className="space-y-4">
                    <div className="relative border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-all cursor-pointer text-center group">
                        <input
                            type="file"
                            multiple
                            accept="image/*,video/*"
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            onChange={handleFileSelect}
                        />
                        <div className="mb-4 p-4 border border-[var(--border)] bg-[var(--bg)] inline-flex group-hover:bg-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                            <UploadCloud className="h-6 w-6 text-[var(--accent)] group-hover:text-[var(--bg)]" />
                        </div>
                        <p className="text-xs font-bold text-[var(--text)] mb-2">
                            Choose files
                        </p>
                        <p className="text-xs text-[var(--muted)]">Drop files here, or click to browse</p>
                    </div>

                    {/* File Preview List */}
                    {mediaFiles.length > 0 && (
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                            {mediaFiles.map((file, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                                >
                                    <div className="flex items-center gap-4 overflow-hidden">
                                        <div className="h-10 w-10 bg-[var(--bg)] border border-[var(--border)] overflow-hidden shrink-0">
                                            <img
                                                src={mediaUrls[idx]}
                                                alt=""
                                                className="h-full w-full object-cover grayscale"
                                            />
                                        </div>
                                        <span className="text-xs text-[var(--text)] truncate">
                                            {file.name}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => removeFile(idx)}
                                        className="p-2 border border-transparent hover:border-red-500 hover:bg-red-500/10 text-red-500 transition-colors"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* URL Mode */}
            {uploadMode === 'url' && (
                <div className="space-y-3">
                    {mediaUrls.map((url, idx) => (
                        <div key={idx} className="flex gap-3">
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => updateUrlAtIndex(idx, e.target.value)}
                                placeholder="Paste an image or video URL"
                                className="flex-1 px-4 py-3 border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--accent)] focus:ring-0 focus:outline-none transition-colors placeholder-gray-600 text-sm"
                            />
                            {idx === mediaUrls.length - 1 && (
                                <button
                                    onClick={addUrlField}
                                    className="p-3 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--accent)] hover:text-[var(--bg)] hover:border-[var(--accent)] text-[var(--muted)] transition-colors"
                                >
                                    <PlusCircle className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MediaSelector;
