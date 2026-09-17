import React, { useState, useEffect } from 'react';
import { X, Sparkles, FileSpreadsheet, Bot, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPipeline, updatePipeline } from '../lib/pipelinesApi';
import { useWorkspace } from '@/features/workspace';
import API_BASE_URL from '@/shared/config';
import { supabase } from '@/shared/lib/supabase';

export default function PipelineEditorModal({ isOpen, onClose, pipeline, onSave }) {
  const { activeWorkspaceId } = useWorkspace();
  const [formData, setFormData] = useState({
    name: '',
    triggerTime: '09:30',
    provider: 'linkedin',
    targetPlatforms: ['linkedin'],
    sheetUrl: '',
    brandLogoText: 'Rahul Saini',
    autoPublish: true,
  });
  const [loading, setLoading] = useState(false);

  const [connectedProfiles, setConnectedProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  useEffect(() => {
    if (pipeline) {
      setFormData({
        name: pipeline.name || '',
        triggerTime: (pipeline.trigger_time || '09:30:00').slice(0, 5),
        provider: pipeline.provider || 'linkedin',
        targetPlatforms: pipeline.target_platforms || ['linkedin'],
        pageId: pipeline.page_id || '',
        sheetUrl: pipeline.sheet_url || '',
        brandLogoText: pipeline.brand_logo_text || 'Rahul Saini',
        autoPublish: pipeline.auto_publish ?? true,
      });
    } else {
      setFormData({
        name: 'Daily Tech & AI Auto-Poster',
        triggerTime: '09:30',
        provider: 'linkedin',
        targetPlatforms: ['linkedin'],
        pageId: '',
        sheetUrl: '',
        brandLogoText: 'Rahul Saini',
        autoPublish: true,
      });
    }

    if (isOpen && activeWorkspaceId) {
      setProfilesLoading(true);
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token;
        const headers = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeWorkspaceId ? { 'x-workspace-id': activeWorkspaceId } : {}),
          'ngrok-skip-browser-warning': 'true',
        };

        return Promise.all([
          fetch(`${API_BASE_URL}/api/meta/connection`, { headers }).then((r) => r.json()).catch(() => ({})),
          fetch(`${API_BASE_URL}/api/linkedin/connection`, { headers }).then((r) => r.json()).catch(() => ({})),
        ]);
      }).then(([metaData, liData]) => {
        const list = [];

        // Meta Pages & Instagram
        if (metaData?.connected && Array.isArray(metaData.pages)) {
          metaData.pages.forEach((page) => {
            const hasIg = Boolean(page.instagram_business_account);
            list.push({
              key: `meta-fb-${page.id}`,
              provider: 'meta',
              pageId: page.id,
              targetPlatforms: ['facebook'],
              label: `Facebook Page — ${page.name}`,
              subtitle: page.category || 'Facebook Page',
            });
            if (hasIg) {
              list.push({
                key: `meta-ig-${page.id}`,
                provider: 'meta',
                pageId: page.id,
                targetPlatforms: ['facebook', 'instagram'],
                label: `Facebook & Instagram — ${page.name} (@${page.instagram_business_account.username || 'ig'})`,
                subtitle: 'Facebook + Instagram Crosspost',
              });
            }
          });
        }

        // LinkedIn profiles & pages
        if (liData?.connected && Array.isArray(liData.actors)) {
          liData.actors.forEach((actor) => {
            list.push({
              key: `li-${actor.urn}`,
              provider: 'linkedin',
              pageId: actor.urn,
              targetPlatforms: ['linkedin'],
              label: `LinkedIn — ${actor.name} (${actor.type === 'org' ? 'Company Page' : 'Personal Profile'})`,
              subtitle: actor.type === 'org' ? 'LinkedIn Page' : 'LinkedIn Profile',
            });
          });
        }

        setConnectedProfiles(list);
      }).finally(() => {
        setProfilesLoading(false);
      });
    }
  }, [pipeline, isOpen, activeWorkspaceId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (pipeline?.id) {
        await updatePipeline(pipeline.id, formData, activeWorkspaceId);
        toast.success('Pipeline updated successfully!');
      } else {
        await createPipeline(formData, activeWorkspaceId);
        toast.success('AI Campaign Pipeline created!');
      }
      onSave();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save pipeline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden text-[var(--text)] transition-all">
        <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-2)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Space_Grotesk'] text-lg font-extrabold text-[var(--text)]">
                {pipeline ? 'Edit Automation Pipeline' : 'Create AI Content Pipeline'}
              </h2>
              <p className="text-xs text-[var(--muted)]">Configure posting schedule, platform, and content source</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--muted)] hover:text-[var(--text)] rounded-xl hover:bg-[var(--surface-2)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">
              Pipeline Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Daily Tech & AI Auto-Poster"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-sm text-[var(--text)] placeholder-[var(--muted-2)] focus:outline-none focus:border-[var(--accent)] transition"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">
                Daily Trigger Time
              </label>
              <input
                type="time"
                required
                value={formData.triggerTime}
                onChange={(e) => setFormData({ ...formData, triggerTime: e.target.value })}
                className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition"
              />
            </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">
              Target Social Profile & Platform
            </label>
            {profilesLoading ? (
              <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-xs text-[var(--muted)] flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
                Loading connected social accounts...
              </div>
            ) : connectedProfiles.length > 0 ? (
              <select
                value={
                  connectedProfiles.find(
                    (p) =>
                      p.provider === formData.provider &&
                      (p.pageId === formData.pageId || (!formData.pageId && p.provider === formData.provider))
                  )?.key || connectedProfiles[0]?.key || ''
                }
                onChange={(e) => {
                  const target = connectedProfiles.find((p) => p.key === e.target.value);
                  if (target) {
                    setFormData({
                      ...formData,
                      provider: target.provider,
                      pageId: target.pageId,
                      targetPlatforms: target.targetPlatforms,
                    });
                  }
                }}
                className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition font-medium"
              >
                {connectedProfiles.map((prof) => (
                  <option key={prof.key} value={prof.key}>
                    {prof.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <select
                  value={formData.provider}
                  onChange={(e) =>
                    setFormData({ ...formData, provider: e.target.value, targetPlatforms: [e.target.value] })
                  }
                  className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition"
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="meta">Facebook / Instagram</option>
                </select>
                <p className="text-[11px] text-amber-500">
                  ⚠️ Connect your accounts under Social Profiles to select specific pages.
                </p>
              </div>
            )}
          </div>
        </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              Google Sheet URL / ID (Optional Source)
            </label>
            <input
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/1OkFQCjLk..."
              value={formData.sheetUrl}
              onChange={(e) => setFormData({ ...formData, sheetUrl: e.target.value })}
              className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-sm text-[var(--text)] placeholder-[var(--muted-2)] focus:outline-none focus:border-[var(--accent)] transition"
            />
            <p className="text-[11px] text-[var(--muted)] mt-1">
              Optional. Or leave blank to import CSV/JSON files directly in the Content Queue.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              Brand Overlay Text
            </label>
            <input
              type="text"
              placeholder="Rahul Saini"
              value={formData.brandLogoText}
              onChange={(e) => setFormData({ ...formData, brandLogoText: e.target.value })}
              className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition"
            />
          </div>

          <div className="flex items-center gap-3 p-4 bg-[var(--bg)] border border-[var(--border)] rounded-2xl">
            <input
              type="checkbox"
              id="autoPublish"
              checked={formData.autoPublish}
              onChange={(e) => setFormData({ ...formData, autoPublish: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
            />
            <label htmlFor="autoPublish" className="text-xs font-medium text-[var(--text)] cursor-pointer">
              Auto-Publish Immediately (If unchecked, generated posts go to Approval Queue)
            </label>
          </div>

          <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full text-xs font-mono uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold font-mono text-xs uppercase tracking-wider rounded-full shadow-md transition flex items-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {pipeline ? 'Update Pipeline' : 'Create Pipeline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
