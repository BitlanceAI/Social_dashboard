# Automation Bitlance — Project Memory

## Critical Rules (Read First)

1. **Server uses ES Modules** — all `require()` calls are invalid; use `import`/`export` syntax only.
2. **`server/src/config/env.js` is the process bootstrap** — it owns `dotenv.config()`, the IPv4 DNS order, and the TLS flag. Any module reading `process.env` at module scope must `import` it first. Never re-add a stray `dotenv.config()` elsewhere.
3. **TLS workaround is intentional** — `NODE_TLS_REJECT_UNAUTHORIZED='0'` in dev is a known tradeoff, not a bug to fix. Do NOT remove unless fixing the underlying certificate issue.
4. **CORS is locked to an explicit allowlist** — to allow a new origin, add it to `allowedOrigins` in `server/src/config/env.js` (or the `ALLOWED_ORIGINS` env var), never open it with `'*'`.
5. **Supabase service-role key is server-side only** — never expose `SUPABASE_SERVICE_ROLE_KEY` to the client. The client uses `VITE_SUPABASE_ANON_KEY` only.
6. **Client imports use the `@/` alias, never deep relatives** — `@/features/meta/...`, `@/shared/lib/...`. This is what keeps files cheap to move.
7. **Cross-feature imports go through the feature barrel** — `import { AuthGuard } from '@/features/auth'`, not through its internal path. Anything shared by two features belongs in `shared/`.

---

## Key Commands

```bash
# Development — npm workspaces; run from the repo root
npm install                     # installs client + server
npm run dev                     # client (5173) + server (3001) concurrently

# Or individually
npm run dev -w client
npm run dev -w server

# Production
npm start                       # server only (node src/server.js)
npm run build                   # installs deps + builds the client for deployment

# Client only
npm run lint -w client
npm run build -w client
```

---

## Architecture

Full-stack Meta (Facebook Pages + Instagram) automation platform.

### Client — feature-sliced

```
client/src/
  app/                    application shell; nothing business-specific
    main.jsx              DOM entry (referenced by index.html)
    App.jsx               providers + <Routes> loop
    routes.jsx            the route table — a new page adds one entry here
    providers/            AppProviders.jsx — every app-wide context
  features/               one folder per product area, self-contained
    auth/                 components/ context/ pages/ index.js
    meta/                 components/ (+ steps/) pages/ index.js
    notifications/        components/ lib/ index.js
    legal/                components/ pages/ index.js
    marketing/            pages/
  shared/                 used by 2+ features; never imports from features/
    components/layout/    Logo, SEOHead
    components/ui/        shadcn primitives
    context/              ThemeContext
    lib/                  analytics, supabase, utils
    config/               API_BASE_URL
  styles/                 index.css, App.css
```

**Adding a feature:** create `features/<name>/` with `components/`, `pages/`, `index.js`;
add its routes to `app/routes.jsx`. Nothing else in `app/` or `shared/` changes.

### Server — modular

```
server/src/
  server.js               process entry: env bootstrap -> listen -> scheduler
  app.js                  express assembly, exported without listening (testable)
  config/
    env.js                dotenv + DNS + TLS + CORS allowlist  (import first!)
    supabase.js           supabase + supabaseAdmin clients
  middleware/auth.js      Bearer token validation
  modules/                one folder per domain, routes + controller + service
    auth/                 auth.routes.js  auth.controller.js
    profile/              profile.routes.js  profile.controller.js
    meta/                 meta.routes.js  meta.service.js
    linkedin/             linkedin.routes.js  linkedin.service.js
    push/                 push.routes.js  push.service.js
    scheduler/            scheduler.service.js
  shared/utils/           encryption.js
  shared/storage/         postMedia.js  (provider-neutral upload helper)
secrets/                  gitignored credential drop (templates tracked)
```

**Adding a module:** create `modules/<name>/<name>.routes.js` (+ `.controller.js`,
`.service.js`), then mount it in `app.js`. Keep prefixed mounts above any `/api` root mount.

### External Integrations

| Service | Purpose |
|---------|---------|
| Supabase | PostgreSQL DB + Storage + Auth |
| Meta Graph API v21 | Pages, Instagram publishing, OAuth, post engagement counts |
| LinkedIn REST API | Member publishing + OAuth. Org Pages are coded but dormant. |
| Firebase (FCM) | Web push notifications |

---

## Environment Variables

### Server (`server/.env`)
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # Server-side ONLY
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=
META_RETURN_PATH=             # client route the OAuth callback bounces back to
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
LINKEDIN_API_VERSION=202608   # LinkedIn-Version header; expires yearly
LINKEDIN_RETURN_PATH=
LINKEDIN_ORG_SCOPES_ENABLED=false  # flipping this invalidates ALL LinkedIn tokens
FRONTEND_URL=
ENCRYPTION_KEY=
PORT=3001
ALLOWED_ORIGINS=              # Comma-separated, overrides hardcoded list
INSECURE_TLS=true             # Dev only — disable in production
```

### Client (`client/.env`) — see `client/.env.example`
```
VITE_API_BASE_URL=http://localhost:3001
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=       # public anon key only
VITE_FIREBASE_*=              # optional; web push opt-in hides itself without them
```

---

## Database — Supabase Tables

`users`, `meta_connections`, `linkedin_connections`, `scheduled_posts`, `push_tokens`

`scheduled_posts.provider` (`'meta' | 'linkedin'`) picks the publisher, and a
CHECK constraint enforces that exactly the matching connection FK is set. The
browser has `FOR ALL` RLS on that table, so the constraint is a real guard.

Migrations live in the repo-root `supabase/migrations/` (single CLI project).

---

## API Route Map

| Prefix | Module | Notes |
|--------|--------|-------|
| `/api/auth` | `modules/auth` | Login, signup, logout |
| `/api/profiles` | `modules/profile` | User profile CRUD |
| `/api/meta` | `modules/meta` | OAuth, Pages, FB + Instagram publishing, scheduling |
| `/api/linkedin` | `modules/linkedin` | OAuth, member publishing, scheduling, delete, metrics |
| `/api/push` | `modules/push` | FCM web-push token registration |
| `/health` | `app.js` | Liveness probe |

All mounted in `server/src/app.js`.

---

## Reminders

- **LinkedIn tokens expire after 60 days and cannot be refreshed.** Refresh tokens go only to approved Marketing Developer Platform partners. `linkedin_connections.token_expires_at` is the single source of truth: the routes precheck it, the scheduler fails a due post with a human message, and the dashboard warns at 7 days. Do not add silent-renewal logic — there is none to add.
- **`LinkedInService.DEFAULT_SCOPES` must not change casually.** LinkedIn invalidates every previously issued token when an app's requested scope set changes. Turning on `LINKEDIN_ORG_SCOPES_ENABLED` is a forced-reconnect release for all users.
- **Posting to a LinkedIn Company Page is dormant, not missing.** The code path exists and is exercised by `getOrganizations()`, which returns `[]` without an HTTP call until `rw_organization_admin` is granted. Enabling it needs Community Management API review (legal entity, business email, Page super-admin verification, screencast) — and a rejection cannot be re-applied for with the same app.
- **`LINKEDIN_API_VERSION` is the only place the `LinkedIn-Version` header lives.** LinkedIn supports a version for a minimum of one year then rejects it outright, so this needs a calendar reminder.
- **LinkedIn does not fetch media by URL.** Unlike Meta, the server must read the bytes back from the public `post-media` bucket and PUT them to LinkedIn. That is why the bucket stays public.

- **Ads are out of scope.** Campaigns, ad insights, account balance and the Conversions API were removed from `modules/meta`, and `ads_read` / `ads_management` are deliberately absent from `MetaService.DEFAULT_SCOPES`. Do not re-add ads endpoints without also adding the scopes and getting them through Meta App Review.

- **DNS is forced to IPv4** (`dns.setDefaultResultOrder('ipv4first')` in `config/env.js`) to prevent Supabase timeouts — do not remove.
- **`INSECURE_TLS` only disables TLS in non-production** — the check is `NODE_ENV !== 'production'`.
- Deployment: client → Vercel (`automation-dashboard-*.vercel.app`), server → separate Node host.
- Post media uploads go to the Supabase Storage bucket `post-media`.

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
