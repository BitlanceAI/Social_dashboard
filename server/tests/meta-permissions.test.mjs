import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://meta-permissions-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { default: MetaService } = await import('../src/modules/meta/meta.service.js');

test('production Meta scopes include the implemented comment-management permission', () => {
    assert.ok(MetaService.DEFAULT_SCOPES.includes('pages_manage_engagement'));
});

test('production Meta scopes include user content needed by the comments workflow', () => {
    assert.ok(MetaService.DEFAULT_SCOPES.includes('pages_read_user_content'));
});

test('production Meta scopes include Instagram comment management', () => {
    assert.ok(MetaService.DEFAULT_SCOPES.includes('instagram_manage_comments'));
});

test('production Meta scopes do not request unimplemented insights permissions', () => {
    assert.equal(MetaService.DEFAULT_SCOPES.includes('read_insights'), false);
});

test('messaging permissions are requested only when the inbox is enabled', () => {
    const previous = process.env.META_MESSAGING_ENABLED;
    try {
        process.env.META_MESSAGING_ENABLED = 'false';
        assert.equal(MetaService.DEFAULT_SCOPES.includes('pages_messaging'), false);
        assert.equal(MetaService.DEFAULT_SCOPES.includes('instagram_manage_messages'), false);
        process.env.META_MESSAGING_ENABLED = 'true';
        for (const scope of ['pages_messaging', 'instagram_manage_messages', 'pages_manage_metadata']) {
            assert.ok(MetaService.DEFAULT_SCOPES.includes(scope));
        }
    } finally {
        if (previous === undefined) delete process.env.META_MESSAGING_ENABLED;
        else process.env.META_MESSAGING_ENABLED = previous;
    }
});
