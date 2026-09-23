import React, { useState, useEffect } from 'react';
import { Bot, Play, Plus, RefreshCw, FileSpreadsheet, Sparkles, Clock, Edit3, Trash2, Layers, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchPipelines, deletePipeline, runPipelineNow, fetchPipelineQueue, syncPipelineSheet } from '../lib/pipelinesApi';
import PipelineEditorModal from '../components/PipelineEditorModal';
import ImportContentModal from '../components/ImportContentModal';
import { useWorkspace } from '@/features/workspace';

const queueLabels = { all: 'All', pending: 'Queued', generating: 'Generating', pending_approval: 'Awaiting approval', scheduled: 'Scheduled', processing: 'Publishing', published: 'Published', rejected: 'Rejected', cancelled: 'Cancelled', failed: 'Failed' };

export default function PipelinesPage() {
  const { activeWorkspaceId } = useWorkspace();
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState(null);

  // Queue Modal & Import Modal State
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [activePipelineForQueue, setActivePipelineForQueue] = useState(null);
  const [queueItems, setQueueItems] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFilter, setQueueFilter] = useState('all');
  const [runningId, setRunningId] = useState(null);

  const loadPipelines = async () => {
    try {
      setLoading(true);
      const data = await fetchPipelines(activeWorkspaceId);
      setPipelines(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPipelines();
  }, [activeWorkspaceId]);

  const handleRunNow = async (id, name) => {
    try {
      setRunningId(id);
      toast.loading(`Running AI campaign "${name}"...`, { id: 'run-toast' });
      const result = await runPipelineNow(id, activeWorkspaceId);
      const message = result.status === 'no_pending_items' ? 'No queued content to generate.'
        : result.status === 'skipped' ? 'Pipeline run skipped.'
          : result.postStatus === 'pending_approval' ? 'Post generated and awaiting approval.' : `Post status: ${queueLabels[result.postStatus] || result.postStatus}.`;
      toast.success(message, { id: 'run-toast' });
      if (result.approvalDelivery && !result.approvalDelivery.sent) toast(result.approvalDelivery.error, { duration: 7000 });
      loadPipelines();
    } catch (err) {
      toast.error(err.message || 'Pipeline execution failed', { id: 'run-toast' });
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this automation pipeline?')) return;
    try {
      await deletePipeline(id, activeWorkspaceId);
      toast.success('Pipeline deleted');
      loadPipelines();
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const handleOpenQueue = async (pipe) => {
    setActivePipelineForQueue(pipe);
    setQueueModalOpen(true);
    setQueueLoading(true);
    try {
      const items = await fetchPipelineQueue(pipe.id, activeWorkspaceId);
      setQueueItems(items);
    } catch (err) {
      toast.error(err.message || 'Failed to load queue');
    } finally {
      setQueueLoading(false);
    }
  };

  const handleSyncSheet = async (pipe) => {
    try {
      toast.loading(`Syncing Google Sheet for "${pipe.name}"...`, { id: 'sync-toast' });
      const res = await syncPipelineSheet(pipe.id, activeWorkspaceId);
      toast.success(`Synced ${res.count || 0} items from Google Sheet!`, { id: 'sync-toast' });
      handleOpenQueue(pipe);
    } catch (err) {
      toast.error(err.message || 'Failed to sync Google Sheet', { id: 'sync-toast' });
    }
  };

  return (
    <div className="space-y-8 text-[var(--text)]">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[var(--accent-muted)] border border-[var(--accent)]/20 text-[var(--accent)] shadow-sm">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-['Space_Grotesk'] text-2xl font-extrabold tracking-tight text-[var(--text)]">
                AI Content Automation Pipelines
              </h1>
              <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--muted)] mt-0.5">
                Automated content engines that fetch hooks, write AI captions, generate graphics, and publish daily.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadPipelines}
            className="p-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition"
            title="Refresh Pipelines"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setSelectedPipeline(null); setModalOpen(true); }}
            className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold font-mono text-xs uppercase tracking-widest rounded-full shadow-sm transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create AI Pipeline
          </button>
        </div>
      </div>

      {/* Pipelines List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      ) : pipelines.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] p-12 text-center bg-[var(--surface)]">
          <Sparkles className="w-12 h-12 text-[var(--accent)] mx-auto mb-4 opacity-70" />
          <h3 className="font-['Space_Grotesk'] text-lg font-bold text-[var(--text)]">No AI Pipelines Configured</h3>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto mt-1 mb-6 leading-relaxed">
            Create an automated campaign pipeline to connect your content ideas, generate AI captions & graphics, and auto-post daily.
          </p>
          <button
            onClick={() => { setSelectedPipeline(null); setModalOpen(true); }}
            className="px-6 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold font-mono text-xs uppercase tracking-widest rounded-full transition shadow-sm"
          >
            Create Your First Pipeline
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pipelines.map((pipe) => (
            <div
              key={pipe.id}
              className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5 hover:border-[var(--accent)] transition-all flex flex-col justify-between shadow-sm"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="font-['Space_Grotesk'] font-bold text-[var(--text)] text-base">{pipe.name}</h3>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--muted-2)]" />
                      Daily at {(pipe.trigger_time || '09:30:00').slice(0, 5)}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/20 uppercase tracking-widest">
                    {pipe.provider || 'LinkedIn'}
                  </span>
                </div>

                <div className="space-y-2 text-xs text-[var(--text)] bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">Content Source:</span>
                    <span className="font-semibold text-[var(--text)]">
                      {pipe.sheet_url ? 'Google Sheet' : 'Internal Queue'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">Auto-Publish:</span>
                    <span className={`font-semibold ${pipe.auto_publish ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {pipe.auto_publish ? 'Enabled' : 'Approval Queue'}
                    </span>
                  </div>
                  {pipe.last_run_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">Last Executed:</span>
                      <span className="text-[var(--muted)]">
                        {new Date(pipe.last_run_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenQueue(pipe)}
                    className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition"
                    title="View Content Queue"
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setSelectedPipeline(pipe); setModalOpen(true); }}
                    className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition"
                    title="Edit Pipeline"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(pipe.id)}
                    className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-rose-500 hover:border-rose-400 transition"
                    title="Delete Pipeline"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => handleRunNow(pipe.id, pipe.name)}
                  disabled={runningId === pipe.id}
                  className="px-4 py-2 bg-[var(--accent-muted)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] border border-[var(--accent)]/30 font-mono font-bold text-xs uppercase tracking-widest rounded-full transition flex items-center gap-1.5"
                >
                  {runningId === pipe.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Run Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pipeline Config Modal */}
      <PipelineEditorModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        pipeline={selectedPipeline}
        onSave={loadPipelines}
      />

      {/* Content Queue Drawer/Modal */}
      {queueModalOpen && activePipelineForQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden text-[var(--text)] max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--border)] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[var(--surface-2)]">
              <div>
                <h3 className="font-['Space_Grotesk'] font-extrabold text-lg text-[var(--text)]">
                  Content Queue & Execution History — {activePipelineForQueue.name}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Hooks & Pillars awaiting AI generation or completed execution logs.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button disabled={queueLoading} onClick={() => handleOpenQueue(activePipelineForQueue)} className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs disabled:opacity-50">Refresh status</button>
                <button
                  onClick={() => setImportModalOpen(true)}
                  className="px-3.5 py-1.5 bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)] hover:text-white text-xs font-mono font-bold uppercase tracking-wider rounded-full transition flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV / JSON
                </button>
                {activePipelineForQueue.sheet_url && (
                  <button
                    onClick={() => handleSyncSheet(activePipelineForQueue)}
                    className="px-3.5 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white text-xs font-mono font-bold uppercase tracking-wider rounded-full transition flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Sync Sheet
                  </button>
                )}
                <button
                  onClick={() => setQueueModalOpen(false)}
                  className="p-2 text-[var(--muted)] hover:text-[var(--text)] rounded-xl hover:bg-[var(--surface-2)] transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="px-6 py-2 border-b border-[var(--border)] bg-[var(--bg)] flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
              {Object.keys(queueLabels).map((filter) => {
                const count = queueItems.filter((i) => filter === 'all' || i.status === filter).length;
                return (
                  <button
                    key={filter}
                    onClick={() => setQueueFilter(filter)}
                    className={`px-3 py-1 rounded-lg uppercase tracking-wider transition ${
                      queueFilter === filter
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
                    }`}
                  >
                    {queueLabels[filter]} ({count})
                  </button>
                );
              })}
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              {queueLoading ? (
                <div className="text-center py-10">
                  <div className="w-6 h-6 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin mx-auto" />
                </div>
              ) : queueItems.filter((i) => queueFilter === 'all' || i.status === queueFilter).length === 0 ? (
                <div className="text-center py-12 text-[var(--muted)] text-sm space-y-4">
                  <p>No {queueFilter !== 'all' ? queueFilter : ''} content queue items found.</p>
                  <button
                    onClick={() => setImportModalOpen(true)}
                    className="px-5 py-2.5 bg-[var(--accent)] text-white font-bold font-mono text-xs uppercase tracking-widest rounded-full hover:opacity-90 transition inline-flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import CSV / JSON File
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {queueItems
                    .filter((i) => queueFilter === 'all' || i.status === queueFilter)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-2xl space-y-3 text-xs shadow-sm hover:border-[var(--accent)]/40 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[var(--text)] text-sm">{item.title_hook}</span>
                          <div className="flex items-center gap-2">
                            {item.updated_at && (
                              <span className="text-[10px] text-[var(--muted)] font-mono">
                                {new Date(item.updated_at).toLocaleString()}
                              </span>
                            )}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                                item.status === 'published'
                                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                  : item.status === 'generating'
                                  ? 'bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/20'
                                  : item.status === 'failed'
                                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                  : 'bg-[var(--surface-2)] text-[var(--muted)]'
                              }`}
                            >
                              {queueLabels[item.status] || item.status}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[var(--muted)] bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)]/50">
                          <div><strong className="text-[var(--text)]">Pillar:</strong> {item.content_pillar || '—'}</div>
                          <div><strong className="text-[var(--text)]">Format:</strong> {item.format || '—'}</div>
                          <div><strong className="text-[var(--text)]">CTA:</strong> {item.cta || '—'}</div>
                          <div><strong className="text-[var(--text)]">Day:</strong> {item.day || '—'}</div>
                        </div>

                        {item.error_message && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 font-mono text-[11px] leading-relaxed">
                            <strong>{item.status === 'failed' ? 'Execution error:' : 'Run notice:'}</strong> {item.error_message}
                          </div>
                        )}

                        {(item.generated_caption || item.generated_image_url) && (
                          <div className="flex flex-col md:flex-row gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                            {item.generated_image_url && (
                              <div className="w-full md:w-32 h-32 flex-shrink-0 bg-black/20 rounded-lg overflow-hidden relative border border-[var(--border)]">
                                <img
                                  src={item.generated_image_url}
                                  alt="AI Banner"
                                  className="w-full h-full object-cover"
                                />
                                <a
                                  href={item.generated_image_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[9px] rounded font-mono"
                                >
                                  Open ↗
                                </a>
                              </div>
                            )}
                            {item.generated_caption && (
                              <div className="flex-1 text-[var(--text)] font-mono text-[11px] max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                {item.generated_caption}
                                {item.generated_hashtags && (
                                  <div className="text-[var(--accent)] mt-1 font-bold">
                                    {item.generated_hashtags}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import File Modal */}
      {activePipelineForQueue && (
        <ImportContentModal
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          pipelineId={activePipelineForQueue.id}
          onImportSuccess={() => handleOpenQueue(activePipelineForQueue)}
        />
      )}
    </div>
  );
}
