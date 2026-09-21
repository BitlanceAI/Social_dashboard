// Usage: node server/tests/pipeline-review-migration.test.mjs <path-to-pglite/dist/index.js>
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const ws = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const post = '00000000-0000-0000-0000-000000000003';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE scheduled_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, user_id uuid, provider text,
 meta_connection_id uuid, linkedin_connection_id uuid, page_id text, page_name text, platforms jsonb,
 content text, media_urls jsonb, link_url text, timezone text, scheduled_time timestamptz,
 status text, approver_phones jsonb, rejected_at timestamptz, rejection_comment text,
 rejected_by text, awaiting_rejection_feedback boolean DEFAULT false,
 approved_at timestamptz, whatsapp_message_id text, updated_at timestamptz
);
CREATE TABLE content_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, scheduled_post_id uuid REFERENCES scheduled_posts(id),
 status text, generated_caption text, generated_hashtags text, error_message text, updated_at timestamptz
);
INSERT INTO scheduled_posts (id, workspace_id, content, status, scheduled_time, rejected_at, rejection_comment, rejected_by, media_urls)
 VALUES ('${post}', '${ws}', 'Original', 'cancelled', '2026-01-01', now(), 'Shorter please', 'reviewer', '["image.jpg"]');
INSERT INTO content_queue (workspace_id, scheduled_post_id, status) VALUES ('${ws}', '${post}', 'posted');`);
const sql = await readFile(new URL('../../supabase/migrations/20260922100000_pipeline_review_revisions.sql', import.meta.url), 'utf8');
await db.exec(sql);
await db.exec(sql);
const queue = async () => (await db.query('SELECT * FROM content_queue')).rows[0];
assert.equal((await queue()).status, 'rejected');
const call = async (workspace = ws, feedback = 'Shorter please') => db.query(
    'SELECT * FROM resubmit_rejected_post($1,$2,$3,$4,$5,$6)', [post, workspace, 'Revised', 'Original', feedback, '["919876543210"]']);
await assert.rejects(call(other), /Post not found/);
await assert.rejects(call(ws, 'stale feedback'), /changed/);
const results = await Promise.allSettled([call(), call()]);
assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
const revised = results.find(r => r.status === 'fulfilled').value.rows[0];
assert.notEqual(revised.id, post);
assert.equal(revised.status, 'pending_approval');
assert.equal(revised.approved_at, null);
assert.equal(revised.whatsapp_message_id, null);
assert.deepEqual(revised.media_urls, ['image.jpg']);
assert.deepEqual(revised.approver_phones, ['919876543210']);
assert.ok(new Date(revised.scheduled_time).getTime() > new Date('2026-01-01').getTime());
assert.equal((await queue()).scheduled_post_id, revised.id);
assert.equal((await queue()).status, 'pending_approval');
const original = (await db.query('SELECT * FROM scheduled_posts WHERE id=$1', [post])).rows[0];
assert.equal(original.content, 'Original');
assert.equal(original.rejection_comment, 'Shorter please');
assert.equal(original.status, 'cancelled');
assert.equal(original.resubmitted_post_id, revised.id);
for (const [status, expected] of [['pending', 'scheduled'], ['processing', 'processing'], ['published', 'published'], ['failed', 'failed'], ['cancelled', 'cancelled']]) {
    await db.query('UPDATE scheduled_posts SET status=$1 WHERE id=$2', [status, revised.id]);
    assert.equal((await queue()).status, expected);
}
await db.query("UPDATE scheduled_posts SET status='cancelled', rejected_at=now(), content='Edited on WhatsApp' WHERE id=$1", [revised.id]);
assert.equal((await queue()).status, 'rejected');
assert.equal((await queue()).generated_caption, 'Edited on WhatsApp');
await assert.rejects(db.query('INSERT INTO content_queue (workspace_id, scheduled_post_id) VALUES ($1,$2)', [other, revised.id]), /same workspace/);
await db.exec('SET ROLE authenticated');
await assert.rejects(call(), /permission denied/);
await db.close();
console.log('Pipeline review SQL passed: backfill, lifecycle status sync, caption sync, workspace isolation, duplicate/stale resubmission, preserved history and RPC permissions.');
