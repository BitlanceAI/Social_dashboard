// ⚠️  Must be set BEFORE any imports — ES module imports are hoisted and
// supabaseClient.js initialises its fetch client at import time.
// Setting this via .env (dotenv.config) is too late.
// In production, do NOT disable TLS verification.
// If you truly need this (e.g. debugging a bad certificate chain), set `INSECURE_TLS=true`.
if (process.env.INSECURE_TLS === 'true' || process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force IPv4 to avoid Supabase connection timeouts
dns.setDefaultResultOrder('ipv4first');

// Load env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// ── CORS ── allow origins from env var (comma-separated) or localhost in dev
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5176', 'http://localhost:3000', 'https://automation-dashboard-ten.vercel.app', 'https://automation-dashboard-git-main-bitlanceais-projects.vercel.app', 'https://bitlancetechhub.com', 'https://www.bitlancetechhub.com'];

// Allow all Vercel preview deployments for this project
const allowedOriginPatterns = [
    /^https:\/\/automation-dashboard-.*-bitlanceais-projects\.vercel\.app$/,
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (allowedOriginPatterns.some(pattern => pattern.test(origin))) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));
app.use(express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Routes will be imported here

import creditRoutes from './routes/payments/creditRoutes.js';
import settingsRoutes from './routes/settings/settingsRoutes.js';
import googleSheetsRoutes from './routes/integrations/googleSheetsRoutes.js';
import retellRoutes from './routes/integrations/retellRoutes.js';
import meetingRoutes from './routes/integrations/meetingRoutes.js';
import designRoutes from './routes/design/designRoutes.js';
import campaignRoutes from './routes/campaigns/campaignRoutes.js';
import trackingRoutes from './routes/tracking/trackingRoutes.js';

import adminRoutes from './routes/admin/adminRoutes.js';
import profileRoutes from './routes/auth/profileRoutes.js';
import authRoutes from './routes/auth/authRoutes.js';
import linkedinRoutes from './routes/social/linkedinRoutes.js';
import metaRoutes from './routes/social/metaRoutes.js';
import articleRoutes from './routes/blog/articleRoutes.js';
import geminiRoutes from './routes/seo/gemini.js';

// Mount routes
app.use('/api/auth', authRoutes);

app.use('/api/credits', creditRoutes);
app.use('/api/user/settings', settingsRoutes);
app.use('/api/google-sheets', googleSheetsRoutes);
app.use('/api', retellRoutes); // Mount at root /api to match /api/create-web-call etc.
app.use('/api/meetings', meetingRoutes);
app.use('/api/design', designRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/track', trackingRoutes);


app.use('/api/admin', adminRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/meta', metaRoutes); // Facebook Pages + Instagram publishing + Meta Ads

import twitterRoutes from './routes/social/twitterRoutes.js';
app.use('/api/twitter', twitterRoutes);
app.use('/api', articleRoutes); // blog generation + CRUD + public blog routes
app.use('/api/gemini', geminiRoutes); // Gemini AI endpoints

// Meta Webhooks (no /api prefix as Meta expects direct path)
import webhookRoutes from './routes/social/webhookRoutes.js';
app.use('/webhooks/meta', webhookRoutes);

import autoBlogRoutes from './routes/admin/autoBlogRoutes.js';
app.use('/api/admin/auto-blog', autoBlogRoutes);


import whatsappRoutes from './routes/social/whatsappRoutes.js';
app.use('/api/whatsapp', whatsappRoutes);

import workspaceRoutes from './routes/settings/workspaceRoutes.js';
app.use('/api/workspaces', workspaceRoutes);

import leadsRoutes from './routes/leads/leadsRoutes.js';
app.use('/api/leads', leadsRoutes);



import pushRoutes from './routes/push/pushRoutes.js';
app.use('/api/push', pushRoutes);

import wordpressRoutes from './routes/wordpress/wordpressRoutes.js';
app.use('/api/wordpress', wordpressRoutes);

import mailtrapRoutes from './routes/email/mailtrapRoutes.js';
app.use('/api/mailtrap', mailtrapRoutes);

import keywordRoutes from './routes/seo/keywordRoutes.js';
app.use('/api/keywords', keywordRoutes);

import seoRankRoutes from './routes/seo/seoRankRoutes.js';
app.use('/api/seo', seoRankRoutes);

import eSignRoutes from './routes/esign/eSignRoutes.js';
app.use('/api/esign', eSignRoutes);

import digiLockerRoutes from './routes/esign/digiLockerRoutes.js';
app.use('/api/digilocker', digiLockerRoutes);

import paymentRoutes from './routes/payments/paymentRoutes.js';
app.use('/api/payment', paymentRoutes);

import sitemapRoutes from './routes/seo/sitemapRoutes.js';
app.use('/', sitemapRoutes);

// Redirect bounces — Cashfree needs https, bounces to local React dev server
// DigiLocker redirect bounce — Cashfree needs https, so it hits the ngrok server
// which redirects the browser back to the local React dev server
app.get('/digilocker/complete', (req, res) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(`${clientUrl}/digilocker/complete${qs ? `?${qs}` : ''}`);
});

app.get('/payment/complete', (req, res) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(`${clientUrl}/payment/complete${qs ? `?${qs}` : ''}`);
});



// Legacy routes handling
app.use('/api/add-to-google-sheet', googleSheetsRoutes);


// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Serve built React assets and root files if enabled
const serveFrontend = process.env.SERVE_FRONTEND === 'true';

if (serveFrontend) {
    const distPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(distPath));
    app.use('/assets', express.static(path.join(distPath, 'assets')));

    // The "catchall" handler: for any request that doesn't
    // match one above, send back React's index.html file.
    app.get('*', (req, res) => {
        const indexPath = path.join(__dirname, '../../client/dist/index.html');
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error('Error sending index.html:', err.message);
                res.status(500).send('Frontend build not found. Please run "npm run build" in the root directory.');
            }
        });
    });
} else {
    // API fallback for standalone backend
    app.use((req, res) => {
        res.status(404).json({ error: 'Not Found' });
    });
}

// Start server
import { startPostScheduler } from './services/scheduler/scheduler.js';

// Start Scheduler Service
import SchedulerService from './services/scheduler/SchedulerService.js';
import { startReminderCron } from './services/scheduler/reminderCron.js';
import { startEmailSequenceCron } from './services/email/emailSequenceCron.js';
// Pass a default MetaService or handle inside Scheduler
const scheduler = new SchedulerService();
scheduler.start();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start the background scheduler
    startPostScheduler();

    // Start 24h reminder cron
    startReminderCron();

    // Start email sequence cron (welcome · nurture · re-engagement)
    startEmailSequenceCron();
});

export default app;
