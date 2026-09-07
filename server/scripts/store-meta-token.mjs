/**
 * Manually store a Meta access token (e.g. a Business System User token) as a
 * meta_connection for a specific user's workspace — a workaround for pages that
 * are business-owned and therefore never appear in the OAuth /me/accounts list.
 *
 * The token is validated, its reachable Pages are fetched, the token is
 * encrypted with the app's ENCRYPTION_KEY (a raw SQL insert can't do this), and
 * a meta_connection row is upserted. All fetched Pages are pre-selected.
 *
 * Usage (run from the server workspace so .env loads):
 *   SYSTEM_TOKEN="EAAR..." TARGET_EMAIL="owner@example.com" \
 *     node scripts/store-meta-token.mjs
 *
 * Optional: TARGET_WORKSPACE_ID overrides the resolved workspace.
 */

import '../src/config/env.js';

import { supabaseAdmin } from '../src/config/supabase.js';
import MetaService from '../src/modules/meta/meta.service.js';
import { encryptData } from '../src/shared/utils/encryption.js';

const token = process.env.SYSTEM_TOKEN;
const email = process.env.TARGET_EMAIL;
let workspaceId = process.env.TARGET_WORKSPACE_ID;

const die = (msg) => { console.error(`\n❌ ${msg}\n`); process.exit(1); };

if (!token) die('Set SYSTEM_TOKEN to the Meta token you want to store.');
if (!email && !workspaceId) die('Set TARGET_EMAIL (or TARGET_WORKSPACE_ID) for the account to attach it to.');

const main = async () => {
    // 1. Resolve the user + workspace.
    const { data: user, error: userErr } = await supabaseAdmin
        .from('users').select('id, email, default_workspace_id').eq('email', email).single();
    if (userErr || !user) die(`No user with email ${email}`);
    console.log(`👤 User: ${user.email} (${user.id})`);

    if (!workspaceId) {
        workspaceId = user.default_workspace_id;
        if (!workspaceId) {
            const { data: ws } = await supabaseAdmin
                .from('workspaces').select('id').eq('owner_id', user.id)
                .order('created_at', { ascending: true }).limit(1).single();
            workspaceId = ws?.id;
        }
    }
    if (!workspaceId) die('Could not resolve a workspace. Set TARGET_WORKSPACE_ID.');
    console.log(`🗂️  Workspace: ${workspaceId}`);

    // 2. Validate the token and fetch its Pages.
    const meta = new MetaService(token);
    const validation = await meta.validateToken();
    console.log(`🔑 Token valid: ${validation.isValid} · scopes: ${(validation.scopes || []).join(', ') || '(system user token — scopes may be empty)'}`);

    const profile = await meta.getMe();
    const metaUserId = profile.success ? profile.data.id : `system-${Date.now()}`;

    const pagesResult = await meta.getPages();
    if (!pagesResult.success) die(`Could not read Pages with this token: ${pagesResult.error}`);
    const pages = pagesResult.pages || [];
    if (pages.length === 0) die('This token has no Pages assigned. Assign the Page to the system user in Business settings, then retry.');
    console.log(`📄 Pages reachable: ${pages.map((p) => p.name).join(', ')}`);

    // 3. Encrypt and upsert. All fetched Pages are pre-selected.
    const encrypted = encryptData(token);
    const { error } = await supabaseAdmin
        .from('meta_connections')
        .upsert({
            workspace_id: workspaceId,
            user_id: user.id,
            connection_type: 'api_key',
            meta_user_id: metaUserId,
            access_token: encrypted,
            token_expires_at: validation.expiresAt || null,
            pages,
            selected_page_ids: pages.map((p) => String(p.id)),
            is_active: true,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id' });
    if (error) die(`Upsert failed: ${error.message}`);

    console.log(`\n✅ Stored a Meta connection for workspace ${workspaceId} with ${pages.length} Page(s). The user can publish to them now.\n`);
    process.exit(0);
};

main().catch((e) => die(e.message));
