import crypto from 'node:crypto';

export const canReply = (lastInbound, now = Date.now()) => {
    const time = Date.parse(lastInbound);
    return Number.isFinite(time) && time <= now && now - time < 24 * 60 * 60 * 1000;
};

export function verifySignature(raw, signature, secret) {
    if (!secret || !Buffer.isBuffer(raw) || !/^sha256=[a-f0-9]{64}$/i.test(signature || '')) return false;
    const expected = crypto.createHmac('sha256', secret).update(raw).digest();
    return crypto.timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function normalizeEvent(provider, accountId, event, now = Date.now()) {
    if (!['facebook', 'instagram'].includes(provider)) return null;
    const sender = String(event.sender?.id || '');
    const recipient = String(event.recipient?.id || '');
    if (!sender || !recipient || ![sender, recipient].includes(String(accountId))) return null;
    const outbound = sender === String(accountId);
    const participant = outbound ? recipient : sender;
    const rawTime = Number(event.timestamp);
    if (!Number.isFinite(rawTime) || rawTime <= 0 || rawTime > now + 60000) return null;
    const time = new Date(Math.min(rawTime, now)).toISOString();
    if (event.message?.mid) {
        if (event.message.is_deleted || event.message.is_echo && !outbound) return null;
        return { kind: 'message', participant, mid: String(event.message.mid),
            direction: outbound ? 'outbound' : 'inbound', time,
            text: typeof event.message.text === 'string' ? event.message.text.slice(0, 20000) : '',
            attachments: (event.message.attachments || []).map(a => ({ type: a.type,
                url: /^https:\/\//i.test(a.payload?.url || '') ? a.payload.url : null })).filter(a => a.url) };
    }
    const watermark = event.read?.watermark ?? event.delivery?.watermark;
    if (!outbound && Number.isFinite(Number(watermark)) && Number(watermark) > 0) {
        return { kind: 'receipt', participant, seen: Boolean(event.read),
            time: new Date(Math.min(Number(watermark), now)).toISOString() };
    }
    return null;
}
