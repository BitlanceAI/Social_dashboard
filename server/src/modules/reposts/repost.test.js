import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, mapApifyPost, mediaSupported, scrapeProfile, scrapePostUrl } from './repost.service.js';

test('normalizes a watch handle and rejects URLs or malformed names', () => {
    assert.equal(normalizeHandle(' @Brand.Name '), 'brand.name');
    assert.throws(() => normalizeHandle('https://instagram.com/brand'), /valid Instagram handle/);
    assert.throws(() => normalizeHandle('bad name'), /valid Instagram handle/);
});

test('maps an Apify carousel in original order, including video children', () => {
    const mapped = mapApifyPost({ shortCode: 'ABC', type: 'Sidecar', caption: 'Hello',
        childPosts: [{ displayUrl: 'https://scontent.cdninstagram.com/1.jpg' },
            { videoUrl: 'https://scontent.cdninstagram.com/2.mp4' }] });
    assert.equal(mapped.media_type, 'carousel');
    assert.deepEqual(mapped.original_media_urls, [
        'https://scontent.cdninstagram.com/1.jpg', 'https://scontent.cdninstagram.com/2.mp4',
    ]);
    assert.equal(mapped.permalink, 'https://www.instagram.com/p/ABC/');
    assert.equal(mapApifyPost({ shortCode: 'BAD', type: 'Video', displayUrl: 'https://example.com/cover.jpg' }), null);
});

test('rejects media combinations the connected publisher cannot handle', () => {
    assert.equal(mediaSupported({ media_urls: ['a.jpg', 'b.mp4'] }, ['facebook']), false);
    assert.equal(mediaSupported({ media_urls: ['a.jpg', 'b.jpg'] }, ['facebook']), true);
    assert.equal(mediaSupported({ media_urls: Array(11).fill('a.jpg') }, ['instagram']), false);
    assert.equal(mediaSupported({ media_urls: [] }, ['instagram']), false);
});

test('requests only posts newer than the cursor and surfaces Apify errors', async () => {
    const previousToken = process.env.APIFY_TOKEN;
    const previousActor = process.env.APIFY_IG_ACTOR;
    const previousFetch = globalThis.fetch;
    process.env.APIFY_TOKEN = 'test-token';
    process.env.APIFY_IG_ACTOR = 'apify/instagram-post-scraper';
    try {
        let input;
        globalThis.fetch = async (url, request) => {
            assert.match(url, /\/acts\/apify~instagram-post-scraper\/run-sync-get-dataset-items/);
            input = JSON.parse(request.body);
            assert.equal(request.headers.Authorization, 'Bearer test-token');
            return { ok: true, json: async () => [{ shortCode: 'NEW', displayUrl: 'https://scontent.cdninstagram.com/a.jpg' }] };
        };
        const posts = await scrapeProfile('brand', 12, '2026-09-01T00:00:00.000Z');
        assert.equal(posts[0].shortcode, 'NEW');
        assert.equal(input.onlyPostsNewerThan, '2026-09-01T00:00:00.000Z');
        assert.equal(input.resultsLimit, 12);
        assert.deepEqual(input.username, ['brand']);
        assert.equal(input.skipPinnedPosts, true);
        assert.equal(input.directUrls, undefined);
        assert.equal(input.resultsType, undefined);
        delete process.env.APIFY_IG_ACTOR;
        await scrapePostUrl('NEW');
        assert.deepEqual(input.username, ['https://www.instagram.com/p/NEW/']);
        assert.equal(input.onlyPostsNewerThan, undefined);
        assert.equal(input.skipPinnedPosts, undefined);
        globalThis.fetch = async () => ({ ok: false, status: 503 });
        await assert.rejects(scrapeProfile('brand', 12), /Apify scrape failed \(503\)/);
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.APIFY_TOKEN;
        else process.env.APIFY_TOKEN = previousToken;
        if (previousActor === undefined) delete process.env.APIFY_IG_ACTOR;
        else process.env.APIFY_IG_ACTOR = previousActor;
    }
});
