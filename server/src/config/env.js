/**
 * Runtime bootstrap — MUST be the first import of the process entrypoint.
 *
 * ES module imports are hoisted and evaluated before any module body, so any
 * process-wide setup (env vars, DNS order, TLS) has to live in a module that
 * every consumer imports *first* rather than in a statement at the top of the
 * entrypoint. `server.js` imports this before `app.js`; `config/supabase.js`
 * imports it too, so the ordering holds however the graph is entered.
 */
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

// Force IPv4 to avoid Supabase connection timeouts.
dns.setDefaultResultOrder('ipv4first');

// In production, do NOT disable TLS verification.
// If you truly need this (e.g. debugging a bad certificate chain), set `INSECURE_TLS=true`.
if (process.env.INSECURE_TLS === 'true' || process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const port = Number(process.env.PORT) || 3001;

export const env = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    serveFrontend: process.env.SERVE_FRONTEND === 'true',

    /**
     * Where this API is reachable from the public internet.
     *
     * OAuth providers build their callback from this and require a public
     * HTTPS URL, so in local development it has to be a tunnel (ngrok,
     * Cloudflare) rather than localhost. Set PUBLIC_URL once and every
     * provider's redirect URI follows -- previously each provider carried its
     * own copy, so a new tunnel URL meant editing several lines and missing
     * one.
     *
     * Only the OAuth callbacks need this. The browser still talks to the API
     * over localhost.
     */
    publicUrl: (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),

    /** Where the browser is running -- the OAuth callback redirects back here. */
    frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
    allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5176',
            'http://localhost:3000',
            'https://automation-dashboard-ten.vercel.app',
            'https://automation-dashboard-git-main-bitlanceais-projects.vercel.app',
            'https://bitlancetechhub.com',
            'https://www.bitlancetechhub.com',
        ],
    // Vercel preview deployments get a fresh URL per commit, so match the whole
    // team namespace rather than one project name.
    allowedOriginPatterns: [
        /^https:\/\/[a-z0-9-]+-bitlanceais-projects\.vercel\.app$/,
    ],
};

export default env;
