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

// Vercel preview deployments get a fresh URL per commit, so match the whole
// team namespace rather than one project name.
const allowedOriginPatterns = [
    /^https:\/\/[a-z0-9-]+-bitlanceais-projects\.vercel\.app$/,
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

// ── Routes ──
import authRoutes from './routes/auth/authRoutes.js';
import profileRoutes from './routes/auth/profileRoutes.js';
import metaRoutes from './routes/social/metaRoutes.js';
import pushRoutes from './routes/push/pushRoutes.js';

app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/meta', metaRoutes); // Facebook Pages + Instagram publishing + Meta Ads
app.use('/api/push', pushRoutes); // web push registration (FCM)

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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Publishes due scheduled_posts to Facebook / Instagram
    startPostScheduler();
});

export default app;
