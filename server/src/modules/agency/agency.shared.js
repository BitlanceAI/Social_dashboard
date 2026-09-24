import '../../config/env.js';
import { supabaseAdmin as db } from '../../config/supabase.js';
import { fail, uuid } from './agency.validation.js';
export { db };
export const handle = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
        const status = error.status || ({ '23503': 400, '23505': 409, '23514': 400, '22P02': 400 }[error.code]) || 500;
        if (status === 500) console.error('[Agency]', error.message);
        res.status(status).json({ error: error.status ? error.message : status === 409 ? 'This record already exists. Refresh and try again.' : status === 400 ? 'Invalid data or linked record.' : 'Could not complete the request' });
    }
};
export const result = async (query) => { const { data, error } = await query; if (error) throw error; return data; };
export const getScoped = async (table, workspaceId, id) => {
    const row = await result(db.from(table).select('*').eq('workspace_id', workspaceId).eq('id', uuid(id)).maybeSingle());
    if (!row) fail('Record not found', 404);
    return row;
};
export const validateLinks = async (workspaceId, patch) => {
    for (const [key, table] of [['campaign_id','campaigns'],['pillar_id','content_pillars'],['brief_id','content_briefs']]) {
        if (patch[key]) await getScoped(table, workspaceId, patch[key]);
    }
    if (patch.assigned_to) {
        const member = await result(db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', patch.assigned_to).maybeSingle());
        if (!member || !['owner','admin','member'].includes(member.role)) fail('Assign an agency member of this workspace');
    }
};
