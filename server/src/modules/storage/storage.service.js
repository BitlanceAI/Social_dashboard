/**
 * Paid media storage — plans, Razorpay orders, entitlement.
 *
 * Razorpay is driven over its REST API with Basic auth rather than the SDK:
 * two endpoints and one HMAC do not justify a dependency. Amounts are in the
 * currency's minor unit (paise) end to end, which is also what Razorpay
 * expects, so nothing is ever multiplied by 100 twice.
 */

import '../../config/env.js';

import crypto from 'crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import {
    isBunnyConfigured, isBunnyUrl, bunnyUpload, bunnyRemove,
} from '../../shared/storage/bunny.js';
import { sendToUser } from '../push/push.service.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

const razorpayAuth = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    return { keyId, keySecret, header: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') };
};

export const isConfigured = () => Boolean(razorpayAuth());

/** The single settings row; the migration seeds it, so absence is an error. */
export const getSettings = async () => {
    const { data, error } = await supabaseAdmin
        .from('storage_settings')
        .select('price_per_gb_month, currency, delete_after_days, updated_at')
        .eq('id', 1)
        .single();
    if (error) throw error;
    return data;
};

export const updateSettings = async ({ pricePerGbMonth, deleteAfterDays }, adminUserId) => {
    const patch = { updated_by: adminUserId, updated_at: new Date().toISOString() };
    if (pricePerGbMonth !== undefined) patch.price_per_gb_month = pricePerGbMonth;
    if (deleteAfterDays !== undefined) patch.delete_after_days = deleteAfterDays;

    const { data, error } = await supabaseAdmin
        .from('storage_settings')
        .update(patch)
        .eq('id', 1)
        .select('price_per_gb_month, currency, delete_after_days, updated_at')
        .single();
    if (error) throw error;
    return data;
};

/**
 * Create a Razorpay order for gb × months at the admin-set price and record
 * it as a 'created' purchase. The amount is always computed here from the
 * settings row — the client never sends a price.
 */
export const createOrder = async (userId, gb, months) => {
    const auth = razorpayAuth();
    if (!auth) {
        const err = new Error('Payments are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
        err.status = 503;
        throw err;
    }

    const settings = await getSettings();
    const amount = settings.price_per_gb_month * gb * months;

    const res = await fetch(`${RAZORPAY_API}/orders`, {
        method: 'POST',
        headers: { Authorization: auth.header, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount,
            currency: settings.currency,
            // Razorpay caps receipts at 40 chars; a UUID is 36
            receipt: crypto.randomUUID(),
            notes: { user_id: userId, gb: String(gb), months: String(months), purpose: 'media-storage' },
        }),
    });
    const order = await res.json();
    if (!res.ok) {
        console.error('[storage] razorpay order failed:', order);
        const err = new Error(order?.error?.description || 'Could not create the payment order');
        err.status = 502;
        throw err;
    }

    const { data: purchase, error } = await supabaseAdmin
        .from('storage_purchases')
        .insert({
            user_id: userId,
            gb,
            months,
            amount,
            currency: settings.currency,
            razorpay_order_id: order.id,
            status: 'created',
        })
        .select('id')
        .single();
    if (error) throw error;

    return {
        purchaseId: purchase.id,
        orderId: order.id,
        amount,
        currency: settings.currency,
        keyId: auth.keyId, // public key id — safe for the checkout widget
    };
};

/**
 * Verify Razorpay's checkout signature and activate the purchase.
 * The signature is HMAC-SHA256(order_id|payment_id, key_secret) — if it
 * checks out, the payment is genuine and captured per checkout defaults.
 */
export const verifyPayment = async (userId, { orderId, paymentId, signature }) => {
    const auth = razorpayAuth();
    if (!auth) {
        const err = new Error('Payments are not configured');
        err.status = 503;
        throw err;
    }

    const expected = crypto
        .createHmac('sha256', auth.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    const valid =
        expected.length === String(signature).length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));

    // Only the order's owner can settle it, and only from 'created'.
    const { data: purchase, error } = await supabaseAdmin
        .from('storage_purchases')
        .select('id, user_id, months, status')
        .eq('razorpay_order_id', orderId)
        .single();
    if (error || !purchase || purchase.user_id !== userId) {
        const err2 = new Error('Unknown order');
        err2.status = 404;
        throw err2;
    }

    if (!valid) {
        await supabaseAdmin
            .from('storage_purchases')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', purchase.id)
            .eq('status', 'created');
        const err2 = new Error('Payment signature did not verify');
        err2.status = 400;
        throw err2;
    }

    if (purchase.status === 'paid') return { alreadyPaid: true }; // idempotent retry

    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + purchase.months);

    const { error: updateError } = await supabaseAdmin
        .from('storage_purchases')
        .update({
            status: 'paid',
            razorpay_payment_id: paymentId,
            starts_at: now.toISOString(),
            expires_at: expires.toISOString(),
            updated_at: now.toISOString(),
        })
        .eq('id', purchase.id);
    if (updateError) throw updateError;

    return { alreadyPaid: false, expiresAt: expires.toISOString() };
};

/** Bytes the user's library currently occupies. */
export const getUsageBytes = async (userId) => {
    const { data, error } = await supabaseAdmin
        .from('media_library')
        .select('size_bytes')
        .eq('user_id', userId);
    if (error) throw error;
    return (data || []).reduce((sum, r) => sum + Number(r.size_bytes), 0);
};

/** What the user currently owns: active GB, usage, history, delete policy. */
export const getEntitlement = async (userId) => {
    const [settings, usedBytes, { data: purchases, error }] = await Promise.all([
        getSettings(),
        getUsageBytes(userId),
        supabaseAdmin
            .from('storage_purchases')
            .select('id, gb, months, amount, currency, status, starts_at, expires_at, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
    ]);
    if (error) throw error;

    const now = Date.now();
    const paid = (purchases || []).filter((p) => p.status === 'paid' && p.expires_at);
    const active = paid.filter((p) => new Date(p.expires_at).getTime() > now);

    // Lapsed with files still stored: the grace clock is running. Surfacing
    // expiredAt/purgeAt here is what lets the UI warn before the sweep acts.
    let expiredAt = null;
    let purgeAt = null;
    if (active.length === 0 && paid.length > 0 && usedBytes > 0) {
        expiredAt = paid.reduce((max, p) => (p.expires_at > max ? p.expires_at : max), paid[0].expires_at);
        purgeAt = new Date(new Date(expiredAt).getTime() + settings.delete_after_days * 24 * 60 * 60 * 1000).toISOString();
    }

    return {
        activeGb: active.reduce((sum, p) => sum + p.gb, 0),
        usedBytes,
        nextExpiry: active.length
            ? active.reduce((min, p) => (p.expires_at < min ? p.expires_at : min), active[0].expires_at)
            : null,
        expiredAt,
        purgeAt,
        deleteAfterDays: settings.delete_after_days,
        purchases: purchases || [],
    };
};

// ── Media library ───────────────────────────────────────────────────────────

const GIB = 1024 * 1024 * 1024;

/**
 * Workspace isolation: a file belongs to the workspace it was uploaded in.
 * The list only ever shows the caller's files for the ACTIVE workspace;
 * NULL workspace = personal/legacy uploads, shown only with no workspace.
 */
export const listMedia = async (userId, workspaceId = null) => {
    let query = supabaseAdmin
        .from('media_library')
        .select('id, url, file_name, mime_type, size_bytes, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    query = workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
};

/**
 * Store files into the user's library, enforcing the purchased quota.
 *
 * Backend: Bunny Storage when its env vars are set (served via the CDN
 * pull zone), otherwise the Supabase post-media bucket. Either way the
 * stored URL is public — Meta fetches media by URL, so it must be. Each
 * row keeps its own url, so backends can be switched without migrating
 * old files: deletes route by where the file actually lives.
 */
export const uploadMedia = async (userId, files, workspaceId = null) => {
    const entitlement = await getEntitlement(userId);
    const quotaBytes = entitlement.activeGb * GIB;
    const incoming = files.reduce((sum, f) => sum + f.size, 0);

    if (entitlement.activeGb === 0) {
        const err = new Error('No active storage plan — buy storage to build a media library');
        err.status = 402;
        throw err;
    }
    if (entitlement.usedBytes + incoming > quotaBytes) {
        const freeGb = ((quotaBytes - entitlement.usedBytes) / GIB).toFixed(2);
        const err = new Error(`Not enough storage: ${freeGb} GB free of ${entitlement.activeGb} GB`);
        err.status = 413;
        throw err;
    }

    const useBunny = isBunnyConfigured();

    const saved = [];
    for (const file of files) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '');
        // Workspace first, mirroring postMedia's key convention — the tenant
        // is readable straight from the object path.
        const prefix = workspaceId ? `library/${workspaceId}/${userId}` : `library/${userId}`;
        const objectKey = `${prefix}/${Date.now()}-${safeName}`;

        let publicUrl;
        if (useBunny) {
            try {
                publicUrl = await bunnyUpload(objectKey, file.buffer, file.mimetype);
            } catch (bunnyError) {
                console.error('[storage] bunny upload failed:', bunnyError);
                const err = new Error('Storage upload failed');
                err.status = 502;
                throw err;
            }
        } else {
            const { error: uploadError } = await supabaseAdmin.storage
                .from('post-media')
                .upload(objectKey, file.buffer, { contentType: file.mimetype, upsert: false });
            if (uploadError) {
                const err = new Error(uploadError.message);
                err.status = 502;
                throw err;
            }
            publicUrl = supabaseAdmin.storage.from('post-media').getPublicUrl(objectKey).data.publicUrl;
        }

        const { data: row, error: insertError } = await supabaseAdmin
            .from('media_library')
            .insert({
                user_id: userId,
                workspace_id: workspaceId,
                object_key: objectKey,
                url: publicUrl,
                file_name: file.originalname,
                mime_type: file.mimetype,
                size_bytes: file.size,
            })
            .select('id, url, file_name, mime_type, size_bytes, created_at')
            .single();
        if (insertError) {
            // Keep accounting honest: an object without a row is invisible to
            // the quota, so remove it rather than leak it.
            await removeObject(objectKey, publicUrl).catch((e) =>
                console.error('[storage] rollback remove failed:', e));
            throw insertError;
        }
        saved.push(row);
    }
    return saved;
};

/** Delete the physical object wherever its URL says it lives. */
const removeObject = async (objectKey, url) => {
    if (isBunnyUrl(url)) {
        await bunnyRemove(objectKey);
        return;
    }
    const { error } = await supabaseAdmin.storage.from('post-media').remove([objectKey]);
    if (error) throw new Error(error.message);
};

/** Remove one library file: object first, then the accounting row. */
export const deleteMedia = async (userId, mediaId) => {
    const { data: row, error } = await supabaseAdmin
        .from('media_library')
        .select('id, object_key, url')
        .eq('id', mediaId)
        .eq('user_id', userId)
        .single();
    if (error || !row) {
        const err = new Error('File not found');
        err.status = 404;
        throw err;
    }

    try {
        await removeObject(row.object_key, row.url);
    } catch (removeError) {
        console.error('[storage] object delete failed:', removeError);
        const err = new Error('Could not delete the stored file');
        err.status = 502;
        throw err;
    }

    const { error: deleteError } = await supabaseAdmin
        .from('media_library')
        .delete()
        .eq('id', row.id);
    if (deleteError) throw deleteError;
};

/**
 * Daily sweep: permanently delete the library of every user whose last paid
 * plan lapsed more than delete_after_days ago. Run by the scheduler.
 *
 * Deliberately conservative:
 *  - a single active purchase protects everything the user stores;
 *  - a user with files but NO paid purchase on record is skipped and logged,
 *    never deleted on a heuristic;
 *  - a row is only removed after its object is confirmed gone, so a failed
 *    delete retries on the next sweep instead of leaking the file.
 */
export const sweepExpiredStorage = async () => {
    try {
        const settings = await getSettings();
        const graceMs = settings.delete_after_days * 24 * 60 * 60 * 1000;
        const now = Date.now();

        const { data: files, error: filesError } = await supabaseAdmin
            .from('media_library')
            .select('id, user_id, object_key, url');
        if (filesError) throw filesError;
        if (!files?.length) return;

        const userIds = [...new Set(files.map((f) => f.user_id))];
        const { data: paidRows, error: paidError } = await supabaseAdmin
            .from('storage_purchases')
            .select('id, user_id, expires_at, grace_notified_at')
            .eq('status', 'paid')
            .in('user_id', userIds);
        if (paidError) throw paidError;

        // The purchase with the latest expiry decides everything for a user:
        // whether they are lapsed, and whether the grace nudge went out.
        const latestByUser = {};
        for (const p of paidRows || []) {
            if (!p.expires_at) continue;
            const current = latestByUser[p.user_id];
            if (!current || p.expires_at > current.expires_at) latestByUser[p.user_id] = p;
        }

        for (const userId of userIds) {
            const latest = latestByUser[userId];
            const lastExpiry = latest ? new Date(latest.expires_at).getTime() : null;
            if (!lastExpiry) {
                console.warn(`[storage] sweep: user ${userId} has files but no paid purchase on record — skipping`);
                continue;
            }
            if (lastExpiry > now) continue;              // plan still active

            if (now - lastExpiry < graceMs) {
                // Inside the grace window: nudge once, then leave them alone.
                if (!latest.grace_notified_at) {
                    const purgeDate = new Date(lastExpiry + graceMs).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                    });
                    const count = files.filter((f) => f.user_id === userId).length;
                    await sendToUser(userId, {
                        title: 'Your media storage has expired',
                        body: `${count} file${count === 1 ? '' : 's'} in your library will be deleted on ${purgeDate}. Renew your storage to keep them.`,
                        url: '/storage',
                    }).catch((e) => console.error('[storage] grace nudge failed:', e.message));

                    await supabaseAdmin
                        .from('storage_purchases')
                        .update({ grace_notified_at: new Date().toISOString() })
                        .eq('id', latest.id);
                }
                continue;
            }

            const theirFiles = files.filter((f) => f.user_id === userId);
            let deleted = 0;
            for (const file of theirFiles) {
                try {
                    await removeObject(file.object_key, file.url);
                    const { error: rowError } = await supabaseAdmin
                        .from('media_library')
                        .delete()
                        .eq('id', file.id);
                    if (rowError) throw rowError;
                    deleted += 1;
                } catch (err) {
                    console.error(`[storage] sweep: could not delete ${file.object_key}:`, err.message);
                }
            }
            console.log(`[storage] sweep: purged ${deleted}/${theirFiles.length} expired files for user ${userId}`);
        }
    } catch (err) {
        // Missing tables (migration not applied yet) and transient outages
        // land here; the sweep simply tries again tomorrow.
        console.error('[storage] expiry sweep failed:', err.message);
    }
};

/**
 * Delete every library file belonging to a workspace — physical objects
 * first, rows after. Called by workspace deletion BEFORE the workspaces row
 * goes away: the media_library rows would cascade with it, but a cascade
 * cannot delete the objects in Bunny/Supabase, which would leak paid
 * storage silently.
 */
export const purgeWorkspaceMedia = async (workspaceId) => {
    const { data: files, error } = await supabaseAdmin
        .from('media_library')
        .select('id, object_key, url')
        .eq('workspace_id', workspaceId);
    if (error) throw error;

    let deleted = 0;
    for (const file of files || []) {
        try {
            await removeObject(file.object_key, file.url);
            const { error: rowError } = await supabaseAdmin
                .from('media_library')
                .delete()
                .eq('id', file.id);
            if (rowError) throw rowError;
            deleted += 1;
        } catch (err) {
            console.error(`[storage] workspace purge: could not delete ${file.object_key}:`, err.message);
        }
    }
    if (files?.length) {
        console.log(`[storage] workspace ${workspaceId}: purged ${deleted}/${files.length} files`);
    }
    return { total: files?.length || 0, deleted };
};
