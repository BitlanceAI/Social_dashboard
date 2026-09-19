export function validateManualPayment(body, now = Date.now()) {
    const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId || '')) invalid('A valid payment request ID is required');
    if (!Number.isSafeInteger(body.amount) || body.amount <= 0 || body.amount > 2147483647) invalid('Enter a positive payment amount');
    if (typeof body.reference !== 'string' || !body.reference.trim() || body.reference.trim().length > 200) invalid('Enter a payment reference (up to 200 characters)');
    const end = Date.parse(body.paidUntil);
    if (!Number.isFinite(end) || end <= now || end > now + 5 * 365 * 86400000) invalid('Choose a future paid-through date within five years');
    return { p_id: body.requestId, p_amount: body.amount, p_reference: body.reference.trim(), p_paid_until: new Date(end).toISOString() };
}
