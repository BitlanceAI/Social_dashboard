import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://workspace-capability-test.invalid';
process.env.SUPABASE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { hasWorkspaceCapability, requireWorkspaceCapability } = await import('../src/middleware/workspace.js');

test('client capabilities are restricted to portal actions', () => {
    assert.equal(hasWorkspaceCapability('client', 'content.view'), true);
    assert.equal(hasWorkspaceCapability('client', 'content.comment'), true);
    assert.equal(hasWorkspaceCapability('client', 'content.approve'), true);
    assert.equal(hasWorkspaceCapability('client', 'reports.view'), true);
    assert.equal(hasWorkspaceCapability('client', 'content.create'), false);
    assert.equal(hasWorkspaceCapability('client', 'content.publish'), false);
    assert.equal(hasWorkspaceCapability('client', 'connections.manage'), false);
});

test('member can prepare and publish but cannot approve client content', () => {
    assert.equal(hasWorkspaceCapability('member', 'content.create'), true);
    assert.equal(hasWorkspaceCapability('member', 'content.edit'), true);
    assert.equal(hasWorkspaceCapability('member', 'content.publish'), true);
    assert.equal(hasWorkspaceCapability('member', 'content.approve'), false);
});

test('admin wildcard grants all content capabilities', () => {
    assert.equal(hasWorkspaceCapability('admin', 'content.create'), true);
    assert.equal(hasWorkspaceCapability('admin', 'content.approve'), true);
    assert.equal(hasWorkspaceCapability('admin', 'content.publish'), true);
});

test('capability middleware rejects a client publishing request', () => {
    const middleware = requireWorkspaceCapability('content.publish');
    let statusCode = null;
    let payload = null;
    const res = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; } };
    let nextCalled = false;
    middleware({ workspace: { role: 'client' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 403);
    assert.equal(payload.code, 'INSUFFICIENT_CAPABILITY');
});
