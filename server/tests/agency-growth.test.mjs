import test from 'node:test';
import assert from 'node:assert/strict';
import { briefPatch, urls } from '../src/modules/agency/agency.validation.js';
import { reportPeriod, dueMonth, normalizeMetrics, summarize } from '../src/modules/reports/report.model.js';
import { renderReport } from '../src/modules/reports/report.pdf.js';

test('report month uses workspace timezone including DST boundaries', () => {
    const india = reportPeriod('2026-09', 'Asia/Kolkata');
    assert.equal(india.period_start, '2026-08-31T18:30:00.000Z');
    assert.equal(india.period_end, '2026-09-30T18:30:00.000Z');
    const dst = reportPeriod('2026-03', 'America/New_York');
    assert.equal(dst.period_start, '2026-03-01T05:00:00.000Z');
    assert.equal(dst.period_end, '2026-04-01T04:00:00.000Z');
    assert.throws(() => reportPeriod('2026-13', 'UTC'));
    assert.throws(() => reportPeriod('2026-01', 'invalid/zone'));
});
test('schedule waits for local due date and rolls January to previous year', () => {
    const schedule = { timezone: 'Asia/Kolkata', day_of_month: 2 };
    assert.equal(dueMonth(schedule, new Date('2026-01-01T18:29:00Z')), null);
    assert.equal(dueMonth(schedule, new Date('2026-01-01T18:30:00Z')), '2025-12');
});
test('clients can edit only their own open requests and cannot assign staff', () => {
    const own = { created_by: 'alice', status: 'submitted' };
    assert.deepEqual(briefPatch({ title: ' Updated ' }, 'client', 'alice', own), { title: 'Updated' });
    for (const item of [{ ...own, created_by: 'bob' }, { ...own, status: 'in_progress' }]) {
        assert.throws(() => briefPatch({ title: 'No' }, 'client', 'alice', item), { status: 403 });
    }
    assert.throws(() => briefPatch({ assigned_to: null }, 'client', 'alice', own), { status: 403 });
    assert.throws(() => briefPatch({ status: 'completed' }, 'client', 'alice', own));
    assert.deepEqual(briefPatch({ workspace_id: 'other', created_by: 'bob', title: 'Safe' }, 'client', 'alice'), { title: 'Safe' });
    assert.throws(() => briefPatch({ status: 'submitted' }, 'owner', 'alice', { ...own, status: 'completed' }), { status: 409 });
});
test('reference URLs reject executable schemes and embedded credentials', () => {
    assert.deepEqual(urls(['https://example.com/brief']), ['https://example.com/brief']);
    for (const url of ['javascript:alert(1)', 'file:///secret', 'https://user:pass@example.com']) assert.throws(() => urls([url]));
});
test('reports preserve unknown metrics and aggregate campaign classification', () => {
    const metrics = normalizeMetrics({ likes: 0, comments: 4, shares: -1, views: Infinity });
    assert.deepEqual(metrics, { likes: 0, comments: 4, shares: null, views: null, impressions: null });
    const report = summarize([
        { id: 'p1', status: 'published', content_item_id: 'c1' },
        { id: 'p2', status: 'published' }, { id: 'p3', status: 'failed' },
    ], [{ id: 'c1', campaign_id: 'launch', pillar_id: 'learn' }], [{ id: 'launch', name: 'Launch' }], [{ id: 'learn', name: 'Education' }], { p1: [{ platform: 'facebook', metrics }] });
    assert.equal(report.totals.total, 3);
    assert.equal(report.totals.published, 2);
    assert.deepEqual(report.coverage, { published: 2, withMetrics: 1 });
    assert.equal(report.engagement.likes, 0);
    assert.equal(report.engagement.impressions, null);
    assert.equal(report.campaigns.find(c => c.id === 'unassigned').total, 2);
    assert.equal(report.pillars.find(c => c.id === 'learn').published, 1);
    assert.equal(report.topPosts[0].score, 4);
});
test('PDF renderer produces a real downloadable document for an empty month', async () => {
    const bytes = await renderReport({ month: '2026-09', timezone: 'Asia/Kolkata', generated_at: '2026-10-01', metrics: summarize([], [], [], []), brand_snapshot: { client_name: 'Example client', primary_color: '#123456' } });
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 1000);
    assert.match(bytes.subarray(-100).toString(), /%%EOF/);
});
