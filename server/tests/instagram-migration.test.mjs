// node server/tests/instagram-migration.test.mjs <path-to-pglite-module>
// Executes real SQL in an isolated in-memory PostgreSQL engine, never Supabase.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE TABLE public.users(id uuid PRIMARY KEY, role text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
CREATE TABLE public.workspaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL);
CREATE TABLE public.meta_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid UNIQUE REFERENCES workspaces(id), pages jsonb, selected_page_ids jsonb, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.linkedin_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid UNIQUE REFERENCES workspaces(id), is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.scheduled_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), provider text NOT NULL DEFAULT 'meta', platforms jsonb NOT NULL DEFAULT '["facebook"]', meta_connection_id uuid REFERENCES meta_connections(id), linkedin_connection_id uuid REFERENCES linkedin_connections(id),
 CONSTRAINT scheduled_posts_provider_check CHECK(provider IN ('meta','linkedin')),
 CONSTRAINT scheduled_posts_provider_fk_check CHECK((provider='meta' AND meta_connection_id IS NOT NULL AND linkedin_connection_id IS NULL) OR (provider='linkedin' AND linkedin_connection_id IS NOT NULL AND meta_connection_id IS NULL)));
`);
for (const name of ['20260904120000_subscription_plans.sql', '20260904130000_subscriptions.sql',
    '20260919120000_solo_trial_billing.sql', '20260919150000_admin_billing_exemption.sql', '20260922120000_instagram_login.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
}
const owner = '00000000-0000-0000-0000-000000000001';
const ws = '00000000-0000-0000-0000-000000000002';
const ws2 = '00000000-0000-0000-0000-000000000003';
const ig = '00000000-0000-0000-0000-000000000004';
const li = '00000000-0000-0000-0000-000000000005';
await db.exec(`INSERT INTO auth.users(id) VALUES('${owner}');
INSERT INTO workspaces VALUES('${ws}', '${owner}');
INSERT INTO subscriptions(user_id,plan_key) VALUES('${owner}','solo');
INSERT INTO instagram_connections(id,workspace_id,user_id,instagram_user_id,username,access_token,token_expires_at)
 VALUES('${ig}','${ws}','${owner}','123','brand','encrypted',now()+interval '60 days');`);
await assert.rejects(db.exec(`INSERT INTO linkedin_connections(id,workspace_id) VALUES('${li}','${ws}')`), /social account limit/);
await assert.rejects(db.exec(`UPDATE instagram_connections SET instagram_user_id='different' WHERE id='${ig}'`), /Disconnect the existing/);
await assert.rejects(db.exec(`INSERT INTO meta_connections(workspace_id,pages) VALUES('${ws}','[{"id":"fb"}]')`), /social account limit/);
// Reconnect/upsert counts the current workspace connection once.
await db.exec(`INSERT INTO instagram_connections(workspace_id,user_id,instagram_user_id,username,access_token,token_expires_at)
 VALUES('${ws}','${owner}','123','brand','new encrypted',now()+interval '60 days')
 ON CONFLICT(workspace_id) DO UPDATE SET is_active=true, access_token=excluded.access_token;`);
await db.exec(`UPDATE subscription_plans SET included_workspaces=2 WHERE plan_key='solo';
 INSERT INTO workspaces VALUES('${ws2}','${owner}');`);
await assert.rejects(db.exec(`INSERT INTO instagram_connections(workspace_id,user_id,instagram_user_id,username,access_token,token_expires_at)
 VALUES('${ws2}','${owner}','456','other','encrypted',now()+interval '60 days')`), /social account limit/);
await assert.rejects(db.exec(`INSERT INTO scheduled_posts(workspace_id,provider,platforms,instagram_connection_id)
 VALUES('${ws2}','instagram','["instagram"]','${ig}')`), /foreign key/);
await assert.rejects(db.exec(`INSERT INTO scheduled_posts(workspace_id,provider,platforms,instagram_connection_id)
 VALUES('${ws}','instagram','["facebook"]','${ig}')`), /check constraint/);
await assert.rejects(db.exec(`INSERT INTO scheduled_posts(workspace_id,provider,platforms)
 VALUES('${ws}','instagram','["instagram"]')`), /check constraint/);
await db.exec(`INSERT INTO scheduled_posts(workspace_id,provider,platforms,instagram_connection_id)
 VALUES('${ws}','instagram','["instagram"]','${ig}');`);
// Credentials and OAuth state are never readable or writable by browser roles.
await db.exec('SET ROLE authenticated');
await assert.rejects(db.exec('SELECT * FROM instagram_connections'), /permission denied/);
await assert.rejects(db.exec('SELECT * FROM instagram_oauth_states'), /permission denied/);
await db.exec('RESET ROLE');
await db.exec(`DELETE FROM instagram_connections WHERE id='${ig}'`);
assert.equal((await db.query('SELECT count(*) AS n FROM scheduled_posts')).rows[0].n, 0);
await db.exec(`INSERT INTO linkedin_connections(id,workspace_id) VALUES('${li}','${ws}');
 INSERT INTO scheduled_posts(workspace_id,provider,platforms,linkedin_connection_id)
 VALUES('${ws}','linkedin','["linkedin"]','${li}');`);
await assert.rejects(db.exec(`INSERT INTO instagram_connections(workspace_id,user_id,instagram_user_id,username,access_token,token_expires_at)
 VALUES('${ws}','${owner}','123','brand','encrypted',now()+interval '60 days')`), /social account limit/);
await db.close();
console.log('Instagram migration passed: cross-provider caps, reconnect, workspace isolation, provider integrity, credential permissions and disconnect cascade.');
