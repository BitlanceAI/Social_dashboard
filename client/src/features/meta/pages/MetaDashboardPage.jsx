import React, { useState, useEffect, useRef } from 'react';
import { Facebook } from 'lucide-react';
import { platformMeta, providerOf, prefixFor, charLimitFor } from '@/features/meta/lib/providers';
import AnalyticsPanel from '@/features/meta/components/AnalyticsPanel';
import CreatePostHub from '@/features/meta/components/CreatePostHub';
import SocialProfilesPanel from '@/features/meta/components/SocialProfilesPanel';
import AddProfileModal from '@/features/meta/components/AddProfileModal';
import PageSelectModal from '@/features/meta/components/PageSelectModal';
import NotificationToggle from '@/features/notifications/components/NotificationToggle';
import { NotificationsBell } from '@/features/notifications';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useWorkspace, WorkspaceSwitcher } from '@/features/workspace';
import { MediaLibrary } from '@/features/storage';
import Logo from '@/shared/components/layout/Logo';
import { supabase } from '@/shared/lib/supabase';
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
} from '@/features/meta';

import API_BASE_URL from '@/shared/config';

import DashboardSidebar, { DashboardMobileNav } from '@/features/meta/components/DashboardSidebar';
import CommentsModal from '@/features/meta/components/CommentsModal';

const MetaDashboardView = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const { activeWorkspaceId } = useWorkspace();

    // Session state (fetched from Supabase)
    const [activeTab, setActiveTab] = useState('create');
    // 'schedule' queues for later, 'now' publishes immediately
    const [publishMode, setPublishMode] = useState('schedule');
    const [session, setSession] = useState(null);

    // Connection state. Each provider connects independently, so the
    // dashboard is usable with either one on its own.
    const [connection, setConnection] = useState(null);          // Meta
    const [liConnection, setLiConnection] = useState(null);      // LinkedIn
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



    // Schedule Wizard State
    const [scheduleStep, setScheduleStep] = useState(1);
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

    // Either provider on its own is enough to use the dashboard.
    const isConnected = Boolean(connection) || Boolean(liConnection);

    /**
     * Every account this user can publish to, flattened into one shape so the
     * composer does not care which network a target came from.
     *
     * `platforms` is what the target accepts: a Facebook Page with a linked
     * Instagram account offers both, which is what replaces the
     * `instagram_business_account` checks previously scattered through the UI.
     */
    const targets = [
        ...(connection?.pages || []).map((page) => ({
            id: String(page.id),
            name: page.name,
            subtitle: page.category || 'Facebook Page',
            provider: 'meta',
            avatarUrl: page.picture?.data?.url || null,
            platforms: page.instagram_business_account ? ['facebook', 'instagram'] : ['facebook'],
            igUsername: page.instagram_business_account?.username || null,
        })),
        ...(liConnection?.actors || []).map((actor) => ({
            id: actor.urn,
            name: actor.name,
            subtitle: actor.type === 'org' ? 'LinkedIn Page' : 'LinkedIn profile',
            provider: 'linkedin',
            avatarUrl: actor.avatarUrl || null,
            platforms: ['linkedin'],
        })),
    ];

    const targetById = (id) => targets.find((t) => t.id === String(id));

    // How many posts each profile has in the queue/history, for its card chip.
    const postCounts = scheduledPosts.reduce((acc, post) => {
        const key = String(post.page_id);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

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
        } else if (searchParams.get('linkedin_connected') && session?.access_token) {
            // The LinkedIn callback already wrote the connection server-side --
            // there is no token in this URL to hand back. Just re-read it.
            toast.success('LinkedIn account connected');
            checkLinkedInConnection();
            window.history.replaceState({}, '', '/socialdashboad');
        } else if (error) {
            toast.error(`Connection failed: ${error}`);
        }
    }, [searchParams, session]);

    // Load connection status only ONCE per mount (not on every token refresh)
    useEffect(() => {
        if (session?.access_token && !dataLoadedRef.current) {
            dataLoadedRef.current = true;
            loadAllConnections();
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
        // Scopes every request to one workspace. Omitted when unknown, and the
        // server then resolves the caller's default -- which is what lets an
        // older client keep working against a workspace-aware server.
        ...(activeWorkspaceId ? { 'x-workspace-id': activeWorkspaceId } : {}),
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
                setConnection(data);
                // Fresh connection: ask which Pages to actually use
                if (data.needsPageSelection) setShowPagePicker(true);
            } else {
                setConnection(null);
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

    /**
     * LinkedIn connection status.
     *
     * Deliberately separate from checkConnection: a user with only one of the
     * two connected must still get a working dashboard, so neither call may
     * gate the other.
     */
    const checkLinkedInConnection = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/linkedin/connection`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            setLiConnection(data.connected && data.isValid ? data : null);

            // LinkedIn tokens last 60 days and this app cannot refresh them,
            // so the only remedy is asking in good time.
            if (data.connected && data.needsReconnect) {
                toast(data.expired
                    ? 'Your LinkedIn connection expired. Reconnect to keep posting.'
                    : `Your LinkedIn connection expires in ${data.daysUntilExpiry} days.`,
                    { icon: '\u26a0\ufe0f' });
            }
        } catch (error) {
            console.error('LinkedIn connection check failed:', error);
        }
    };

    /** Both providers, then the shared publishing queue. */
    const loadAllConnections = async () => {
        await Promise.all([checkConnection(), checkLinkedInConnection()]);
        await loadScheduledPosts();
    };

    /**
     * Both providers answer an expired token with 401 + TOKEN_EXPIRED, so one
     * handler covers them -- it just needs to know whose connection to clear.
     */
    const handleAuthError = (status, data, provider = 'meta') => {
        if (status === 401 && data?.code === 'TOKEN_EXPIRED') {
            if (provider === 'linkedin') {
                setLiConnection(null);
                toast.error('LinkedIn session expired. Please reconnect.');
            } else {
                setConnection(null);
                toast.error('Meta session expired. Please reconnect.');
            }
            return true;
        }
        return false;
    };


    // Live history fetched from Meta itself (all posts on the Pages/IG
    // accounts, made through this app or not). Loaded lazily when the
    // History tab first opens; null = not fetched yet.
    const [platformHistory, setPlatformHistory] = useState(null);
    const [historyFeedErrors, setHistoryFeedErrors] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    // Facebook post whose comment thread is open in the manager modal
    const [commentsPost, setCommentsPost] = useState(null);

    const loadPlatformHistory = async () => {
        setHistoryLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/meta/posts/history`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (handleAuthError(response.status, data)) return;
            if (data.success) {
                setPlatformHistory(data.posts || []);
                setHistoryFeedErrors(data.feedErrors || []);
            }
        } catch (error) {
            console.error('Failed to load platform history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history' && connection && platformHistory === null && !historyLoading) {
            loadPlatformHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, connection]);

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
    const handleOAuthConnect = async (provider = 'meta', target) => {
        try {
            setConnecting(true);
            oauthProcessedRef.current = false;

            // `target` picks the LinkedIn scope set: 'member' for a personal
            // profile, 'organization' to also request Company Page posting.
            const query = target ? `?target=${encodeURIComponent(target)}` : '';

            const response = await fetch(`${API_BASE_URL}${prefixFor(provider)}/oauth/url${query}`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (data.success && data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Could not build the sign-in URL');
            }
        } catch (error) {
            console.error('OAuth error:', error);
            toast.error(error.message || 'Failed to start sign-in');
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

    /**
     * Remove a single profile from the dashboard.
     *
     * The two providers differ in what that can mean. A LinkedIn connection is
     * one member, so removing it is a disconnect. A Meta connection can cover
     * several Pages, so removing one deselects it and leaves the rest working
     * -- disconnecting Meta wholesale over one Page would be a nasty surprise.
     */
    const handleRemoveTarget = async (target) => {
        if (target.provider === 'linkedin') {
            return handleDisconnect('linkedin');
        }

        const remaining = targets
            .filter((t) => t.provider === 'meta' && t.id !== target.id)
            .map((t) => t.id);

        if (remaining.length === 0) {
            // Nothing would be left to publish to, so this is a disconnect.
            return handleDisconnect('meta');
        }

        if (!confirm(`Remove ${target.name} from this dashboard? Your other Pages stay connected.`)) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/meta/pages/select`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ pageIds: remaining })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                toast.error(data.error || 'Could not remove that profile');
                return;
            }

            toast.success(`${target.name} removed`);
            await checkConnection();
        } catch (error) {
            toast.error('Could not remove that profile');
        }
    };

    const handleDisconnect = async (provider = 'meta') => {
        const label = provider === 'linkedin' ? 'LinkedIn' : 'Meta';
        if (!confirm(`Are you sure you want to disconnect your ${label} account?`)) return;

        try {
            const response = await fetch(`${API_BASE_URL}${prefixFor(provider)}/disconnect`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(data.error || 'Failed to disconnect');
                return;
            }

            toast.success(`${label} account disconnected`);
            if (provider === 'linkedin') setLiConnection(null);
            else setConnection(null);
            // Rows for the other provider are still valid, so re-read the queue
            // rather than clearing it outright.
            await loadScheduledPosts();
        } catch (error) {
            toast.error('Failed to disconnect');
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                connection && fetch(`${API_BASE_URL}/api/meta/refresh-accounts`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                }),
                liConnection && fetch(`${API_BASE_URL}/api/linkedin/refresh-accounts`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                }),
            ].filter(Boolean));
            await loadAllConnections();
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

        // One post targets one provider; validateStep(1) blocks a mixed
        // selection, so the first platform decides which API this goes to.
        const provider = providerOf(scheduleFormData.platforms);
        const prefix = prefixFor(provider);

        setSubmitting(true);
        try {
            let finalMediaUrls = scheduleFormData.mediaUrls.filter(url => url.trim() !== '' && !url.startsWith('blob:'));

            // Handle File Uploads
            if (scheduleFormData.mediaFiles.length > 0) {
                const toastId = toast.loading('Uploading media...');

                const formData = new FormData();
                scheduleFormData.mediaFiles.forEach(file => formData.append('files', file));

                // Get headers but remove Content-Type so browser sets it for FormData
                const headers = getAuthHeaders();
                if (headers['Content-Type']) delete headers['Content-Type'];

                const uploadRes = await fetch(`${API_BASE_URL}${prefix}/posts/upload-media`, {
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
            const endpoint = `${prefix}${publishNow ? '/posts/publish' : '/posts/schedule'}`;

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
                    // The server flags a LinkedIn post scheduled past the
                    // 60-day token expiry -- it would fail silently otherwise.
                    if (data.warning) toast(data.warning, { icon: '⚠️', duration: 10000 });
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

    const handleDeleteScheduledPost = async (post) => {
        // A published post is live on Meta; a pending one only exists here.
        const isPublished = post?.status === 'published';
        const network = post?.provider === 'linkedin' ? 'LinkedIn' : 'Facebook';
        const confirmText = isPublished
            ? `Delete this post from ${network}? This cannot be undone.`
            : 'Cancel this scheduled post?';
        if (!confirm(confirmText)) return;

        try {
            const response = await fetch(`${API_BASE_URL}${prefixFor(post.provider)}/posts/${post.id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                // 409 carries the parts that could not be deleted — most often
                // Instagram, which the Graph API cannot delete at all.
                toast.error(data.error || 'Failed to delete post');
                await loadScheduledPosts();
                return;
            }

            toast.success(data.message || 'Post deleted');
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
            case 1: {
                if (!scheduleFormData.pageId) return 'Please select a page';
                // A scheduled_posts row carries one provider, so a post cannot
                // span both networks. Two separate posts, two separate rows.
                const providers = new Set(scheduleFormData.platforms.map((id) => platformMeta(id).provider));
                if (providers.size > 1) {
                    return 'Pick one network per post -- LinkedIn and Meta are published separately';
                }
                return true;
            }
            case 2: {
                const mediaCount = scheduleFormData.mediaUrls.length + scheduleFormData.mediaFiles.length;

                if (!scheduleFormData.content && mediaCount === 0) {
                    return 'Please add content or media';
                }

                // Instagram's API cannot publish text-only posts
                const needsMedia = scheduleFormData.platforms.find((id) => platformMeta(id).requiresMedia);
                if (needsMedia && mediaCount === 0) {
                    return `${platformMeta(needsMedia).label} posts require at least one image or video`;
                }

                const limit = charLimitFor(scheduleFormData.platforms);
                if ((scheduleFormData.content || '').length > limit) {
                    return `That is over the ${limit.toLocaleString()} character limit for this network`;
                }

                // Multi-image LinkedIn posts need a different content shape
                // (content.multiImage) that is not built yet.
                if (scheduleFormData.platforms.includes('linkedin') && mediaCount > 1) {
                    return 'LinkedIn posts currently support one image or video';
                }

                return true;
            }
            case 3: {
                if (!scheduleFormData.scheduledTime) return 'Please select a schedule time';
                const when = new Date(scheduleFormData.scheduledTime);
                if (Number.isNaN(when.getTime())) return 'That date does not look valid';
                // The picker's min only constrains the widget, not typed input
                if (when.getTime() <= Date.now()) return 'Pick a time in the future';
                return true;
            }
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

            <div className="flex-1 min-w-0 flex flex-col">
                {/* Mobile header. DashboardMobileNav is five equal items with no
                    room for a sixth, and no brand or account affordance at all —
                    so the switcher gets its own strip up here instead. */}
                <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur">
                    <Logo className="h-6" />
                    <div className="flex items-center gap-2">
                        <NotificationsBell posts={scheduledPosts} liConnection={liConnection} />
                        <WorkspaceSwitcher compact />
                    </div>
                </div>

            <main className="flex-1 min-w-0 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-10 py-6 sm:py-10 pb-32 lg:pb-16">

                {/* Desktop: the sidebar carries nav, so the bell gets a slim
                    utility row at the top of the content column. */}
                <div className="hidden lg:flex justify-end mb-4">
                    <NotificationsBell posts={scheduledPosts} liConnection={liConnection} />
                </div>


                {/* Social Profiles tab */}
                {activeTab === 'profiles' && isConnected && !loading && (
                    <div className="mb-6">
                        <NotificationToggle authHeaders={getAuthHeaders} />
                    </div>
                )}

                {activeTab === 'profiles' && (
                    <SocialProfilesPanel
                        loading={loading}
                        isConnected={isConnected}
                        targets={targets}
                        metaScopes={connection ? {
                            granted: connection.grantedScopes || [],
                            required: connection.requiredScopes || [],
                        } : null}
                        instagramAccounts={connection?.instagramAccounts || []}
                        hiddenInstagram={
                            (connection?.availablePages || [])
                                .filter((p) => p.instagram_business_account?.id
                                    && !(connection.selectedPageIds || []).map(String).includes(String(p.id)))
                                .map((p) => ({
                                    username: p.instagram_business_account.username,
                                    pageName: p.name,
                                }))
                        }
                        linkedinConnection={liConnection}
                        postCounts={postCounts}
                        onAddProfile={() => setShowConnectModal(true)}
                        onManagePages={() => setShowPagePicker(true)}
                        onRefresh={handleRefresh}
                        onRemoveTarget={handleRemoveTarget}
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
                                            {['pending', 'published', 'failed'].includes(post.status) && (
                                                <button
                                                    onClick={() => handleDeleteScheduledPost(post)}
                                                    title={post.status === 'published'
                                                        ? 'Delete this post from Facebook'
                                                        : 'Remove from history'}
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

                {/* Post History tab — live feed straight from Meta, so it
                    includes posts made natively on FB/IG, not just ours. */}
                {activeTab === 'history' && isConnected && connection && (
                    <div className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] p-5 sm:p-6 mb-6 sm:mb-8">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)]">All Posts</h3>
                            <button
                                onClick={loadPlatformHistory}
                                disabled={historyLoading}
                                className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors disabled:opacity-60"
                                title="Refresh"
                            >
                                <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <p className="text-xs text-[var(--muted)] mb-4">
                            Everything published on your connected Pages and Instagram accounts —
                            whether it was posted through Botlance or natively.
                        </p>

                        {/* One feed failing must be visible, not silent — this is
                            how "only Instagram shows up" gets diagnosed. */}
                        {historyFeedErrors.length > 0 && (
                            <div className="flex items-start gap-2.5 rounded-xl border px-4 py-3 mb-4"
                                style={{ borderColor: 'rgba(251, 191, 36, 0.4)', background: 'rgba(251, 191, 36, 0.08)' }}>
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#FBBF24' }} />
                                <div className="text-[12px] text-[var(--text)] leading-relaxed min-w-0">
                                    <p className="font-medium mb-0.5">Some feeds could not be read:</p>
                                    {historyFeedErrors.map((msg, i) => (
                                        <p key={i} className="text-[var(--muted)] break-words">{msg}</p>
                                    ))}
                                </div>
                            </div>
                        )}

                        {historyLoading && platformHistory === null ? (
                            <div className="py-10 text-center text-sm text-[var(--muted)]">Loading your posts…</div>
                        ) : !platformHistory?.length ? (
                            <div className="py-10 text-center">
                                <Send className="h-8 w-8 mx-auto mb-3 text-[var(--muted-2)]" />
                                <p className="text-sm text-[var(--muted)]">
                                    No posts found on your connected accounts yet.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {platformHistory.map(post => {
                                    const Icon = platformMeta(post.platform).Icon;
                                    return (
                                        <div
                                            key={post.id}
                                            className="flex items-start gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)]"
                                        >
                                            {post.mediaUrl && (
                                                <img
                                                    src={post.mediaUrl}
                                                    alt=""
                                                    loading="lazy"
                                                    className="w-14 h-14 rounded-xl object-cover border border-[var(--border)] shrink-0"
                                                />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-[var(--text)] line-clamp-2 mb-2">
                                                    {post.message || <span className="text-[var(--muted-2)]">No caption</span>}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] font-medium">
                                                        <Icon className="h-3 w-3" />
                                                        {post.pageName}
                                                    </span>
                                                    <span>{new Date(post.publishedAt).toLocaleString()}</span>
                                                    {post.likes !== null && <span>· {post.likes} likes</span>}
                                                    {post.platform === 'facebook' ? (
                                                        <button
                                                            onClick={() => setCommentsPost(post)}
                                                            className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                                                            title="Read, reply to, hide or delete comments as your Page"
                                                        >
                                                            · {post.comments ?? 0} comments →
                                                        </button>
                                                    ) : (
                                                        post.comments !== null && <span>· {post.comments} comments</span>
                                                    )}
                                                    {post.permalink && (
                                                        <a
                                                            href={post.permalink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[var(--accent)] hover:text-[var(--accent-hover)]"
                                                        >
                                                            View →
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* LinkedIn history stays app-tracked: LinkedIn's API does not
                    let non-partner apps read a member's post list. */}
                {activeTab === 'history' && isConnected && publishedPosts.filter(p => p.provider === 'linkedin').length > 0 && (
                    <div className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] p-5 sm:p-6 mb-6 sm:mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)]">LinkedIn Posts</h3>
                            <span className="text-xs text-[var(--muted)]">
                                published via Botlance — LinkedIn does not expose full history
                            </span>
                        </div>
                        <div className="space-y-3">
                                {publishedPosts.filter(p => p.provider === 'linkedin').map(post => {
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
                                                    const Icon = platformMeta(platform).Icon;
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

                {/* Media Library tab — files stored in the user's paid storage */}
                {activeTab === 'library' && (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                        <div className="flex items-center gap-4 mb-1">
                            <h2 className="flex-1 text-[15px] font-semibold text-[var(--text)]">Media Library</h2>
                            <button
                                onClick={() => navigate('/storage')}
                                className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                            >
                                Manage storage →
                            </button>
                        </div>
                        <p className="text-xs text-[var(--muted)] mb-4">
                            Upload once, reuse in any post — the composer's Library tab pulls from here.
                        </p>
                        <MediaLibrary />
                    </div>
                )}

                {/* Analytics tab */}
                {activeTab === 'analytics' && isConnected && (
                    <AnalyticsPanel
                        hasMeta={Boolean(connection)}
                        hasLinkedIn={Boolean(liConnection)}
                        posts={scheduledPosts}
                        authHeaders={getAuthHeaders}
                    />
                )}

            </main>
            </div>

            </div>{/* end sidebar + content layout */}

            {commentsPost && (
                <CommentsModal
                    post={commentsPost}
                    authHeaders={getAuthHeaders}
                    onClose={() => setCommentsPost(null)}
                />
            )}

            <DashboardMobileNav
                active={activeTab}
                onNavigate={setActiveTab}
                isConnected={isConnected}
            />

            {/* Connect Modal */}
            <AddProfileModal
                isOpen={showConnectModal}
                orgConnectAvailable={liConnection?.orgConnectAvailable ?? false}
                onClose={() => setShowConnectModal(false)}
                onSelect={(provider, target) => {
                    setShowConnectModal(false);
                    handleOAuthConnect(provider, target);
                }}
            />

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
                        targets={targets}
                        selectedTargetId={scheduleFormData.pageId}
                        platforms={scheduleFormData.platforms}
                        onSelect={(targetId) => {
                            const target = targetById(targetId);
                            // Keep whatever the previous selection still supports;
                            // a Page with no linked Instagram, or any LinkedIn
                            // target, will not offer 'instagram'.
                            const kept = scheduleFormData.platforms
                                .filter((pl) => target?.platforms.includes(pl));
                            updateScheduleForm({
                                pageId: targetId,
                                platforms: kept.length ? kept : [target?.platforms[0] ?? 'facebook'],
                            });
                        }}
                        onPlatformsChange={(platforms) => updateScheduleForm({ platforms })}
                    />
                )}

                {scheduleStep === 2 && (
                    <StepContent
                        platforms={scheduleFormData.platforms}
                        content={scheduleFormData.content}
                        linkUrl={scheduleFormData.linkUrl}
                        mediaUrls={scheduleFormData.mediaUrls}
                        mediaFiles={scheduleFormData.mediaFiles}
                        onContentChange={(content) => updateScheduleForm({ content })}
                        onLinkChange={(linkUrl) => updateScheduleForm({ linkUrl })}
                        onMediaUpdate={(updates) => updateScheduleForm(updates)}
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

/**
 * Remounting on a workspace change is deliberate.
 *
 * The view holds a dozen pieces of connection state plus three refs -- notably
 * dataLoadedRef, which makes the loader fire exactly once per mount and would
 * otherwise swallow the reload. Keying the subtree resets every one of them,
 * including AnalyticsPanel's effect, whose dependency array would otherwise miss
 * a switch between two workspaces that happen to have the same post count.
 */
const MetaDashboardPage = () => {
    const { activeWorkspaceId } = useWorkspace();
    return <MetaDashboardView key={activeWorkspaceId || 'none'} />;
};

export default MetaDashboardPage;
