import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UploadCloud, Trash2, Film } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWorkspace } from '@/features/workspace';
import { fetchMedia, uploadMedia, deleteMedia, fmtBytes } from '../lib/storageApi';

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

    useEffect(() => { load(); }, [load]);

    const handleUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length || uploading) return;
        setUploading(true);
        try {
            await uploadMedia(files, activeWorkspaceId);
            toast.success(`${files.length} file${files.length === 1 ? '' : 's'} added`);
            await load();
            onChanged?.();
        } catch (err) {
            toast.error(err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
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
                disabled={uploading}
                className="w-full flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] hover:border-[var(--accent)] bg-[var(--surface)] py-6 mb-4 transition-colors disabled:opacity-60"
            >
                <UploadCloud className="h-5 w-5 text-[var(--accent)]" />
                <span className="text-xs font-medium">{uploading ? 'Uploading…' : 'Upload to your library'}</span>
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
                <div className={`grid gap-3 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                    {media.map((item) => {
                        const isVideo = item.mime_type?.startsWith('video/');
                        return (
                            <div
                                key={item.id}
                                onClick={onPick ? () => onPick(item) : undefined}
                                className={`group relative rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden ${
                                    onPick ? 'cursor-pointer hover:border-[var(--accent)]' : ''
                                } transition-colors`}
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
                                {!onPick && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                        className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-[var(--bg)]/80 text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:text-[#F87171] transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MediaLibrary;
