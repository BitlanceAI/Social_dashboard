import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { canReply, verifySignature, normalizeEvent } from '../src/modules/messaging/messaging.policy.js';

const now = Date.parse('2026-09-25T12:00:00Z');
const inbound = { sender: { id: 'customer' }, recipient: { id: 'page' }, timestamp: now,
    message: { mid: 'm1', text: 'Hello', attachments: [{ type: 'file', payload: { url: 'javascript:alert(1)' } }] } };

test('signatures fail closed for missing secrets, tampering and malformed headers', () => {
    const raw = Buffer.from('{"object":"page"}');
    const signature = 'sha256=' + crypto.createHmac('sha256', 'secret').update(raw).digest('hex');
    assert.equal(verifySignature(raw, signature, 'secret'), true);
    assert.equal(verifySignature(Buffer.from('{}'), signature, 'secret'), false);
    assert.equal(verifySignature(raw, signature, ''), false);
    assert.equal(verifySignature(raw, 'sha256=zz', 'secret'), false);
    assert.equal(verifySignature(raw, null, 'secret'), false);
});

test('reply window excludes future timestamps, invalid timestamps and exactly 24 hours', () => {
    assert.equal(canReply(new Date(now - 86399999).toISOString(), now), true);
    assert.equal(canReply(new Date(now - 86400000).toISOString(), now), false);
    assert.equal(canReply(new Date(now + 1000).toISOString(), now), false);
    assert.equal(canReply(null, now), false);
});

test('inbound and echo messages preserve direction and drop unsafe attachment URLs', () => {
    const item = normalizeEvent('facebook', 'page', inbound, now);
    assert.equal(item.direction, 'inbound');
    assert.equal(item.participant, 'customer');
    assert.deepEqual(item.attachments, []);
    const echo = normalizeEvent('instagram', 'page', { ...inbound, sender: { id: 'page' },
        recipient: { id: 'customer' }, message: { mid: 'm2', text: 'Hi', is_echo: true } }, now);
    assert.equal(echo.direction, 'outbound');
    assert.equal(echo.participant, 'customer');
});

test('events for other accounts, unsupported objects and future messages are ignored', () => {
    assert.equal(normalizeEvent('facebook', 'other', inbound, now), null);
    assert.equal(normalizeEvent('whatsapp', 'page', inbound, now), null);
    assert.equal(normalizeEvent('facebook', 'page', { ...inbound, timestamp: now + 120000 }, now), null);
});

test('read receipts are not messages and cannot open a reply window', () => {
    const item = normalizeEvent('facebook', 'page', { ...inbound, message: undefined, read: { watermark: now } }, now);
    assert.equal(item.kind, 'receipt');
    assert.equal(item.seen, true);
    assert.equal(item.direction, undefined);
});
