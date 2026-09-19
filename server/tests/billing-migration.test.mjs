// Run with: node server/tests/billing-migration.test.mjs <path-to-pglite-module>
// The temporary test engine never connects to Supabase.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
CREATE TABLE public.workspaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL);
CREATE TABLE public.meta_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid UNIQUE REFERENCES workspaces(id), pages jsonb, selected_page_ids jsonb, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.linkedin_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid UNIQUE REFERENCES workspaces(id), is_active boolean NOT NULL DEFAULT true);
`);
for (const file of ['20260904120000_subscription_plans.sql', '20260904130000_subscriptions.sql', '20260919120000_solo_trial_billing.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
}
const owner = '00000000-0000-0000-0000-000000000001';
const ws = '00000000-0000-0000-0000-000000000002';
const ws2 = '00000000-0000-0000-0000-000000000003';
await db.exec(`INSERT INTO auth.users VALUES('${owner}'); INSERT INTO workspaces VALUES('${ws}', '${owner}');`);
assert.equal((await db.query("SELECT monthly_price FROM subscription_plans WHERE plan_key='solo'")).rows[0].monthly_price, 30000);
assert.equal((await db.query("SELECT trial_days FROM subscription_plans WHERE plan_key='solo'")).rows[0].trial_days, 15);
await assert.rejects(db.exec(`INSERT INTO workspaces VALUES('${ws2}', '${owner}')`), /workspace limit/);
await db.exec(`INSERT INTO subscriptions(user_id, plan_key, mandate_required) VALUES('${owner}', 'solo', true)`);
await db.exec(`INSERT INTO linkedin_connections(workspace_id) VALUES('${ws}')`);
// Reauthorization is an upsert and must not count the same connection twice.
await db.exec(`INSERT INTO linkedin_connections(workspace_id) VALUES('${ws}') ON CONFLICT(workspace_id) DO UPDATE SET is_active=true`);
await assert.rejects(db.exec(`INSERT INTO meta_connections(workspace_id, pages) VALUES('${ws}', '[{"id":"page1"}]')`), /social account limit/);
await db.exec(`UPDATE linkedin_connections SET is_active=false WHERE workspace_id='${ws}'`);
await db.exec(`INSERT INTO meta_connections(workspace_id, pages, selected_page_ids) VALUES('${ws}', '[{"id":"page1"},{"id":"page2"}]', '["page1"]')`);
await assert.rejects(db.exec(`UPDATE meta_connections SET selected_page_ids='["page1","page2"]' WHERE workspace_id='${ws}'`), /social account limit/);
await db.exec(`UPDATE meta_connections SET selected_page_ids='[]' WHERE workspace_id='${ws}'`);
await db.exec(`UPDATE linkedin_connections SET is_active=true WHERE workspace_id='${ws}'`);
const reservations = await Promise.all(Array.from({ length: 25 }, () => db.query(`SELECT reserve_subscription_usage('${owner}', 'generations', '2026-09', 20) AS allowed`)));
assert.equal(reservations.filter(r => r.rows[0].allowed).length, 20);
const trialPosts = await Promise.all(Array.from({ length: 5 }, () => db.query(`SELECT reserve_subscription_usage('${owner}', 'trial_auto_posts', 'trial:one', 2) AS allowed`)));
assert.equal(trialPosts.filter(r => r.rows[0].allowed).length, 2);
assert.equal((await db.query(`SELECT reserve_subscription_usage('${owner}', 'generations', '2026-10', 20) AS allowed`)).rows[0].allowed, true);
assert.equal((await db.query(`SELECT reserve_subscription_usage('${owner}', 'generations', 'zero', 0) AS allowed`)).rows[0].allowed, false);
await db.exec("UPDATE subscription_plans SET included_workspaces=2 WHERE plan_key='solo'");
await db.exec(`INSERT INTO workspaces VALUES('${ws2}', '${owner}')`);
await assert.rejects(db.exec(`INSERT INTO linkedin_connections(workspace_id) VALUES('${ws2}')`), /social account limit/);
await db.exec("SET ROLE authenticated");
await assert.rejects(db.exec(`SELECT reserve_subscription_usage('${owner}', 'generations', 'forged', 999)`), /permission denied/);
await db.exec(`RESET ROLE;
 ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN email_confirmed_at timestamptz;
 CREATE TABLE public.users(id uuid PRIMARY KEY, role text);
 INSERT INTO public.users VALUES('${owner}', 'admin');
 UPDATE auth.users SET email='bitlanceai@gmail.com', email_confirmed_at=now() WHERE id='${owner}';`);
await db.exec(await readFile(new URL('../../supabase/migrations/20260919150000_admin_billing_exemption.sql', import.meta.url), 'utf8'));
assert.equal((await db.query(`SELECT is_billing_exempt('${owner}') AS exempt`)).rows[0].exempt, true);
await db.exec(`INSERT INTO workspaces(owner_id) SELECT '${owner}' FROM generate_series(1,5);
 INSERT INTO linkedin_connections(workspace_id) VALUES('${ws2}')`);
await db.exec(`UPDATE public.users SET role='user' WHERE id='${owner}'`);
await assert.rejects(db.exec(`INSERT INTO workspaces(owner_id) VALUES('${owner}')`), /workspace limit/);
await db.exec(`UPDATE public.users SET role='admin' WHERE id='${owner}'; UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${owner}'`);
assert.equal((await db.query(`SELECT is_billing_exempt('${owner}') AS exempt`)).rows[0].exempt, false);
await db.close();
console.log('Migration validated: prices, trial duration, account/workspace limits, reconnects, cross-workspace limits, 20 generations, 2 trial posts, monthly reset, and RPC permissions.');
