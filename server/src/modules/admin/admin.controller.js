import { supabaseAdmin } from '../../config/supabase.js';
import * as storageService from '../storage/storage.service.js';

const EXPIRY_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Token health from an expiry timestamp. A NULL expiry is long-lived
 * (Meta page tokens); LinkedIn always carries one (60 days, no renewal).
 */
const tokenStatus = (expiresAt) => {
    if (!expiresAt) return 'long-lived';
    const expiry = new Date(expiresAt).getTime();
    const now = Date.now();
    if (expiry <= now) return 'expired';
    if (expiry - now <= EXPIRY_WARNING_DAYS * DAY_MS) return 'expiring';
    return 'healthy';
};

/** Batch-load user rows for a set of ids, keyed by id. */
const usersById = async (ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return {};
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, email, name')
        .in('id', unique);
    if (error) throw error;
    return Object.fromEntries((data || []).map((u) => [u.id, u]));
};

/**
 * GET /api/admin/overview
 * Stat tiles, LinkedIn tokens nearing expiry, scheduler queue snapshot,
 * and the latest activity rows — everything the Overview tab renders.
 */
export const getOverview = async (req, res) => {
    try {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
        const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
        const warningEdge = new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS).toISOString();

        const count = (table, filter) => {
            let q = supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
            if (filter) q = filter(q);
            return q;
        };

        const [
            totalUsers, newUsers,
            metaConnections, linkedinConnections,
            pendingPosts, failedRecent,
            expiringResult, recentResult,
        ] = await Promise.all([
            count('users'),
            count('users', (q) => q.gte('created_at', weekAgo)),
            count('meta_connections', (q) => q.eq('is_active', true)),
            count('linkedin_connections', (q) => q.eq('is_active', true)),
            count('scheduled_posts', (q) => q.eq('status', 'pending')),
            count('scheduled_posts', (q) => q.eq('status', 'failed').gte('updated_at', dayAgo)),
            supabaseAdmin
                .from('linkedin_connections')
                .select('id, user_id, display_name, token_expires_at')
                .eq('is_active', true)
                .not('token_expires_at', 'is', null)
                .lte('token_expires_at', warningEdge)
                .gt('token_expires_at', now.toISOString())
                .order('token_expires_at', { ascending: true })
                .limit(10),
            supabaseAdmin
                .from('scheduled_posts')
                .select('id, user_id, page_name, provider, platforms, status, scheduled_time, error_message')
                .order('updated_at', { ascending: false })
                .limit(8),
        ]);

        const firstError = [
            totalUsers, newUsers, metaConnections, linkedinConnections,
            pendingPosts, failedRecent, expiringResult, recentResult,
        ].find((r) => r.error);
        if (firstError) throw firstError.error;

        const userMap = await usersById([
            ...(expiringResult.data || []).map((c) => c.user_id),
            ...(recentResult.data || []).map((p) => p.user_id),
        ]);

        res.json({
            success: true,
            stats: {
                totalUsers: totalUsers.count ?? 0,
                newUsersThisWeek: newUsers.count ?? 0,
                metaConnections: metaConnections.count ?? 0,
                linkedinConnections: linkedinConnections.count ?? 0,
                queueDepth: pendingPosts.count ?? 0,
                failedLast24h: failedRecent.count ?? 0,
            },
            expiringTokens: (expiringResult.data || []).map((c) => ({
                connectionId: c.id,
                userId: c.user_id,
                name: c.display_name || userMap[c.user_id]?.name || 'Unknown',
                email: userMap[c.user_id]?.email || null,
                expiresAt: c.token_expires_at,
                daysLeft: Math.max(0, Math.ceil((new Date(c.token_expires_at) - now) / DAY_MS)),
            })),
            recentActivity: (recentResult.data || []).map((p) => ({
                id: p.id,
                userName: userMap[p.user_id]?.name || userMap[p.user_id]?.email || 'Unknown',
                target: p.page_name || '—',
                provider: p.provider,
                platforms: p.platforms || [],
                scheduledTime: p.scheduled_time,
                status: p.status,
                errorMessage: p.error_message,
            })),
        });
    } catch (err) {
        console.error('[admin] overview failed:', err);
        res.status(500).json({ success: false, error: 'Failed to load overview' });
    }
};

/**
 * GET /api/admin/users?page=1&per=20&search=…
 * Paginated user list with per-user connection presence, token health,
 * and queued/published post counts.
 */
export const getUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const per = Math.min(50, Math.max(1, parseInt(req.query.per, 10) || 20));
        const search = (req.query.search || '').trim();
        const from = (page - 1) * per;

        let query = supabaseAdmin
            .from('users')
            .select('id, email, name, role, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, from + per - 1);
        if (search) {
            query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
        }

        const { data: users, count, error } = await query;
        if (error) throw error;

        const ids = (users || []).map((u) => u.id);
        let metaByUser = {};
        let liByUser = {};
        let postCounts = {};

        if (ids.length > 0) {
            const [metaRes, liRes, postsRes] = await Promise.all([
                supabaseAdmin
                    .from('meta_connections')
                    .select('user_id, is_active, token_expires_at')
                    .in('user_id', ids),
                supabaseAdmin
                    .from('linkedin_connections')
                    .select('user_id, is_active, token_expires_at')
                    .in('user_id', ids),
                supabaseAdmin
                    .from('scheduled_posts')
                    .select('user_id')
                    .in('user_id', ids),
            ]);
            const anyError = [metaRes, liRes, postsRes].find((r) => r.error);
            if (anyError) throw anyError.error;

            metaByUser = Object.fromEntries((metaRes.data || []).map((c) => [c.user_id, c]));
            liByUser = Object.fromEntries((liRes.data || []).map((c) => [c.user_id, c]));
            postCounts = (postsRes.data || []).reduce((acc, p) => {
                acc[p.user_id] = (acc[p.user_id] || 0) + 1;
                return acc;
            }, {});
        }

        res.json({
            success: true,
            page,
            per,
            total: count ?? 0,
            users: (users || []).map((u) => {
                const meta = metaByUser[u.id];
                const li = liByUser[u.id];
                const providers = [
                    ...(meta?.is_active ? ['meta'] : []),
                    ...(li?.is_active ? ['linkedin'] : []),
                ];
                // Worst token state across the user's connections drives the row chip.
                const states = [
                    ...(meta?.is_active ? [tokenStatus(meta.token_expires_at)] : []),
                    ...(li?.is_active ? [tokenStatus(li.token_expires_at)] : []),
                ];
                const status =
                    providers.length === 0 ? 'no-connection'
                        : states.includes('expired') ? 'token-expired'
                            : states.includes('expiring') ? 'token-expiring'
                                : 'active';
                return {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    createdAt: u.created_at,
                    providers,
                    postCount: postCounts[u.id] || 0,
                    status,
                };
            }),
        });
    } catch (err) {
        console.error('[admin] users failed:', err);
        res.status(500).json({ success: false, error: 'Failed to load users' });
    }
};

/**
 * POST /api/admin/users  { email, password, name?, role? }
 * Creates an account through the Supabase admin API. The signup trigger
 * (handle_new_user) mirrors the row into public.users; the role is then
 * set explicitly rather than trusted from metadata.
 */
export const createUser = async (req, res) => {
    try {
        const { email, password, name, role } = req.body || {};

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'A valid email is required' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }
        const newRole = role === 'admin' ? 'admin' : 'user';

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // admin-created accounts skip the confirmation email
            user_metadata: { name: name || email.split('@')[0] },
        });
        if (error) {
            // Supabase reports duplicates and policy failures here; surface its message.
            return res.status(error.status === 422 ? 422 : 400).json({ success: false, error: error.message });
        }

        if (newRole === 'admin') {
            const { error: roleError } = await supabaseAdmin
                .from('users')
                .update({ role: 'admin', updated_at: new Date().toISOString() })
                .eq('id', data.user.id);
            if (roleError) {
                // The account exists; report the partial outcome honestly.
                console.error('[admin] created user but role grant failed:', roleError);
                return res.status(500).json({
                    success: false,
                    error: 'User created, but granting the admin role failed — set it manually',
                });
            }
        }

        res.status(201).json({
            success: true,
            user: {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.name || null,
                role: newRole,
                createdAt: data.user.created_at,
            },
        });
    } catch (err) {
        console.error('[admin] create user failed:', err);
        res.status(500).json({ success: false, error: 'Failed to create user' });
    }
};

/**
 * GET /api/admin/connections?provider=all|meta|linkedin
 * Both connection tables flattened into one shape, with token health.
 */
export const getConnections = async (req, res) => {
    try {
        const provider = ['meta', 'linkedin'].includes(req.query.provider) ? req.query.provider : 'all';

        const wantMeta = provider !== 'linkedin';
        const wantLinkedin = provider !== 'meta';

        const [metaRes, liRes] = await Promise.all([
            wantMeta
                ? supabaseAdmin
                    .from('meta_connections')
                    .select('id, user_id, pages, is_active, token_expires_at, created_at')
                    .order('created_at', { ascending: false })
                : Promise.resolve({ data: [] }),
            wantLinkedin
                ? supabaseAdmin
                    .from('linkedin_connections')
                    .select('id, user_id, display_name, is_active, token_expires_at, created_at')
                    .order('created_at', { ascending: false })
                : Promise.resolve({ data: [] }),
        ]);
        if (metaRes.error) throw metaRes.error;
        if (liRes.error) throw liRes.error;

        const userMap = await usersById([
            ...(metaRes.data || []).map((c) => c.user_id),
            ...(liRes.data || []).map((c) => c.user_id),
        ]);

        const connections = [
            ...(metaRes.data || []).map((c) => {
                const pages = Array.isArray(c.pages) ? c.pages : [];
                const hasInstagram = pages.some((p) => p.instagram_business_account);
                return {
                    id: c.id,
                    provider: 'meta',
                    userId: c.user_id,
                    userName: userMap[c.user_id]?.name || 'Unknown',
                    userEmail: userMap[c.user_id]?.email || null,
                    accountName: pages[0]?.name || 'Meta account',
                    accountDetail: pages.length > 1
                        ? `${pages.length} Pages${hasInstagram ? ' + Instagram' : ''}`
                        : hasInstagram ? 'Page + linked Instagram' : 'Facebook Page',
                    isActive: c.is_active,
                    connectedAt: c.created_at,
                    expiresAt: c.token_expires_at,
                    status: c.is_active ? tokenStatus(c.token_expires_at) : 'disconnected',
                };
            }),
            ...(liRes.data || []).map((c) => ({
                id: c.id,
                provider: 'linkedin',
                userId: c.user_id,
                userName: userMap[c.user_id]?.name || 'Unknown',
                userEmail: userMap[c.user_id]?.email || null,
                accountName: c.display_name || 'LinkedIn member',
                accountDetail: 'LinkedIn profile',
                isActive: c.is_active,
                connectedAt: c.created_at,
                expiresAt: c.token_expires_at,
                status: c.is_active ? tokenStatus(c.token_expires_at) : 'disconnected',
            })),
        ].sort((a, b) => new Date(b.connectedAt) - new Date(a.connectedAt));

        const summary = connections.reduce(
            (acc, c) => {
                if (c.status === 'expired') acc.expired += 1;
                else if (c.status === 'expiring') acc.expiring += 1;
                else if (c.status !== 'disconnected') acc.healthy += 1;
                return acc;
            },
            { healthy: 0, expiring: 0, expired: 0 },
        );

        res.json({ success: true, connections, summary });
    } catch (err) {
        console.error('[admin] connections failed:', err);
        res.status(500).json({ success: false, error: 'Failed to load connections' });
    }
};

/** GET /api/admin/storage/settings — current pricing and delete policy. */
export const getStorageSettings = async (req, res) => {
    try {
        const s = await storageService.getSettings();
        res.json({
            success: true,
            pricePerGbMonth: s.price_per_gb_month,
            currency: s.currency,
            deleteAfterDays: s.delete_after_days,
            paymentsEnabled: storageService.isConfigured(),
        });
    } catch (err) {
        console.error('[admin] storage settings failed:', err);
        res.status(500).json({ success: false, error: 'Failed to load storage settings' });
    }
};

/**
 * PUT /api/admin/storage/settings  { pricePerGbMonth, deleteAfterDays }
 * pricePerGbMonth is in the currency's minor unit (paise).
 */
export const updateStorageSettings = async (req, res) => {
    try {
        const { pricePerGbMonth, deleteAfterDays } = req.body || {};
        if (pricePerGbMonth !== undefined
            && (!Number.isInteger(pricePerGbMonth) || pricePerGbMonth < 100 || pricePerGbMonth > 100000000)) {
            return res.status(400).json({ success: false, error: 'pricePerGbMonth must be an integer amount in paise (min ₹1)' });
        }
        if (deleteAfterDays !== undefined
            && (!Number.isInteger(deleteAfterDays) || deleteAfterDays < 0 || deleteAfterDays > 365)) {
            return res.status(400).json({ success: false, error: 'deleteAfterDays must be between 0 and 365' });
        }
        const s = await storageService.updateSettings({ pricePerGbMonth, deleteAfterDays }, req.user.id);
        res.json({
            success: true,
            pricePerGbMonth: s.price_per_gb_month,
            currency: s.currency,
            deleteAfterDays: s.delete_after_days,
        });
    } catch (err) {
        console.error('[admin] update storage settings failed:', err);
        res.status(500).json({ success: false, error: 'Failed to update storage settings' });
    }
};

/** GET /api/admin/storage/purchases — latest purchases across all users. */
export const getStoragePurchases = async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('storage_purchases')
            .select('id, user_id, gb, months, amount, currency, status, razorpay_order_id, starts_at, expires_at, created_at')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;

        const userMap = await usersById((data || []).map((p) => p.user_id));
        res.json({
            success: true,
            purchases: (data || []).map((p) => ({
                ...p,
                userName: userMap[p.user_id]?.name || 'Unknown',
                userEmail: userMap[p.user_id]?.email || null,
            })),
        });
    } catch (err) {
        console.error('[admin] storage purchases failed:', err);
        res.status(500).json({ success: false, error: 'Failed to load storage purchases' });
    }
};
