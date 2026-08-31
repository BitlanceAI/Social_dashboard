/**
 * Web push via Firebase Cloud Messaging (HTTP v1).
 *
 * Credentials come from FIREBASE_SERVICE_ACCOUNT — the JSON key from
 * Firebase Console → Project settings → Service accounts, as a single-line
 * string. Without it the module stays dormant: every send is a no-op and the
 * rest of the app carries on. Notifications are a nicety, never a reason for
 * a publish to fail.
 */

// Modular ESM entry points. The CommonJS default export does not expose
// `credential` under ESM, so `admin.credential.cert` is undefined there.
// Process-wide env bootstrap — these module-scope reads need it loaded.
import '../../config/env.js';

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createClient } from '@supabase/supabase-js';

let app = null;
let initTried = false;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Read the service account from whichever form the host makes practical.
 *
 * Some platforms (DigitalOcean App Platform among them) choke on a long,
 * quote-heavy JSON value in their env editor, so base64 and split-field
 * variants are supported too. Checked in order of convenience.
 */
const readCredentials = () => {
    // 1. Base64 of the JSON — no quotes, no braces, no newlines. Easiest to
    //    paste into any host's env editor.
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (b64) {
        try {
            return JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
        } catch (e) {
            console.error('[Push] FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64 JSON:', e.message);
            return null;
        }
    }

    // 2. Raw JSON on one line.
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('[Push] FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
            return null;
        }
    }

    // 3. The three fields that actually matter, set separately. Env editors
    //    usually store the key's line breaks as the two characters \n, so
    //    turn those back into real newlines before handing it to cert().
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
        privateKey = privateKey
            .replace(/^["']|["']$/g, '')
            .replace(/\\n/g, '\n');
        return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
    }

    return null;
};

const init = () => {
    if (initTried) return app;
    initTried = true;

    const credentials = readCredentials();
    if (!credentials) {
        console.log('[Push] No Firebase credentials found — notifications disabled.');
        return null;
    }

    try {
        app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(credentials) });
        console.log(`[Push] Firebase Cloud Messaging ready (${credentials.project_id}).`);
    } catch (error) {
        console.error('[Push] Could not initialise Firebase — notifications disabled:', error.message);
        app = null;
    }
    return app;
};

export const isPushEnabled = () => Boolean(init());

/**
 * Send a notification to every browser the given users have opted in from.
 * Resolves quietly when push is not configured or nobody has tokens.
 *
 * push_tokens has UNIQUE(token), so a token belongs to exactly one user and a
 * fan-out over several users can never emit a duplicate.
 */
export const sendToUsers = async (userIds, { title, body, url }) => {
    if (!init()) return { sent: 0, skipped: true };
    if (!userIds || userIds.length === 0) return { sent: 0 };

    const { data: rows, error } = await supabase
        .from('push_tokens')
        .select('token')
        .in('user_id', userIds);

    if (error) {
        console.error('[Push] Could not read tokens:', error.message);
        return { sent: 0 };
    }
    if (!rows || rows.length === 0) return { sent: 0 };

    const tokens = rows.map((r) => r.token);

    let response;
    try {
        response = await getMessaging(app).sendEachForMulticast({
            tokens,
            notification: { title, body },
            // The service worker reads this to decide where a click lands
            data: { url: url || '/' },
            webpush: {
                fcmOptions: { link: url || '/' },
                notification: { icon: '/favicon.png' }
            }
        });
    } catch (error) {
        console.error('[Push] Send failed:', error.message);
        return { sent: 0 };
    }

    // Drop tokens FCM says are dead, so the table does not grow stale
    const dead = [];
    response.responses.forEach((r, i) => {
        const code = r.error?.code;
        if (code === 'messaging/registration-token-not-registered'
            || code === 'messaging/invalid-registration-token') {
            dead.push(tokens[i]);
        }
    });

    if (dead.length) {
        await supabase.from('push_tokens').delete().in('token', dead);
        console.log(`[Push] Removed ${dead.length} stale token(s)`);
    }

    return { sent: response.successCount, failed: response.failureCount };
};

/** One user. Kept so existing callers and the /test route need no change. */
export const sendToUser = (userId, payload) => sendToUsers([userId], payload);

/**
 * Everyone in a workspace.
 *
 * A scheduled post belongs to a workspace, not to whoever happened to create
 * it, so a publish failure has to reach the people actually watching that
 * workspace -- not just the one member whose token was used.
 */
export const sendToWorkspace = async (workspaceId, payload) => {
    if (!workspaceId) return { sent: 0 };

    const { data: members, error } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId);

    if (error) {
        console.error('[Push] Could not read workspace members:', error.message);
        return { sent: 0 };
    }

    return sendToUsers((members || []).map((m) => m.user_id), payload);
};

export default { sendToUser, sendToUsers, sendToWorkspace, isPushEnabled };
