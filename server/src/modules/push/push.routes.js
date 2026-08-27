/**
 * Web push registration.
 *
 * The browser obtains an FCM token after the user grants notification
 * permission, then posts it here so the server can reach that device later.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { isPushEnabled, sendToUser } from '../../services/push/fcmService.js';

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.use(authenticateUser);

/**
 * Whether the server can send at all — lets the client hide the opt-in
 * rather than offer a switch that does nothing.
 * GET /api/push/status
 */
router.get('/status', async (req, res) => {
    const { count } = await supabase
        .from('push_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id);

    res.json({
        success: true,
        available: isPushEnabled(),
        registeredDevices: count || 0
    });
});

/**
 * Register this browser
 * POST /api/push/subscribe   body: { token }
 */
router.post('/subscribe', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'token is required' });
        }

        // A token is unique to one browser; re-registering updates ownership
        // rather than creating a duplicate row.
        const { error } = await supabase
            .from('push_tokens')
            .upsert({
                user_id: req.user.id,
                token,
                user_agent: (req.headers['user-agent'] || '').slice(0, 300),
                last_used_at: new Date().toISOString()
            }, { onConflict: 'token' });

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Push subscribe error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Stop notifications for this browser
 * POST /api/push/unsubscribe   body: { token }
 */
router.post('/unsubscribe', async (req, res) => {
    try {
        const { token } = req.body;

        const query = supabase.from('push_tokens').delete().eq('user_id', req.user.id);
        // No token means "this account, everywhere"
        const { error } = token ? await query.eq('token', token) : await query;

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Push unsubscribe error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Send a test notification to the caller's own devices
 * POST /api/push/test
 */
router.post('/test', async (req, res) => {
    const result = await sendToUser(req.user.id, {
        title: 'Notifications are on',
        body: 'You will be told here when a scheduled post publishes or fails.',
        url: '/socialdashboad'
    });

    if (result.skipped) {
        return res.status(503).json({ error: 'Push is not configured on the server' });
    }
    res.json({ success: true, ...result });
});

export default router;
