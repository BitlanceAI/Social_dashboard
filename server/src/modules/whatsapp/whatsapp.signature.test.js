import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyWhatsAppSignature } from './whatsapp.signature.js';

const rawBody = Buffer.from('{ "message": "Approve ✅" }');
const signed = secret => ({
    rawBody,
    headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}` },
});
const production = { NODE_ENV: 'production', META_APP_SECRET: 'publishing-secret' };

test('shared app verifies the original bytes, including Unicode and whitespace', () => {
    assert.equal(verifyWhatsAppSignature(signed('publishing-secret'), production).valid, true);
    const altered = { ...signed('publishing-secret'), rawBody: Buffer.from(JSON.stringify(JSON.parse(rawBody))) };
    assert.equal(verifyWhatsAppSignature(altered, production).valid, false);
});

test('dedicated WhatsApp secret takes precedence without accepting the publishing secret', () => {
    const environment = { ...production, WHATSAPP_APP_SECRET: '  whatsapp-secret\n' };
    assert.equal(verifyWhatsAppSignature(signed('whatsapp-secret'), environment).valid, true);
    const rejected = verifyWhatsAppSignature(signed('publishing-secret'), environment);
    assert.equal(rejected.valid, false);
    assert.match(rejected.reason, /WHATSAPP_APP_SECRET/);
    assert.equal(verifyWhatsAppSignature(signed('publishing-secret'), { ...production, WHATSAPP_APP_SECRET: ' ' }).valid, true);
});

test('missing secret fails closed in production and preserves the development behavior', () => {
    assert.equal(verifyWhatsAppSignature(signed('any'), { NODE_ENV: 'production' }).valid, false);
    assert.equal(verifyWhatsAppSignature(signed('any'), { NODE_ENV: 'development' }).valid, true);
});

test('missing/malformed headers and missing raw bytes have distinct safe diagnostics', () => {
    assert.match(verifyWhatsAppSignature({ rawBody, headers: {} }, production).reason, /missing X-Hub/);
    for (const signature of ['sha256=abcd', 'sha256=' + 'z'.repeat(64), ['sha256=abcd'], 'sha1=abcd']) {
        assert.match(verifyWhatsAppSignature({ rawBody, headers: { 'x-hub-signature-256': signature } }, production).reason, /malformed/);
    }
    assert.match(verifyWhatsAppSignature({ ...signed('publishing-secret'), rawBody: undefined }, production).reason, /missing raw/);
});
