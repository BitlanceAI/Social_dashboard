import { DateTime } from 'luxon';
import { fail } from '../agency/agency.validation.js';

export function reportPeriod(month, zone) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) fail('Choose a month in YYYY-MM format');
    const start=DateTime.fromISO(`${month}-01`,{zone});
    if(!start.isValid) fail('Choose a valid timezone and month');
    return {month,timezone:zone,period_start:start.toUTC().toISO(),period_end:start.plus({months:1}).toUTC().toISO()};
}
export function dueMonth(schedule, now=new Date()) {
    const local=DateTime.fromJSDate(now).setZone(schedule.timezone);
    if(!local.isValid || local.day<schedule.day_of_month) return null;
    return local.minus({months:1}).toFormat('yyyy-MM');
}
export const normalizeMetrics = (metrics) => Object.fromEntries(['likes','comments','shares','views','impressions'].map(key=>[
    key,typeof metrics?.[key]==='number' && Number.isFinite(metrics[key]) && metrics[key]>=0 ? metrics[key] : null,
]));

export function summarize(posts, items, campaigns, pillars, metricsByPost={}) {
    const totals={total:posts.length,published:0,failed:0,pending:0,scheduled:0};
    const labels=(catalog)=>new Map(catalog.map(x=>[x.id,x.name]));
    const campaignNames=labels(campaigns), pillarNames=labels(pillars), content=new Map(items.map(x=>[x.id,x]));
    const groups={campaigns:{},pillars:{}};
    const engagement=normalizeMetrics({});
    const coverage={published:0,withMetrics:0};
    const ranked=[];
    for(const post of posts){
        totals[post.status]=(totals[post.status] || 0)+1;
        const entries=metricsByPost[post.id] || [];
        let score=null;
        for(const entry of entries) for(const key of Object.keys(engagement)) {
            const value=entry.metrics[key];
            if(value!=null) engagement[key]=(engagement[key] ?? 0)+value;
            if(['likes','comments','shares'].includes(key) && value!=null) score=(score ?? 0)+value;
        }
        if(post.status==='published') {coverage.published++; if(entries.some(e=>Object.values(e.metrics).some(v=>v!==null))) coverage.withMetrics++;}
        const item=content.get(post.content_item_id);
        for(const [group,key,names] of [['campaigns','campaign_id',campaignNames],['pillars','pillar_id',pillarNames]]) {
            const id=item?.[key] || 'unassigned';
            const row=groups[group][id] ||= {id,name:names.get(id) || 'Unassigned',total:0,published:0,failed:0,engagement:null};
            row.total++; if(post.status==='published') row.published++; if(post.status==='failed') row.failed++;
            if(score!==null) row.engagement=(row.engagement ?? 0)+score;
        }
        if(score!==null) ranked.push({id:post.id,caption:post.content,pageName:post.page_name,provider:post.provider,score,metrics:entries});
    }
    return {totals,engagement,coverage,campaigns:Object.values(groups.campaigns),pillars:Object.values(groups.pillars),
        topPosts:ranked.sort((a,b)=>b.score-a.score).slice(0,10),
        notes:['Posts are included by scheduled time in the selected workspace month. Engagement is the available lifetime count at collection, not engagement earned only within that month. Unavailable metrics are shown as unavailable; top posts rank by available likes + comments + shares.'],
    };
}
