import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabaseClient';
import toast from 'react-hot-toast';
import {
    ArrowLeft,
    Target,
    Sparkles,
    BarChart3,
    IndianRupee,
    TrendingUp,
    Settings,
    PlayCircle,
    PauseCircle,
    RefreshCw,
    PlusCircle,
    Eye,
    Edit3,
    Zap,
    Layers,
    Globe,
    CheckCircle2,
    Clock,
    AlertCircle,
    Link2,
    Unlink,
    Key,
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
    Trash2,
    CreditCard
} from 'lucide-react';

import {
    SchedulePostModal,
    StepAccount,
    StepContent,
    StepSchedule,
    StepAdvanced,
    StepReview
} from '../../components/meta';

import API_BASE_URL from '../../config';

import CampaignManagerPage from '../admin/CampaignManagerPage';

const MetaAdsPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { credits, user } = useAuth();
    const [showInternalCampaigns, setShowInternalCampaigns] = useState(false);

    // Session state (fetched from Supabase)
    const [session, setSession] = useState(null);

    // Connection state
    const [isConnected, setIsConnected] = useState(false);
    const [connection, setConnection] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Modal state
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [connectMethod, setConnectMethod] = useState('api-key');
    const [connecting, setConnecting] = useState(false);
    const oauthProcessedRef = useRef(false);
    const authTokenRef = useRef(null); // Stores auth token synchronously for immediate use
    const dataLoadedRef = useRef(false); // Prevents re-fetching on every token refresh (tab switch)

    // Form state
    const [apiKeyForm, setApiKeyForm] = useState({
        accessToken: '',
        appId: '',
        appSecret: ''
    });

    // Data state
    const [campaigns, setCampaigns] = useState([]);
    const [scheduledPosts, setScheduledPosts] = useState([]);
    const [insights, setInsights] = useState({});
    const [filter, setFilter] = useState('all');
    const [adAccountBalance, setAdAccountBalance] = useState(null); // { balance, currency, amount_spent, name }

    useEffect(() => {
        if (filter !== 'all') setShowInternalCampaigns(false);
    }, [filter]);

    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

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
        recurring: false,
        recurringFrequency: 'weekly',
        targetAudience: { ageMin: 18, ageMax: 65, location: '' }
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

    const getAuthHeaders = (authToken) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken || session?.access_token || authTokenRef.current}`
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
                // Load campaigns and posts
                await Promise.all([
                    loadCampaigns(),
                    loadScheduledPosts(),
                    loadInsights(),
                    loadAdAccountBalance()
                ]);
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

    const loadCampaigns = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/meta/campaigns`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (handleAuthError(response.status, data)) return;

            if (data.success) {
                setCampaigns(data.campaigns || []);
            }
        } catch (error) {
            console.error('Failed to load campaigns:', error);
        }
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

    const loadInsights = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/meta/insights`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (handleAuthError(response.status, data)) return;

            if (data.success) {
                setInsights(data.insights || {});
            }
        } catch (error) {
            console.error('Failed to load insights:', error);
        }
    };

    const loadAdAccountBalance = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/meta/account-balance`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success && data.accounts && data.accounts.length > 0) {
                setAdAccountBalance(data.accounts[0]); // Use first ad account
            }
        } catch (error) {
            console.error('Failed to load account balance:', error);
        }
    };

    const handleConnectApiKey = async (e) => {
        e.preventDefault();
        if (!apiKeyForm.accessToken) {
            toast.error('Access token is required');
            return;
        }

        setConnecting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/meta/connect-api-key`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(apiKeyForm)
            });

            const data = await response.json();

            if (data.success) {
                toast.success('Meta account connected successfully!');
                setShowConnectModal(false);
                setApiKeyForm({ accessToken: '', appId: '', appSecret: '' });
                await checkConnection();
            } else {
                toast.error(data.error || 'Failed to connect');
            }
        } catch (error) {
            toast.error('Connection failed: ' + error.message);
        } finally {
            setConnecting(false);
        }
    };

    const handleSupabaseOAuthConnect = async () => {
        try {
            setConnecting(true);
            oauthProcessedRef.current = false; // Reset for new attempt

            // Use linkIdentity to keep the existing session (avoids logging out the user)
            const { data, error } = await supabase.auth.linkIdentity({
                provider: 'facebook',
                options: {
                    redirectTo: window.location.origin + '/dashboard/agents/meta',
                    scopes: 'pages_manage_posts,pages_read_engagement,pages_show_list,ads_management,ads_read,business_management,instagram_basic,instagram_content_publish'
                }
            });

            if (error) {
                // If linkIdentity fails (e.g. identity already linked), fall back to signInWithOAuth
                console.warn('[Meta OAuth] linkIdentity failed, trying signInWithOAuth:', error.message);
                const { error: signInError } = await supabase.auth.signInWithOAuth({
                    provider: 'facebook',
                    options: {
                        redirectTo: window.location.origin + '/dashboard/agents/meta',
                        scopes: 'pages_manage_posts,pages_read_engagement,pages_show_list,ads_management,ads_read,business_management,instagram_basic,instagram_content_publish'
                    }
                });
                if (signInError) throw signInError;
            }
            // Redirect happens automatically
        } catch (error) {
            console.error('Supabase OAuth error:', error);
            toast.error('Failed to start Facebook login');
            setConnecting(false);
        }
    };

    // Alias for the button click
    const handleOAuthConnect = handleSupabaseOAuthConnect;

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
                window.history.replaceState({}, '', '/dashboard/agents/meta');
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
                loadCampaigns(),
                loadScheduledPosts(),
                loadInsights(),
                loadAdAccountBalance()
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

        // Basic Validation
        if (!scheduleFormData.pageId || (!scheduleFormData.content && !scheduleFormData.mediaUrls[0] && scheduleFormData.mediaFiles.length === 0) || !scheduleFormData.scheduledTime) {
            toast.error('Please fill all required fields');
            return;
        }

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
            const localDate = new Date(scheduleFormData.scheduledTime);
            const utcScheduledTime = localDate.toISOString();

            const response = await fetch(`${API_BASE_URL}/api/meta/posts/schedule`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...scheduleFormData,
                    scheduledTime: utcScheduledTime, // Send UTC
                    originalLocalTime: scheduleFormData.scheduledTime, // Optional: keep ref
                    mediaUrls: finalMediaUrls
                })
            });

            const data = await response.json();
            if (data.success) {
                toast.success('Post scheduled successfully!');
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
                    recurring: false,
                    recurringFrequency: 'weekly',
                    targetAudience: { ageMin: 18, ageMax: 65, location: '' }
                });
                setUploadMode('file');
                await loadScheduledPosts();
            } else {
                toast.error(data.error || 'Failed to schedule post');
            }
        } catch (error) {
            toast.error(error.message || 'Failed to schedule post');
            console.error(error);
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
            ACTIVE: { icon: PlayCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Active' },
            PAUSED: { icon: PauseCircle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Paused' },
            SCHEDULED: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Scheduled' },
            pending: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Pending' },
            published: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Published' },
            failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' }
        };
        return configs[status] || configs.PAUSED;
    };

    const stats = {
        totalCampaigns: campaigns.length,
        activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
        totalSpent: parseFloat(insights.spend || 0),
        totalImpressions: parseInt(insights.impressions || 0),
        totalConversions: parseInt(insights.conversions || 0),
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
            case 4:
                return true; // Advanced options are optional
            default:
                return true;
        }
    };

    const filteredCampaigns = campaigns.filter(campaign => {
        if (filter === 'all') return true;
        return campaign.status?.toUpperCase() === filter.toUpperCase();
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20 flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">Loading Meta Ads...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20">

            {/* Header */}
            <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-gray-200/50 dark:border-slate-700/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/agents')}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300 transition-colors"
                                title="Back to Agents"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                                    <Target className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                                        Meta Ads Automation
                                    </h1>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {isConnected ? `${stats.pages} Pages Connected` : 'Connect your Meta account'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Connection Status */}
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isConnected
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
                                }`}>
                                {isConnected ? <Link2 className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
                                {isConnected ? 'Connected' : 'Not Connected'}
                            </div>

                            {/* Credits Display */}
                            <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/30">
                                <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500">
                                    <Zap className="h-4 w-4 text-white" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Credits</p>
                                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-none">
                                        {credits?.toLocaleString() || 0}
                                    </p>
                                </div>
                            </div>


                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Hero Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 mb-8">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzLTItMi0yLTQgMi00IDItNGMwLTItMi00LTItNHMyLTIgMi00LTItNC0yLTRjMC0yIDItNCAyLTRzLTItMi0yLTQgMi00IDItNGMwLTIgNC0yIDQtMnM0IDAgNC0yIDQgMiA0IDItMiA0LTIgNCAyIDQgMiA0cy0yIDItMiA0IDIgNCAyIDRjMCAyLTIgNC0yIDRzMiAyIDIgNC0yIDQtMiA0YzAgMi0yIDQtMiA0czIgMiAyIDQtMiA0LTIgNGMwIDItNCAyLTQgMnMtNCAwLTQgMi00LTItNC0yIDItNC0yLTQtMi00LTItNGMwLTIgMi00IDItNHMtMi0yLTItNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-medium backdrop-blur-sm">
                                    <Sparkles className="inline h-3 w-3 mr-1" />
                                    AI Powered
                                </span>
                                <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-medium backdrop-blur-sm">
                                    <Globe className="inline h-3 w-3 mr-1" />
                                    Meta Platform
                                </span>
                            </div>
                            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
                                {isConnected ? 'Manage Your Campaigns' : 'Connect Your Meta Account'}
                            </h2>
                            <p className="text-blue-100 text-lg max-w-xl">
                                {isConnected
                                    ? 'Create, optimize, and schedule your Facebook & Instagram posts with AI-driven automation.'
                                    : 'Link your Meta Business account to start automating campaigns and scheduling posts.'
                                }
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            {isConnected ? (
                                <>
                                    <button
                                        onClick={() => setShowScheduleModal(true)}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors shadow-lg"
                                    >
                                        <Calendar className="h-5 w-5" />
                                        Schedule Post
                                    </button>
                                    <a
                                        href={`https://business.facebook.com/billing/payment_methods?act=${connection?.ad_accounts?.[0]?.account_id || ''}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/20"
                                    >
                                        <CreditCard className="h-5 w-5" />
                                        Add Payment
                                    </a>
                                    <button
                                        onClick={handleDisconnect}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/20"
                                    >
                                        <Unlink className="h-5 w-5" />
                                        Disconnect
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setShowConnectModal(true)}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors shadow-lg"
                                >
                                    <Link2 className="h-5 w-5" />
                                    Connect Account
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                {isConnected && (
                    <>
                        {/* Ad Account Balance Card */}
                        {adAccountBalance && (
                            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 mb-4 shadow-lg shadow-emerald-500/20">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                                <div className="relative z-10 flex items-center justify-between">
                                    <div>
                                        <p className="text-emerald-100 text-sm font-medium mb-1">Available Ad Balance</p>
                                        <p className="text-3xl font-bold text-white">
                                            {adAccountBalance.currency} {parseFloat(adAccountBalance.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-emerald-200 text-xs mt-1">
                                            Spent: {adAccountBalance.currency} {parseFloat(adAccountBalance.amount_spent).toLocaleString(undefined, { minimumFractionDigits: 2 })} · {adAccountBalance.name}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm">
                                            <CreditCard className="h-7 w-7 text-white" />
                                        </div>
                                        <button
                                            onClick={loadAdAccountBalance}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors"
                                            title="Refresh balance"
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                            Refresh
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Metric Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                            {[
                                { label: 'Total Campaigns', value: stats.totalCampaigns, icon: Layers, color: 'from-blue-500 to-cyan-500' },
                                { label: 'Active Campaigns', value: stats.activeCampaigns, icon: PlayCircle, color: 'from-emerald-500 to-teal-500' },
                                { label: 'Total Spent', value: `₹${stats.totalSpent.toLocaleString()}`, icon: IndianRupee, color: 'from-amber-500 to-orange-500' },
                                { label: 'Impressions', value: stats.totalImpressions.toLocaleString(), icon: Eye, color: 'from-violet-500 to-purple-500' },
                                { label: 'Conversions', value: stats.totalConversions, icon: TrendingUp, color: 'from-rose-500 to-pink-500' }
                            ].map((stat) => (
                                <div key={stat.label} className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800/50 border border-gray-200/50 dark:border-slate-700/50 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-slate-900/50 hover:-translate-y-0.5">
                                    <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${stat.color} opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500`} />
                                    <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${stat.color} mb-3`}>
                                        <stat.icon className="h-5 w-5 text-white" />
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Connected Pages */}
                {isConnected && connection?.pages?.length > 0 && (
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-gray-200/50 dark:border-slate-700/50 p-6 mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Connected Pages</h3>
                            <button
                                onClick={handleRefresh}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors text-sm font-medium"
                            >
                                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {connection.pages.map(page => (
                                <div key={page.id} className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200/50 dark:border-slate-700/50">
                                    {page.picture?.data?.url ? (
                                        <img src={page.picture.data.url} alt={page.name} className="w-12 h-12 rounded-xl object-cover" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                            <FileText className="h-6 w-6 text-white" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">{page.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{page.category || 'Page'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Scheduled Posts */}
                {isConnected && scheduledPosts.length > 0 && (
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-gray-200/50 dark:border-slate-700/50 p-6 mb-8">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Scheduled Posts</h3>
                        <div className="space-y-3">
                            {scheduledPosts.map(post => {
                                const statusConfig = getStatusConfig(post.status);
                                return (
                                    <div key={post.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200/50 dark:border-slate-700/50">
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-900 dark:text-white line-clamp-1">{post.content}</p>
                                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
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
                                                    className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
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

                {/* Tabs */}
                <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-slate-700">
                    <button
                        onClick={() => setFilter('all')}
                        className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${filter === 'all' && !showInternalCampaigns
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        Meta Campaigns
                    </button>
                    <button
                        onClick={() => setShowInternalCampaigns(true)}
                        className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${showInternalCampaigns
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        Internal Campaigns
                    </button>
                </div>

                {showInternalCampaigns ? (
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-gray-200/50 dark:border-slate-700/50 p-6">
                        <CampaignManagerPage embedded={true} />
                    </div>
                ) : (
                    isConnected && (
                        <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-gray-200/50 dark:border-slate-700/50 shadow-xl shadow-gray-200/20 dark:shadow-slate-900/30 overflow-hidden">
                            <div className="p-6 border-b border-gray-200/50 dark:border-slate-700/50">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Campaigns</h2>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Manage and monitor your Meta ad campaigns</p>
                                    </div>
                                </div>

                                {/* Filter Pills */}
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {['all', 'ACTIVE', 'PAUSED', 'SCHEDULED'].map(status => (
                                        <button
                                            key={status}
                                            onClick={() => setFilter(status)}
                                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${filter === status
                                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                                                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                                }`}
                                        >
                                            {status === 'all' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6">
                                {filteredCampaigns.length === 0 ? (
                                    <div className="text-center py-16">
                                        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                                            <Target className="h-10 w-10 text-gray-400 dark:text-gray-500" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                            No campaigns found
                                        </h3>
                                        <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                                            {campaigns.length === 0
                                                ? 'Create your first Meta ad campaign in Meta Business Suite.'
                                                : 'No campaigns match the selected filter.'
                                            }
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {filteredCampaigns.map(campaign => {
                                            const statusConfig = getStatusConfig(campaign.status);
                                            const StatusIcon = statusConfig.icon;
                                            const spent = parseFloat(campaign.insights?.spend || 0);
                                            const budget = parseFloat(campaign.daily_budget || campaign.lifetime_budget || 0) / 100;

                                            return (
                                                <div
                                                    key={campaign.id}
                                                    className="group relative overflow-hidden rounded-2xl border border-gray-200/50 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-900/30 p-6 transition-all duration-300 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800/50"
                                                >
                                                    <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3 mb-2">
                                                                <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                                                                    {campaign.name}
                                                                </h3>
                                                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                                                                    <StatusIcon className="h-3.5 w-3.5" />
                                                                    {statusConfig.label}
                                                                </div>
                                                            </div>
                                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                                Objective: {campaign.objective || 'N/A'}
                                                            </p>
                                                        </div>

                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 lg:gap-8">
                                                            <div>
                                                                <p className="text-xs text-gray-400 dark:text-gray-500">Spent</p>
                                                                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                                                    ₹{spent.toFixed(2)}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-gray-400 dark:text-gray-500">Impressions</p>
                                                                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                                                    {parseInt(campaign.insights?.impressions || 0).toLocaleString()}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-gray-400 dark:text-gray-500">Clicks</p>
                                                                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                                                    {parseInt(campaign.insights?.clicks || 0).toLocaleString()}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-gray-400 dark:text-gray-500">CTR</p>
                                                                <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                                                                    {parseFloat(campaign.insights?.ctr || 0).toFixed(2)}%
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleViewDetails(campaign)}
                                                                className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
                                                                title="View Details"
                                                            >
                                                                <Eye className="h-5 w-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleViewAnalytics(campaign)}
                                                                className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
                                                                title="Analytics"
                                                            >
                                                                <BarChart3 className="h-5 w-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                {/* Not Connected State */}
                {!isConnected && (
                    <div className="bg-white dark:bg-slate-800/50 rounded-3xl border border-gray-200/50 dark:border-slate-700/50 p-12 text-center">
                        <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center">
                            <Link2 className="h-12 w-12 text-blue-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                            Connect Your Meta Account
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
                            Link your Meta Business account to start managing campaigns, scheduling posts, and viewing analytics all in one place.
                        </p>
                        <button
                            onClick={() => setShowConnectModal(true)}
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-lg shadow-blue-500/25"
                        >
                            <Link2 className="h-5 w-5" />
                            Connect Account
                        </button>
                    </div>
                )}
            </main>

            {/* Campaign Details Modal */}
            {showDetailsModal && selectedCampaign && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800 sticky top-0">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Campaign Details</h3>
                            <button onClick={() => setShowDetailsModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
                                <X className="h-5 w-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {Object.entries(selectedCampaign).map(([key, value]) => {
                                    if (key === 'insights' || typeof value === 'object') return null;
                                    return (
                                        <div key={key} className="p-3 bg-gray-50 dark:bg-slate-900 rounded-xl">
                                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">{key.replace(/_/g, ' ')}</p>
                                            <p className="text-gray-900 dark:text-white font-medium break-all">{String(value)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Campaign Analytics Modal */}
            {showAnalyticsModal && selectedCampaign && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800 sticky top-0">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Campaign Analytics</h3>
                                <p className="text-sm text-gray-500">{selectedCampaign.name}</p>
                            </div>
                            <button onClick={() => setShowAnalyticsModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
                                <X className="h-5 w-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-6">
                            {selectedCampaign.insights ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {[
                                        { label: 'Spend', value: `$${parseFloat(selectedCampaign.insights.spend || 0).toFixed(2)}`, icon: DollarSign, color: 'text-emerald-500' },
                                        { label: 'Impressions', value: parseInt(selectedCampaign.insights.impressions || 0).toLocaleString(), icon: Eye, color: 'text-blue-500' },
                                        { label: 'Clicks', value: parseInt(selectedCampaign.insights.clicks || 0).toLocaleString(), icon: MousePointer, color: 'text-violet-500' },
                                        { label: 'CPC', value: `$${parseFloat(selectedCampaign.insights.cpc || 0).toFixed(2)}`, icon: TrendingUp, color: 'text-amber-500' },
                                        { label: 'CPM', value: `$${parseFloat(selectedCampaign.insights.cpm || 0).toFixed(2)}`, icon: BarChart3, color: 'text-rose-500' },
                                        { label: 'CTR', value: `${parseFloat(selectedCampaign.insights.ctr || 0).toFixed(2)}%`, icon: Target, color: 'text-cyan-500' },
                                    ].map((stat) => (
                                        <div key={stat.label} className="p-4 bg-gray-50 dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700">
                                            <div className="flex items-center gap-2 mb-2">
                                                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                                                <span className="text-sm text-gray-500">{stat.label}</span>
                                            </div>
                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10">
                                    <p className="text-gray-500">No analytics data available for this campaign.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Connect Modal */}
            {showConnectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Connect Meta Account</h3>
                                <button
                                    onClick={() => setShowConnectModal(false)}
                                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {/* Method Tabs */}
                            <div className="flex gap-2 mb-6">
                                <button
                                    onClick={() => setConnectMethod('api-key')}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${connectMethod === 'api-key'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    <Key className="h-4 w-4" />
                                    API Key
                                </button>
                                <button
                                    onClick={() => setConnectMethod('oauth')}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${connectMethod === 'oauth'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    Login with Meta
                                </button>
                            </div>

                            {connectMethod === 'api-key' ? (
                                <form onSubmit={handleConnectApiKey} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Access Token *
                                        </label>
                                        <input
                                            type="password"
                                            value={apiKeyForm.accessToken}
                                            onChange={(e) => setApiKeyForm({ ...apiKeyForm, accessToken: e.target.value })}
                                            placeholder="Your Meta access token"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            App ID (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={apiKeyForm.appId}
                                            onChange={(e) => setApiKeyForm({ ...apiKeyForm, appId: e.target.value })}
                                            placeholder="Meta App ID"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            App Secret (Optional)
                                        </label>
                                        <input
                                            type="password"
                                            value={apiKeyForm.appSecret}
                                            onChange={(e) => setApiKeyForm({ ...apiKeyForm, appSecret: e.target.value })}
                                            placeholder="Meta App Secret"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={connecting}
                                        className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:from-blue-700 hover:to-indigo-700 transition-colors disabled:opacity-50"
                                    >
                                        {connecting ? (
                                            <>
                                                <RefreshCw className="h-5 w-5 animate-spin" />
                                                Connecting...
                                            </>
                                        ) : (
                                            <>
                                                <Link2 className="h-5 w-5" />
                                                Connect Account
                                            </>
                                        )}
                                    </button>
                                </form>
                            ) : (
                                <div className="text-center py-8">
                                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#1877F2] flex items-center justify-center">
                                        <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                                        Click below to securely connect your Meta account
                                    </p>
                                    <button
                                        onClick={handleOAuthConnect}
                                        className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#1877F2] text-white font-semibold hover:bg-[#166FE5] transition-colors"
                                    >
                                        <ExternalLink className="h-5 w-5" />
                                        Continue with Meta
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Schedule Post Modal - Component-Based */}
            <SchedulePostModal
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

                {scheduleStep === 4 && (
                    <StepAdvanced
                        targetAudience={scheduleFormData.targetAudience}
                        callToAction={scheduleFormData.callToAction}
                        onTargetChange={(targetAudience) => updateScheduleForm({ targetAudience })}
                        onCtaChange={(callToAction) => updateScheduleForm({ callToAction })}
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
