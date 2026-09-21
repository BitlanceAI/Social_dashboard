import crypto from 'node:crypto';

// A separate WhatsApp app must use its own secret, not the publishing app's.
export function verifyWhatsAppSignature(req, environment = process.env) {
    const dedicated = environment.WHATSAPP_APP_SECRET?.trim();
    const secret = dedicated || environment.META_APP_SECRET?.trim();
    const source = dedicated ? 'WHATSAPP_APP_SECRET' : 'META_APP_SECRET';
    if (!secret) {
        return environment.NODE_ENV === 'production'
            ? { valid: false, reason: 'missing app secret; set WHATSAPP_APP_SECRET (or META_APP_SECRET for a shared app)' }
            : { valid: true, warning: 'App secret not set — accepting unsigned webhook (development only)' };
    }
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return { valid: false, reason: 'missing X-Hub-Signature-256 header' };
    if (typeof signature !== 'string' || !/^sha256=[a-f\d]{64}$/i.test(signature)) {
        return { valid: false, reason: 'malformed X-Hub-Signature-256 header' };
    }
    if (!Buffer.isBuffer(req.rawBody)) return { valid: false, reason: 'missing raw request body' };
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest();
    const actual = Buffer.from(signature.slice(7), 'hex');
    return crypto.timingSafeEqual(actual, expected)
        ? { valid: true }
        : { valid: false, reason: `signature mismatch using ${source}; check the App Secret of the Meta app subscribed to this WhatsApp webhook` };
}
