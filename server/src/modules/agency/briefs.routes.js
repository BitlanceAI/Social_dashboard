import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace, requireWorkspaceRole } from '../../middleware/workspace.js';
import { createContent } from '../content/content.service.js';
import { db, handle, result, getScoped, validateLinks } from './agency.shared.js';
import { briefPatch, fail, text, uuid } from './agency.validation.js';

const router=express.Router();
router.use(authenticateUser,resolveWorkspace);
const staff=requireWorkspaceRole('owner','admin','member');
router.get('/',handle(async(req,res)=>{
    let q=db.from('content_briefs').select('*').eq('workspace_id',req.workspaceId).order('id').limit(51);
    if(req.query.cursor) q=q.gt('id',uuid(req.query.cursor));
    if(req.query.status) q=q.eq('status',req.query.status);
    if(req.query.assignedTo) q=q.eq('assigned_to',uuid(req.query.assignedTo));
    if(req.query.campaignId) q=q.eq('campaign_id',uuid(req.query.campaignId));
    const rows=await result(q);
    res.json({items:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null});
}));
router.post('/',handle(async(req,res)=>{
    const patch=briefPatch(req.body || {},req.workspace.role,req.user.id);
    await validateLinks(req.workspaceId,patch);
    res.status(201).json({item:await result(db.from('content_briefs').insert({...patch,workspace_id:req.workspaceId,created_by:req.user.id}).select().single())});
}));
router.get('/:id',handle(async(req,res)=>{
    const item=await getScoped('content_briefs',req.workspaceId,req.params.id);
    let comments=db.from('brief_comments').select('*').eq('workspace_id',req.workspaceId).eq('brief_id',item.id).order('created_at');
    if(req.workspace.role==='client') comments=comments.eq('visibility','shared');
    let content=db.from('content_items').select('id,title,review_status').eq('workspace_id',req.workspaceId).eq('brief_id',item.id);
    if(req.workspace.role==='client') content=content.not('review_status','in','(draft,internal_review)');
    const [thread,attachments,events,items]=await Promise.all([
        result(comments),result(db.from('brief_attachments').select('id,filename,size_bytes,mime_type').eq('workspace_id',req.workspaceId).eq('brief_id',item.id)),
        result(db.from('brief_events').select('*').eq('workspace_id',req.workspaceId).eq('brief_id',item.id).order('created_at')),result(content)
    ]);
    res.json({item,comments:thread,attachments,events,content:items});
}));
router.patch('/:id',handle(async(req,res)=>{
    const item=await getScoped('content_briefs',req.workspaceId,req.params.id);
    if(req.body?.revision!==item.revision) fail('Request changed. Reload before saving.',409);
    const patch=briefPatch(req.body,req.workspace.role,req.user.id,item);
    await validateLinks(req.workspaceId,patch);
    const updated=await result(db.from('content_briefs').update({...patch,updated_by:req.user.id,revision:item.revision+1,updated_at:new Date().toISOString()}).eq('workspace_id',req.workspaceId).eq('id',item.id).eq('revision',item.revision).select().maybeSingle());
    if(!updated) fail('Request changed. Reload before saving.',409);
    res.json({item:updated});
}));
router.post('/:id/comments',handle(async(req,res)=>{
    await getScoped('content_briefs',req.workspaceId,req.params.id);
    const visibility=req.workspace.role!=='client' && req.body?.visibility==='internal'?'internal':'shared';
    res.status(201).json({comment:await result(db.from('brief_comments').insert({workspace_id:req.workspaceId,brief_id:req.params.id,author_id:req.user.id,body:text(req.body?.body,4000,true),visibility}).select().single())});
}));
router.post('/:id/create-content',staff,handle(async(req,res)=>{
    const brief=await getScoped('content_briefs',req.workspaceId,req.params.id);
    if(['completed','cancelled'].includes(brief.status)) fail('This request is closed',409);
    const item=await createContent(req.workspaceId,req.user.id,{...req.body,briefId:brief.id,campaignId:req.body?.campaignId ?? brief.campaign_id,title:req.body?.title || brief.title});
    res.status(201).json({item});
}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}}).single('file');
// Authorize before buffering the upload.
router.post('/:id/attachments',async(req,res,next)=>{
    try { await getScoped('content_briefs',req.workspaceId,req.params.id); next(); }
    catch(error) { res.status(error.status || 500).json({error:error.status?error.message:'Could not load request'}); }
},(req,res,next)=>upload(req,res,error=>error?res.status(400).json({error:'Upload one file, maximum 10 MB'}):next()),handle(async(req,res)=>{
    const f=req.file; if(!f?.size) fail('Choose a file');
    const signatures={
        'application/pdf': b=>b.subarray(0,5).toString()==='%PDF-',
        'image/png': b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
        'image/jpeg': b=>b[0]===255 && b[1]===216 && b[2]===255,
    };
    if(!signatures[f.mimetype]?.(f.buffer)) fail('Upload a PDF, PNG or JPEG file');
    const key=`briefs/${req.workspaceId}/${req.params.id}/${crypto.randomUUID()}`;
    await result(db.storage.from('agency-private').upload(key,f.buffer,{contentType:f.mimetype}));
    try {
        const attachment=await result(db.from('brief_attachments').insert({workspace_id:req.workspaceId,brief_id:req.params.id,uploaded_by:req.user.id,filename:f.originalname.slice(0,200),mime_type:f.mimetype,size_bytes:f.size,object_key:key}).select('id,filename,size_bytes').single());
        res.status(201).json({attachment});
    } catch(error) { await db.storage.from('agency-private').remove([key]); throw error; }
}));
router.get('/:id/attachments/:attachmentId',handle(async(req,res)=>{
    await getScoped('content_briefs',req.workspaceId,req.params.id);
    const file=await getScoped('brief_attachments',req.workspaceId,req.params.attachmentId);
    if(file.brief_id!==req.params.id) fail('Attachment not found',404);
    const signed=await result(db.storage.from('agency-private').createSignedUrl(file.object_key,60,{download:file.filename}));
    res.set('Cache-Control','no-store').json({url:signed.signedUrl});
}));
export default router;
