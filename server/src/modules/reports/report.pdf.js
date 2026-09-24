import PDFDocument from 'pdfkit';

export function renderReport(snapshot) {
    return new Promise((resolve,reject)=>{
        const doc=new PDFDocument({size:'A4',margin:48,info:{Title:`Social report ${snapshot.month}`}});
        const chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
        if(process.env.REPORT_FONT_PATH) doc.font(process.env.REPORT_FONT_PATH);
        const brand=snapshot.brand_snapshot || {}, m=snapshot.metrics;
        const color=/^#[0-9a-f]{6}$/i.test(brand.primary_color || '')?brand.primary_color:'#1AA8A8';
        doc.fillColor(color).fontSize(24).text(brand.client_name || 'Client report');
        doc.fillColor('#222222').fontSize(16).text(`Social performance | ${snapshot.month}`).moveDown();
        const line=(s)=>doc.fontSize(11).text(s,{paragraphGap:8});
        line(`Timezone: ${snapshot.timezone} | Generated: ${snapshot.generated_at}`);
        for(const [key,value] of Object.entries(m.totals)) line(`${key}: ${value}`);
        doc.moveDown();doc.fontSize(16).text('Available engagement').moveDown(0.4);
        for(const [key,value] of Object.entries(m.engagement)) line(`${key}: ${value ?? 'Unavailable'}`);
        line(`Metric coverage: ${m.coverage.withMetrics} of ${m.coverage.published} published posts`);
        for(const group of ['campaigns','pillars']) {
            doc.moveDown();doc.fontSize(16).text(group==='campaigns'?'Campaigns':'Content pillars').moveDown(0.4);
            for(const row of m[group]) line(`${row.name}: ${row.published}/${row.total} published; ${row.failed} failed; engagement ${row.engagement ?? 'unavailable'}`);
        }
        doc.moveDown();doc.fontSize(16).text('Top posts').moveDown(0.4);
        for(const post of m.topPosts) line(`${post.pageName || post.provider} | ${post.score} engagements\n${post.caption}`);
        if(snapshot.narrative) {doc.moveDown();doc.fontSize(16).text('Agency notes').moveDown(0.4);line(snapshot.narrative);}
        doc.moveDown();for(const note of m.notes) line(note);
        if(brand.report_footer) line(brand.report_footer);
        doc.end();
    });
}
