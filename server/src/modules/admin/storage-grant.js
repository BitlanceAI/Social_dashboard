const invalid = message => Object.assign(new Error(message), { status: 400 });

export async function createStorageGrant(db, adminId, body = {}, now = new Date()) {
    const { userId, gb, months } = body;
    if (typeof userId !== 'string' || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(userId.trim())) {
        throw invalid('Enter a valid user ID');
    }
    if (!Number.isInteger(gb) || gb < 1 || gb > 1000) throw invalid('Storage must be 1–1000 GB');
    if (!Number.isInteger(months) || months < 1 || months > 24) throw invalid('Duration must be 1–24 months');
    const { data, error } = await db.auth.admin.getUserById(userId.trim());
    if (error && error.status !== 404) throw error;
    if (!data?.user) throw Object.assign(new Error('User not found'), { status: 404 });

    // Clamp month-end dates (January 31 + one month ends in February).
    const expires = new Date(now);
    expires.setUTCDate(1);
    expires.setUTCMonth(expires.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(expires.getUTCFullYear(), expires.getUTCMonth() + 1, 0)).getUTCDate();
    expires.setUTCDate(Math.min(now.getUTCDate(), lastDay));
    const { data: grant, error: insertError } = await db.from('storage_purchases').insert({
        user_id: data.user.id, gb, months, amount: 0, currency: 'INR',
        status: 'granted', granted_by: adminId,
        starts_at: now.toISOString(), expires_at: expires.toISOString(),
    }).select('id, user_id, gb, months, status, expires_at').single();
    if (insertError) throw insertError;
    return grant;
}
