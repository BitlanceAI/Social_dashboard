import React, { useState, useEffect, useRef } from 'react';
import { Facebook, Instagram } from 'lucide-react';
import AnalyticsPanel from '../../components/dashboard/AnalyticsPanel';
import CreatePostHub from '../../components/dashboard/CreatePostHub';
import SocialProfilesPanel from '../../components/dashboard/SocialProfilesPanel';
import PageSelectModal from '../../components/dashboard/PageSelectModal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabaseClient';
import toast from 'react-hot-toast';
import {
    BarChart3,
    IndianRupee,
    TrendingUp,
    Settings,
    PlayCircle,
    PauseCircle,
    RefreshCw,
    Eye,
    Edit3,
    Layers,
    Globe,
    CheckCircle2,
    Clock,
    AlertCircle,
    Link2,
    Unlink,
    ExternalLink,
    X,
    Calendar,
    Image,
    Send,
    FileText,
    MousePointer,
    ChevronRight,
    ChevronLeft,
    Image as ImageIcon,
    Video,
    CalendarClock,
    Users,
    UploadCloud,
    Trash2
} from 'lucide-react';

import {
    SchedulePostModal,
    StepAccount,
    StepContent,
    StepSchedule,
    StepReview
} from '../../components/meta';

import API_BASE_URL from '../../config';

import DashboardSidebar, { DashboardMobileNav } from '../../components/dashboard/DashboardSidebar';

const MetaAdsPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();

    // Session state (fetched from Supabase)
    const [activeTab, setActiveTab] = useState('create');
    // 'schedule' queues for later, 'now' publishes immediately
    const [publishMode, setPublishMode] = useState('schedule');
    const [session, setSession] = useState(null);

    // Connection state
    const [isConnected, setIsConnected] = useState(false);
    const [connection, setConnection] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Modal state
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [showPagePicker, setShowPagePicker] = useState(false);
    const [savingPages, setSavingPages] = useState(false);
    // Guards against a second submit while a publish is in flight
    const [submitting, setSubmitting] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const oauthProcessedRef = useRef(false);
    const authTokenRef = useRef(null); // Stores auth token synchronously for immediate use
    const dataLoadedRef = useRef(false); // Prevents re-fetching on every token refresh (tab switch)

    // Form state

    // Data state
    const [scheduledPosts, setScheduledPosts] = useState([]);



    const handleViewDetails = (campaign) => {
        setSelectedCampaign(campaign);
        setShowDetailsModal(true);
    };

    const handleViewAnalytics = (campaign) => {
        setSelectedCampaign(campaign);
        setShowAnalyticsModal(true);
    };

    // Schedule Wizard State
    const [scheduleStep, setScheduleStep] = useState(1);
    const [uploadMode, setUploadMode] = useState('file'); // 'file', 'url', or 'library'
    const [generatedGraphics, setGeneratedGraphics] = useState([]);
    const [loadingGraphics, setLoadingGraphics] = useState(false);
    const [scheduleFormData, setScheduleFormData] = useState({
        pageId: '',
        platforms: ['facebook'],
        content: '',
        mediaUrls: [], // Array for multiple URLs (or Preview blobs)
        mediaFiles: [], // Array of File objects
        linkUrl: '',
        hashtags: '',
        scheduledTime: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    // Helper to update form
    const updateScheduleForm = (updates) => setScheduleFormData(prev => ({ ...prev, ...updates }));

    // Fetch generated graphics from library
    const loadGeneratedGraphics = async () => {
        setLoadingGraphics(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/design/jobs`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                // Filter only completed jobs with flyer_url
                const completedJobs = (data.jobs || []).filter(job => job.status === 'completed' && job.flyer_url);
                setGeneratedGraphics(completedJobs);
            }
        } catch (error) {
            console.error('Failed to load graphics:', error);
        } finally {
            setLoadingGraphics(false);
        }
    };

    // Add graphic from library to media
    const selectGraphicFromLibrary = (job) => {
        const url = job.flyer_url;
        if (!scheduleFormData.mediaUrls.includes(url)) {
            updateScheduleForm({ mediaUrls: [...scheduleFormData.mediaUrls, url] });
            toast.success('Graphic added!');
        } else {
            toast.info('Already added');
        }
    };
    // Listen for auth state changes (handles both initial load and OAuth redirects)
    useEffect(() => {
        // Reset the processed flag on mount
        oauthProcessedRef.current = false;
        dataLoadedRef.current = false;

        // Get initial session and do ONE full data load
        const initSession = async () => {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession) {
                authTokenRef.current = currentSession.access_token;
                setSession(currentSession);
                // Check for Facebook provider token on initial load
                checkForFacebookToken(currentSession);
            } else {
                setLoading(false);
            }
        };

        initSession();

        // Listen for auth changes (fires AFTER Supabase processes OAuth redirect tokens)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
            console.log('[Meta OAuth] Auth state changed:', event);

            if (currentSession) {
                // Always keep the token ref fresh (needed for API calls)
                authTokenRef.current = currentSession.access_token;

                if (event === 'TOKEN_REFRESHED') {
                    // Token silently refreshed (e.g. tab switch) — do NOT reload data
                    // Just update the ref (already done above), no state update needed
                    console.log('[Meta OAuth] Token refreshed silently, skipping reload');
                    return;
                }

                setSession(currentSession);

                // Only check for Facebook OAuth token on SIGNED_IN
                if (event === 'SIGNED_IN') {
                    checkForFacebookToken(currentSession);
                }
            } else {
                setSession(null);
                dataLoadedRef.current = false;
                setLoading(false);
            }
        });

        return () => subscription?.unsubscribe();
    }, []);

    // Helper to detect and handle Facebook provider token (with dedup guard)
    const checkForFacebookToken = async (currentSession) => {
        if (!currentSession?.provider_token) return;
        // Prevent duplicate processing
        if (oauthProcessedRef.current) {
            console.log('[Meta OAuth] Already processed, skipping...');
            return;
        }

        const hasFacebookIdentity =
            currentSession?.user?.app_metadata?.provider === 'facebook' ||
            currentSession?.user?.app_metadata?.providers?.includes('facebook') ||
            currentSession?.user?.identities?.some(id => id.provider === 'facebook');

        if (hasFacebookIdentity) {
            oauthProcessedRef.current = true;
            console.log('[Meta OAuth] Found Facebook provider token, connecting...');
            await handleOAuthComplete(currentSession.provider_token, currentSession.access_token);
        }
    };

    // Check for URL params (legacy/manual OAuth flow fallback)
    useEffect(() => {
        const oauthSuccess = searchParams.get('oauth_success');
        const token = searchParams.get('token');
        const error = searchParams.get('error');

        if (oauthSuccess && token && session?.access_token && !oauthProcessedRef.current) {
            oauthProcessedRef.current = true;
            handleOAuthComplete(token, session.access_token);
        } else if (error) {
            toast.error(`Connection failed: ${error}`);
        }
    }, [searchParams, session]);

    // Load connection status only ONCE per mount (not on every token refresh)
    useEffect(() => {
        if (session?.access_token && !dataLoadedRef.current) {
            dataLoadedRef.current = true;
            checkConnection();
        }
    }, [session]);

    // checkConnection is the only thing that clears `loading`, and it only runs
    // once a session exists. If the session never resolves — or the request
    // stalls behind the Meta API — the spinner would otherwise never go away.
    useEffect(() => {
        const timer = setTimeout(() => {
            setLoading(prev => {
                if (prev) console.warn('[Meta] Connection check timed out; showing the dashboard anyway.');
                return false;
            });
        }, 8000);
        return () => clearTimeout(timer);
    }, []);

    const getAuthHeaders = (authToken) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken || session?.access_token || authTokenRef.current}`,
        // When the API is reached through an ngrok tunnel, ngrok serves an HTML
        // interstitial to anything with a browser User-Agent. That page carries
        // no CORS headers, so fetch() fails before reaching our server. This
        // header opts out of it. Harmless on any other host.
        'ngrok-skip-browser-warning': 'true'
    });

    const checkConnection = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/api/meta/connection`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (data.connected && data.isValid) {
                setIsConnected(true);
                setConnection(data);
                // Fresh connection: ask which Pages to actually use
                if (data.needsPageSelection) setShowPagePicker(true);
                // Load the publishing queue
                await loadScheduledPosts();
            } else {
                setIsConnected(false);
                // If it was previously connected but now isn't valid, show toast
                if (data.connected === false && data.isValid === false) {
                    toast.error('Meta session expired. Please reconnect.');
                }
            }
        } catch (error) {
            console.error('Connection check failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAuthError = (status, data) => {
        if (status === 401 && data?.code === 'TOKEN_EXPIRED') {
            setIsConnected(false);
            setConnection(null);
            toast.error('Meta session expired. Please reconnect.');
            return true;
        }
        return false;
    };


    const loadScheduledPosts = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/meta/posts/scheduled`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (handleAuthError(response.status, data)) return;

            if (data.success) {
                setScheduledPosts(data.posts || []);
            }
        } catch (error) {
            console.error('Failed to load scheduled posts:', error);
        }
    };




    /**
     * Start the Meta OAuth flow.
     *
     * Uses our own server endpoint (/api/meta/oauth/url) rather than Supabase's
     * Facebook provider, so the scope list has a single source of truth in
     * metaService.DEFAULT_SCOPES and the redirect URI is the one registered in
     * the Meta app dashboard.
     */
    const handleOAuthConnect = async () => {
        try {
            setConnecting(true);
            oauthProcessedRef.current = false;

            const response = await fetch(`${API_BASE_URL}/api/meta/oauth/url`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (data.success && data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Could not build the Facebook login URL');
            }
        } catch (error) {
            console.error('Meta OAuth error:', error);
            toast.error(error.message || 'Failed to start Facebook login');
            setConnecting(false);
        }
    };

    const handleOAuthComplete = async (providerToken, authToken) => {
        setConnecting(true);
        // Store token in ref for immediate synchronous access
        if (authToken) authTokenRef.current = authToken;
        try {
            console.log('[Meta OAuth] Completing connection with auth token:', authToken ? 'present' : 'missing');
            const response = await fetch(`${API_BASE_URL}/api/meta/connect-api-key`, {
                method: 'POST',
                headers: getAuthHeaders(authToken),
                body: JSON.stringify({ accessToken: providerToken })
            });

            const data = await response.json();
            console.log('[Meta OAuth] Connect response:', data);
            if (data.success) {
                toast.success('Meta account connected via Facebook!');
                await checkConnection();
                // Clear the URL to preventing token leakage/re-submission
                window.history.replaceState({}, '', '/socialdashboad');
            } else {
                toast.error(data.error || 'OAuth connection failed');
            }
        } catch (error) {
            console.error('OAuth completion error:', error);
            toast.error('OAuth completion failed');
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('Are you sure you want to disconnect your Meta account?')) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/meta/disconnect`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (response.ok) {
                toast.success('Meta account disconnected');
                setIsConnected(false);
                setConnection(null);
                setCampaigns([]);
                setScheduledPosts([]);
                setInsights({});
            }
        } catch (error) {
            toast.error('Failed to disconnect');
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                fetch(`${API_BASE_URL}/api/meta/refresh-accounts`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                }),
                loadScheduledPosts()
            ]);
            await checkConnection();
            toast.success('Data refreshed');
        } catch (error) {
            toast.error('Refresh failed');
        } finally {
            setRefreshing(false);
        }
    };

    const handleSchedulePost = async (e) => {
        if (e) e.preventDefault();

        // A second click while the first request is still running would publish
        // the same post twice — Meta has no idempotency key to fall back on.
        if (submitting) return;

        // Basic Validation
        const publishNow = publishMode === 'now';

        if (!scheduleFormData.pageId
            || (!scheduleFormData.content && !scheduleFormData.mediaUrls[0] && scheduleFormData.mediaFiles.length === 0)
            || (!publishNow && !scheduleFormData.scheduledTime)) {
            toast.error('Please fill all required fields');
            return;
        }

        setSubmitting(true);
        try {
            let finalMediaUrls = scheduleFormData.mediaUrls.filter(url => url.trim() !== '' && !url.startsWith('blob:'));

            // Handle File Uploads
            if (scheduleFormData.mediaFiles.length > 0 && uploadMode === 'file') {
                const toastId = toast.loading('Uploading media...');

                const formData = new FormData();
                scheduleFormData.mediaFiles.forEach(file => formData.append('files', file));

                // Get headers but remove Content-Type so browser sets it for FormData
                const headers = getAuthHeaders();
                if (headers['Content-Type']) delete headers['Content-Type'];

                const uploadRes = await fetch(`${API_BASE_URL}/api/meta/posts/upload-media`, {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });

                const uploadData = await uploadRes.json();
                toast.dismiss(toastId);

                if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

                // Use uploaded URLs
                finalMediaUrls = uploadData.urls;
            }

            // Convert local scheduled time to UTC for storage
            // The input `scheduleFormData.scheduledTime` is in local time (e.g. "2026-02-07T15:35")
            // We create a Date object which defaults to browser's timezone (IST)
            // Then toISOString() converts it to UTC (e.g. "2026-02-07T10:05:00.000Z")
            const endpoint = publishNow ? '/api/meta/posts/publish' : '/api/meta/posts/schedule';

            const payload = publishNow
                ? {
                    pageId: scheduleFormData.pageId,
                    platforms: scheduleFormData.platforms,
                    content: scheduleFormData.content,
                    linkUrl: scheduleFormData.linkUrl,
                    mediaUrls: finalMediaUrls
                }
                : {
                    ...scheduleFormData,
                    // scheduledTime is local (e.g. "2026-02-07T15:35"); send UTC
                    scheduledTime: new Date(scheduleFormData.scheduledTime).toISOString(),
                    originalLocalTime: scheduleFormData.scheduledTime,
                    mediaUrls: finalMediaUrls
                };

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (data.success) {
                if (publishNow) {
                    // Publish-now reports per-network, so surface partial failures
                    const failed = Object.entries(data.results || {})
                        .filter(([, r]) => !r.success)
                        .map(([platform, r]) => `${platform}: ${r.error}`);
                    if (failed.length) toast.error(`Partly failed — ${failed.join('; ')}`, { duration: 8000 });
                    else toast.success('Published!');
                    // Show the result rather than leaving them on the composer tab
                    setActiveTab('history');
                } else {
                    toast.success('Post scheduled successfully!');
                }
                setShowScheduleModal(false);
                setScheduleStep(1);
                setScheduleFormData({
                    pageId: '',
                    platforms: ['facebook'],
                    content: '',
                    mediaUrls: [],
                    mediaFiles: [],
                    linkUrl: '',
                    hashtags: '',
                    scheduledTime: '',
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                });
                setUploadMode('file');
                await loadScheduledPosts();
            } else {
                toast.error(data.error || 'Failed to schedule post');
            }
        } catch (error) {
            toast.error(error.message || 'Failed to schedule post');
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSavePageSelection = async (pageIds) => {
        setSavingPages(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/meta/pages/select`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ pageIds })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Could not save your selection');

            setShowPagePicker(false);
            await checkConnection();
            toast.success(pageIds.length
                ? `Connected ${pageIds.length} profile${pageIds.length === 1 ? '' : 's'}`
                : 'No profiles connected');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSavingPages(false);
        }
    };

    const handleDeleteScheduledPost = async (postId) => {
        if (!confirm('Delete this scheduled post?')) return;

        try {
            await fetch(`${API_BASE_URL}/api/meta/posts/${postId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            toast.success('Post deleted');
            await loadScheduledPosts();
        } catch (error) {
            toast.error('Failed to delete post');
        }
    };

    const getStatusConfig = (status) => {
        const configs = {
            ACTIVE: { icon: PlayCircle, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-muted)]', label: 'Active' },
            PAUSED: { icon: PauseCircle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Paused' },
            SCHEDULED: { icon: Clock, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-muted)]', label: 'Scheduled' },
            pending: { icon: Clock, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-muted)]', label: 'Pending' },
            published: { icon: CheckCircle2, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-muted)]', label: 'Published' },
            failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' }
        };
        return configs[status] || configs.PAUSED;
    };

    const stats = {
        pages: connection?.pages?.length || 0
    };

    // Validation for each wizard step
    const validateStep = (step) => {
        switch (step) {
            case 1:
                if (!scheduleFormData.pageId) return 'Please select a page';
                return true;
            case 2:
                if (!scheduleFormData.content && scheduleFormData.mediaUrls.length === 0 && scheduleFormData.mediaFiles.length === 0) {
                    return 'Please add content or media';
                }
                // Instagram's API cannot publish text-only posts
                if (scheduleFormData.platforms.includes('instagram')
                    && scheduleFormData.mediaUrls.length === 0 && scheduleFormData.mediaFiles.length === 0) {
                    return 'Instagram posts require at least one image or video';
                }
                return true;
            case 3:
                if (!scheduleFormData.scheduledTime) return 'Please select a schedule time';
                return true;
            default:
                return true;
        }
    };

    // Scheduled posts split by lifecycle for the two dashboard sections
    const publishedPosts = scheduledPosts.filter(p => p.status === 'published');
    const upcomingPosts = scheduledPosts.filter(p => p.status !== 'published');

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">

            {/* Header */}

            <div className="flex">

            <DashboardSidebar
                active={activeTab}
                onNavigate={setActiveTab}
                isConnected={isConnected}
                pageCount={connection?.pages?.length || 0}
                scheduledCount={upcomingPosts.length}
                publishedCount={publishedPosts.length}
            />

            <main className="flex-1 min-w-0 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-10 py-6 sm:py-10 pb-32 lg:pb-16">


                {/* Social Profiles tab */}
                {activeTab === 'profiles' && (
                    <SocialProfilesPanel
                        loading={loading}
                        isConnected={isConnected}
                        onManagePages={() => setShowPagePicker(true)}
                        pages={connection?.pages || []}
                        onConnect={() => setShowConnectModal(true)}
                        onRefresh={handleRefresh}
                        onDisconnect={handleDisconnect}
                        refreshing={refreshing}
                    />
                )}

                {/* Scheduled Posts tab */}
                {activeTab === 'scheduled' && isConnected && upcomingPosts.length > 0 && (
                    <div className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] p-5 sm:p-6 mb-6 sm:mb-8">
                        <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)] mb-4">Scheduled Posts</h3>
                        <div className="space-y-3">
                            {upcomingPosts.map(post => {
                                const statusConfig = getStatusConfig(post.status);
                                return (
                                    <div key={post.id} className="flex items-center justify-between p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                                        <div className="flex-1">
                                            <p className="font-medium text-[var(--text)] line-clamp-1">{post.content}</p>
                                            <div className="flex items-center gap-3 mt-1 text-sm text-[var(--muted)]">
                                                <span>{post.page_name}</span>
                                                <span>•</span>
                                                <span>{new Date(post.scheduled_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                                                {statusConfig.label}
                                            </span>
                                            {post.status === 'pending' && (
                                                <button
                                                    onClick={() => handleDeleteScheduledPost(post.id)}
                                                    className="p-2 rounded-lg hover:bg-red-100 text-red-500 transition-colors"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Post History tab */}
                {activeTab === 'history' && isConnected && (
                    <div className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] p-5 sm:p-6 mb-6 sm:mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)]">Published Posts</h3>
                            <span className="text-xs text-[var(--muted)]">
                                {publishedPosts.length} published
                            </span>
                        </div>

                        {publishedPosts.length === 0 ? (
                            <div className="py-10 text-center">
                                <Send className="h-8 w-8 mx-auto mb-3 text-[var(--muted-2)]" />
                                <p className="text-sm text-[var(--muted)]">
                                    Nothing published yet. Scheduled posts appear here once they go live.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {publishedPosts.map(post => {
                                    const results = post.publish_results || {};
                                    const targets = (post.platforms && post.platforms.length) ? post.platforms : ['facebook'];
                                    return (
                                        <div
                                            key={post.id}
                                            className="flex items-start gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)]"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-[var(--text)] line-clamp-2 mb-2">
                                                    {post.content}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[11px] text-[var(--muted)]">
                                                        {post.page_name}
                                                    </span>
                                                    <span className="text-[var(--muted-2)]">·</span>
                                                    <span className="text-[11px] text-[var(--muted)]">
                                                        {post.published_at
                                                            ? new Date(post.published_at).toLocaleString()
                                                            : new Date(post.scheduled_time).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Per-network outcome */}
                                            <div className="flex flex-col gap-1.5 shrink-0">
                                                {targets.map(platform => {
                                                    const r = results[platform];
                                                    const ok = r ? r.success : true;
                                                    const Icon = platform === 'instagram' ? Instagram : Facebook;
                                                    return (
                                                        <span
                                                            key={platform}
                                                            title={ok ? 'Published' : (r && r.error) || 'Failed'}
                                                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium ${ok
                                                                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                                                : 'bg-red-50 text-red-600'
                                                                }`}
                                                        >
                                                            <Icon className="h-3 w-3" />
                                                            {ok ? 'Published' : 'Failed'}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* A post can succeed on one network and fail on the other */}
                        {publishedPosts.some(p => p.error_message) && (
                            <p className="mt-4 text-[11px] text-[var(--muted)]">
                                Some posts published to only one network. Hover a red badge for the reason Meta returned.
                            </p>
                        )}
                    </div>
                )}

                {/* Scheduled tab with nothing queued */}
                {activeTab === 'scheduled' && isConnected && upcomingPosts.length === 0 && (
                    <div className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] p-8 sm:p-12 text-center">
                        <Calendar className="h-10 w-10 mx-auto mb-4 text-[var(--muted-2)]" />
                        <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)] mb-2">Nothing scheduled</h3>
                        <p className="text-sm text-[var(--muted)] mb-6">
                            Compose a post and pick a time and it will appear here until it publishes.
                        </p>
                        <button
                            onClick={() => setShowScheduleModal(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-[11px] font-mono uppercase tracking-widest hover:bg-[var(--accent-hover)] transition-colors"
                        >
                            <Calendar className="h-4 w-4" />
                            Schedule Post
                        </button>
                    </div>
                )}

                {/* Create a Post tab */}
                {activeTab === 'create' && (
                    <CreatePostHub
                        isConnected={isConnected}
                        onConnect={() => setActiveTab('profiles')}
                        onSelect={(mode) => {
                            setPublishMode(mode);
                            setScheduleStep(1);
                            setShowScheduleModal(true);
                        }}
                    />
                )}

                {/* Analytics tab */}
                {activeTab === 'analytics' && isConnected && (
                    <AnalyticsPanel
                        posts={scheduledPosts}
                        authHeaders={getAuthHeaders}
                    />
                )}

            </main>

            </div>{/* end sidebar + content layout */}

            <DashboardMobileNav
                active={activeTab}
                onNavigate={setActiveTab}
                isConnected={isConnected}
            />

            {/* Connect Modal */}
            {showConnectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-[var(--surface)] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-[var(--border)]">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-[var(--text)]">Connect Meta Account</h3>
                                <button
                                    onClick={() => setShowConnectModal(false)}
                                    className="p-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--muted)] transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="text-center py-8">
                                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#1877F2] flex items-center justify-center">
                                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                    </svg>
                                </div>
                                <p className="text-[var(--muted)] mb-6 max-w-sm mx-auto leading-relaxed">
                                    Sign in with Facebook to connect your Pages and any linked
                                    Instagram Business accounts. We never see your password.
                                </p>
                                <button
                                    onClick={handleOAuthConnect}
                                    className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#1877F2] text-white font-semibold hover:bg-[#166FE5] transition-colors"
                                >
                                    <ExternalLink className="h-5 w-5" />
                                    Continue with Facebook
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <PageSelectModal
                isOpen={showPagePicker}
                pages={connection?.availablePages || []}
                initialSelected={connection?.selectedPageIds || []}
                onSave={handleSavePageSelection}
                onClose={() => setShowPagePicker(false)}
                saving={savingPages}
            />

            {/* Schedule Post Modal - Component-Based */}
            <SchedulePostModal
                mode={publishMode}
                isSubmitting={submitting}
                isOpen={showScheduleModal}
                onClose={() => setShowScheduleModal(false)}
                currentStep={scheduleStep}
                setCurrentStep={setScheduleStep}
                onSubmit={handleSchedulePost}
                onValidate={validateStep}
            >
                {scheduleStep === 1 && (
                    <StepAccount
                        pages={connection?.pages || []}
                        selectedPageId={scheduleFormData.pageId}
                        platforms={scheduleFormData.platforms}
                        onSelect={(pageId) => {
                            const page = (connection?.pages || []).find(p => String(p.id) === String(pageId));
                            // Drop Instagram if the newly picked page has no linked IG account
                            const platforms = page?.instagram_business_account
                                ? scheduleFormData.platforms
                                : scheduleFormData.platforms.filter(pl => pl !== 'instagram');
                            updateScheduleForm({ pageId, platforms: platforms.length ? platforms : ['facebook'] });
                        }}
                        onPlatformsChange={(platforms) => updateScheduleForm({ platforms })}
                    />
                )}

                {scheduleStep === 2 && (
                    <StepContent
                        content={scheduleFormData.content}
                        linkUrl={scheduleFormData.linkUrl}
                        mediaUrls={scheduleFormData.mediaUrls}
                        mediaFiles={scheduleFormData.mediaFiles}
                        onContentChange={(content) => updateScheduleForm({ content })}
                        onLinkChange={(linkUrl) => updateScheduleForm({ linkUrl })}
                        onMediaUpdate={(updates) => updateScheduleForm(updates)}
                        getAuthHeaders={getAuthHeaders}
                        apiBase={API_BASE_URL}
                    />
                )}

                {scheduleStep === 3 && (
                    <StepSchedule
                        scheduledTime={scheduleFormData.scheduledTime}
                        onScheduleChange={(scheduledTime) => updateScheduleForm({ scheduledTime })}
                    />
                )}

                {scheduleStep === 5 && (
                    <StepReview
                        formData={scheduleFormData}
                        pages={connection?.pages || []}
                    />
                )}
            </SchedulePostModal>
        </div>
    );
};

export default MetaAdsPage;
