import '../../config/env.js';
import { db, result } from '../agency/agency.shared.js';
import { reportPeriod, dueMonth, normalizeMetrics, summarize } from './report.model.js';
import { renderReport } from './report.pdf.js';
import MetaService from '../meta/meta.service.js';
import LinkedInService from '../linkedin/linkedin.service.js';
import { decryptData } from '../../shared/utils/encryption.js';

export async function allRows(build, orderKey='id') {
    const rows=[];let page;
    do {page=await result(build().order(orderKey).range(rows.length,rows.length+499));rows.push(...page);}while(page.length===500);
    return rows;
}
export async function enqueueReport(workspaceId,month,zone,narrative='') {
    const period=reportPeriod(month,zone);
    const {data,error}=await db.from('report_snapshots').insert({...period,workspace_id:workspaceId,narrative}).select('id,status,month').single();
    if(error?.code==='23505') return result(db.from('report_snapshots').select('id,status,month').eq('workspace_id',workspaceId).eq('month',month).single());
    if(error) throw error;return data;
}
async function collectMetrics(workspaceId,posts,heartbeat) {
    const clients={},pageTokens=new Map();
    for(const [provider,table,Service] of [['meta','meta_connections',MetaService],['linkedin','linkedin_connections',LinkedInService]]) {
        const connection=await result(db.from(table).select('access_token,is_active,token_expires_at').eq('workspace_id',workspaceId).maybeSingle());
        if(connection?.is_active && (!connection.token_expires_at || Date.parse(connection.token_expires_at)>Date.now())) {
            try {clients[provider]=new Service(decryptData(connection.access_token));} catch { /* Missing/decryptable credentials yield unavailable metrics. */ }
        }
    }
    const metrics={};
    for(const post of posts.filter(p=>p.status==='published')) {
        await heartbeat();
        metrics[post.id]=[];
        for(const [platform,delivery] of Object.entries(post.publish_results || {})) {
            if(!delivery?.success || !delivery.postId || delivery.deleted) continue;
            let response;
            try {
                const service=clients[post.provider];
                if(service && post.provider==='meta') {
                    if(!pageTokens.has(post.page_id)) pageTokens.set(post.page_id,await service.getPageToken(post.page_id));
                    const token=pageTokens.get(post.page_id);
                    if(token?.success) response=await service.getPostMetrics(platform,delivery.postId,token.pageAccessToken);
                } else if(service) response=await service.getPostMetrics(delivery.postId);
            } catch { /* Provider outages must not erase delivery reporting. */ }
            metrics[post.id].push({platform,metrics:normalizeMetrics(response?.success?response.metrics:null)});
        }
    }
    return metrics;
}
async function generate(job) {
    let lastBeat=0;
    const heartbeat=async()=>{
        if(Date.now()-lastBeat<60000) return;
        const changed=await result(db.from('report_snapshots').update({leased_until:new Date(Date.now()+30*60000).toISOString()}).eq('id',job.id).eq('claim_token',job.claim_token).eq('status','processing').select('id').maybeSingle());
        if(!changed) throw new Error('Report lease lost');lastBeat=Date.now();
    };
    const [posts,items,campaigns,pillars,brand]=await Promise.all([
        allRows(()=>db.from('scheduled_posts').select('id,provider,page_id,page_name,status,content,content_item_id,publish_results').eq('workspace_id',job.workspace_id).gte('scheduled_time',job.period_start).lt('scheduled_time',job.period_end)),
        allRows(()=>db.from('content_items').select('id,campaign_id,pillar_id').eq('workspace_id',job.workspace_id)),
        allRows(()=>db.from('campaigns').select('id,name').eq('workspace_id',job.workspace_id)),
        allRows(()=>db.from('content_pillars').select('id,name').eq('workspace_id',job.workspace_id)),
        result(db.from('workspace_brand_profiles').select('client_name,primary_color,report_footer').eq('workspace_id',job.workspace_id).maybeSingle())
    ]);
    const metrics=summarize(posts,items,campaigns,pillars,await collectMetrics(job.workspace_id,posts,heartbeat));
    const snapshot={...job,metrics,brand_snapshot:brand,generated_at:new Date().toISOString()};
    const bytes=await renderReport(snapshot);
    const key=`reports/${job.workspace_id}/${job.id}/${job.claim_token}.pdf`;
    await result(db.storage.from('agency-private').upload(key,bytes,{contentType:'application/pdf',upsert:true}));
    const committed=await result(db.from('report_snapshots').update({metrics,brand_snapshot:brand,generated_at:snapshot.generated_at,pdf_object_key:key,status:'ready',leased_until:null,error_message:null}).eq('id',job.id).eq('claim_token',job.claim_token).eq('status','processing').select('id').maybeSingle());
    if(!committed) await db.storage.from('agency-private').remove([key]);
}
let running=false;
export async function runReportWorker() {
    if(running || !db) return;running=true;
    try {
        const schedules=await allRows(()=>db.from('report_schedules').select('*').eq('enabled',true),'workspace_id');
        for(const s of schedules) {const month=dueMonth(s);if(month) await enqueueReport(s.workspace_id,month,s.timezone,s.narrative);}
        const jobs=await result(db.rpc('claim_report_job'));
        const job=jobs?.[0];if(!job) return;
        try {await generate(job);}
        catch(error) {
            console.error('[Reports] Generation failed',job.id,error.message);
            await result(db.from('report_snapshots').update({status:job.attempts<3?'queued':'failed',leased_until:null,error_message:'Generation failed. Check server configuration or retry.'}).eq('id',job.id).eq('claim_token',job.claim_token));
        }
    } finally {running=false;}
}
export function startReportWorker() {
    const tick=()=>runReportWorker().catch(error=>console.error('[Reports]',error.message));
    tick();const timer=setInterval(tick,60000);timer.unref();return timer;
}
