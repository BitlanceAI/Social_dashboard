import ApprovalQueuePanel from '@/features/meta/components/ApprovalQueuePanel';
import useApprovalQueue from '@/features/meta/hooks/useApprovalQueue';
import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Facebook } from 'lucide-react';
import { platformMeta, providerOf, prefixFor, charLimitFor } from '@/features/meta/lib/providers';
import AnalyticsPanel from '@/features/meta/components/AnalyticsPanel';
import EngagementInbox from '@/features/meta/components/EngagementInbox';
import CreatePostHub from '@/features/meta/components/CreatePostHub';
import SocialProfilesPanel from '@/features/meta/components/SocialProfilesPanel';
import AddProfileModal from '@/features/meta/components/AddProfileModal';
import PageSelectModal from '@/features/meta/components/PageSelectModal';
import NotificationToggle from '@/features/notifications/components/NotificationToggle';
import { NotificationsBell } from '@/features/notifications';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
    Trash2,
    MessageCircle,
    Heart,
    Check
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
import AssignPagesModal from '@/features/meta/components/AssignPagesModal';
import GraphicTemplatesModal from '@/features/templates/components/GraphicTemplatesModal';
import BulkUploadModal from '@/features/meta/components/BulkUploadModal';

// Module-scoped, so it survives the StrictMode/dev remount that resets a ref.
// One OAuth token is completed exactly once, no matter how many times the
// effect or auth-state handler re-fires it — kills the duplicate connect toast.
const processedOAuthTokens = new Set();
const PipelinesPage = lazy(() => import('@/features/pipelines/pages/PipelinesPage'));
const dashboardTabs = new Set(['create', 'inbox', 'approvals', 'profiles', 'library', 'history', 'analytics']);

const MetaDashboardView = ({ activeTab, setActiveTab }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const { activeWorkspaceId, workspaces } = useWorkspace();

    // Session state (fetched from Supabase)
    // 'schedule' queues for later, 'now' publishes immediately
    const [publishMode, setPublishMode] = useState('schedule');
    const [session, setSession] = useState(null);
    const approvalQueue = useApprovalQueue(session?.access_token, activeWorkspaceId, activeTab === 'approvals');

    // Connection state. Each provider connects independently, so the
    // dashboard is usable with either one on its own.
    const [connection, setConnection] = useState(null);          // Meta
    const [liConnection, setLiConnection] = useState(null);      // LinkedIn
    const [igConnection, setIgConnection] = useState(null);      // Direct Instagram Login
    const [showBulk, setShowBulk] = useState(false);             // bulk CSV modal
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Modal state
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [showPagePicker, setShowPagePicker] = useState(false);
    const [showAssignPages, setShowAssignPages] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    // When set, the templates modal opens deep-linked to an occasion.
    const [occasionContext, setOccasionContext] = useState(null);
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
        approverPhones: '', // comma-separated WhatsApp numbers; empty = no approval step
    });

    // WhatsApp approval channel: whether the server has it configured, and the
    // approver numbers this workspace used before. Loaded when the composer opens.
    const [approvalConfig, setApprovalConfig] = useState({ enabled: false, savedPhones: [], defaultPhones: [] });
    const approverEditVersion = useRef(0);
    const [savingApprovers, setSavingApprovers] = useState(false);
    const [reuseApprovers, setReuseApprovers] = useState(true);

    // Helper to update form
    const updateScheduleForm = (updates) => setScheduleFormData(prev => ({ ...prev, ...updates }));

    // Either provider on its own is enough to use the dashboard.
    const isConnected = Boolean(connection) || Boolean(liConnection) || Boolean(igConnection?.isValid);

    /**
     * Every account this user can publish to, flattened into one shape so the
     * composer does not care which network a target came from.
     *
     * `platforms` is what the target accepts: a Facebook Page with a linked
     * Instagram account offers both, which is what replaces the
     * `instagram_business_account` checks previously scattered through the UI.
     */
    const rawTargets = [
        ...(igConnection?.isValid ? [{
            id: igConnection.account.id, name: `@${igConnection.account.username}`,
            subtitle: 'Instagram · connected directly', provider: 'instagram',
            avatarUrl: igConnection.account.avatarUrl, platforms: ['instagram'],
            igUsername: igConnection.account.username,
        }] : []),
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
    // One card per profile — guard against a repeated page/actor slipping through.
    const seenTargetKeys = new Set();
    const targets = rawTargets.filter((t) => {
        const k = `${t.provider}-${t.id}`;
        if (seenTargetKeys.has(k)) return false;
        seenTargetKeys.add(k);
        return true;
    });

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

    /**
     * A Supabase session's `provider_token` is the token from SIGNING IN with
     * Facebook. It is NOT a Meta connection token, and must never be used as
     * one: the sign-in consent never shows the Page/Instagram asset picker, so
     * the token comes back with the permission names present but no asset
     * grant (`granular_scopes` with no `target_ids`). Meta then returns an
     * empty /me/accounts, and the dashboard shows zero Pages while every
     * permission looks correctly granted.
     *
     * Connecting Meta goes through handleOAuthConnect -> /api/meta/oauth/url,
     * which is the only flow that presents the asset picker and comes back
     * with target_ids attached.
     */
    const checkForFacebookToken = async (currentSession) => {
        if (!currentSession?.provider_token) return;
        console.log(
            '[Meta OAuth] Ignoring Supabase sign-in provider_token — it carries no Page/IG asset grant. Use Connect to run the Meta OAuth flow.'
        );
    };

    // Check for URL params (legacy/manual OAuth flow fallback)
    useEffect(() => {
        const oauthSuccess = searchParams.get('oauth_success');
        const token = searchParams.get('token');
        const error = searchParams.get('error');

        if (oauthSuccess && token && session?.access_token && !oauthProcessedRef.current) {
            oauthProcessedRef.current = true;
            handleOAuthComplete(token, session.access_token);
        } else if (searchParams.get('instagram_ticket') && session?.access_token) {
            completeInstagramLogin(searchParams.get('instagram_ticket'));
        } else if (searchParams.get('linkedin_connected') && session?.access_token) {
            // The LinkedIn callback already wrote the connection server-side --
            // there is no token in this URL to hand back. Just re-read it.
            toast.success('LinkedIn account connected');
            checkLinkedInConnection();
            window.history.replaceState({}, '', '/socialdashboad');
        } else if (error) {
            toast.error(`Connection failed: ${error}`);
            sessionStorage.removeItem('instagramLogin');
            window.history.replaceState({}, '', '/socialdashboad');
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
            return data;
        } catch (error) {
            console.error('Connection check failed:', error);
            return null;
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

    const checkInstagramConnection = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/instagram/connection`, { headers: getAuthHeaders() });
            const data = await response.json();
            if (response.ok) setIgConnection(data.connected ? data : null);
        } catch { /* Other providers remain usable if this provider is unavailable. */ }
    };

    const completeInstagramLogin = async (ticket) => {
        if (processedOAuthTokens.has(ticket)) return;
        processedOAuthTokens.add(ticket);
        window.history.replaceState({}, '', '/socialdashboad');
        try {
            const pending = JSON.parse(sessionStorage.getItem('instagramLogin') || 'null');
            sessionStorage.removeItem('instagramLogin');
            if (!pending?.verifier) throw new Error('Instagram login belongs to another browser session. Please connect again.');
            const response = await fetch(`${API_BASE_URL}/api/instagram/oauth/complete`, {
                method: 'POST', headers: { ...getAuthHeaders(), ...(pending.workspaceId ? { 'x-workspace-id': pending.workspaceId } : {}) },
                body: JSON.stringify({ ticket, verifier: pending.verifier }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Instagram connection failed.');
            toast.success('Instagram connected');
            await checkInstagramConnection();
        } catch (error) { toast.error(error.message); }
    };

    /** Connections, then the shared publishing queue. */
    const loadAllConnections = async () => {
        await Promise.all([checkConnection(), checkLinkedInConnection(), checkInstagramConnection()]);
        await loadScheduledPosts();
    };

    /**
     * Both providers answer an expired token with 401 + TOKEN_EXPIRED, so one
     * handler covers them -- it just needs to know whose connection to clear.
     */
    const handleAuthError = (status, data, provider = 'meta') => {
        if (status === 401 && data?.code === 'TOKEN_EXPIRED') {
            if (provider === 'instagram') {
                setIgConnection((prev) => prev ? { ...prev, isValid: false } : null);
                toast.error('Instagram session expired. Please reconnect.');
            } else if (provider === 'linkedin') {
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
    const [historyPlatform, setHistoryPlatform] = useState('all'); // all | facebook | instagram | linkedin
    const [historyStatus, setHistoryStatus] = useState('all'); // all | published | scheduled | failed
    const [historyRange, setHistoryRange] = useState('all'); // all | 24h | 7d | 30d | 90d
    const [historyNowMs] = useState(() => Date.now()); // stable "now" for range filtering
    // Facebook post whose comment thread is open in the manager modal
    const [commentsPost, setCommentsPost] = useState(null);
    const [likedHistoryPosts, setLikedHistoryPosts] = useState({});
    const [likeBusyId, setLikeBusyId] = useState(null);

    const handleHistoryLike = async (post) => {
        if (likeBusyId) return;
        const next = !likedHistoryPosts[post.id];
        setLikeBusyId(post.id);
        try {
            const params = new URLSearchParams({ pageId: post.pageId, mediaId: post.id });
            const response = await fetch(`${API_BASE_URL}/api/meta/instagram/likes${next ? '' : `?${params}`}`, {
                method: next ? 'POST' : 'DELETE',
                headers: { ...getAuthHeaders(), ...(next ? { 'Content-Type': 'application/json' } : {}) },
                ...(next ? { body: JSON.stringify({ pageId: post.pageId, mediaId: post.id }) } : {}),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Could not update the Instagram like');
            setLikedHistoryPosts((current) => ({ ...current, [post.id]: next }));
            toast.success(next ? 'Post liked on Instagram' : 'Instagram like removed');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLikeBusyId(null);
        }
    };

    const loadPlatformHistory = async () => {
        setHistoryLoading(true);
        try {
            const providers = [connection && 'meta', igConnection?.isValid && 'instagram'].filter(Boolean);
            const feeds = await Promise.all(providers.map(async (provider) => {
                try {
                    const response = await fetch(`${API_BASE_URL}${prefixFor(provider)}/posts/history`, { headers: getAuthHeaders() });
                    const data = await response.json();
                    handleAuthError(response.status, data, provider);
                    return data.success ? data : { posts: [], feedErrors: [{ platform: provider, error: data.error || 'Could not load posts.' }] };
                } catch { return { posts: [], feedErrors: [{ platform: provider, error: 'Could not load posts.' }] }; }
            }));
            // Meta posts carry the numeric Instagram account ID required by
            // engagement actions. Keep them when direct Instagram Login also
            // returns the same media ID.
            const postsById = new Map();
            for (const post of feeds.flatMap((feed) => feed.posts || [])) {
                if (!postsById.has(post.id)) postsById.set(post.id, post);
            }
            setPlatformHistory([...postsById.values()]);
            setHistoryFeedErrors(feeds.flatMap((f) => f.feedErrors || []));
        } catch (error) {
            console.error('Failed to load platform history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history') {
            // Post History merges live Meta posts with our tracked scheduled/
            // failed rows, so both sources load when the tab opens.
            if ((connection || igConnection?.isValid) && platformHistory === null && !historyLoading) loadPlatformHistory();
            loadScheduledPosts();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, connection, liConnection, igConnection]);

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

    // ── WhatsApp approval ────────────────────────────────────────────────────

    const loadApprovalConfig = async () => {
        const editVersion = approverEditVersion.current;
        try {
            const response = await fetch(`${API_BASE_URL}/api/approvals/approvers`, {
                headers: getAuthHeaders()
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                setApprovalConfig({ enabled: Boolean(data.enabled), savedPhones: data.phones || [], defaultPhones: data.defaultPhones || [] });
                setReuseApprovers(true);
                setScheduleFormData(current => current.approverPhones || editVersion !== approverEditVersion.current ? current : { ...current, approverPhones: (data.defaultPhones || []).join(', ') });
            }
        } catch (error) {
            // Optional feature: a failed probe just hides the approval field.
            console.error('Failed to load approval settings:', error);
        }
    };

    useEffect(() => {
        if (showScheduleModal && (session?.access_token || authTokenRef.current)) loadApprovalConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showScheduleModal]);

    const saveApprovalNumbers = async () => {
        setSavingApprovers(true);
        try {
            const input = scheduleFormData.approverPhones.trim();
            const response = await fetch(`${API_BASE_URL}/api/approvals/approvers`, {
                method: 'PUT', headers: getAuthHeaders(),
                body: JSON.stringify({ phones: [...approvalConfig.savedPhones, ...input.split(/[,;\s]+/).filter(Boolean)], defaultPhones: reuseApprovers ? input : [] }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save approval numbers');
            setApprovalConfig(current => ({ ...current, savedPhones: data.phones || [], defaultPhones: data.defaultPhones || [] }));
            toast.success(reuseApprovers && data.defaultPhones?.length ? 'Approval numbers saved. They will be filled in next time.' : 'Automatic approval numbers cleared.');
        } catch (err) { toast.error(err.message); }
        finally { setSavingApprovers(false); }
    };

    const [approvalBusyId, setApprovalBusyId] = useState(null);

    const handleApprovePost = async (post) => {
        const timing = new Date(post.scheduled_time).getTime() <= Date.now()
            ? 'Its scheduled time has passed. It will publish on the next scheduler run.'
            : 'It will publish at its scheduled time, or on the next scheduler run if that time passes before approval.';
        if (!confirm(`Approve this post from the dashboard? ${timing}`)) return;
        setApprovalBusyId(post.id);
        try {
            const response = await fetch(`${API_BASE_URL}/api/approvals/${post.id}/approve`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(data.error || 'Failed to approve post');
            } else {
                toast.success(data.message || 'Post approved');
            }
            await loadScheduledPosts();
        } catch {
            toast.error('Failed to approve post');
        } finally {
            setApprovalBusyId(null);
        }
    };

    const handleResendApproval = async (post) => {
        setApprovalBusyId(post.id);
        try {
            const response = await fetch(`${API_BASE_URL}/api/approvals/${post.id}/resend`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({})
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(data.error || 'Failed to resend WhatsApp request');
            } else {
                toast.success(data.message || 'Approval request resent');
            }
        } catch {
            toast.error('Failed to resend WhatsApp request');
        } finally {
            setApprovalBusyId(null);
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

            let options = { headers: getAuthHeaders() };
            if (provider === 'instagram') {
                const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, '0')).join('');
                sessionStorage.setItem('instagramLogin', JSON.stringify({ verifier, workspaceId: activeWorkspaceId }));
                options = { ...options, method: 'POST', body: JSON.stringify({ verifier }) };
            }
            const response = await fetch(`${API_BASE_URL}${prefixFor(provider)}/oauth/url${query}`, options);
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
        // Dedup by token at module scope: two callers (the auth-state handler
        // and the URL-param effect), plus StrictMode's dev remount, otherwise
        // fire this two+ times and post two "connected" toasts. A ref resets
        // on remount; this Set does not.
        if (!providerToken || processedOAuthTokens.has(providerToken)) {
            return;
        }
        processedOAuthTokens.add(providerToken);

        setConnecting(true);
        // Store token in ref for immediate synchronous access
        if (authToken) authTokenRef.current = authToken;
        try {
            console.log('[Meta OAuth] Completing connection with auth token:', authToken ? 'present' : 'missing');
            const response = await fetch(`${API_BASE_URL}/api/meta/connect-api-key`, {
                method: 'POST',
                headers: getAuthHeaders(authToken),
                body: JSON.stringify({ accessToken: providerToken, source: 'meta-oauth-flow' })
            });

            const data = await response.json();
            console.log('[Meta OAuth] Connect response:', data);
            if (data.success) {
                // The token authenticated but carries no Pages -- opening the
                // picker would show an empty list with no explanation, so say
                // what actually went wrong and who was signed in.
                if (data.warning) {
                    toast.error(data.warning, { duration: 12000 });
                    window.history.replaceState({}, '', '/socialdashboad');
                    await checkConnection();
                    return;
                }
                // Do NOT announce success yet. After connecting, ALWAYS open the
                // Page picker so the user chooses (or re-confirms) their Pages —
                // on a reconnect the server keeps the old selection, so the
                // picker would not open on its own. The "Connected N profiles"
                // toast fires only after they save in handleSavePageSelection.
                await checkConnection();
                // Clear the URL to preventing token leakage/re-submission
                window.history.replaceState({}, '', '/socialdashboad');
                setShowPagePicker(true);
            } else {
                toast.error(data.error || 'OAuth connection failed');
            }
        } catch (error) {
            console.error('OAuth completion error:', error);
            toast.error('OAuth completion failed');
            // Let a genuine failure be retried with the same token.
            processedOAuthTokens.delete(providerToken);
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
        if (target.provider === 'linkedin' || target.provider === 'instagram') {
            return handleDisconnect(target.provider);
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
        const label = provider === 'instagram' ? 'Instagram' : provider === 'linkedin' ? 'LinkedIn' : 'Meta';
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
            else if (provider === 'instagram') setIgConnection(null);
            else setConnection(null);
            setPlatformHistory(null);
            // Rows for the other provider are still valid, so re-read the queue
            // rather than clearing it outright.
            await loadScheduledPosts();
        } catch {
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
                igConnection && fetch(`${API_BASE_URL}/api/instagram/refresh-accounts`, {
                    method: 'POST', headers: getAuthHeaders(),
                }),
            ].filter(Boolean));
            await loadAllConnections();
            toast.success('Data refreshed');
        } catch {
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
        const provider = targetById(scheduleFormData.pageId)?.provider || providerOf(scheduleFormData.platforms);
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
            if (handleAuthError(response.status, data, provider)) return;
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
                } else if (data.approval) {
                    // Held for WhatsApp approval — say whether the request went out.
                    if (data.approval.sent) toast.success(data.message, { duration: 8000 });
                    else toast(data.message, { icon: '⚠️', duration: 12000 });
                    setActiveTab('approvals');
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
                    approverPhones: '',
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

    // Agency flow: place Pages from this account into another workspace.
    const handleAssignPages = async (targetWorkspaceId, pageIds) => {
        setSavingPages(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/meta/pages/assign`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ targetWorkspaceId, pageIds }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || 'Could not assign the Pages');
            const ws = workspaces.find((w) => w.id === targetWorkspaceId);
            toast.success(`Assigned ${pageIds.length} Page${pageIds.length === 1 ? '' : 's'} to ${ws?.name || 'the workspace'}`);
            setShowAssignPages(false);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSavingPages(false);
        }
    };

    const handleDeleteScheduledPost = async (post) => {
        // A published post is live on Meta; a pending one only exists here.
        const isPublished = post?.status === 'published';
        const network = post?.provider === 'instagram' ? 'Instagram' : post?.provider === 'linkedin' ? 'LinkedIn' : 'Facebook';
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
            scheduled: { icon: Clock, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-muted)]', label: 'Scheduled on Meta' },
            awaiting_approval: { icon: MessageCircle, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Awaiting WhatsApp approval' },
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

    // Scheduled posts split by lifecycle (sidebar counts, notifications)
    const publishedPosts = scheduledPosts.filter(p => p.status === 'published');
    const upcomingPosts = scheduledPosts.filter(p => p.status !== 'published');

    // ── Unified Post History ─────────────────────────────────────────────────
    // One list, filterable by status and platform. Published FB/IG come from the
    // live Meta feed (so native posts show too); scheduled/failed rows, plus
    // LinkedIn (no live feed), come from our tracked scheduled_posts.
    const liveHistoryItems = (platformHistory || []).map((p) => ({
        key: `live-${p.id}`,
        source: 'live',
        platforms: [p.platform],
        platform: p.platform,
        status: 'published',
        message: p.message,
        mediaUrl: p.mediaUrl,
        pageName: p.pageName,
        when: p.publishedAt,
        likes: p.likes,
        comments: p.comments,
        permalink: p.permalink,
        raw: p,
    }));

    const livePostIds = new Set(liveHistoryItems.map((i) => i.raw?.id).filter(Boolean));

    const dbHistoryItems = (scheduledPosts || []).flatMap((p) => {
        const isLinkedIn = p.provider === 'linkedin';
        const platforms = isLinkedIn
            ? ['linkedin']
            : ((p.platforms && p.platforms.length) ? p.platforms : ['facebook']);
        let status;
        if (p.status === 'failed') status = 'failed';
        else if (p.status === 'pending_approval') status = 'awaiting_approval';
        else if (['pending', 'processing', 'scheduled'].includes(p.status)) status = 'scheduled';
        else if (p.status === 'published') status = 'published';
        else return []; // cancelled etc. never surface

        // Only skip Meta published rows if they ALREADY exist in liveHistoryItems to avoid duplicate display
        if (status === 'published' && !isLinkedIn && p.meta_post_id && livePostIds.has(p.meta_post_id)) {
            return [];
        }

        const permalink = p.publish_results?.instagram?.permalink || p.publish_results?.facebook?.permalink
            || (platforms.includes('facebook') && p.meta_post_id ? `https://facebook.com/${p.meta_post_id}` : null);

        return [{
            key: `db-${p.id}`,
            source: 'db',
            platforms,
            platform: platforms[0],
            status,
            message: p.content,
            mediaUrl: (p.media_urls && p.media_urls[0]) || null,
            pageName: p.page_name,
            when: p.published_at || p.scheduled_time,
            permalink,
            error: p.error_message,
            raw: p,
        }];
    });

    const allHistoryItems = [...liveHistoryItems, ...dbHistoryItems]
        .sort((a, b) => new Date(b.when) - new Date(a.when));
    const RANGE_DAYS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
    const rangeCutoff = historyRange === 'all'
        ? 0
        : historyNowMs - RANGE_DAYS[historyRange] * 24 * 60 * 60 * 1000;
    const filteredHistory = allHistoryItems.filter((it) =>
        (historyStatus === 'all' || it.status === historyStatus)
        && (historyPlatform === 'all' || it.platforms.includes(historyPlatform))
        && (historyRange === 'all' || (it.when && new Date(it.when).getTime() >= rangeCutoff)));

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">

            {/* Header */}

            <div className="flex">

                <DashboardSidebar
                    active={activeTab}
                    onNavigate={setActiveTab}
                    isConnected={isConnected}
                    approvalCount={approvalQueue.data?.pendingCount || 0}
                    pageCount={connection?.pages?.length || 0}
                    scheduledCount={upcomingPosts.length}
                    publishedCount={publishedPosts.length}
                />

                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Mobile header. The navigation has no brand or account affordance —
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


                        {/* Approval Queue */}
                        {activeTab === 'pipelines' && (
                            <Suspense fallback={<p role="status">Loading AI Pipelines…</p>}>
                                <PipelinesPage />
                            </Suspense>
                        )}
                        {activeTab === 'approvals' && (
                            <ApprovalQueuePanel
                                key={activeWorkspaceId}
                                queue={approvalQueue}
                                token={session?.access_token}
                                workspaceId={activeWorkspaceId}
                                onChanged={() => loadScheduledPosts()}
                            />
                        )}

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
                                linkedinConnection={liConnection}
                                instagramConnection={igConnection}
                                postCounts={postCounts}
                                onAddProfile={() => setShowConnectModal(true)}
                                onAssignPages={connection?.availablePages?.length && workspaces.length > 1
                                    ? () => setShowAssignPages(true)
                                    : null}
                                onRefresh={handleRefresh}
                                onRemoveTarget={handleRemoveTarget}
                                refreshing={refreshing}
                            />
                        )}

                        {/* Post History tab — live feed straight from Meta, so it
                    includes posts made natively on FB/IG, not just ours. */}
                        {activeTab === 'history' && isConnected && (
                            <div className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] p-5 sm:p-6 mb-6 sm:mb-8">
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)]">All Posts</h3>
                                    <button
                                        onClick={() => { loadPlatformHistory(); loadScheduledPosts(); }}
                                        disabled={historyLoading}
                                        className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors disabled:opacity-60"
                                        title="Refresh"
                                    >
                                        <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                                <p className="text-xs text-[var(--muted)] mb-4">
                                    Every post on your connected accounts — published, scheduled, or failed,
                                    posted through Botlance or natively.
                                </p>

                                {/* Status + platform dropdown filters */}
                                <div className="flex flex-wrap items-center gap-3 mb-4">
                                    <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                        Status
                                        <select
                                            value={historyStatus}
                                            onChange={(e) => setHistoryStatus(e.target.value)}
                                            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)]"
                                        >
                                            <option value="all">All</option>
                                            <option value="published">Published</option>
                                            <option value="scheduled">Scheduled</option>
                                            <option value="awaiting_approval">Awaiting approval</option>
                                            <option value="failed">Failed</option>
                                        </select>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                        Platform
                                        <select
                                            value={historyPlatform}
                                            onChange={(e) => setHistoryPlatform(e.target.value)}
                                            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)]"
                                        >
                                            <option value="all">All</option>
                                            <option value="facebook">Facebook</option>
                                            <option value="instagram">Instagram</option>
                                            <option value="linkedin">LinkedIn</option>
                                        </select>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                        Date
                                        <select
                                            value={historyRange}
                                            onChange={(e) => setHistoryRange(e.target.value)}
                                            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)]"
                                        >
                                            <option value="all">All time</option>
                                            <option value="24h">Last 24 hours</option>
                                            <option value="7d">Last 7 days</option>
                                            <option value="30d">Last 30 days</option>
                                            <option value="90d">Last 90 days</option>
                                        </select>
                                    </label>
                                    <span className="text-[11px] text-[var(--muted-2)]">
                                        {filteredHistory.length} post{filteredHistory.length === 1 ? '' : 's'}
                                    </span>
                                </div>

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
                                ) : allHistoryItems.length === 0 ? (
                                    <div className="py-10 text-center">
                                        <Send className="h-8 w-8 mx-auto mb-3 text-[var(--muted-2)]" />
                                        <p className="text-sm text-[var(--muted)]">
                                            No posts on your connected accounts yet.
                                        </p>
                                    </div>
                                ) : filteredHistory.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-[var(--muted)]">
                                        No posts match these filters.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {filteredHistory.map((it) => {
                                            const Icon = platformMeta(it.platform).Icon;
                                            const statusConfig = getStatusConfig(it.status);
                                            return (
                                                <div
                                                    key={it.key}
                                                    className="flex flex-col gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)]"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        {it.mediaUrl && (
                                                            <img
                                                                src={it.mediaUrl}
                                                                alt=""
                                                                loading="lazy"
                                                                className="w-14 h-14 rounded-xl object-cover border border-[var(--border)] shrink-0"
                                                            />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-[var(--text)] line-clamp-3 mb-2">
                                                                {it.message || <span className="text-[var(--muted-2)]">No caption</span>}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] font-medium">
                                                                    <Icon className="h-3 w-3" />
                                                                    {it.pageName}
                                                                </span>
                                                                <span>{it.when ? new Date(it.when).toLocaleString() : ''}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {it.status === 'failed' && it.error && (
                                                        <p className="text-[11px] text-red-500 line-clamp-2">{it.error}</p>
                                                    )}

                                                    {it.status === 'awaiting_approval' && (
                                                        <p className="text-[11px] text-[var(--muted)]">
                                                            Sent to {(it.raw.approver_phones || []).map((p) => `+${p}`).join(', ') || 'no approver'}
                                                            {it.raw.approval_sent_at
                                                                ? ` · ${new Date(it.raw.approval_sent_at).toLocaleString()}`
                                                                : ' · WhatsApp request not delivered yet'}
                                                        </p>
                                                    )}

                                                    <div className="flex flex-wrap items-center justify-between gap-2 mt-auto">
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                                                            {statusConfig.label}
                                                        </span>
                                                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                                            {it.source === 'live' && it.likes != null && (
                                                                <span className="text-[var(--muted)]">{it.likes} likes</span>
                                                            )}
                                                            {it.source === 'live' && it.platform === 'instagram' && /^\d+$/.test(String(it.raw.pageId)) && (
                                                                <button
                                                                    onClick={() => handleHistoryLike(it.raw)}
                                                                    disabled={likeBusyId === it.raw.id}
                                                                    aria-label={`${likedHistoryPosts[it.raw.id] ? 'Unlike' : 'Like'} Instagram post by ${it.pageName}`}
                                                                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-semibold text-[var(--accent)] hover:bg-[var(--accent-muted)] disabled:opacity-50"
                                                                >
                                                                    <Heart className={`h-3.5 w-3.5 ${likedHistoryPosts[it.raw.id] ? 'fill-current' : ''}`} />
                                                                    {likedHistoryPosts[it.raw.id] ? 'Unlike' : 'Like'}
                                                                </button>
                                                            )}
                                                            {it.source === 'live' && ['facebook', 'instagram'].includes(it.platform) && (
                                                                <button
                                                                    onClick={() => setCommentsPost(it.raw)}
                                                                    className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                                                                    title={`Read, reply to, hide or delete ${it.platform} comments`}
                                                                >
                                                                    {it.comments ?? 0} comments →
                                                                </button>
                                                            )}
                                                            {it.source === 'live' && !['facebook', 'instagram'].includes(it.platform) && it.comments != null && (
                                                                <span className="text-[var(--muted)]">{it.comments} comments</span>
                                                            )}
                                                            {it.permalink && (
                                                                <a
                                                                    href={it.permalink}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium"
                                                                >
                                                                    View →
                                                                </a>
                                                            )}

                                                            {it.source === 'db' && it.status === 'awaiting_approval' && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleResendApproval(it.raw)}
                                                                        disabled={approvalBusyId === it.raw.id}
                                                                        title="Send the WhatsApp approval request again"
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-50 transition-colors"
                                                                    >
                                                                        <MessageCircle className="h-3.5 w-3.5" /> Resend
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleApprovePost(it.raw)}
                                                                        disabled={approvalBusyId === it.raw.id}
                                                                        title="Approve from the dashboard without waiting for WhatsApp"
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                                                                    >
                                                                        <Check className="h-3.5 w-3.5" /> Approve
                                                                    </button>
                                                                </>
                                                            )}
                                                            {it.source === 'db' && (
                                                                <button
                                                                    onClick={() => handleDeleteScheduledPost(it.raw)}
                                                                    title={it.status === 'scheduled' ? 'Cancel this post' : 'Remove from history'}
                                                                    className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
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

                        {/* Create a Post tab */}
                        {activeTab === 'create' && (
                            <CreatePostHub
                                isConnected={isConnected}
                                onConnect={() => setActiveTab('profiles')}
                                onSelect={(mode) => {
                                    if (mode === 'pipeline') {
                                        navigate('/pipelines');
                                        return;
                                    }
                                    if (mode === 'template') {
                                        setOccasionContext(null);
                                        setShowTemplates(true);
                                        return;
                                    }
                                    if (mode === 'bulk') {
                                        setShowBulk(true);
                                        return;
                                    }
                                    setPublishMode(mode);
                                    setScheduleStep(1);
                                    setShowScheduleModal(true);
                                }}
                                onPickOccasion={(occasion) => {
                                    // Open the template gallery filtered to this occasion,
                                    // carrying its date so the post pre-schedules to it.
                                    setOccasionContext({
                                        niche: 'occasion',
                                        search: occasion.name,
                                        date: occasion.date,
                                    });
                                    setShowTemplates(true);
                                }}
                            />
                        )}

                        {activeTab === 'inbox' && isConnected && (
                            <EngagementInbox
                                authHeaders={getAuthHeaders}
                                onOpenThread={setCommentsPost}
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
                                hasInstagram={Boolean(igConnection?.isValid)}
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
                approvalCount={approvalQueue.data?.pendingCount || 0}
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

            <GraphicTemplatesModal
                isOpen={showTemplates}
                workspaceId={activeWorkspaceId}
                initialNiche={occasionContext?.niche || 'all'}
                initialSearch={occasionContext?.search || ''}
                scheduledDate={occasionContext?.date || null}
                onClose={() => { setShowTemplates(false); setOccasionContext(null); }}
                onUseImage={(imageUrl, opts = {}) => {
                    // Drop the generated image into the composer as media and
                    // open the schedule flow so the user can caption + publish.
                    const patch = { mediaUrls: [imageUrl], mediaFiles: [] };
                    // Occasion-driven: pre-set the schedule to the occasion date.
                    if (opts.scheduledDate) patch.scheduledTime = `${opts.scheduledDate}T09:00`;
                    updateScheduleForm(patch);
                    setShowTemplates(false);
                    setOccasionContext(null);
                    setPublishMode('schedule');
                    setScheduleStep(2); // jump to the content step (media already set)
                    setShowScheduleModal(true);
                }}
            />

            <BulkUploadModal
                isOpen={showBulk}
                targets={targets}
                authHeaders={getAuthHeaders}
                onDone={loadScheduledPosts}
                onClose={() => setShowBulk(false)}
            />

            <AssignPagesModal
                isOpen={showAssignPages}
                pages={connection?.availablePages || []}
                workspaces={workspaces}
                currentWorkspaceId={activeWorkspaceId}
                onAssign={handleAssignPages}
                onClose={() => setShowAssignPages(false)}
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
                        approvalEnabled={approvalConfig.enabled}
                        savedApprovers={approvalConfig.savedPhones}
                        savingApprovers={savingApprovers}
                        reuseApprovers={reuseApprovers}
                        onReuseApproversChange={setReuseApprovers}
                        onSaveApprovers={saveApprovalNumbers}
                        approverPhones={scheduleFormData.approverPhones}
                        onApproverChange={(approverPhones) => { ++approverEditVersion.current; updateScheduleForm({ approverPhones }); }}
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
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const activeTab = pathname === '/pipelines' ? 'pipelines' : dashboardTabs.has(requestedTab) ? requestedTab : 'create';
    const setActiveTab = tab => {
        if (tab === 'pipelines') {
            navigate('/pipelines');
        } else if (dashboardTabs.has(tab)) {
            if (pathname === '/pipelines') navigate(`/socialdashboad?tab=${tab}`);
            else setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('tab', tab); return next; });
        }
    };
    return <MetaDashboardView key={activeWorkspaceId || 'none'} activeTab={activeTab} setActiveTab={setActiveTab} />;
};

export default MetaDashboardPage;
