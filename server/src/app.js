/**
 * Express application assembly. Exports the configured app without listening,
 * so tests and alternate hosts can mount it. See `server.js` for the process
 * entrypoint.
 */
import './config/env.js';

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';

import authRoutes from './modules/auth/auth.routes.js';
import profileRoutes from './modules/profile/profile.routes.js';
import metaRoutes from './modules/meta/meta.routes.js';
import linkedinRoutes from './modules/linkedin/linkedin.routes.js';
import workspaceRoutes from './modules/workspace/workspace.routes.js';
import pushRoutes from './modules/push/push.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import storageRoutes from './modules/storage/storage.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ── CORS ── explicit allowlist; add new origins to `env.allowedOrigins`, never '*'
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (env.allowedOrigins.includes(origin)) return callback(null, true);
        if (env.allowedOriginPatterns.some(pattern => pattern.test(origin))) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));

app.use(express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// ── Module routes ──
// New modules mount here. Keep prefixed routes above any '/api' root mounts.
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/meta', metaRoutes); // Facebook Pages + Instagram publishing
app.use('/api/linkedin', linkedinRoutes); // LinkedIn member + (dormant) Page publishing
app.use('/api/workspaces', workspaceRoutes); // membership, roles, invites
app.use('/api/push', pushRoutes); // web push registration (FCM)
app.use('/api/admin', adminRoutes); // platform administration (role='admin' only)
app.use('/api/storage', storageRoutes); // paid media storage (Razorpay)

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

if (env.serveFrontend) {
    const distPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(distPath));
    app.use('/assets', express.static(path.join(distPath, 'assets')));

    // Catch-all: hand any unmatched request to the React router.
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'), (err) => {
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

export default app;
