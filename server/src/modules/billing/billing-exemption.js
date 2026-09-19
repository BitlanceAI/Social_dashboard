import { supabaseAdmin } from '../../config/supabase.js';

export const matchesExemptIdentity = user =>
    Boolean(user?.email_confirmed_at && user.email?.trim().toLowerCase() === 'bitlanceai@gmail.com');

export async function isBillingExempt(userId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) throw error;
    if (!matchesExemptIdentity(data?.user)) return false;
    const { data: profile, error: profileError } = await supabaseAdmin.from('users').select('role').eq('id', userId).maybeSingle();
    if (profileError) throw profileError;
    return profile?.role === 'admin';
}
