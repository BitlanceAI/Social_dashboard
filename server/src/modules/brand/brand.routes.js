import '../../config/env.js';

import express from 'express';
import { supabaseAdmin as db } from '../../config/supabase.js';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace, requireWorkspaceCapability } from '../../middleware/workspace.js';

const router = express.Router();
router.use(authenticateUser, resolveWorkspace);

router.get('/', async (req, res) => {
    try {
        const { data, error } = await db.from('workspace_brand_profiles')
            .select('*').eq('workspace_id', req.workspaceId).maybeSingle();
        if (error) throw error;
        res.json({ success: true, brand: data || null });
    } catch (error) {
        res.status(500).json({ error: 'Could not load the brand profile' });
    }
});

router.put('/', requireWorkspaceCapability('brand.manage'), async (req, res) => {
    try {
        const text = (value, max) => String(value ?? '').trim().slice(0, max) || null;
        const list = (value) => Array.isArray(value) ? value.map((x) => text(x, 120)).filter(Boolean).slice(0, 30) : [];
        const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
        const row = {
            workspace_id: req.workspaceId,
            client_name: text(req.body?.clientName, 160),
            logo_url: text(req.body?.logoUrl, 2048),
            primary_color: color(req.body?.primaryColor, '#1AA8A8'),
            secondary_color: color(req.body?.secondaryColor, '#0A0A0A'),
            timezone: text(req.body?.timezone, 80) || 'Asia/Kolkata',
            tone_of_voice: text(req.body?.toneOfVoice, 4000),
            content_pillars: list(req.body?.contentPillars),
            approved_hashtags: list(req.body?.approvedHashtags),
            prohibited_terms: list(req.body?.prohibitedTerms),
            competitors: list(req.body?.competitors),
            report_footer: text(req.body?.reportFooter, 1000),
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await db.from('workspace_brand_profiles')
            .upsert(row, { onConflict: 'workspace_id' }).select().single();
        if (error) throw error;
        res.json({ success: true, brand: data });
    } catch (error) {
        res.status(500).json({ error: 'Could not save the brand profile' });
    }
});

export default router;

