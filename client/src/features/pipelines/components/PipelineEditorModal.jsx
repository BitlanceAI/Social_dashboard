import React, { useState, useEffect } from 'react';
import { X, Sparkles, FileSpreadsheet, Bot, Send, RefreshCw, MessageSquare, Image } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPipeline, updatePipeline } from '../lib/pipelinesApi';
import { useWorkspace } from '@/features/workspace';
import API_BASE_URL from '@/shared/config';
import { supabase } from '@/shared/lib/supabase';

const DEFAULT_CAPTION_PROMPT = `You write engaging social media captions for a tech and AI automation brand.
Return ONLY a JSON object with two keys: "caption" (80-150 words, first-person, engaging hook, short readable paragraphs, ends with the CTA) and "hashtags" (5-8 relevant hashtags as one space-separated string).

Post Title: {{titleHook}}
Content Pillar: {{contentPillar}}
Caption Outline: {{captionOutline}}
Format: {{format}}
CTA: {{cta}}`;

const DEFAULT_IMAGE_PROMPT = `Professional, modern, minimal flat-design illustration for a social media post about: "{{titleHook}}". Theme: {{contentPillar}}. Style: clean tech/SaaS branding, dark navy and electric-blue accent palette, high contrast, 1:1 square composition. Include the text "{{brandLogoText}}" as a small logo-style wordmark in a corner, and work the phrase "{{titleHook}}" into the design as a short, bold headline overlay — clean sans-serif font, legible at thumbnail size.`;

export default function PipelineEditorModal({ isOpen, onClose, pipeline, onSave }) {
  const { activeWorkspaceId } = useWorkspace();
  const [formData, setFormData] = useState({
    name: '',
    triggerTime: '09:30',
    provider: 'linkedin',
    targetPlatforms: ['linkedin'],
    sheetUrl: '',
    brandLogoText: 'Rahul Saini',
    captionPromptTemplate: DEFAULT_CAPTION_PROMPT,
    imagePromptTemplate: DEFAULT_IMAGE_PROMPT,
    autoPublish: true,
    approverPhones: '',
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
        captionPromptTemplate: pipeline.caption_prompt_template || DEFAULT_CAPTION_PROMPT,
        imagePromptTemplate: pipeline.image_prompt_template || DEFAULT_IMAGE_PROMPT,
        autoPublish: pipeline.auto_publish ?? true,
        approverPhones: (pipeline.approver_phones || []).join(', '),
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
        captionPromptTemplate: DEFAULT_CAPTION_PROMPT,
        imagePromptTemplate: DEFAULT_IMAGE_PROMPT,
        autoPublish: true,
        approverPhones: '',
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
          fetch(`${API_BASE_URL}/api/instagram/connection`, { headers }).then((r) => r.json()).catch(() => ({})),
        ]);
      }).then(([metaData, liData, igData]) => {
        const list = [];
        if (igData?.connected && igData.isValid) {
          list.push({ key: igData.account.id, provider: 'instagram', pageId: igData.account.id,
            targetPlatforms: ['instagram'], label: `Instagram — @${igData.account.username}`,
            subtitle: 'Instagram · connected directly' });
        }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden text-[var(--text)] transition-all my-auto">
        <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-2)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Space_Grotesk'] text-lg font-extrabold text-[var(--text)]">
                {pipeline ? 'Edit Automation Pipeline' : 'Create AI Content Pipeline'}
              </h2>
              <p className="text-xs text-[var(--muted)]">Configure posting schedule, platform, and content prompts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--muted)] hover:text-[var(--text)] rounded-xl hover:bg-[var(--surface-2)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
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
                    <option value="instagram">Instagram (direct)</option>
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

          {/* AI Prompt Customization Section */}
          <div className="space-y-4 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-[var(--accent)] font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> AI Generation Prompts (Customizable)
              </span>
              <span className="text-[10px] text-[var(--muted)]">Edit prompts or use default templates</span>
            </div>

            {/* AI Caption Prompt */}
            <div className="p-4 bg-[var(--surface-2)]/60 border border-[var(--border)] rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                  AI Caption Prompt Template
                </label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, captionPromptTemplate: DEFAULT_CAPTION_PROMPT })}
                  className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] flex items-center gap-1 transition"
                  title="Reset to default caption prompt"
                >
                  <RefreshCw className="w-3 h-3" /> Reset Default
                </button>
              </div>
              <textarea
                rows={4}
                value={formData.captionPromptTemplate}
                onChange={(e) => setFormData({ ...formData, captionPromptTemplate: e.target.value })}
                className="w-full p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition leading-relaxed"
              />
              <div className="flex flex-wrap gap-1.5 items-center pt-1">
                <span className="text-[10px] text-[var(--muted)]">Insert tag:</span>
                {['{{titleHook}}', '{{contentPillar}}', '{{captionOutline}}', '{{format}}', '{{cta}}'].map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        captionPromptTemplate: formData.captionPromptTemplate + ' ' + tag,
                      })
                    }
                    className="px-2 py-0.5 text-[10px] font-mono bg-[var(--bg)] border border-[var(--border)] rounded-md hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Graphic Image Prompt */}
            <div className="p-4 bg-[var(--surface-2)]/60 border border-[var(--border)] rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5 text-emerald-500" />
                  AI Image Graphic Prompt Template
                </label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, imagePromptTemplate: DEFAULT_IMAGE_PROMPT })}
                  className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] flex items-center gap-1 transition"
                  title="Reset to default image prompt"
                >
                  <RefreshCw className="w-3 h-3" /> Reset Default
                </button>
              </div>
              <textarea
                rows={3}
                value={formData.imagePromptTemplate}
                onChange={(e) => setFormData({ ...formData, imagePromptTemplate: e.target.value })}
                className="w-full p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition leading-relaxed"
              />
              <div className="flex flex-wrap gap-1.5 items-center pt-1">
                <span className="text-[10px] text-[var(--muted)]">Insert tag:</span>
                {['{{titleHook}}', '{{contentPillar}}', '{{brandLogoText}}', '{{captionOutline}}', '{{caption}}'].map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        imagePromptTemplate: formData.imagePromptTemplate + ' ' + tag,
                      })
                    }
                    className="px-2 py-0.5 text-[10px] font-mono bg-[var(--bg)] border border-[var(--border)] rounded-md hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
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
              Auto-Publish Immediately (Uncheck to require approval before publishing)
            </label>
          </div>

          {!formData.autoPublish && (
            <div className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-2xl space-y-2">
              <label htmlFor="pipeline-approver-phones" className="block text-xs font-medium text-[var(--text)]">
                WhatsApp approval number(s)
              </label>
              <input
                id="pipeline-approver-phones"
                type="text"
                value={formData.approverPhones}
                onChange={(e) => setFormData({ ...formData, approverPhones: e.target.value })}
                placeholder="e.g. +919876543210"
                aria-describedby="pipeline-approver-help"
                className="w-full px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--text)] placeholder-[var(--muted-2)] focus:outline-none focus:border-[var(--accent)] transition"
              />
              <p id="pipeline-approver-help" className="text-[11px] text-[var(--muted)]">
                Include the country code. Separate multiple numbers with commas. Leave blank to use workspace default approvers.
                New posts will wait in the Approval Queue. WhatsApp requests require a configured WhatsApp connection.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3 shrink-0">
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
