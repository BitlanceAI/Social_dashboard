import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UploadCloud, Trash2, Film, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWorkspace } from '@/features/workspace';
import { fetchMedia, uploadMedia, deleteMedia, fmtBytes } from '../lib/storageApi';
import QuickScheduleModal from './QuickScheduleModal';

/**
 * The user's stored files: upload into the purchased quota, delete, and —
 * when an onPick handler is given (the composer's picker) — select one.
 * Uploads are rejected server-side when the quota would be exceeded, so
 * this component only relays those messages.
 */
const MediaLibrary = ({ onPick, onChanged, compact = false }) => {
    // Files are isolated per workspace: the list and every upload carry the
    // active workspace, and switching workspaces reloads the grid.
    const { activeWorkspaceId } = useWorkspace();
    const [media, setMedia] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [previewItem, setPreviewItem] = useState(null);
    const [scheduleItem, setScheduleItem] = useState(null);
    const [compactPage, setCompactPage] = useState(0);
    const inputRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchMedia(activeWorkspaceId);
            setMedia(res.media);
        } catch (err) {
            toast.error(err.message || 'Could not load your library');
        } finally {
            setLoading(false);
        }
    }, [activeWorkspaceId]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void load(); }, 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const processUpload = async (files) => {
        if (!files.length || uploading) return;
        setUploading(true);
        try {
            await uploadMedia(files, activeWorkspaceId);
            toast.success(`${files.length} file${files.length === 1 ? '' : 's'} added`);
            await load();
            setCompactPage(0);
            onChanged?.();
        } catch (err) {
            toast.error(err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleUpload = (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        processUpload(files);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer.files || []);
        processUpload(files);
    };

    const handleDelete = async (item) => {
        try {
            await deleteMedia(item.id);
            setMedia((m) => m.filter((x) => x.id !== item.id));
            toast.success('Deleted');
            onChanged?.();
        } catch (err) {
            toast.error(err.message || 'Could not delete');
        }
    };

    const pageSize = 3;
    const compactPageCount = Math.max(1, Math.ceil(media.length / pageSize));
    const safeCompactPage = Math.min(compactPage, compactPageCount - 1);
    const visibleMedia = compact
        ? media.slice(safeCompactPage * pageSize, safeCompactPage * pageSize + pageSize)
        : media;

    const scheduledMedia = visibleMedia.filter((m) => m.is_scheduled);
    const notScheduledMedia = visibleMedia.filter((m) => !m.is_scheduled);

    const renderMediaGrid = (items) => (
        <div className={`grid gap-3 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {items.map((item) => {
                const isVideo = item.mime_type?.startsWith('video/');
                return (
                    <div
                        key={item.id}
                        onClick={onPick ? () => onPick(item) : () => setPreviewItem(item)}
                        className="group relative rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden cursor-pointer hover:border-[var(--accent)] transition-colors"
                    >
                        <div className="aspect-square bg-[var(--surface-2)] flex items-center justify-center overflow-hidden">
                            {isVideo ? (
                                <Film className="h-8 w-8 text-[var(--muted)]" />
                            ) : (
                                <img src={item.url} alt={item.file_name} loading="lazy" className="w-full h-full object-cover" />
                            )}
                        </div>
                        <div className="px-2.5 py-2">
                            <span className="block text-[11px] truncate">{item.file_name}</span>
                            <span className="block text-[10px] font-mono text-[var(--muted)]">{fmtBytes(item.size_bytes)}</span>
                        </div>
                        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                                onClick={(e) => { e.stopPropagation(); setScheduleItem(item); }}
                                className="p-1.5 rounded-lg bg-[var(--bg)]/80 text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                                title="Quick Schedule"
                            >
                                <CalendarClock className="h-3.5 w-3.5" />
                            </button>

                            {!onPick && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                    className="p-1.5 rounded-lg bg-[var(--bg)]/80 text-[var(--muted)] hover:text-[#F87171] transition-all"
                                    title="Delete"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={handleUpload}
            />

            <button
                onClick={() => inputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                disabled={uploading}
                className={`w-full flex flex-col items-center gap-2 rounded-xl border border-dashed py-6 mb-4 transition-colors disabled:opacity-60 ${
                    isDragOver
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                        : 'border-[var(--border)] hover:border-[var(--accent)] bg-[var(--surface)]'
                }`}
            >
                <UploadCloud className="h-5 w-5 text-[var(--accent)]" />
                <span className="text-xs font-medium">{uploading ? 'Uploading…' : isDragOver ? 'Drop files here' : 'Upload to your library'}</span>
                <span className="text-[11px] text-[var(--muted)]">Images and video, up to 100 MB each</span>
            </button>

            {loading ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                    Loading your library…
                </div>
            ) : media.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                    Nothing stored yet — files you upload here can be reused in any post.
                </div>
            ) : (
                <div className="space-y-6">
                    {scheduledMedia.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Scheduled</h4>
                            {renderMediaGrid(scheduledMedia)}
                        </div>
                    )}
                    {notScheduledMedia.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Not Scheduled</h4>
                            {renderMediaGrid(notScheduledMedia)}
                        </div>
                    )}
                </div>
            )}

            {compact && media.length > pageSize && (
                <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-[var(--muted)]">
                        {safeCompactPage * pageSize + 1}–{Math.min((safeCompactPage + 1) * pageSize, media.length)} of {media.length}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCompactPage((page) => Math.max(0, page - 1))}
                            disabled={safeCompactPage === 0}
                            aria-label="Show newer media"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setCompactPage((page) => Math.min(compactPageCount - 1, page + 1))}
                            disabled={safeCompactPage >= compactPageCount - 1}
                            aria-label="Show older media"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {previewItem && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setPreviewItem(null)}
                >
                    <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center">
                        <button 
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 text-sm font-medium"
                            onClick={() => setPreviewItem(null)}
                        >
                            Close
                        </button>
                        {previewItem.mime_type?.startsWith('video/') ? (
                            <video 
                                src={previewItem.url} 
                                controls 
                                autoPlay 
                                className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <img 
                                src={previewItem.url} 
                                alt={previewItem.file_name} 
                                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Quick Schedule Modal */}
            {scheduleItem && (
                <QuickScheduleModal
                    item={scheduleItem}
                    onClose={() => setScheduleItem(null)}
                    onSuccess={() => {
                        setScheduleItem(null);
                        onChanged?.();
                    }}
                />
            )}
        </div>
    );
};

export default MediaLibrary;
