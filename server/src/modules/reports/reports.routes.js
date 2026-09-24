import '../../config/env.js';

import express from 'express';
import { supabaseAdmin as db } from '../../config/supabase.js';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace, requireWorkspaceCapability, requireWorkspaceRole } from '../../middleware/workspace.js';
import { handle, result, getScoped } from '../agency/agency.shared.js';
import { fail, text } from '../agency/agency.validation.js';
import { reportPeriod } from './report.model.js';
import { enqueueReport, allRows } from './report.service.js';

const router = express.Router();
router.use(authenticateUser, resolveWorkspace, requireWorkspaceCapability('reports.view'));

router.get('/summary', async (req, res) => {
    try {
        const now = new Date();
        const from = req.query.from && !Number.isNaN(Date.parse(req.query.from))
            ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
        const to = req.query.to && !Number.isNaN(Date.parse(req.query.to))
            ? new Date(req.query.to) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
        if (to <= from || to - from > 366 * 86400000) return res.status(400).json({ error: 'Choose a valid range of 366 days or less' });

        const rows = await allRows(() => db.from('scheduled_posts')
            .select('id, provider, platforms, status, content, page_name, scheduled_time, published_at, publish_results, error_message')
            .eq('workspace_id', req.workspaceId)
            .gte('scheduled_time', from.toISOString()).lt('scheduled_time', to.toISOString())
            .order('scheduled_time', { ascending: false }));
        const totals = rows.reduce((acc, post) => {
            acc.total += 1;
            acc[post.status] = (acc[post.status] || 0) + 1;
            acc.providers[post.provider] = (acc.providers[post.provider] || 0) + 1;
            return acc;
        }, { total: 0, published: 0, failed: 0, pending: 0, scheduled: 0, providers: {} });
        res.json({
            success: true,
            range: { from: from.toISOString(), to: to.toISOString() },
            totals,
            recentPosts: rows.slice(0, 20),
        });
    } catch (error) {
        console.error('[Client reports]', error);
        res.status(500).json({ error: 'Could not build the report' });
    }
});

const manager=requireWorkspaceRole('owner','admin');
router.get('/schedule',manager,handle(async(req,res)=>{
    res.json({schedule:await result(db.from('report_schedules').select('*').eq('workspace_id',req.workspaceId).maybeSingle())});
}));
router.put('/schedule',manager,handle(async(req,res)=>{
    const {enabled,day_of_month,timezone,narrative=''}=req.body || {};
    if(typeof enabled!=='boolean' || !Number.isInteger(day_of_month) || day_of_month<1 || day_of_month>28) fail('Choose day 1 to 28 and an enabled setting');
    reportPeriod('2026-01',timezone);
    if(!timezone) fail('Timezone is required');
    const schedule=await result(db.from('report_schedules').upsert({workspace_id:req.workspaceId,enabled,day_of_month,timezone,narrative:text(narrative,10000),updated_at:new Date().toISOString()}).select().single());
    res.json({schedule});
}));
router.get('/snapshots',handle(async(req,res)=>{
    const offset=Number(req.query.offset || 0);
    if(!Number.isInteger(offset) || offset<0 || offset>100000) fail('Invalid page');
    const rows=await result(db.from('report_snapshots').select('id,month,timezone,status,generated_at,error_message').eq('workspace_id',req.workspaceId).order('month',{ascending:false}).range(offset,offset+49));
    res.json({items:rows,nextOffset:rows.length===50?offset+50:null});
}));
router.post('/snapshots/generate',manager,handle(async(req,res)=>{
    const {month,timezone='Asia/Kolkata',narrative=''}=req.body || {};
    res.status(202).json({item:await enqueueReport(req.workspaceId,month,timezone,text(narrative,10000))});
}));
router.get('/snapshots/:id',handle(async(req,res)=>{
    const row=await getScoped('report_snapshots',req.workspaceId,req.params.id);
    const {claim_token,leased_until,pdf_object_key,...item}=row;
    res.json({item});
}));
router.post('/snapshots/:id/retry',manager,handle(async(req,res)=>{
    const row=await getScoped('report_snapshots',req.workspaceId,req.params.id);
    if(row.status!=='failed') fail('Only failed reports can be retried',409);
    const item=await result(db.from('report_snapshots').update({status:'queued',attempts:0,error_message:null}).eq('workspace_id',req.workspaceId).eq('id',row.id).eq('status','failed').select('id,status').maybeSingle());
    if(!item) fail('Report changed. Refresh first.',409);res.json({item});
}));
router.get('/snapshots/:id/download',handle(async(req,res)=>{
    const item=await getScoped('report_snapshots',req.workspaceId,req.params.id);
    if(item.status!=='ready' || !item.pdf_object_key) fail('The PDF is not ready yet',409);
    const signed=await result(db.storage.from('agency-private').createSignedUrl(item.pdf_object_key,60,{download:`report-${item.month}.pdf`}));
    res.set('Cache-Control','no-store').json({url:signed.signedUrl});
}));
export default router;
