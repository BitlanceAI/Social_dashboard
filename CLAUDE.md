# Automation Bitlance — Project Memory

## Critical Rules (Read First)

1. **Server uses ES Modules** — all `require()` calls are invalid; use `import`/`export` syntax only.
2. **TLS workaround is intentional** — `NODE_TLS_REJECT_UNAUTHORIZED='0'` in dev is a known tradeoff, not a bug to fix. Do NOT remove unless fixing the underlying certificate issue.
3. **CORS is locked to an explicit allowlist** — to allow a new origin, add it to `allowedOrigins` in `server/src/index.js`, never open it with `'*'`.
4. **PII must be SHA-256 hashed before leaving the server** — email/phone sent to Meta CAPI must pass through `trackingController` hashing logic.
5. **Supabase service-role key is server-side only** — never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
6. **Route registration order matters** — `articleRoutes` and `retellRoutes` are mounted at `/api` root; add new routes before them to avoid path conflicts.

---

## Key Commands

```bash
# Development
cd client && npm run dev        # Vite frontend on http://localhost:5173
cd server && npm run dev        # Express backend on http://localhost:3001 (node --watch)

# Production
npm start                       # Starts server only (node server/src/index.js)
npm run build                   # Installs all deps + builds client for deployment

# Client only
cd client && npm run lint       # ESLint
cd client && npm run build      # Vite production build
cd client && npm run preview    # Preview production build locally
```

---

## Architecture

Full-stack Meta Ads automation platform. See `ARCHITECTURE.md` for full diagrams.

```
client/           React 19 + Vite — frontend SPA
  src/
    components/   Navbar, Footer, AuthGuard, AdminGuard, CampaignForms
    context/      AuthContext, ThemeContext
    pages/        Public + protected pages, landing pages (/l/*)
    services/api.js  Axios API client (base URL from VITE_API_URL)
    utils/MetaPixel.js  Browser-side pixel tracking helper

server/src/
  index.js        Express entry — CORS, route mounting
  config/         supabaseClient.js
  controllers/    campaignController, trackingController, articleController…
  routes/         One file per domain (auth, campaigns, meta, tracking, …)
  services/       social/metaService (Graph API), scheduler (post + blog cron), analytics
  middleware/     authMiddleware.js (Bearer token validation)
  utils/          encryption.js
```

### External Integrations

| Service | Purpose |
|---------|---------|
| Supabase | PostgreSQL DB + Storage + Auth |
| Meta Graph API v21 | Campaigns, Pages, Instagram publishing, OAuth, CAPI |
| Google Sheets API | Lead data sync |
| Retell AI | Voice agent calls |
| Firebase | Push notifications |
| Gemini AI / OpenAI | Content generation |
| Twilio | SMS |

---

## Environment Variables

### Server (`server/.env`)
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # Server-side ONLY
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=
META_PIXEL_ID=916142120954550
META_ACCESS_TOKEN=            # For CAPI
ENCRYPTION_KEY=
PORT=3001
ALLOWED_ORIGINS=              # Comma-separated, overrides hardcoded list
INSECURE_TLS=true             # Dev only — disable in production
```

### Client (`client/.env`)
```
VITE_API_URL=http://localhost:3001
```

---

## Database — Campaign Tables

9 campaign types each have their own Supabase table:
`awareness_campaigns`, `traffic_campaigns`, `engagement_campaigns`,
`leadgen_campaigns`, `conversion_campaigns`, `app_promotion_campaigns`,
`local_business_campaigns`, `remarketing_campaigns`, `offer_event_campaigns`

Other tables: `users`, `tracking_events`, `articles`, `credit_ledger`, `meta_connections`

---

## API Route Map

| Prefix | File | Notes |
|--------|------|-------|
| `/api/auth` | authRoutes.js | Login, signup, logout |
| `/api/campaigns` | campaignRoutes.js | CRUD + `/upload` for media |
| `/api/track` | trackingRoutes.js | CAPI relay — hashes PII |
| `/api/meta` | social/metaRoutes.js | OAuth, Pages, FB + Instagram publishing, scheduling, Insights |
| `/api/credits` | creditRoutes.js | Credit balance |
| `/api/design` | designRoutes.js | AI graphic generation |
| `/api/admin` | adminRoutes.js | Admin ops |
| `/api/admin/auto-blog` | autoBlogRoutes.js | Automated blog generation |
| `/api/google-sheets` | googleSheetsRoutes.js | Lead sync |
| `/api/meetings` | meetingRoutes.js | Calendar / Calendly |
| `/api/gemini` | geminiRoutes.js | Gemini AI |
| `/api/twitter` | twitterRoutes.js | Twitter integration |
| `/api/linkedin` | linkedinRoutes.js | LinkedIn integration |
| `/api` (root) | retellRoutes.js | Retell voice (`/api/create-web-call` etc.) |
| `/api` (root) | articleRoutes.js | Blog CRUD + public `/api/public/articles` |
| `/webhooks/meta` | webhookRoutes.js | Meta lead/conversion webhooks |

---

## Reminders

- **DNS is forced to IPv4** (`dns.setDefaultResultOrder('ipv4first')`) to prevent Supabase timeouts — do not remove.
- **`INSECURE_TLS` only disables TLS in non-production** — the check is `NODE_ENV !== 'production'`.
- Deployment: client → Vercel (`automation-dashboard-*.vercel.app`), server → separate Node host.
- Media uploads go to Supabase Storage bucket `campaign-media`; social media assets to `post-media`.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
