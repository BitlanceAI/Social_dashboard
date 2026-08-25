import React, { useState, useRef, useEffect } from 'react';
import {
    Send,
    Calendar,
    Library,
    Users,
    Inbox,
    BarChart2,
    MessageSquare,
    HelpCircle,
    AlertCircle,
    MoreVertical,
    Plus,
    ChevronLeft,
    Rocket,
    TrendingUp,
    Facebook,
    Linkedin,
    Instagram,
    Edit2,
    Layers,
    Sparkles,
    CalendarCheck,
    Star,
    CalendarDays,
    X,
    ImageIcon,
    FileText,
    Film,
    Paperclip,
    MessageCircle,
    Link2,
    Copy,
    Check,
    ExternalLink,
    LogOut,
    Loader2,
    Download,
    Eye,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock,
    Palette,
    Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.webp';
import API_BASE_URL from '../../config.js';
import { supabase } from '../../services/supabaseClient';
import WorkspaceSwitcher from '../../components/workspace/WorkspaceSwitcher';
import CalendarView from '../../components/social/CalendarView';
import AITemplatesView from '../../components/social/AITemplatesView';
import CreateWithAIView from '../../components/social/CreateWithAIView';
import PlanWeeklyAIView from '../../components/social/PlanWeeklyAIView';
import SpecialDaysAIView from '../../components/social/SpecialDaysAIView';
import TwitterThreadBuilderView from '../../components/social/TwitterThreadBuilderView';
import UploadCSVView from '../../components/social/UploadCSVView';
import InboxView from '../../components/social/InboxView';

const XIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

// ─── Inline Graphics AI View ─────────────────────────────────────────────────
const GraphicsAIView = () => {
    const { user, credits, isAdmin, refreshCredits } = useAuth();
    const [promptText, setPromptText] = useState('');
    const [imageSize, setImageSize] = useState('1024x1024');
    const [imageQuality, setImageQuality] = useState('low');
    const [loading, setLoading] = useState(false);
    const [jobs, setJobs] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [previewJob, setPreviewJob] = useState(null);
    const [activeTab, setActiveTab] = useState('create');
    const [filter, setFilter] = useState('all');
    const COST = 5;

    const getToken = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token;
    };

    const fetchJobs = async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const res = await fetch(`${API_BASE_URL}/api/design/jobs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setJobs(data.jobs || []);
            }
        } catch { /* non-critical */ }
    };

    useEffect(() => {
        fetchJobs();
        const iv = setInterval(fetchJobs, 30000);
        return () => clearInterval(iv);
    }, []);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchJobs();
        await refreshCredits();
        setTimeout(() => setRefreshing(false), 600);
    };

    const forceDownload = async (url, filename) => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl; a.download = filename || 'design.png';
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); window.URL.revokeObjectURL(blobUrl);
        } catch { window.open(url, '_blank'); }
    };

    const handleGenerate = async () => {
        if (!promptText.trim()) return;
        if (credits < COST && !isAdmin) {
            alert(`You need ${COST} credits to generate an image.`);
            return;
        }
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            const res = await fetch(`${API_BASE_URL}/api/design/generate-from-prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ prompt: promptText, image_size: imageSize, image_quality: imageQuality })
            });
            const data = await res.json();
            if (res.ok) {
                setPromptText('');
                setActiveTab('history');
                refreshCredits();
                fetchJobs();
            } else {
                alert(data.error || 'Failed to generate image');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const getStatusConfig = (status) => ({
        pending:    { icon: Clock,         color: 'text-amber-500',   bg: 'bg-amber-500/10',   label: 'Pending' },
        processing: { icon: Loader2,       color: 'text-blue-500',    bg: 'bg-blue-500/10',    label: 'Processing', animate: true },
        completed:  { icon: CheckCircle2,  color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Completed' },
        failed:     { icon: XCircle,       color: 'text-red-500',     bg: 'bg-red-500/10',     label: 'Failed' },
    }[status] || { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10', label: status });

    const filtered = jobs.filter(j => filter === 'all' || j.status === filter);

    return (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-8 pt-8 pb-4 border-b border-slate-200 flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-[#26cece]/10 border border-[#26cece]/30">
                    <Palette className="w-6 h-6 text-[#26cece]" />
                </div>
                <div>
                    <h2 className="text-xl font-bold font-['Space_Grotesk'] text-slate-900 uppercase tracking-tight">Graphics AI Agent</h2>
                    <p className="text-[11px] font-mono text-gray-500 uppercase tracking-widest mt-0.5">Generate hyper-realistic visuals from a prompt</p>
                </div>
                <div className="ml-auto flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-[2px]">
                    <Zap className="w-3.5 h-3.5 text-[#26cece]" />
                    <span className="font-mono text-[12px] text-slate-900">{credits?.toLocaleString() || 0} <span className="text-gray-500">cr</span></span>
                </div>
            </div>

            {/* Tabs */}
            <div className="shrink-0 flex gap-0 border-b border-slate-200 px-8">
                {['create', 'history'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                        className={`px-5 py-3 font-mono text-[12px] uppercase tracking-widest border-b-2 transition-colors ${
                            activeTab === t
                                ? 'border-[#26cece] text-[#26cece]'
                                : 'border-transparent text-gray-500 hover:text-slate-900'
                        }`}>
                        {t === 'create' ? 'Create' : `Gallery (${jobs.length})`}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                {activeTab === 'create' ? (
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Prompt */}
                        <div className="bg-slate-50 border border-slate-200 rounded-[2px] p-6 space-y-4 shadow-[0_2px_16px_0_rgba(0,0,0,0.4)]">
                            <h3 className="text-[13px] font-mono uppercase tracking-widest text-[#26cece] flex items-center gap-2">
                                <Sparkles className="w-4 h-4" /> Custom Design Prompt
                            </h3>
                            <textarea
                                value={promptText}
                                onChange={e => setPromptText(e.target.value)}
                                placeholder="Describe your concept in detail — e.g. A hyper-realistic 8K luxury beachfront villa at sunset with infinity pool..."
                                rows={7}
                                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-gray-600 rounded-[2px] p-4 text-[14px] font-sans focus:outline-none focus:border-[#26cece] transition-colors resize-none"
                            />
                            {/* Settings row */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-mono uppercase tracking-widest text-gray-500 mb-1.5">Dimensions</label>
                                    <select value={imageSize} onChange={e => setImageSize(e.target.value)}
                                        className="w-full bg-white border border-slate-200 text-slate-900 rounded-[2px] px-3 py-2.5 text-[13px] font-mono focus:outline-none focus:border-[#26cece] transition-colors">
                                        <option value="512x512">512 × 512</option>
                                        <option value="1024x1024">1024 × 1024</option>
                                        <option value="1536x1024">1536 × 1024</option>
                                        <option value="1024x1536">1024 × 1536</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-mono uppercase tracking-widest text-gray-500 mb-1.5">Quality</label>
                                    <select value={imageQuality} onChange={e => setImageQuality(e.target.value)}
                                        className="w-full bg-white border border-slate-200 text-slate-900 rounded-[2px] px-3 py-2.5 text-[13px] font-mono focus:outline-none focus:border-[#26cece] transition-colors">
                                        <option value="low">Low (Fast)</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High (Detailed)</option>
                                        <option value="auto">Auto</option>
                                    </select>
                                </div>
                            </div>
                            <button
                                onClick={handleGenerate}
                                disabled={loading || !promptText.trim() || (credits < COST && !isAdmin)}
                                className="w-full flex items-center justify-center gap-2 bg-[#26cece] text-[#070707] font-bold font-['Space_Grotesk'] uppercase tracking-widest py-3.5 rounded-[2px] hover:bg-white hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#333] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                                ) : (
                                    <><Sparkles className="w-4 h-4" /> Generate Image ({COST} cr)</>
                                )}
                            </button>
                        </div>
                        <p className="text-[11px] font-mono text-gray-600 text-center">Image generation is processed asynchronously. Check the Gallery tab for results.</p>
                    </div>
                ) : (
                    <div className="max-w-5xl mx-auto space-y-6">
                        {/* Filters + refresh */}
                        <div className="flex flex-wrap items-center gap-3">
                            {['all', 'completed', 'processing', 'pending', 'failed'].map(s => (
                                <button key={s} onClick={() => setFilter(s)}
                                    className={`px-4 py-2 rounded-[2px] font-mono text-[11px] uppercase tracking-widest border transition-all ${
                                        filter === s
                                            ? 'bg-[#26cece] text-[#070707] border-[#26cece]'
                                            : 'bg-slate-50 border-slate-200 text-gray-400 hover:text-slate-900 hover:border-[#555]'
                                    }`}>
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                            ))}
                            <button onClick={handleRefresh} className="ml-auto p-2.5 bg-slate-50 border border-slate-200 rounded-[2px] text-gray-400 hover:text-[#26cece] hover:border-[#26cece] transition-colors">
                                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#26cece]' : ''}`} />
                            </button>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 bg-slate-50 border border-slate-200 rounded-[2px]">
                                <ImageIcon className="w-12 h-12 text-[#26cece]/30 mb-4" />
                                <p className="font-mono text-gray-500 uppercase tracking-widest text-[12px]">No images yet. Create one above.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {filtered.flatMap(job => {
                                    const cfg = getStatusConfig(job.status);
                                    const StatusIcon = cfg.icon;
                                    if (job.status !== 'completed' || (!job.flyer_url && !job.metadata?.flyer_urls)) {
                                        return [(
                                            <div key={job.id} className="bg-slate-50 border border-slate-200 rounded-[2px] overflow-hidden">
                                                <div className="aspect-[4/3] flex flex-col items-center justify-center bg-white">
                                                    <StatusIcon className={`w-10 h-10 mb-2 ${cfg.color} ${cfg.animate ? 'animate-spin' : ''}`} />
                                                    <span className={`font-mono text-[11px] uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
                                                </div>
                                                <div className="p-4 border-t border-slate-200">
                                                    <p className="font-mono text-[12px] text-gray-400 line-clamp-2">{job.prompt || job.property_type || 'Custom Design'}</p>
                                                    <p className="font-mono text-[10px] text-gray-600 mt-1 uppercase tracking-widest">{new Date(job.created_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        )];
                                    }
                                    const urls = job.metadata?.flyer_urls || [job.flyer_url];
                                    return urls.map((url, idx) => (
                                        <div key={`${job.id}-${idx}`} className="group bg-slate-50 border border-slate-200 rounded-[2px] overflow-hidden hover:border-[#26cece] hover:shadow-[0_2px_16px_0_rgba(0,0,0,0.4)] transition-all duration-300">
                                            <div className="relative aspect-[4/3] bg-white overflow-hidden">
                                                <img src={url} alt="Generated" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                                <div className="absolute bottom-3 left-3 right-3 flex gap-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                                                    <button onClick={() => setPreviewJob({ ...job, _previewUrl: url })}
                                                        className="flex-1 bg-white/20 backdrop-blur-md text-slate-900 py-2 rounded-[2px] text-[11px] font-mono uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-white/30 transition-colors">
                                                        <Eye className="w-3.5 h-3.5" /> View
                                                    </button>
                                                    <button onClick={() => forceDownload(url, `design_${idx + 1}.png`)}
                                                        className="flex-1 bg-[#26cece] text-[#070707] py-2 rounded-[2px] text-[11px] font-mono uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-white transition-colors">
                                                        <Download className="w-3.5 h-3.5" /> Save
                                                    </button>
                                                </div>
                                                {urls.length > 1 && (
                                                    <div className="absolute top-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-[2px] font-mono text-[10px] text-slate-900 uppercase tracking-widest">Var {idx + 1}</div>
                                                )}
                                            </div>
                                            <div className="p-4 border-t border-slate-200">
                                                <p className="font-mono text-[12px] text-gray-300 line-clamp-2">{job.prompt || job.property_type || 'Custom Design'}</p>
                                                <p className="font-mono text-[10px] text-gray-600 mt-1 uppercase tracking-widest">{new Date(job.created_at).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    ));
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Preview Modal */}
            {previewJob && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={() => setPreviewJob(null)}>
                    <div className="relative max-w-4xl w-full bg-slate-50 border border-slate-200 rounded-[2px] shadow-[0_4px_24px_0_rgba(0,0,0,0.5)] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="font-bold font-['Space_Grotesk'] text-slate-900 uppercase tracking-tight">Preview</h3>
                            <button onClick={() => setPreviewJob(null)} className="p-2 text-gray-400 hover:text-slate-900 border border-transparent hover:border-slate-200 rounded-[2px] transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 bg-black/40 flex flex-col items-center gap-5">
                            <img src={previewJob._previewUrl} alt="Preview" className="max-h-[65vh] w-full object-contain rounded-[2px] ring-1 ring-white/10" />
                            <button onClick={() => forceDownload(previewJob._previewUrl, 'design.png')}
                                className="flex items-center gap-2 bg-[#26cece] text-[#070707] font-bold font-['Space_Grotesk'] uppercase tracking-widest px-8 py-3 rounded-[2px] hover:bg-white transition-colors">
                                <Download className="w-4 h-4" /> Download
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SocialDashboard = () => {
    const { user, session } = useAuth();
    const { workspaceHeaders, loading: workspaceLoading, activeWorkspace } = useWorkspace();
    const navigate = useNavigate();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
    const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
    const [isAddProfileModalOpen, setIsAddProfileModalOpen] = useState(false);
    const [connectedProfiles, setConnectedProfiles] = useState([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
    const [activeView, setActiveView] = useState('share'); // 'share' or 'profiles'

    // Post composer state
    const [postText, setPostText] = useState('');
    const [selectedProfileIds, setSelectedProfileIds] = useState([]);
    const [postVisibility, setPostVisibility] = useState('PUBLIC');
    const [isPosting, setIsPosting] = useState(false);
    const [postStatus, setPostStatus] = useState(null); // { type: 'success'|'error', message: string }
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewStep, setPreviewStep] = useState(1); // 1 = platform select, 2 = preview
    const [postTargets, setPostTargets] = useState([]); // profiles chosen in step 1

    // WhatsApp share (Step 1 optional section)
    const [waShare, setWaShare] = useState({ enabled: false, mode: 'link', phone: '', sending: false, sent: false, copied: false, opened: false, error: null });
    // Media attachment: { file: File, preview: string|null, mediaCategory: 'IMAGE'|'VIDEO'|'DOCUMENT' }
    const [mediaAttachment, setMediaAttachment] = useState(null);
    const fileInputRef = useRef(null);

    // Recent posts
    const [recentPosts, setRecentPosts] = useState([]);
    const [stats, setStats] = useState(null);
    const [statsDays, setStatsDays] = useState(7);

    // AI Write
    const [isAiWriteOpen, setIsAiWriteOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiTone, setAiTone] = useState('professional');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);

    // Graphics AI Picker
    const [isGraphicsPickerOpen, setIsGraphicsPickerOpen] = useState(false);
    const [graphicsJobs, setGraphicsJobs] = useState([]);
    const [graphicsLoading, setGraphicsLoading] = useState(false);

    // Trending Keywords
    const [isTrendingModalOpen, setIsTrendingModalOpen] = useState(false);
    const [trendingTopics, setTrendingTopics] = useState([]);
    const [isTrendingLoading, setIsTrendingLoading] = useState(false);
    const [trendingNiche, setTrendingNiche] = useState('technology');

    const authToken = session?.access_token;

    // Fetch existing connections and handle OAuth callback
    React.useEffect(() => {
        if (!authToken || workspaceLoading) return;

        // Build headers inline — avoids any stale closure on workspaceHeaders
        const wsId = activeWorkspace?.id ?? null;
        const authHeaders = {
            'Authorization': `Bearer ${authToken}`,
            ...(wsId ? { 'x-workspace-id': wsId } : {})
        };

        const fetchConnections = async () => {
            try {
                const [liRes, twRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/linkedin/connection`, { headers: authHeaders }),
                    fetch(`${API_BASE_URL}/api/twitter/connection`, { headers: authHeaders }),
                ]);
                const [liData, twData] = await Promise.all([liRes.json(), twRes.json()]);

                const profiles = [];

                if (liData.connected && liData.profiles?.length > 0) {
                    profiles.push(...liData.profiles.map(p => ({
                        platform: 'linkedin',
                        profileId: p.profileId,
                        name: p.name,
                        type: 'LinkedIn Profile',
                        followers: 'Connected',
                        avatar: p.profilePicture,
                    })));
                }

                if (twData.connected && twData.profiles?.length > 0) {
                    profiles.push(...twData.profiles.map(p => ({
                        platform: 'twitter',
                        profileId: p.twitterUserId,
                        twitterUserId: p.twitterUserId,
                        name: p.name,
                        type: '@' + p.username,
                        followers: 'Connected',
                        avatar: p.profilePicture,
                    })));
                }

                setConnectedProfiles(profiles);
            } catch (error) {
                console.error('Error fetching connections:', error);
            } finally {
                setIsLoadingProfiles(false);
            }
        };

        const fetchRecentPosts = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/linkedin/posts?limit=5`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const data = await res.json();
                if (data.success) setRecentPosts(data.posts);
            } catch { /* non-critical */ }
        };

        const fetchStats = async (days = 7) => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/linkedin/stats?days=${days}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const data = await res.json();
                if (data.success) setStats(data.stats);
            } catch { /* non-critical */ }
        };
        window._fetchLinkedInStats = fetchStats;
        fetchStats(7);

        const handleOAuthCallback = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const state = urlParams.get('state');

            if (code && state && state.startsWith('linkedin_connect')) {
                window.history.replaceState({}, document.title, window.location.pathname);
                setIsLoadingProfiles(true);

                try {
                    const response = await fetch(`${API_BASE_URL}/api/linkedin/connect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        body: JSON.stringify({ code })
                    });
                    const data = await response.json();
                    if (data.success) {
                        await fetchConnections();
                        setIsAddProfileModalOpen(false);
                    } else {
                        alert(`LinkedIn Connection Failed: ${data.error}`);
                        fetchConnections();
                    }
                } catch (error) {
                    console.error('Error connecting linkedin:', error);
                    alert('Error connecting LinkedIn account');
                    fetchConnections();
                }
            } else if (code && state && state.startsWith('twitter_connect')) {
                window.history.replaceState({}, document.title, window.location.pathname);
                setIsLoadingProfiles(true);

                try {
                    const response = await fetch(`${API_BASE_URL}/api/twitter/connect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        body: JSON.stringify({ code, state })
                    });
                    const data = await response.json();
                    if (data.success) {
                        await fetchConnections();
                        setIsAddProfileModalOpen(false);
                    } else {
                        alert(`Twitter Connection Failed: ${data.error}`);
                        fetchConnections();
                    }
                } catch (error) {
                    console.error('Error connecting twitter:', error);
                    alert('Error connecting Twitter/X account');
                    fetchConnections();
                }
            } else {
                fetchConnections();
            }
        };

        handleOAuthCallback();
        fetchRecentPosts();
    }, [authToken, workspaceLoading, activeWorkspace?.id]);

    // Clear profiles instantly when workspace changes so stale data doesn't linger
    React.useEffect(() => {
        setConnectedProfiles([]);
        setSelectedProfileIds([]);
    }, [activeWorkspace?.id]);

    // Default all connected profiles as post targets when they load
    React.useEffect(() => {
        setPostTargets(connectedProfiles);
    }, [connectedProfiles]);

    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

    const linkedinProfiles = connectedProfiles.filter(p => p.platform === 'linkedin');

    const toggleProfileSelection = (profileId) => {
        setSelectedProfileIds(prev =>
            prev.includes(profileId) ? prev.filter(id => id !== profileId) : [...prev, profileId]
        );
    };

    const togglePostTarget = (profile) => {
        const key = profile.profileId || profile.name;
        setPostTargets(prev => {
            const exists = prev.find(p => (p.profileId || p.name) === key);
            return exists ? prev.filter(p => (p.profileId || p.name) !== key) : [...prev, profile];
        });
    };

    const isPostTarget = (profile) => {
        const key = profile.profileId || profile.name;
        return postTargets.some(p => (p.profileId || p.name) === key);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        let mediaCategory = 'IMAGE';
        if (file.type.startsWith('video/')) mediaCategory = 'VIDEO';
        else if (file.type === 'application/pdf') mediaCategory = 'DOCUMENT';

        const preview = (mediaCategory === 'IMAGE') ? URL.createObjectURL(file) : null;
        setMediaAttachment({ file, preview, mediaCategory });
        // reset input so same file can be re-selected
        e.target.value = '';
    };

    const removeAttachment = () => {
        if (mediaAttachment?.preview) URL.revokeObjectURL(mediaAttachment.preview);
        setMediaAttachment(null);
    };

    const handleAiWrite = async () => {
        if (!aiPrompt.trim() && !postText.trim()) return;
        setIsAiLoading(true);
        setAiError(null);
        try {
            const body = aiPrompt.trim()
                ? { prompt: aiPrompt, tone: aiTone }
                : { existingText: postText, tone: aiTone };

            const res = await fetch(`${API_BASE_URL}/api/linkedin/ai-write`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'AI write failed');
            setPostText(data.text);
            setIsAiWriteOpen(false);
            setAiPrompt('');
        } catch (err) {
            setAiError(err.message);
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleFetchTrending = async () => {
        setIsTrendingLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/linkedin/trending-keywords`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ niche: trendingNiche }),
            });
            const data = await res.json();
            if (data.success) {
                setTrendingTopics(data.topics || []);
            } else {
                alert(data.error || 'Failed to fetch trending keywords');
            }
        } catch (err) {
            alert('Error fetching trending keywords: ' + err.message);
        } finally {
            setIsTrendingLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!postText.trim()) return;
        const liTargets = postTargets.filter(p => p.platform === 'linkedin');
        const twTargets = postTargets.filter(p => p.platform === 'twitter');

        if (liTargets.length === 0 && twTargets.length === 0) {
            setPostStatus({ type: 'error', message: 'No profile selected.' });
            return;
        }

        setIsPosting(true);
        setPostStatus(null);

        try {
            const results = await Promise.all([
                // LinkedIn posts (with optional media upload)
                ...liTargets.map(async (profile) => {
                    let assetUrn = null;
                    let mediaCategory = null;

                    if (mediaAttachment) {
                        const formData = new FormData();
                        formData.append('file', mediaAttachment.file);
                        formData.append('profileId', profile.profileId);
                        formData.append('mediaCategory', mediaAttachment.mediaCategory);

                        const uploadRes = await fetch(`${API_BASE_URL}/api/linkedin/upload-media`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${authToken}`, ...workspaceHeaders },
                            body: formData,
                        }).then(r => r.json());

                        if (!uploadRes.success) return { success: false, error: uploadRes.error };
                        assetUrn = uploadRes.assetUrn;
                        mediaCategory = uploadRes.mediaCategory;
                    }

                    return fetch(`${API_BASE_URL}/api/linkedin/post`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`, ...workspaceHeaders },
                        body: JSON.stringify({ profileId: profile.profileId, text: postText, visibility: postVisibility, assetUrn, mediaCategory, title: mediaAttachment?.file?.name }),
                    }).then(r => r.json());
                }),
                // Twitter posts (text only, max 280 chars)
                ...twTargets.map(profile =>
                    fetch(`${API_BASE_URL}/api/twitter/post`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`, ...workspaceHeaders },
                        body: JSON.stringify({ twitterUserId: profile.twitterUserId, text: postText }),
                    }).then(r => r.json())
                ),
            ]);

            setIsPosting(false);

            const failed = results.filter(r => !r.success);
            if (failed.length === 0) {
                const total = postTargets.length;
                setPostStatus({ type: 'success', message: `Post published to ${total} profile${total > 1 ? 's' : ''}!` });
                setPostText('');
                setSelectedProfileIds([]);
                removeAttachment();
                if (liTargets.length > 0) {
                    fetch(`${API_BASE_URL}/api/linkedin/posts?limit=5`, { headers: { 'Authorization': `Bearer ${authToken}` } })
                        .then(r => r.json()).then(d => { if (d.success) setRecentPosts(d.posts); }).catch(() => {});
                }
                setTimeout(() => { setIsPreviewOpen(false); setPostStatus(null); }, 1800);
            } else {
                setPostStatus({ type: 'error', message: failed[0].error || 'Failed to publish post.' });
            }
        } catch (err) {
            setIsPosting(false);
            setPostStatus({ type: 'error', message: err.message || 'Unexpected error.' });
        }
    };

    const sidebarItems = [
        { icon: Send, label: 'Share a post', view: 'share', path: '/dashboard' },
        { icon: Calendar, label: 'Calendar', view: 'calendar', path: '#' },
        { icon: Library, label: 'Libraries', view: null, path: '#' },
        { icon: Users, label: 'Social profiles', view: 'profiles', path: '#' },
        { icon: Inbox, label: 'Inbox', view: 'inbox', path: '#' },
        { icon: BarChart2, label: 'Reports', view: null, path: '#' },
        { icon: MessageSquare, label: 'DM automations', view: null, path: '#' },
    ];

    const shareMenuItems = [
        { id: 'share', icon: Edit2, label: 'Create a Post Manually' },
        { id: 'upload_csv', icon: Layers, label: 'Upload CSV file' },
        { divider: true },
        { id: 'create_ai', icon: Sparkles, label: 'Create a Post with AI' },
        { id: 'plan_weekly', icon: CalendarCheck, label: 'Plan Weekly Posts with AI' },
        { id: 'ai_templates', icon: Star, label: 'Use AI Templates' },
        { id: 'special_days', icon: CalendarDays, label: 'Special Days Posts (AI)' },
        { divider: true },
        { id: 'twitter_thread', icon: XIcon, label: 'X (Twitter) Thread Builder' },
    ];

    const libraryMenuItems = [
        { id: 'graphics_ai', icon: ImageIcon, label: 'Graphics AI Agent' },
    ];

    const bottomItems = [
        { icon: HelpCircle, label: 'Help', path: '#' },
        { icon: AlertCircle, label: 'Report an Issue', path: '#' },
    ];

    // ─── Disconnect a profile ────────────────────────────────────────────────
    const handleDisconnect = async (profile) => {
        if (!confirm(`Disconnect ${profile.name}?`)) return;
        try {
            const endpoint = profile.platform === 'twitter'
                ? `${API_BASE_URL}/api/twitter/disconnect/${profile.twitterUserId}`
                : `${API_BASE_URL}/api/linkedin/disconnect/${profile.profileId}`;
            await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}`, ...workspaceHeaders } });
            setConnectedProfiles(prev => prev.filter(p => p.profileId !== profile.profileId));
        } catch (err) {
            console.error('Disconnect error:', err);
        }
    };

    // ─── Reusable profile card (list style, used in Profiles view) ───────────
    const ProfileListCard = ({ profile }) => (
        <div className="bg-slate-50 border border-slate-200 rounded-[2px] p-5 flex items-center gap-5 hover:-translate-y-1 hover:shadow-[0_2px_16px_0_rgba(0,0,0,0.4)] hover:border-slate-200 transition-all duration-300">
            <div className="relative">
                {profile.avatar ? (
                    <img src={profile.avatar} alt={profile.name} className="w-14 h-14 rounded-[2px] object-cover border-2 border-slate-200" />
                ) : (
                    <div className="w-14 h-14 rounded-[2px] bg-white flex items-center justify-center text-xl font-bold font-mono text-gray-400 border-2 border-slate-200">
                        {profile.name?.charAt(0)}
                    </div>
                )}
                <div className={`absolute -bottom-2 -right-2 w-6 h-6 rounded-[2px] flex items-center justify-center text-[#070707] shadow-md border-2 border-[#111111] ${profile.platform === 'linkedin' ? 'bg-[#26cece]' : profile.platform === 'twitter' ? 'bg-white' : 'bg-[#26cece]'}`}>
                    {profile.platform === 'linkedin' ? <Linkedin className="w-3 h-3 fill-current" /> : profile.platform === 'twitter' ? <XIcon className="w-3 h-3" /> : <Facebook className="w-3 h-3 fill-current" />}
                </div>
            </div>
            <div className="flex-1">
                <h3 className="text-slate-900 font-bold font-['Space_Grotesk'] text-[16px] tracking-tight">{profile.name}</h3>
                <p className="text-gray-500 font-mono text-[11px] uppercase tracking-widest mt-0.5">{profile.type}</p>
                <div className="flex items-center gap-4 mt-2">
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 font-mono flex items-center gap-1.5 bg-white border border-slate-200 rounded-[2px] px-2.5 py-1">
                        {profile.platform === 'linkedin' ? <Linkedin className="w-3 h-3" /> : profile.platform === 'twitter' ? <XIcon className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                        {profile.followers}
                    </span>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-[#26cece] flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#26cece]"></div>
                        Active
                    </span>
                </div>
            </div>
            <button onClick={() => handleDisconnect(profile)} className="text-gray-500 hover:text-red-400 p-2 transition-colors cursor-pointer rounded-[2px] border border-transparent hover:border-red-400 hover:bg-red-400/10" title="Disconnect">
                <LogOut className="w-4 h-4" />
            </button>
        </div>
    );

    // ─── Reusable profile card (grid style, used in Share/dashboard view) ────
    const ProfileGridCard = ({ profile }) => (
        <div className="bg-slate-50 border border-slate-200 rounded-[2px] p-5 flex items-start gap-4 hover:-translate-y-1 hover:shadow-[0_2px_16px_0_rgba(0,0,0,0.4)] hover:border-slate-200 transition-all duration-300">
            <div className="relative">
                <div className="w-12 h-12 rounded-[2px] bg-white overflow-hidden shadow-sm flex items-center justify-center text-lg font-bold font-mono text-gray-400 border border-slate-200">
                    {profile.avatar
                        ? <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
                        : profile.name.charAt(0)
                    }
                </div>
                <div className={`absolute -bottom-2 -right-2 w-5 h-5 rounded-[2px] flex items-center justify-center text-[#070707] shadow-md border-2 border-[#111111] ${profile.platform === 'linkedin' ? 'bg-[#26cece]' : profile.platform === 'twitter' ? 'bg-white' : 'bg-[#26cece]'}`}>
                    {profile.platform === 'linkedin' ? <Linkedin className="w-2.5 h-2.5 fill-current" /> : profile.platform === 'twitter' ? <XIcon className="w-2.5 h-2.5" /> : <Facebook className="w-2.5 h-2.5 fill-current" />}
                </div>
            </div>
            <div className="flex-1 overflow-hidden">
                <h3 className="text-slate-900 font-bold font-['Space_Grotesk'] text-[15px] truncate tracking-tight">{profile.name}</h3>
                <p className="text-gray-500 font-mono uppercase tracking-widest text-[10px] mt-0.5">{profile.type}</p>
                <div className="flex items-center gap-3 mt-3">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-gray-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#26cece]" /> {profile.followers}
                    </span>
                </div>
            </div>
            <button onClick={() => handleDisconnect(profile)} className="text-gray-500 hover:text-red-400 p-1 ml-auto shrink-0 transition-colors cursor-pointer border border-transparent rounded-[2px] hover:border-red-400 hover:bg-red-400/10" title="Disconnect">
                <LogOut className="w-4 h-4" />
            </button>
        </div>
    );

    // ─── Shared empty-state illustration ────────────────────────────────────
    const EmptyIllustration = () => (
        <div className="relative w-[340px] h-[240px] mb-8 flex justify-center items-center">
            <div className="absolute top-4 right-14 w-10 h-10 bg-blue-900/30 text-blue-400 rounded-[10px] flex items-center justify-center transform rotate-[15deg] shadow-sm z-10">
                <Facebook className="w-[20px] h-[20px]" />
            </div>
            <div className="absolute top-16 left-12 w-9 h-9 bg-pink-900/30 text-pink-400 rounded-full flex items-center justify-center transform -rotate-[15deg] shadow-sm z-10">
                <Instagram className="w-[18px] h-[18px]" />
            </div>
            <div className="absolute bottom-16 right-6 w-9 h-9 bg-blue-900/30 text-blue-400 rounded-[8px] flex items-center justify-center shadow-sm z-10 scale-90 rotate-[-5deg]">
                <Linkedin className="w-[18px] h-[18px]" />
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-24 h-24 text-indigo-500 flex items-center justify-center z-20 drop-shadow-2xl">
                <Rocket className="w-20 h-20 fill-current" />
            </div>
            <div className="absolute top-[22%] left-0 -translate-x-4 w-[120px] h-[68px] bg-slate-900 border border-slate-800 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-3 flex flex-col z-20">
                <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5 tracking-wider">Conversions</div>
                <div className="text-[16px] text-indigo-400 font-extrabold flex items-center"><TrendingUp className="w-3.5 h-3.5 mr-1" /> 251K</div>
                <div className="mt-1.5 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="w-[65%] bg-indigo-500 h-full rounded-full"></div>
                </div>
            </div>
            <div className="absolute bottom-6 right-6 w-[140px] h-[76px] bg-slate-900 border border-slate-800 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-3.5 flex flex-col z-20">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Result</span>
                    <span className="text-[13px] text-emerald-400 font-extrabold flex items-center"><TrendingUp className="w-3 h-3 mr-0.5" /> 450K</span>
                </div>
                <div className="flex-1 w-full bg-slate-800/50 rounded mt-1.5 relative overflow-hidden flex items-end">
                    <div className="w-full h-[65%] bg-emerald-500 rounded-t-[3px] border-t border-emerald-400"></div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-screen font-sans overflow-hidden bg-white">
            <div className="flex flex-1 overflow-hidden">

                {/* ── Sidebar ─────────────────────────────────────────────── */}
                <aside className={`flex flex-col bg-slate-50 border-r border-slate-200 transition-all duration-300 relative ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>

                    {/* Logo */}
                    <div className="h-16 flex items-center px-4 border-b border-slate-200 mt-2">
                        {!isSidebarCollapsed ? (
                            <div className="flex items-center gap-2 group">
                                <img
                                    src={Logo}
                                    alt="Bitlance.ai"
                                    className="h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.parentElement.innerHTML = '<span class="text-xl font-bold text-indigo-400">Bitlance</span>';
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center w-full">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                                    <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* Nav items */}
                    <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3" style={{ overflow: 'visible' }}>
                        {sidebarItems.map((item, index) => (
                            <div key={index} className="relative">
                                <button
                                    onClick={() => {
                                        if (item.label === 'Share a post') {
                                            setIsShareMenuOpen(!isShareMenuOpen);
                                            setIsLibraryMenuOpen(false);
                                            setActiveView('share');
                                        } else if (item.label === 'Libraries') {
                                            setIsLibraryMenuOpen(!isLibraryMenuOpen);
                                            setIsShareMenuOpen(false);
                                        } else if (item.view) {
                                            setActiveView(item.view);
                                            setIsShareMenuOpen(false);
                                            setIsLibraryMenuOpen(false);
                                        } else if (item.path !== '#') {
                                            navigate(item.path);
                                            setIsShareMenuOpen(false);
                                            setIsLibraryMenuOpen(false);
                                        }
                                    }}
                                    className={`flex items-center w-full px-3 py-2.5 rounded-[2px] font-mono text-[12px] uppercase tracking-wider transition-colors ${item.view && activeView === item.view
                                        ? 'bg-[#26cece]/10 text-[#26cece] border-l-2 border-[#26cece]'
                                        : 'text-gray-400 hover:bg-[#1E1E1E] hover:text-slate-900 border-l-2 border-transparent'
                                        }`}
                                >
                                    <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'} ${item.view && activeView === item.view ? 'text-[#26cece]' : 'text-gray-500'}`} />
                                    {!isSidebarCollapsed && <span>{item.label}</span>}
                                </button>

                                {/* Share post popup */}
                                {item.label === 'Share a post' && isShareMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsShareMenuOpen(false)} />
                                        <div className={`absolute top-0 z-50 w-[260px] bg-slate-50 border border-slate-200 shadow-[0_2px_16px_0_rgba(0,0,0,0.4)] rounded-[2px] py-2 ${isSidebarCollapsed ? 'left-[calc(100%+16px)]' : 'left-[calc(100%+8px)]'}`}>
                                            {shareMenuItems.map((shareItem, idx) =>
                                                shareItem.divider ? (
                                                    <div key={idx} className="my-2 border-t border-slate-200" />
                                                ) : (
                                                    <button 
                                                        key={idx} 
                                                        onClick={() => { setActiveView(shareItem.id); setIsShareMenuOpen(false); }}
                                                        className={`flex items-center w-full px-4 py-2.5 hover:bg-[#1E1E1E] text-left transition-colors group ${activeView === shareItem.id ? 'bg-[#1E1E1E]' : ''}`}
                                                    >
                                                        <shareItem.icon className={`w-[18px] h-[18px] mr-3 transition-colors ${activeView === shareItem.id ? 'text-[#26cece]' : 'text-gray-500 group-hover:text-[#26cece]'}`} />
                                                        <span className={`text-[13px] font-mono transition-colors ${activeView === shareItem.id ? 'text-slate-900' : 'text-gray-400 group-hover:text-slate-900'}`}>{shareItem.label}</span>
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* Libraries popup */}
                                {item.label === 'Libraries' && isLibraryMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsLibraryMenuOpen(false)} />
                                        <div className={`absolute top-0 z-50 w-[260px] bg-slate-50 border border-slate-200 shadow-[0_2px_16px_0_rgba(0,0,0,0.4)] rounded-[2px] py-2 ${isSidebarCollapsed ? 'left-[calc(100%+16px)]' : 'left-[calc(100%+8px)]'}`}>
                                            {libraryMenuItems.map((libItem, idx) =>
                                                libItem.divider ? (
                                                    <div key={idx} className="my-2 border-t border-slate-200" />
                                                ) : (
                                                    <button 
                                                        key={idx} 
                                                        onClick={() => { 
                                                            setActiveView(libItem.id); 
                                                            setIsLibraryMenuOpen(false); 
                                                        }}
                                                        className={`flex items-center w-full px-4 py-2.5 hover:bg-[#1E1E1E] text-left transition-colors group ${activeView === libItem.id ? 'bg-[#1E1E1E]' : ''}`}
                                                    >
                                                        <libItem.icon className={`w-[18px] h-[18px] mr-3 transition-colors ${activeView === libItem.id ? 'text-[#26cece]' : 'text-gray-500 group-hover:text-[#26cece]'}`} />
                                                        <span className={`text-[13px] font-mono transition-colors ${activeView === libItem.id ? 'text-slate-900' : 'text-gray-400 group-hover:text-slate-900'}`}>{libItem.label}</span>
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}

                        <div className="my-2 border-t border-slate-200 w-8 mx-auto" />

                        {bottomItems.map((item, index) => (
                            <button key={index} className="flex items-center w-full px-3 py-2.5 rounded-[2px] text-[12px] font-mono uppercase tracking-wider text-gray-400 hover:bg-[#1E1E1E] hover:text-slate-900 transition-colors">
                                <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'} text-gray-500`} />
                                {!isSidebarCollapsed && <span>{item.label}</span>}
                            </button>
                        ))}
                    </div>

                    {/* User profile */}
                    <div className="p-3 border-t border-slate-200">
                        <button className="flex items-center w-full p-2.5 rounded-[2px] hover:bg-[#1E1E1E] transition-colors">
                            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-gray-400 flex-shrink-0">
                                <Users className="w-4 h-4" />
                            </div>
                            {!isSidebarCollapsed && (
                                <>
                                    <span className="ml-3 text-[13px] font-mono text-gray-300 truncate">{userName}</span>
                                    <MoreVertical className="w-4 h-4 ml-auto text-gray-500" />
                                </>
                            )}
                        </button>
                    </div>

                    {/* Collapse toggle */}
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="absolute right-0 top-16 translate-x-1/2 z-10 bg-slate-50 border border-slate-200 rounded-full p-0.5 text-[#26cece] hover:text-slate-900 shadow-[2px_2px_0_0_#26cece] transition-transform hover:scale-110"
                    >
                        <ChevronLeft className={`w-[14px] h-[14px] transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
                    </button>
                </aside>

                {/* ── Main content ─────────────────────────────────────────── */}
                <main className="flex-1 flex flex-col relative w-full h-full overflow-y-auto bg-white">

                    {/* Workspace switcher bar */}
                    <div className="flex items-center justify-end px-5 py-2.5 border-b border-slate-200 bg-white shrink-0">
                        <WorkspaceSwitcher />
                    </div>

                    {activeView === 'profiles' ? (
                        /* ── PROFILES VIEW ─────────────────────────────────── */
                        <div className="flex-1 p-8 bg-white overflow-y-auto w-full">
                            <div className="max-w-4xl mx-auto space-y-8">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h2 className="text-2xl font-bold font-['Space_Grotesk'] text-slate-900 uppercase tracking-tight">Social Profiles</h2>
                                        <p className="text-sm font-mono text-gray-500 mt-1 uppercase tracking-widest">Manage your connected social accounts</p>
                                    </div>
                                    <button
                                        onClick={() => setIsAddProfileModalOpen(true)}
                                        className="bg-[#26cece] text-[#070707] border border-transparent px-5 py-2.5 rounded-[2px] font-bold font-['Space_Grotesk'] uppercase tracking-widest hover:bg-white hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] transition-all duration-200 flex items-center"
                                    >
                                        <Plus className="w-4 h-4 mr-2" /> Add Profile
                                    </button>
                                </div>

                                {connectedProfiles.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 bg-slate-50 border border-slate-200 rounded-[2px]">
                                        <div className="w-16 h-16 bg-white border border-slate-200 rounded-[2px] flex items-center justify-center mb-4">
                                            <Users className="w-8 h-8 text-[#26cece]" />
                                        </div>
                                        <h3 className="text-xl font-bold font-['Space_Grotesk'] text-slate-900 uppercase tracking-tight mb-2">No profiles connected yet</h3>
                                        <p className="text-sm font-sans text-gray-400 mb-6 text-center max-w-sm">Connect your LinkedIn or Facebook account to start managing your social media.</p>
                                        <button
                                            onClick={() => setIsAddProfileModalOpen(true)}
                                            className="bg-[#26cece] text-[#070707] px-5 py-2.5 rounded-[2px] font-bold font-['Space_Grotesk'] uppercase tracking-widest hover:bg-white hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] transition-all duration-200 flex items-center"
                                        >
                                            <Plus className="w-4 h-4 mr-2" /> Connect a profile
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {connectedProfiles.map((profile, idx) => (
                                            <ProfileListCard key={idx} profile={profile} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    ) : connectedProfiles.length === 0 ? (
                        /* ── SHARE VIEW — empty state ───────────────────────── */
                        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white">
                            <EmptyIllustration />
                            <h3 className="text-[28px] leading-[36px] font-bold font-['Space_Grotesk'] text-slate-900 mb-3 text-center tracking-tight uppercase">
                                You haven&apos;t connected any social profiles<br />yet.
                            </h3>
                            <p className="text-[15px] text-gray-400 font-sans text-center mb-8 max-w-[440px] leading-relaxed">
                                Connect your Meta or LinkedIn account to start boosting your posts with Paid Ads.
                            </p>
                            <button
                                onClick={() => setIsAddProfileModalOpen(true)}
                                className="bg-[#26cece] text-[#070707] px-6 py-3 rounded-[2px] font-bold font-['Space_Grotesk'] uppercase tracking-widest hover:bg-white hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] transition-all duration-200 flex items-center"
                            >
                                <Plus className="w-[20px] h-[20px] mr-2" />
                                Add social profiles
                            </button>
                        </div>

                    ) : activeView === 'calendar' ? (
                        <CalendarView />
                    ) : activeView === 'upload_csv' ? (
                        <UploadCSVView />
                    ) : activeView === 'create_ai' ? (
                        <CreateWithAIView />
                    ) : activeView === 'plan_weekly' ? (
                        <PlanWeeklyAIView />
                    ) : activeView === 'ai_templates' ? (
                        <AITemplatesView />
                    ) : activeView === 'special_days' ? (
                        <SpecialDaysAIView />
                    ) : activeView === 'twitter_thread' ? (
                        <TwitterThreadBuilderView />
                    ) : activeView === 'inbox' ? (
                        <InboxView />
                    ) : activeView === 'graphics_ai' ? (
                        <GraphicsAIView />
                    ) : (
                        /* ── SHARE VIEW — dashboard ─────────────────────────── */
                        <div className="flex-1 p-8 bg-white overflow-y-auto w-full">
                            <div className="max-w-5xl mx-auto space-y-8">

                                {/* Connected profiles grid */}
                                <div>
                                    <div className="flex justify-between items-center mb-5">
                                        <h2 className="text-xl font-bold font-['Space_Grotesk'] text-slate-900 uppercase tracking-tight">Connected Profiles</h2>
                                        <button
                                            onClick={() => setIsAddProfileModalOpen(true)}
                                            className="text-[12px] text-[#26cece] hover:text-slate-900 font-mono uppercase tracking-widest bg-[#26cece]/10 hover:bg-slate-50 border border-transparent hover:border-slate-200 px-3.5 py-2 rounded-[2px] transition-colors flex items-center gap-1.5"
                                        >
                                            <Plus className="w-[14px] h-[14px]" /> Add another
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {connectedProfiles.map((profile, idx) => (
                                            <ProfileGridCard key={idx} profile={profile} />
                                        ))}
                                    </div>
                                </div>

                                {/* Create post */}
                                <div className="bg-slate-50 border border-slate-200 rounded-[2px] p-6 shadow-[0_4px_24px_0_rgba(0,0,0,0.4)]">
                                    <h2 className="text-[16px] font-bold font-['Space_Grotesk'] tracking-tight text-slate-900 mb-4 uppercase flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-[#26cece]" />
                                        Create a new post
                                    </h2>

                                    {/* Profile selector */}
                                    {linkedinProfiles.length > 1 && (
                                        <div className="mb-4 flex flex-wrap gap-2">
                                            {linkedinProfiles.map(profile => {
                                                const isSelected = selectedProfileIds.length === 0 || selectedProfileIds.includes(profile.profileId);
                                                return (
                                                    <button
                                                        key={profile.profileId}
                                                        onClick={() => toggleProfileSelection(profile.profileId)}
                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-[2px] font-mono text-[11px] uppercase tracking-widest border transition-all cursor-pointer ${isSelected ? 'bg-[#26cece]/10 border-[#26cece] text-[#26cece]' : 'bg-white border-slate-200 text-gray-500 hover:text-slate-900 hover:border-slate-200'}`}
                                                    >
                                                        <Linkedin className="w-3.5 h-3.5" />
                                                        {profile.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="border border-slate-200 bg-white rounded-[2px] p-4 focus-within:border-[#26cece] transition-all">
                                        <textarea
                                            value={postText}
                                            onChange={e => { setPostText(e.target.value); setPostStatus(null); }}
                                            placeholder="What do you want to share with your audience?"
                                            className="w-full bg-transparent border-none text-slate-900 resize-none focus:outline-none min-h-[120px] text-[15px] placeholder:text-gray-600 font-sans"
                                        />

                                        {/* Attachment preview */}
                                        {mediaAttachment && (
                                            <div className="mt-3 relative inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-[2px] px-3 py-2 max-w-full">
                                                {mediaAttachment.mediaCategory === 'IMAGE' && mediaAttachment.preview ? (
                                                    <img src={mediaAttachment.preview} alt="preview" className="w-12 h-12 rounded-[2px] object-cover shrink-0" />
                                                ) : mediaAttachment.mediaCategory === 'VIDEO' ? (
                                                    <Film className="w-8 h-8 text-[#26cece] shrink-0" />
                                                ) : (
                                                    <FileText className="w-8 h-8 text-[#26cece] shrink-0" />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-900 text-[11px] font-mono tracking-widest truncate">{mediaAttachment.file.name}</p>
                                                    <p className="text-gray-500 font-mono text-[10px] tracking-widest uppercase">{mediaAttachment.mediaCategory} · {(mediaAttachment.file.size / 1024 / 1024).toFixed(1)} MB</p>
                                                </div>
                                                <button onClick={removeAttachment} className="ml-1 text-gray-500 hover:text-red-400 transition-colors shrink-0 cursor-pointer">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}

                                        {/* AI Write panel */}
                                        {isAiWriteOpen && (
                                            <div className="mt-3 p-3 bg-[#26cece]/5 border border-[#26cece]/20 rounded-[2px] space-y-3">
                                                <div className="flex items-center gap-2 text-[#26cece] font-mono uppercase tracking-widest text-[11px]">
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    {postText.trim() ? 'Rewrite with AI' : 'Generate with AI'}
                                                </div>

                                                {!postText.trim() && (
                                                    <textarea
                                                        value={aiPrompt}
                                                        onChange={e => setAiPrompt(e.target.value)}
                                                        placeholder="What do you want to post about? (e.g. product launch, industry insight, career win…)"
                                                        className="w-full bg-white border border-slate-200 text-slate-900 rounded-[2px] p-2.5 text-[13px] font-sans resize-none focus:outline-none focus:border-[#26cece] min-h-[72px] placeholder:text-gray-600"
                                                    />
                                                )}
                                                {postText.trim() && (
                                                    <p className="text-[10px] font-mono tracking-widest uppercase text-[#26cece]">Your current draft will be improved and rewritten.</p>
                                                )}

                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono tracking-widest text-gray-500 shrink-0 uppercase">Tone:</span>
                                                    {['professional', 'casual', 'inspiring', 'witty'].map(t => (
                                                        <button
                                                            key={t}
                                                            onClick={() => setAiTone(t)}
                                                            className={`px-2.5 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-widest border transition-all cursor-pointer ${aiTone === t ? 'bg-[#26cece]/10 border-[#26cece] text-[#26cece]' : 'bg-white border-slate-200 text-gray-500 hover:text-slate-900 hover:border-slate-200'}`}
                                                        >
                                                            {t}
                                                        </button>
                                                    ))}
                                                </div>

                                                {aiError && (
                                                    <p className="text-[12px] font-mono text-red-500">✕ {aiError}</p>
                                                )}

                                                <div className="flex gap-2 justify-end mt-2">
                                                    <button
                                                        onClick={() => { setIsAiWriteOpen(false); setAiPrompt(''); setAiError(null); }}
                                                        className="px-3 py-1.5 text-gray-500 hover:text-slate-900 rounded-[2px] font-mono text-[11px] uppercase tracking-widest hover:bg-[#333] transition-colors cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={handleAiWrite}
                                                        disabled={isAiLoading || (!aiPrompt.trim() && !postText.trim())}
                                                        className="px-4 py-1.5 bg-[#26cece] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#070707] font-bold font-['Space_Grotesk'] uppercase tracking-widest text-[12px] rounded-[2px] flex items-center gap-1.5 transition-colors cursor-pointer"
                                                    >
                                                        {isAiLoading ? (
                                                            <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
                                                        ) : (
                                                            <><Sparkles className="w-3.5 h-3.5" /> Generate</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Twitter char counter */}
                                        {connectedProfiles.some(p => p.platform === 'twitter') && (
                                            <div className={`mt-2 text-right text-[12px] font-mono tracking-widest uppercase ${postText.length > 280 ? 'text-[#FF4A4A]' : postText.length > 240 ? 'text-[#FFCA4A]' : 'text-gray-600'}`}>
                                                <XIcon className="inline w-3 h-3 mr-1 opacity-70" />
                                                {postText.length}/280{postText.length > 280 && ' · over limit for tweet'}
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200">
                                            <div className="flex gap-1 items-center">
                                                <button
                                                    onClick={() => { setIsAiWriteOpen(v => !v); setAiError(null); }}
                                                    className={`p-2 rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest border border-transparent ${isAiWriteOpen ? 'bg-[#26cece]/10 text-[#26cece] border-[#26cece]' : 'text-gray-400 hover:text-slate-900 hover:border-slate-200 hover:bg-slate-50'}`}
                                                >
                                                    <Sparkles className="w-4 h-4" /> AI Write
                                                </button>
                                                
                                                <button
                                                    onClick={() => { setIsTrendingModalOpen(true); handleFetchTrending(); }}
                                                    className="p-2 text-gray-400 hover:text-[#26cece] rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest border border-transparent hover:border-slate-200 hover:bg-slate-50"
                                                >
                                                    <TrendingUp className="w-4 h-4" /> Trends
                                                </button>

                                                {/* Attach file button */}
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,application/pdf"
                                                    className="hidden"
                                                    onChange={handleFileSelect}
                                                />
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    title="Attach image, video or PDF"
                                                    className="p-2 text-gray-500 hover:text-slate-900 rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 hover:bg-slate-50 hover:shadow-[2px_2px_0_0_#333]"
                                                >
                                                    <Paperclip className="w-4 h-4" />
                                                </button>

                                                {/* Import from Graphics AI */}
                                                <button
                                                    onClick={async () => {
                                                        setIsGraphicsPickerOpen(true);
                                                        setGraphicsLoading(true);
                                                        try {
                                                            const res = await fetch(`${API_BASE_URL}/api/design/jobs`, {
                                                                headers: { 'Authorization': `Bearer ${authToken}` }
                                                            });
                                                            const data = await res.json();
                                                            const completed = (data.jobs || []).filter(j => j.status === 'completed' && (j.flyer_url || j.metadata?.flyer_urls));
                                                            setGraphicsJobs(completed);
                                                        } catch { /* non-critical */ } finally {
                                                            setGraphicsLoading(false);
                                                        }
                                                    }}
                                                    title="Import image from Graphics AI"
                                                    className="p-2 text-gray-500 hover:text-[#26cece] rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 hover:bg-slate-50 font-mono text-[11px] uppercase tracking-widest border border-transparent hover:border-slate-200"
                                                >
                                                    <ImageIcon className="w-4 h-4" />
                                                    <span className="hidden sm:inline">AI Art</span>
                                                </button>

                                                {/* Visibility toggle */}
                                                <select
                                                    value={postVisibility}
                                                    onChange={e => setPostVisibility(e.target.value)}
                                                    className="bg-slate-50 border border-slate-200 text-gray-400 font-mono text-[10px] uppercase tracking-widest rounded-[2px] px-2.5 py-1.5 focus:outline-none focus:border-[#26cece] cursor-pointer"
                                                >
                                                    <option value="PUBLIC">Public</option>
                                                    <option value="CONNECTIONS">Connections only</option>
                                                </select>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setPostStatus(null);
                                                    setPreviewStep(1);
                                                    setWaShare({ enabled: false, mode: 'link', phone: '', sending: false, sent: false, copied: false, opened: false, error: null });
                                                    setIsPreviewOpen(true);
                                                }}
                                                disabled={!postText.trim() || postTargets.length === 0}
                                                className="bg-[#26cece] text-[#070707] px-5 py-2.5 rounded-[2px] font-bold font-['Space_Grotesk'] uppercase tracking-widest hover:bg-white hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] transition-all duration-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                            >
                                                <Send className="w-4 h-4 mr-2" /> Preview & Publish
                                            </button>
                                        </div>
                                    </div>

                                    {/* Platform / profile selection */}
                                    <div className="mt-5 flex flex-wrap items-center gap-2">
                                        <span className="text-[10px] font-mono tracking-widest text-gray-500 uppercase shrink-0">Post to:</span>
                                        {connectedProfiles.map(profile => {
                                            const selected = isPostTarget(profile);
                                            const activeStyle = 'bg-[#26cece]/10 border-[#26cece] text-[#26cece]';
                                            const inactiveStyle = 'bg-white border-slate-200 text-gray-500 hover:text-slate-900 hover:border-slate-200';
                                            return (
                                                <button
                                                    key={profile.profileId || profile.name}
                                                    onClick={() => togglePostTarget(profile)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] font-mono uppercase tracking-widest text-[11px] border transition-all cursor-pointer ${selected ? activeStyle : inactiveStyle}`}
                                                >
                                                    {profile.platform === 'linkedin' && <Linkedin className="w-3 h-3" />}
                                                    {profile.platform === 'twitter' && <XIcon className="w-3 h-3" />}
                                                    {profile.platform === 'facebook' && <Facebook className="w-3 h-3" />}
                                                    <span className="truncate max-w-[100px]">{profile.name}</span>
                                                    {selected && <Check className="w-3 h-3 shrink-0" />}
                                                </button>
                                            );
                                        })}
                                        {postTargets.length === 0 && (
                                            <span className="text-[10px] font-mono tracking-widest text-[#FFCA4A] uppercase">Select at least one profile</span>
                                        )}
                                    </div>

                                    {/* Status message */}
                                    {postStatus && (
                                        <div className={`mt-3 px-4 py-3 rounded-[2px] font-mono text-[11px] uppercase tracking-widest flex items-center gap-2 ${postStatus.type === 'success' ? 'bg-[#26cece]/10 border border-[#26cece] text-[#26cece]' : 'bg-[#FF4A4A]/10 border border-[#FF4A4A] text-[#FF4A4A]'}`}>
                                            {postStatus.type === 'success' ? '✓' : '✕'} {postStatus.message}
                                        </div>
                                    )}
                                </div>

                                {/* Stats grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="bg-slate-50 border border-slate-200 rounded-[2px] p-6 shadow-[0_2px_16px_0_rgba(0,0,0,0.4)]">
                                        <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-3">
                                            <h3 className="text-[15px] font-bold font-['Space_Grotesk'] tracking-tight text-slate-900 uppercase flex items-center gap-2">
                                                <CalendarDays className="w-4 h-4 text-gray-500" /> Recent Posts
                                            </h3>
                                            <button className="text-[11px] font-mono tracking-widest text-[#26cece] uppercase hover:text-slate-900 transition-colors cursor-pointer">View all</button>
                                        </div>
                                        {recentPosts.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-8 text-center bg-white border border-slate-200 rounded-[2px]">
                                                <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-[2px] flex items-center justify-center mb-3">
                                                    <Send className="w-4 h-4 text-[#26cece]" />
                                                </div>
                                                <p className="font-mono text-[11px] tracking-widest uppercase text-gray-500 px-4">No posts yet. Publish your first post above.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {recentPosts.map((post) => (
                                                    <div key={post.id} className="flex gap-3 p-3.5 rounded-[2px] border border-slate-200 bg-white hover:border-slate-200 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] transition-all duration-300">
                                                        <div className={`w-9 h-9 rounded-[2px] border border-slate-200 shrink-0 flex items-center justify-center text-slate-900 ${post.media_category === 'IMAGE' ? 'bg-[#26cece]/10' : post.media_category === 'VIDEO' ? 'bg-[#26cece]/10' : post.media_category === 'DOCUMENT' ? 'bg-[#26cece]/10' : 'bg-[#26cece]/10'}`}>
                                                            {post.media_category === 'VIDEO' ? <Film className="w-4 h-4 text-[#26cece]" /> : post.media_category === 'DOCUMENT' ? <FileText className="w-4 h-4 text-[#26cece]" /> : post.media_category === 'IMAGE' ? <ImageIcon className="w-4 h-4 text-[#26cece]" /> : <Linkedin className="w-4 h-4 text-[#26cece]" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-mono tracking-widest text-slate-900 leading-snug line-clamp-2">{post.text}</p>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">{new Date(post.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                                <span className="text-gray-700">·</span>
                                                                <span className={`text-[10px] font-mono tracking-widest uppercase ${post.visibility === 'PUBLIC' ? 'text-[#26cece]' : 'text-gray-400'}`}>{post.visibility === 'PUBLIC' ? '🌐 Public' : '🔒 Connections'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-slate-50 border border-slate-200 rounded-[2px] p-6 shadow-[0_2px_16px_0_rgba(0,0,0,0.4)]">
                                        <div className="flex items-center justify-between mb-5 border-b border-slate-200 pb-3">
                                            <h3 className="text-[15px] font-bold font-['Space_Grotesk'] tracking-tight text-slate-900 uppercase flex items-center gap-2">
                                                <BarChart2 className="w-4 h-4 text-gray-500" /> Performance Overview
                                            </h3>
                                            <select
                                                value={statsDays}
                                                onChange={e => {
                                                    const d = Number(e.target.value);
                                                    setStatsDays(d);
                                                    window._fetchLinkedInStats?.(d);
                                                }}
                                                className="bg-white border border-slate-200 font-mono uppercase tracking-widest text-gray-400 text-[10px] rounded-[2px] px-2.5 py-1.5 focus:outline-none focus:border-[#26cece] cursor-pointer"
                                            >
                                                <option value={7}>Last 7 days</option>
                                                <option value={30}>Last 30 days</option>
                                            </select>
                                        </div>

                                        {!stats ? (
                                            <div className="grid grid-cols-2 gap-4 animate-pulse">
                                                {[1,2,3,4].map(i => <div key={i} className="h-20 bg-white border border-slate-200 rounded-[2px]" />)}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="grid grid-cols-2 gap-3 mb-4">
                                                    {/* Posts this period */}
                                                    <div className="p-4 rounded-[2px] border border-slate-200 bg-white hover:border-slate-200 transition-colors">
                                                        <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-1">Posts Published</div>
                                                        <div className="text-2xl font-bold font-['Space_Grotesk'] tracking-tight text-slate-900">{stats.periodPosts}</div>
                                                        <div className={`flex items-center text-[10px] font-mono tracking-widest uppercase mt-2 ${stats.periodPct === null ? 'text-gray-500' : stats.periodPct >= 0 ? 'text-[#26cece]' : 'text-[#FF4A4A]'}`}>
                                                            <TrendingUp className="w-3 h-3 mr-1" />
                                                            {stats.periodPct === null ? 'No previous data' : `${stats.periodPct > 0 ? '+' : ''}${stats.periodPct}% vs prev`}
                                                        </div>
                                                    </div>
                                                    {/* Total all time */}
                                                    <div className="p-4 rounded-[2px] border border-slate-200 bg-white hover:border-slate-200 transition-colors">
                                                        <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-1">Total Posts</div>
                                                        <div className="text-2xl font-bold font-['Space_Grotesk'] tracking-tight text-slate-900">{stats.totalPosts}</div>
                                                        <div className="text-[10px] font-mono tracking-widest uppercase text-gray-500 mt-2">All time</div>
                                                    </div>
                                                    {/* Public vs Connections */}
                                                    <div className="p-4 rounded-[2px] border border-slate-200 bg-white hover:border-slate-200 transition-colors">
                                                        <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-2">Visibility</div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] font-mono text-[#26cece]">🌐 {stats.publicPosts}</span>
                                                            <span className="text-gray-600">·</span>
                                                            <span className="text-[11px] font-mono text-gray-400">🔒 {stats.connectionPosts}</span>
                                                        </div>
                                                        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mt-2">Public · Conn</div>
                                                    </div>
                                                    {/* Media vs text */}
                                                    <div className="p-4 rounded-[2px] border border-slate-200 bg-white hover:border-slate-200 transition-colors">
                                                        <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-2">Post Type</div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] font-mono text-slate-900">📎 {stats.withMedia}</span>
                                                            <span className="text-gray-600">·</span>
                                                            <span className="text-[11px] font-mono text-gray-400">📝 {stats.textOnly}</span>
                                                        </div>
                                                        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mt-2">Media · Text</div>
                                                    </div>
                                                </div>

                                                {/* Spark bar chart */}
                                                {stats.byDay?.length > 0 && (
                                                    <div className="bg-white border border-slate-200 rounded-[2px] p-4">
                                                        <div className="text-[10px] font-mono tracking-widest uppercase text-gray-500 mb-2">Posts per day</div>
                                                        <div className="flex items-end gap-1 h-10">
                                                            {stats.byDay.map(({ date, count }) => {
                                                                const max = Math.max(...stats.byDay.map(d => d.count), 1);
                                                                const h = Math.max((count / max) * 100, count > 0 ? 15 : 4);
                                                                return (
                                                                    <div key={date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                                                                        <div
                                                                            className={`w-full rounded-sm transition-all border border-slate-200 ${count > 0 ? 'bg-[#26cece] hover:bg-white border-none' : 'bg-slate-50'}`}
                                                                            style={{ height: `${h}%` }}
                                                                        />
                                                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#26cece] text-[#070707] text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10 font-bold uppercase">
                                                                            {date.slice(5)}: {count}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}

                </main>
            </div>

            {/* ── Add Profile Modal ────────────────────────────────────────── */}
            {isAddProfileModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-white/90 backdrop-blur-sm"
                        onClick={() => setIsAddProfileModalOpen(false)}
                    />
                    <div className="relative bg-slate-50 border border-slate-200 rounded-[2px] shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] w-full max-w-sm overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <h3 className="text-[14px] font-bold font-['Space_Grotesk'] uppercase tracking-widest text-[#26cece]">Connect Profile</h3>
                            <button
                                onClick={() => setIsAddProfileModalOpen(false)}
                                className="text-gray-500 hover:text-slate-900 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            {/* Facebook + Instagram (official Meta OAuth) */}
                            <button
                                onClick={async () => {
                                    try {
                                        const response = await fetch(`${API_BASE_URL}/api/meta/oauth/url`, {
                                            headers: { 'Authorization': `Bearer ${authToken}` }
                                        });
                                        const data = await response.json();
                                        if (data.success && data.url) {
                                            window.location.href = data.url;
                                        } else {
                                            alert(data.error || 'Failed to get Meta auth URL');
                                        }
                                    } catch (err) {
                                        console.error('Meta connect init error:', err);
                                        alert('Failed to initiate Meta connection');
                                    }
                                }}
                                className="w-full flex items-center gap-4 p-4 rounded-[2px] border border-slate-200 bg-white hover:border-slate-200 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] transition-all group cursor-pointer text-left"
                            >
                                <div className="w-10 h-10 rounded-[2px] border border-slate-200 bg-[#26cece]/10 flex items-center justify-center text-[#26cece] shrink-0">
                                    <Facebook className="w-5 h-5 fill-current" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[13px] font-mono tracking-widest text-slate-900 uppercase group-hover:text-[#26cece]">Facebook &amp; Instagram</div>
                                    <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mt-1">Connect page + linked IG account</div>
                                </div>
                                <Plus className="w-5 h-5 text-gray-500 group-hover:text-slate-900" />
                            </button>

                            {/* LinkedIn */}
                            <button
                                onClick={async () => {
                                    try {
                                        const response = await fetch(`${API_BASE_URL}/api/linkedin/oauth/url`, {
                                            headers: { 'Authorization': `Bearer ${authToken}` }
                                        });
                                        const data = await response.json();
                                        if (data.success && data.url) {
                                            window.location.href = data.url;
                                        } else {
                                            alert(data.error || 'Failed to get LinkedIn auth URL');
                                        }
                                    } catch (err) {
                                        console.error('LinkedIn connect init error:', err);
                                        alert('Failed to initiate LinkedIn connection');
                                    }
                                }}
                                className="w-full flex items-center gap-4 p-4 rounded-[2px] border border-slate-200 bg-white hover:border-slate-200 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] transition-all group cursor-pointer text-left"
                            >
                                <div className="w-10 h-10 rounded-[2px] border border-slate-200 bg-[#26cece]/10 flex items-center justify-center text-[#26cece] shrink-0">
                                    <Linkedin className="w-5 h-5 fill-current" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[13px] font-mono tracking-widest text-slate-900 uppercase group-hover:text-[#26cece]">LinkedIn</div>
                                    <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mt-1">Connect profile or page</div>
                                </div>
                                <Plus className="w-5 h-5 text-gray-500 group-hover:text-slate-900" />
                            </button>

                            {/* X (Twitter) */}
                            <button
                                onClick={async () => {
                                    try {
                                        const response = await fetch(`${API_BASE_URL}/api/twitter/oauth/url`, {
                                            headers: { 'Authorization': `Bearer ${authToken}` }
                                        });
                                        const data = await response.json();
                                        if (data.success && data.url) {
                                            window.location.href = data.url;
                                        } else {
                                            alert(data.error || 'Failed to get Twitter auth URL');
                                        }
                                    } catch (err) {
                                        console.error('Twitter connect init error:', err);
                                        alert('Failed to initiate Twitter/X connection');
                                    }
                                }}
                                className="w-full flex items-center gap-4 p-4 rounded-[2px] border border-slate-200 bg-white hover:border-slate-200 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] transition-all group cursor-pointer text-left"
                            >
                                <div className="w-10 h-10 rounded-[2px] border border-slate-200 bg-[#26cece]/10 flex items-center justify-center text-[#26cece] shrink-0">
                                    <XIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[13px] font-mono tracking-widest text-slate-900 uppercase group-hover:text-[#26cece]">X (Twitter)</div>
                                    <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mt-1">Connect your X account</div>
                                </div>
                                <Plus className="w-5 h-5 text-gray-500 group-hover:text-slate-900" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Post Modal (2-step) ───────────────────────────────────────── */}
            {isPreviewOpen && (() => {
                const platformMeta = {
                    linkedin: { label: 'LinkedIn', color: '#0A66C2', bg: 'bg-[#0A66C2]', ring: 'ring-[#0A66C2]/40', icon: <Linkedin className="w-4 h-4 fill-current" /> },
                    facebook: { label: 'Facebook', color: '#1877F2', bg: 'bg-[#1877F2]', ring: 'ring-[#1877F2]/40', icon: <Facebook className="w-4 h-4 fill-current" /> },
                    twitter: { label: 'X (Twitter)', color: '#000000', bg: 'bg-black', ring: 'ring-black/40', icon: <XIcon className="w-4 h-4" /> },
                };

                const toggleTarget = togglePostTarget;
                const isTargeted = (profile) => {
                    const key = profile.profileId || profile.name;
                    return postTargets.some(p => (p.profileId || p.name) === key);
                };

                const grouped = connectedProfiles.reduce((acc, p) => {
                    (acc[p.platform] = acc[p.platform] || []).push(p);
                    return acc;
                }, {});

                const previewProfile = postTargets.find(p => p.platform === 'linkedin') || postTargets.find(p => p.platform === 'twitter') || linkedinProfiles[0];
                const formatText = (text) => {
                    const MAX = 280;
                    const display = text.length > MAX ? text.slice(0, MAX) : text;
                    return display.split('\n').map((line, i) => (
                        <span key={i}>{line}{i < display.split('\n').length - 1 && <br />}</span>
                    ));
                };

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm" onClick={() => !isPosting && setIsPreviewOpen(false)} />
                        <div className="relative z-10 w-full max-w-lg flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">

                            {/* Header */}
                            <div className="flex items-center gap-3 px-1">
                                {previewStep === 2 && (
                                    <button onClick={() => setPreviewStep(1)} className="text-gray-500 hover:text-slate-900 transition-colors shrink-0 cursor-pointer">
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                )}
                                <div className="flex-1">
                                    <h3 className="text-[#26cece] font-bold font-['Space_Grotesk'] tracking-widest uppercase text-[14px]">
                                        {previewStep === 1 ? 'Where do you want to post?' : 'Post Preview'}
                                    </h3>
                                    <div className="flex items-center gap-1.5 mt-2">
                                        {[1, 2].map(s => (
                                            <div key={s} className={`h-1 flex-1 rounded-[2px] transition-all ${s === previewStep ? 'bg-[#26cece]' : 'bg-[#333]'}`} />
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => !isPosting && setIsPreviewOpen(false)} className="text-gray-500 hover:text-slate-900 transition-colors shrink-0 cursor-pointer">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {previewStep === 1 ? (
                                /* ── Step 1: Platform / Profile selection ── */
                                <div className="bg-slate-50 border border-slate-200 rounded-[2px] shadow-[0_4px_24px_0_rgba(0,0,0,0.5)] overflow-hidden">
                                    <div className="p-5 space-y-5">
                                        {Object.entries(grouped).map(([platform, profiles]) => {
                                            const meta = platformMeta[platform] || platformMeta.linkedin;
                                            return (
                                                <div key={platform}>
                                                    <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-5 h-5 rounded-[2px] flex items-center justify-center text-slate-900 ${meta.bg}`}>
                                                                {meta.icon}
                                                            </div>
                                                            <span className="font-mono text-[11px] tracking-widest text-slate-900 uppercase">{meta.label}</span>
                                                        </div>
                                                        <span className="font-mono text-[10px] tracking-widest text-[#26cece] uppercase">{profiles.length} profile{profiles.length > 1 ? 's' : ''}</span>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {profiles.map((profile, idx) => {
                                                            const selected = isTargeted(profile);
                                                            return (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => toggleTarget(profile)}
                                                                    className={`w-full flex items-center gap-3 p-3 rounded-[2px] border transition-all cursor-pointer text-left ${selected ? 'border-[#26cece] bg-[#26cece]/10' : 'border-slate-200 bg-white hover:border-slate-200'}`}
                                                                >
                                                                    <div className="relative shrink-0">
                                                                        {profile.avatar ? (
                                                                            <img src={profile.avatar} alt={profile.name} className="w-10 h-10 rounded-[2px] object-cover border border-slate-200" />
                                                                        ) : (
                                                                            <div className={`w-10 h-10 rounded-[2px] ${meta.bg} flex items-center justify-center text-slate-900 font-bold font-mono`}>
                                                                                {profile.name?.charAt(0)}
                                                                            </div>
                                                                        )}
                                                                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-[2px] ${meta.bg} flex items-center justify-center border-2 border-[#111111]`}>
                                                                            {meta.icon}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                        <p className="text-[12px] font-mono tracking-widest text-slate-900 uppercase truncate">{profile.name}</p>
                                                                        <p className="text-[10px] font-mono text-gray-500 uppercase mt-1">{profile.type}</p>
                                                                    </div>
                                                                    <div className={`w-4 h-4 rounded-[2px] border flex items-center justify-center shrink-0 transition-all ${selected ? 'border-[#26cece] bg-[#26cece]' : 'border-slate-200 bg-transparent'}`}>
                                                                        {selected && <Check className="w-3 h-3 text-[#070707] stroke-[3]" />}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* ── Optional WhatsApp share ── */}
                                    <div className="mx-5 mb-5 border border-slate-200 rounded-[2px] overflow-hidden bg-white">
                                        <button
                                            onClick={() => setWaShare(s => ({ ...s, enabled: !s.enabled, error: null }))}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1E1E1E] transition-colors cursor-pointer"
                                        >
                                            <div className="w-7 h-7 rounded-[2px] border border-[#25D366] bg-[#25D366]/10 flex items-center justify-center shrink-0">
                                                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                                            </div>
                                            <div className="flex-1 text-left">
                                                <p className="text-[11px] font-mono tracking-widest text-slate-900 uppercase">Share to WhatsApp first</p>
                                                <p className="text-[10px] font-mono tracking-widest text-[#25D366] uppercase mt-1">Optional · via link or API</p>
                                            </div>
                                            <div className={`w-8 h-4 rounded-[2px] transition-colors relative border ${waShare.enabled ? 'bg-[#25D366]/20 border-[#25D366]' : 'bg-white border-slate-200'}`}>
                                                <div className={`absolute top-0.5 w-3 h-3 rounded-[2px] transition-all ${waShare.enabled ? 'left-4 bg-[#25D366]' : 'left-0.5 bg-gray-500'}`} />
                                            </div>
                                        </button>

                                        {waShare.enabled && (
                                            <div className="border-t border-slate-200 p-4 space-y-3 bg-white">
                                                {/* Mode tabs */}
                                                <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-[2px] p-1">
                                                    {[{ id: 'link', icon: Link2, label: 'Share Link' }, { id: 'api', icon: MessageCircle, label: 'Send via API' }].map(({ id, icon: Icon, label }) => (
                                                        <button
                                                            key={id}
                                                            onClick={() => setWaShare(s => ({ ...s, mode: id, error: null, sent: false }))}
                                                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[2px] text-[10px] font-mono tracking-widest uppercase transition-all cursor-pointer ${waShare.mode === id ? 'bg-[#26cece]/10 text-[#26cece]' : 'text-gray-500 hover:text-slate-900'}`}
                                                        >
                                                            <Icon className="w-3.5 h-3.5" />{label}
                                                        </button>
                                                    ))}
                                                </div>

                                                {waShare.mode === 'link' ? (
                                                    /* Share Link mode */
                                                    <div className="space-y-3">
                                                        <p className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">Opens WhatsApp with your post pre-filled. Works without any API setup.</p>
                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    const url = `https://wa.me/?text=${encodeURIComponent(postText)}`;
                                                                    navigator.clipboard.writeText(url);
                                                                    setWaShare(s => ({ ...s, copied: true, opened: true }));
                                                                    setTimeout(() => setWaShare(s => ({ ...s, copied: false })), 2000);
                                                                }}
                                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-50 hover:bg-[#1E1E1E] text-slate-900 text-[10px] font-mono uppercase tracking-widest rounded-[2px] border border-slate-200 transition-colors cursor-pointer"
                                                            >
                                                                {waShare.copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Link</>}
                                                            </button>
                                                            <a
                                                                href={`https://wa.me/?text=${encodeURIComponent(postText)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={() => setWaShare(s => ({ ...s, opened: true }))}
                                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] text-[10px] font-mono uppercase tracking-widest rounded-[2px] border border-[#25D366] transition-colors cursor-pointer"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" /> Open WhatsApp
                                                            </a>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* Send via API mode — uses 'acknowledgement' template */
                                                    <div className="space-y-2">
                                                        <p className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">Sends a post preview with <span className="text-[#25D366] font-medium">✓ Approve</span> / <span className="text-[#FF4A4A] font-medium">✕ Disapprove</span> buttons via WhatsApp template.</p>
                                                        <input
                                                            type="text"
                                                            value={waShare.recipientName || ''}
                                                            onChange={e => setWaShare(s => ({ ...s, recipientName: e.target.value, error: null }))}
                                                            placeholder="Recipient name (e.g. Rahul)"
                                                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-[11px] font-mono uppercase tracking-widest rounded-[2px] px-3 py-2.5 focus:outline-none focus:border-[#25D366] placeholder:text-gray-600"
                                                        />
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="tel"
                                                                value={waShare.phone}
                                                                onChange={e => setWaShare(s => ({ ...s, phone: e.target.value, error: null }))}
                                                                placeholder="Phone (e.g. 9876543210)"
                                                                className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 text-[11px] font-mono uppercase tracking-widest rounded-[2px] px-3 py-2.5 focus:outline-none focus:border-[#25D366] placeholder:text-gray-600"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    if (!waShare.phone.trim()) return;
                                                                    setWaShare(s => ({ ...s, sending: true, error: null }));
                                                                    try {
                                                                        const res = await fetch(`${API_BASE_URL}/api/linkedin/whatsapp-share`, {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                                                                            body: JSON.stringify({
                                                                                phone: waShare.phone,
                                                                                name: waShare.recipientName || waShare.phone,
                                                                                text: postText,
                                                                                title: postText.split('\n')[0].slice(0, 60) || 'LinkedIn Post',
                                                                                niche: mediaAttachment?.mediaCategory || 'General',
                                                                                profileId: selectedProfileIds[0] || null,
                                                                                visibility: postVisibility,
                                                                                assetUrn: mediaAttachment?.assetUrn || null,
                                                                                mediaCategory: mediaAttachment?.mediaCategory || null,
                                                                            }),
                                                                        }).then(r => r.json());
                                                                        if (!res.success) throw new Error(res.error);
                                                                        setWaShare(s => ({ ...s, sending: false, sent: true }));
                                                                    } catch (err) {
                                                                        setWaShare(s => ({ ...s, sending: false, error: err.message }));
                                                                    }
                                                                }}
                                                                disabled={waShare.sending || !waShare.phone.trim() || waShare.sent}
                                                                className="px-4 py-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 disabled:opacity-50 disabled:cursor-not-allowed text-[#25D366] text-[11px] font-mono font-bold uppercase tracking-widest rounded-[2px] border border-[#25D366] flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                                                            >
                                                                {waShare.sending ? <span className="w-3 h-3 border border-[#25D366]/30 border-t-[#25D366] rounded-full animate-spin" /> : waShare.sent ? <><Check className="w-3.5 h-3.5" /> Sent!</> : <><MessageCircle className="w-3.5 h-3.5" /> Send</>}
                                                            </button>
                                                        </div>
                                                        {waShare.error && <p className="text-[10px] font-mono tracking-widest text-[#FF4A4A] uppercase mt-2">✕ {waShare.error}</p>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="px-5 pb-5 flex gap-3">
                                        <button onClick={() => setIsPreviewOpen(false)} className="flex-1 px-4 py-3 rounded-[2px] border border-slate-200 text-slate-900 hover:bg-[#1E1E1E] font-bold font-['Space_Grotesk'] uppercase tracking-widest text-[14px] transition-colors cursor-pointer">
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => setPreviewStep(2)}
                                            disabled={postTargets.length === 0}
                                            className="flex-1 bg-[#26cece] hover:bg-white disabled:bg-[#333] disabled:text-gray-500 disabled:shadow-none text-[#070707] px-4 py-3 rounded-[2px] font-bold font-['Space_Grotesk'] uppercase tracking-widest text-[14px] flex items-center justify-center gap-2 transition-all cursor-pointer hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333]"
                                        >
                                            Preview Post →
                                        </button>
                                    </div>
                                </div>

                            ) : (
                                /* ── Step 2: Preview ── */
                                <>
                                    <div className="bg-slate-50 border border-slate-200 rounded-[2px] overflow-hidden shadow-[0_4px_24px_0_rgba(0,0,0,0.5)]">
                                        <div className="px-4 pt-4 pb-3">
                                            <div className="flex items-start gap-3">
                                                <div className="relative shrink-0">
                                                    {previewProfile?.avatar ? (
                                                        <img src={previewProfile.avatar} alt={previewProfile?.name} className="w-12 h-12 rounded-[2px] object-cover border border-slate-200" />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-[2px] bg-[#0A66C2]/10 border border-[#0A66C2]/30 flex items-center justify-center text-[#0A66C2] font-bold text-lg font-mono">
                                                            {previewProfile?.name?.charAt(0) || 'U'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-mono uppercase tracking-widest text-[13px] text-slate-900 leading-tight truncate">{previewProfile?.name || userName}</div>
                                                    <div className="text-[10px] font-mono tracking-widest uppercase text-gray-500 mt-1">LinkedIn Member</div>
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Just now ·</span>
                                                        {postVisibility === 'PUBLIC'
                                                            ? <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.07 9h2.93a13.07 13.07 0 00.39 2.65A7.02 7.02 0 011.07 9zM4 7H1.07A7.02 7.02 0 013.39 4.35 13.07 13.07 0 004 7zm1 2h6a11.09 11.09 0 01-.43 2.81A11.1 11.1 0 018 12.99a11.1 11.1 0 01-2.57-.18A11.09 11.09 0 015 9zm0-2a11.09 11.09 0 01.43-2.81A11.1 11.1 0 018 3.01a11.1 11.1 0 012.57.18A11.09 11.09 0 0111 7H5zm7 2h2.93a7.02 7.02 0 01-2.32 2.65A13.07 13.07 0 0012 9zm0-2a13.07 13.07 0 00-.39-2.65A7.02 7.02 0 0113.93 7H12z"/></svg>
                                                            : <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 16 16"><path d="M13 6a5 5 0 00-10 0v1H2a1 1 0 00-1 1v6a1 1 0 001 1h12a1 1 0 001-1V8a1 1 0 00-1-1h-1V6zm-7 0a3 3 0 016 0v1H6V6zm3 5.5a1 1 0 110-2 1 1 0 010 2z"/></svg>
                                                        }
                                                    </div>
                                                </div>
                                                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                            </div>
                                        </div>

                                        <div className="px-4 pb-3 text-[12px] font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">
                                            {formatText(postText)}
                                            {postText.length > 280 && <span className="text-[#26cece] hover:underline cursor-pointer"> …see more</span>}
                                        </div>

                                        {mediaAttachment && (
                                            <div className="mx-4 mb-3 rounded-[2px] overflow-hidden border border-slate-200 bg-white">
                                                {mediaAttachment.mediaCategory === 'IMAGE' && mediaAttachment.preview
                                                    ? <img src={mediaAttachment.preview} alt="attachment" className="w-full max-h-72 object-cover" />
                                                    : mediaAttachment.mediaCategory === 'VIDEO'
                                                        ? <div className="flex items-center gap-3 p-3"><div className="w-10 h-10 rounded-[2px] bg-[#26cece]/10 flex items-center justify-center"><Film className="w-5 h-5 text-[#26cece]" /></div><div><p className="font-mono text-[12px] tracking-widest text-[#26cece] uppercase truncate">{mediaAttachment.file.name}</p><p className="text-[10px] font-mono text-gray-500 uppercase mt-1">Video · {(mediaAttachment.file.size / 1024 / 1024).toFixed(1)} MB</p></div></div>
                                                        : <div className="flex items-center gap-3 p-3"><div className="w-10 h-10 rounded-[2px] bg-[#26cece]/10 flex items-center justify-center"><FileText className="w-5 h-5 text-[#26cece]" /></div><div><p className="font-mono text-[12px] tracking-widest text-[#26cece] uppercase truncate">{mediaAttachment.file.name}</p><p className="text-[10px] font-mono text-gray-500 uppercase mt-1">Document · {(mediaAttachment.file.size / 1024 / 1024).toFixed(1)} MB</p></div></div>
                                                }
                                            </div>
                                        )}

                                        <div className="border-t border-slate-200 px-4 py-2 flex items-center justify-between">
                                            {[{ label: 'Like', icon: '👍' }, { label: 'Comment', icon: '💬' }, { label: 'Repost', icon: '🔁' }, { label: 'Send', icon: '✉️' }].map(({ label, icon }) => (
                                                <button key={label} className="flex items-center gap-1.5 px-3 py-2 rounded-[2px] text-gray-500 hover:text-slate-900 hover:bg-[#1E1E1E] text-[10px] font-mono tracking-widest uppercase transition-colors cursor-pointer">
                                                    <span className="text-base leading-none">{icon}</span>{label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Publishing to summary */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-[2px] px-4 py-3 flex flex-wrap gap-2 items-center">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase shrink-0">Publishing to:</span>
                                        {postTargets.map((p, i) => {
                                            const meta = platformMeta[p.platform] || platformMeta.linkedin;
                                            return (
                                                <span key={i} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-900 tracking-widest uppercase border border-slate-200 bg-white px-2.5 py-1.5 rounded-[2px]">
                                                    <span className={`w-3.5 h-3.5 rounded-[2px] flex items-center justify-center text-slate-900 ${meta.bg}`} style={{ fontSize: 8 }}>{meta.icon}</span>
                                                    {p.name}
                                                </span>
                                            );
                                        })}
                                        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-[#26cece]">{postVisibility === 'PUBLIC' ? '🌐 Public' : '🔒 Connections'}</span>
                                    </div>

                                    {/* WhatsApp gate / status */}
                                    {waShare.enabled && (() => {
                                        // Approved if: sent successfully, OR send was attempted but failed (they tried)
                                        const waApproved = waShare.mode === 'api'
                                            ? (waShare.sent || !!waShare.error)
                                            : waShare.opened;

                                        if (!waApproved) {
                                            // Not attempted yet — block and prompt
                                            return (
                                                <div className="flex items-center gap-2.5 px-4 py-3 bg-[#25D366]/10 border border-[#25D366] rounded-[2px]">
                                                    <MessageCircle className="w-4 h-4 text-[#25D366] shrink-0" />
                                                    <p className="text-[11px] font-mono tracking-widest text-[#25D366] uppercase leading-relaxed">
                                                        {waShare.mode === 'api'
                                                            ? 'Send the WhatsApp message first — go back to Step 1.'
                                                            : 'Open or copy the WhatsApp link first — go back to Step 1.'}
                                                    </p>
                                                    <button onClick={() => setPreviewStep(1)} className="ml-auto text-[10px] font-mono tracking-widest text-[#25D366] uppercase underline underline-offset-4 cursor-pointer whitespace-nowrap">
                                                        ← Back
                                                    </button>
                                                </div>
                                            );
                                        }

                                        if (waShare.mode === 'api' && waShare.error) {
                                            // Attempted but failed — warn but allow publish
                                            return (
                                                <div className="flex items-start gap-2.5 px-4 py-3 bg-[#FFCA4A]/10 border border-[#FFCA4A] rounded-[2px]">
                                                    <MessageCircle className="w-4 h-4 text-[#FFCA4A] shrink-0 mt-0.5" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-mono tracking-widest text-[#FFCA4A] uppercase text-[11px]">WhatsApp send failed</p>
                                                        <p className="font-mono tracking-widest text-gray-500 uppercase text-[10px] mt-1 break-words">{waShare.error}</p>
                                                        <p className="font-mono tracking-widest text-slate-900 uppercase text-[10px] mt-2">You can still publish to social media.</p>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        if (waShare.sent) {
                                            return (
                                                <div className="flex items-start gap-2.5 px-4 py-3 bg-[#25D366]/10 border border-[#25D366] rounded-[2px]">
                                                    <Check className="w-4 h-4 text-[#25D366] shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="font-mono tracking-widest uppercase text-[#25D366] text-[11px]">Approval request sent via WhatsApp</p>
                                                        <p className="font-mono tracking-widest uppercase text-gray-500 text-[10px] mt-1">Post will be published to LinkedIn automatically when approved. You can also publish manually below.</p>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return null;
                                    })()}

                                    <div className="flex gap-3">
                                        <button onClick={() => setIsPreviewOpen(false)} disabled={isPosting} className="flex-1 px-4 py-3 rounded-[2px] border border-slate-200 text-slate-900 hover:bg-[#1E1E1E] transition-colors cursor-pointer font-bold font-['Space_Grotesk'] uppercase tracking-widest text-[14px] disabled:opacity-50">
                                            Edit Post
                                        </button>
                                        <button
                                            onClick={async () => { await handlePublish(); }}
                                            disabled={isPosting || (waShare.enabled && !(waShare.mode === 'api' ? (waShare.sent || !!waShare.error) : waShare.opened))}
                                            className="flex-1 bg-[#26cece] hover:bg-white text-[#070707] px-4 py-3 rounded-[2px] shadow-none hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#333] font-bold font-['Space_Grotesk'] uppercase tracking-widest text-[14px] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none bg-[#26cece] disabled:bg-[#333] disabled:text-gray-500"
                                        >
                                            {isPosting ? <><span className="w-4 h-4 border-[3px] border-[#070707]/30 border-t-[#070707] rounded-full animate-spin" /> Publishing...</> : <><Send className="w-4 h-4" /> Confirm & Publish</>}
                                        </button>
                                    </div>

                                    {postStatus && (
                                        <div className={`px-4 py-3 rounded-[2px] font-mono tracking-widest uppercase text-[11px] flex items-center gap-2 ${postStatus.type === 'success' ? 'bg-[#25D366]/10 border border-[#25D366] text-[#25D366]' : 'bg-[#FF4A4A]/10 border border-[#FF4A4A] text-[#FF4A4A]'}`}>
                                            {postStatus.type === 'success' ? '✓' : '✕'} {postStatus.message}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* ── Trending Topics Modal ─────────────────────────────────────── */}
            {isTrendingModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm" onClick={() => setIsTrendingModalOpen(false)} />
                    <div className="relative z-10 w-full max-w-2xl bg-white border border-slate-200 rounded-[2px] shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-[#26cece]" />
                                <h3 className="text-[14px] font-bold font-['Space_Grotesk'] uppercase tracking-widest text-slate-900">Trending Post Ideas</h3>
                            </div>
                            <button onClick={() => setIsTrendingModalOpen(false)} className="text-gray-500 hover:text-slate-900 transition-colors cursor-pointer">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            <div className="flex gap-2 mb-6">
                                <input 
                                    type="text" 
                                    value={trendingNiche} 
                                    onChange={(e) => setTrendingNiche(e.target.value)}
                                    placeholder="Enter niche (e.g. Real Estate, SaaS)..."
                                    className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 rounded-[2px] font-mono text-[13px] focus:outline-none focus:border-[#26cece]"
                                />
                                <button 
                                    onClick={handleFetchTrending}
                                    disabled={isTrendingLoading}
                                    className="px-4 py-2.5 bg-[#26cece] text-[#070707] font-bold font-mono text-[12px] uppercase tracking-widest rounded-[2px] hover:bg-[#1AA8A8] hover:text-white transition-all disabled:opacity-50"
                                >
                                    {isTrendingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Search'}
                                </button>
                            </div>

                            {isTrendingLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <Loader2 className="w-8 h-8 text-[#26cece] animate-spin" />
                                    <p className="font-mono text-[11px] uppercase tracking-widest text-gray-500">Analyzing trends and generating ideas...</p>
                                </div>
                            ) : trendingTopics.length === 0 ? (
                                <div className="text-center py-20 bg-slate-50 border border-slate-200 rounded-[2px]">
                                    <p className="font-mono text-[11px] uppercase tracking-widest text-gray-500">No trends found. Try another niche.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {trendingTopics.map((topic, i) => (
                                        <div key={i} className="group p-5 bg-white border border-slate-200 rounded-[2px] hover:border-[#26cece] transition-all hover:shadow-[0_4px_20px_rgba(38,206,206,0.05)]">
                                            <h4 className="text-[#26cece] font-bold font-['Space_Grotesk'] uppercase tracking-tight text-[16px] mb-2">{topic.keyword}</h4>
                                            <p className="text-slate-600 text-[13px] mb-4 leading-relaxed italic">"{topic.hook}"</p>
                                            <div className="flex flex-wrap gap-2 mb-5">
                                                {topic.hashtags?.map((tag, j) => (
                                                    <span key={j} className="text-[10px] font-mono text-gray-500 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-[2px] border border-slate-200">#{tag.replace('#','')}</span>
                                                ))}
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setAiPrompt(`Write a post about ${topic.keyword} with this hook: ${topic.hook}. Include these hashtags: ${topic.hashtags.join(', ')}`);
                                                    setIsTrendingModalOpen(false);
                                                    setIsAiWriteOpen(true);
                                                }}
                                                className="w-full py-2.5 border border-[#26cece] text-[#26cece] font-bold font-mono text-[11px] uppercase tracking-widest rounded-[2px] hover:bg-[#26cece] hover:text-white transition-all flex items-center justify-center gap-2"
                                            >
                                                <Sparkles className="w-3.5 h-3.5" /> Draft Post with AI
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Graphics AI Image Picker Modal ─────────────────────────── */}
            {isGraphicsPickerOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setIsGraphicsPickerOpen(false)}>
                    <div className="relative w-full max-w-3xl bg-slate-50 border border-slate-200 rounded-[2px] overflow-hidden" onClick={e => e.stopPropagation()}>

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <div className="flex items-center gap-2.5">
                                <ImageIcon className="w-5 h-5 text-[#26cece]" />
                                <div>
                                    <h3 className="font-bold font-['Space_Grotesk'] text-slate-900 uppercase tracking-tight text-[15px]">Import from Graphics AI</h3>
                                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-0.5">Select a generated image to attach to your post</p>
                                </div>
                            </div>
                            <button onClick={() => setIsGraphicsPickerOpen(false)} className="p-2 text-gray-400 hover:text-slate-900 border border-transparent hover:border-slate-200 rounded-[2px] transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 max-h-[65vh] overflow-y-auto">
                            {graphicsLoading ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <Loader2 className="w-8 h-8 text-[#26cece] animate-spin" />
                                    <p className="font-mono text-gray-500 uppercase tracking-widest text-[11px]">Loading generated images...</p>
                                </div>
                            ) : graphicsJobs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <ImageIcon className="w-10 h-10 text-gray-700" />
                                    <p className="font-mono text-gray-500 uppercase tracking-widest text-[11px]">No completed graphics yet</p>
                                    <p className="font-mono text-gray-600 text-[10px]">Generate images in Libraries → Graphics AI Agent first</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {graphicsJobs.flatMap(job => {
                                        const urls = job.metadata?.flyer_urls || [job.flyer_url];
                                        return urls.map((url, idx) => (
                                            <button
                                                key={`${job.id}-${idx}`}
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch(url);
                                                        const blob = await res.blob();
                                                        const ext = blob.type.includes('png') ? 'png' : 'jpg';
                                                        const file = new File([blob], `ai_graphic_${idx + 1}.${ext}`, { type: blob.type });
                                                        setMediaAttachment({ file, mediaCategory: 'IMAGE', preview: URL.createObjectURL(blob) });
                                                        setIsGraphicsPickerOpen(false);
                                                    } catch {
                                                        alert('Could not load image. Please try again.');
                                                    }
                                                }}
                                                className="group relative aspect-square overflow-hidden rounded-[2px] border border-[#1E1E1E] hover:border-[#26cece] transition-all duration-200 focus:outline-none"
                                            >
                                                <img src={url} alt="Generated graphic" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center">
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 bg-[#26cece] text-[#070707] font-bold font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-[2px]">
                                                        <Check className="w-3.5 h-3.5" /> Select
                                                    </div>
                                                </div>
                                                {urls.length > 1 && (
                                                    <div className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-[2px] font-mono text-[9px] text-white uppercase tracking-widest">
                                                        Var {idx + 1}
                                                    </div>
                                                )}
                                            </button>
                                        ));
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


export default SocialDashboard;