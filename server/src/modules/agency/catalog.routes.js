import express from 'express';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace, requireWorkspaceRole } from '../../middleware/workspace.js';
import { db, handle, result, getScoped } from './agency.shared.js';
import { text, date, fail, oneOf } from './agency.validation.js';

export const catalogRouter = (table) => {
    const router = express.Router();
    const campaign = table === 'campaigns';
    router.use(authenticateUser, resolveWorkspace);
    const fields = (body) => {
        const row = {};
        if (body.name !== undefined) row.name = text(body.name,160,true);
        if (campaign) {
            if (body.objective !== undefined) row.objective = text(body.objective,4000);
            if (body.status !== undefined) row.status = oneOf(body.status,['active','completed','archived']);
            for (const key of ['starts_at','ends_at']) if (body[key] !== undefined) row[key] = date(body[key]);
        } else {
            if (body.description !== undefined) row.description = text(body.description,4000);
            if (body.color !== undefined) { if (!/^#[0-9a-f]{6}$/i.test(body.color)) fail('Use a six-digit hex color'); row.color=body.color; }
            if (body.is_active !== undefined) { if (typeof body.is_active !== 'boolean') fail('Invalid active flag'); row.is_active=body.is_active; }
        }
        return row;
    };
    router.get('/', handle(async(req,res) => {
        const rows = []; let page;
        do { page = await result(db.from(table).select('*').eq('workspace_id',req.workspaceId).order('name').order('id').range(rows.length,rows.length+499)); rows.push(...page); } while(page.length===500);
        res.json({ items: rows });
    }));
    router.get('/:id', handle(async(req,res) => res.json({ item: await getScoped(table,req.workspaceId,req.params.id) })));
    if (campaign) router.get('/:id/posts', handle(async(req,res) => {
        await getScoped(table,req.workspaceId,req.params.id);
        const items=[]; let page;
        do {
            let query=db.from('content_items').select('id,title,review_status,planned_for,pillar_id').eq('workspace_id',req.workspaceId).eq('campaign_id',req.params.id).order('id').range(items.length,items.length+499);
            if(req.workspace.role==='client') query=query.not('review_status','in','(draft,internal_review)');
            page=await result(query);items.push(...page);
        } while(page.length===500);
        const progress=items.reduce((counts,item)=>{counts[item.review_status]=(counts[item.review_status] || 0)+1;return counts;},{total:items.length});
        res.json({items,progress});
    }));
    router.post('/', requireWorkspaceRole('owner','admin','member'), handle(async(req,res) => {
        const row=fields(req.body || {}); if(!row.name) fail('Name is required');
        res.status(201).json({ item: await result(db.from(table).insert({...row,workspace_id:req.workspaceId}).select().single()) });
    }));
    router.patch('/:id', requireWorkspaceRole('owner','admin','member'), handle(async(req,res) => {
        await getScoped(table,req.workspaceId,req.params.id);
        res.json({ item: await result(db.from(table).update({...fields(req.body || {}),updated_at:new Date().toISOString()}).eq('workspace_id',req.workspaceId).eq('id',req.params.id).select().single()) });
    }));
    return router;
};
