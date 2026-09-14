import express from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { resolveWorkspace } from '../../middleware/workspace.js';

const router = express.Router();
router.use(resolveWorkspace);
const handle = handler => (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    console.error('[saved-details]', error.message);
    res.status(500).json({ error: 'Could not access saved details. Please try again.' });
});

router.get('/', handle(async (req, res) => {
    const { data, error } = await supabaseAdmin.from('template_saved_details')
        .select('field_values, language, include_contact, auto_reuse')
        .eq('workspace_id', req.workspaceId).maybeSingle();
    if (error) return res.status(500).json({ error: 'Could not load saved details.' });
    res.json({ success: true, details: data });
}));

router.put('/', handle(async (req, res) => {
    const { field_values, language, include_contact, auto_reuse } = req.body || {};
    if (!field_values || typeof field_values !== 'object' || Array.isArray(field_values)
        || Object.keys(field_values).length > 100
        || Object.entries(field_values).some(([key, value]) => !/^[\w.-]{1,100}$/.test(key)
            || ['__proto__', 'constructor', 'prototype'].includes(key)
            || typeof value !== 'string' || value.length > 10000)
        || !['en', 'hi', 'mr'].includes(language)
        || typeof include_contact !== 'boolean' || typeof auto_reuse !== 'boolean') {
        return res.status(400).json({ error: 'Invalid saved template details.' });
    }
    const { data, error } = await supabaseAdmin.from('template_saved_details').upsert({
        workspace_id: req.workspaceId, field_values, language, include_contact, auto_reuse,
        updated_at: new Date().toISOString(),
    }).select('field_values, language, include_contact, auto_reuse').single();
    if (error) return res.status(500).json({ error: 'Could not save details. Please try again.' });
    res.json({ success: true, details: data });
}));

export default router;
