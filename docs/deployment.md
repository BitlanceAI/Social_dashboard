# Deployment — Vercel (frontend) + DigitalOcean (backend)

Two origins, so CORS and the OAuth redirect both matter. Get those two right
and the rest is routine.

| | Where | Serves |
|---|---|---|
| Frontend | Vercel | the React app |
| Backend | DigitalOcean | `/api/*`, OAuth callback, the scheduler |

Placeholders used below:

- `https://social-dashboard.vercel.app` → your Vercel domain
- `https://api.yourdomain.com` → your DigitalOcean domain

---

## 1. Backend — DigitalOcean App Platform

**Create App → from the GitHub repo → Resource type: Web Service.**

| Setting | Value |
|---|---|
| Source directory | `/server` |
| Build command | `npm install --legacy-peer-deps` |
| Run command | `npm start` |
| HTTP port | `3001` (or leave and set `PORT` to what DO injects) |
| Health check path | `/health` |

`server/package.json` is `"type": "module"` and needs Node ≥ 18 — App Platform's
default is fine.

### Environment variables

Mark every secret as **encrypted** in DO.

```bash
NODE_ENV=production            # NOT optional — see the TLS note below
PORT=3001
SERVE_FRONTEND=false           # Vercel serves the client

# Supabase → Project Settings → API
SUPABASE_URL=https://dfkkiyutfzxfdhorfxtp.supabase.co
SUPABASE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>     # server only

# Reuse the value from your local server/.env. A new key makes every stored
# Meta token undecryptable and forces all users to reconnect.
ENCRYPTION_KEY=<64 hex chars, same as local>

# Meta
META_APP_ID=1223947918763528
META_APP_SECRET=<app secret>
META_API_VERSION=v21.0

# The callback lives on the API; the browser is sent back to the frontend
META_REDIRECT_URI=https://api.yourdomain.com/api/meta/oauth/callback
FRONTEND_URL=https://social-dashboard.vercel.app

# Browser origins allowed to call this API
ALLOWED_ORIGINS=https://social-dashboard.vercel.app

# Web push (optional). Base64 of the Firebase service-account JSON —
# DigitalOcean's env editor handles a single base64 blob far better than raw
# JSON full of quotes and braces. Mark it encrypted.
FIREBASE_SERVICE_ACCOUNT_B64=<base64 blob>
```

### Firebase credentials on DigitalOcean

The loader accepts three forms, checked in this order — use whichever the
host tolerates:

| Variable(s) | When to use |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_B64` | **Preferred.** One base64 line, no quotes or braces to confuse an env editor. |
| `FIREBASE_SERVICE_ACCOUNT` | Raw JSON on one line. Fine locally; some hosts mangle it. |
| `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | Fallback. The key's line breaks are usually stored as the two literal characters backslash-n; the loader converts them back. |

Generate the base64 form from the service-account JSON:

```bash
node -e "console.log(Buffer.from(require('fs').readFileSync('service-account.json','utf8')).toString('base64'))"
```

If none are set, push is simply disabled — nothing else in the app changes.

> `ALLOWED_ORIGINS` **replaces** the built-in list entirely. Include every
> frontend origin you use, comma-separated. Vercel preview URLs are matched
> separately by pattern (`*-bitlanceais-projects.vercel.app`), so previews keep
> working without listing each one.

### ⚠️ `NODE_ENV=production` is a security requirement

`server/src/index.js` and `config/supabaseClient.js` both start with:

```js
if (process.env.INSECURE_TLS === 'true' || process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
```

Anything other than exactly `production` disables TLS certificate verification
**process-wide**, including calls to Meta and Supabase. Never set `INSECURE_TLS`
in production.

### The scheduler needs an always-on instance

`startPostScheduler()` runs in-process on a 1-minute interval. If the instance
sleeps or scales to zero, **scheduled posts silently do not publish**. Use a
paid always-on plan, or move the scheduler to a DO Function on a cron trigger.

---

## 2. Frontend — Vercel

**Import the repo → Framework preset: Vite.**

| Setting | Value |
|---|---|
| Root directory | `client` |
| Build command | `npm run build` (default) |
| Output directory | `dist` (default) |
| Install command | `npm install --legacy-peer-deps` |

### Environment variable

```bash
VITE_API_BASE_URL=https://api.yourdomain.com
```

Vite **inlines this at build time**, so it must exist before the build, and
changing it requires a redeploy — not just a restart.

If it is missing, `client/src/config.js` falls back to
`https://automation-dashboard-s3m6.onrender.com` in production builds, and the
app will quietly talk to the wrong backend. Worth updating that default too.

`client/vercel.json` already handles SPA routing (all paths → `index.html`) and
asset caching, so deep links like `/socialdashboad` and `/data-deletion` work.

**Deploy the backend first** so you have its URL for this variable.

---

## 3. Supabase

Apply migrations against the project the app uses:

```bash
supabase db push        # 20260826000000_initial_schema, 20260826120000_selected_pages
```

The `post-media` storage bucket must stay **public** — Meta fetches images and
video by URL rather than accepting an upload. The baseline migration sets this.

Email confirmation is on by default. Either turn it off
(Authentication → Providers → Email) or pre-confirm accounts, otherwise new
signups — including the Meta reviewer account — cannot log in.

---

## 4. Meta App Dashboard

Note which domain each URL belongs to. Only the OAuth callback is on the API.

| Setting | Value |
|---|---|
| Valid OAuth Redirect URIs | `https://api.yourdomain.com/api/meta/oauth/callback` |
| Deauthorize Callback URL | `https://api.yourdomain.com/api/meta/deauthorize` |
| Data Deletion Request URL | `https://api.yourdomain.com/api/meta/data-deletion` |
| Data Deletion Instructions URL | `https://social-dashboard.vercel.app/data-deletion` |
| Privacy Policy URL | `https://social-dashboard.vercel.app/privacy-policy` |
| Terms of Service URL | `https://social-dashboard.vercel.app/terms-policy` |
| App Domains | `social-dashboard.vercel.app`, `api.yourdomain.com` |

The redirect URI must match `META_REDIRECT_URI` character for character, or
Facebook rejects the login with "URL blocked".

---

## 5. Verify

```bash
API=https://api.yourdomain.com
APP=https://social-dashboard.vercel.app

curl $API/health                                            # {"status":"ok"}
curl -o /dev/null -w "%{http_code}\n" $API/api/meta/connection   # 401 — guard works
curl -o /dev/null -w "%{http_code}\n" $APP/                      # 200 — app loads
curl -o /dev/null -w "%{http_code}\n" $APP/data-deletion         # 200 — SPA routing

# CORS preflight from the frontend origin
curl -s -X OPTIONS $API/api/meta/oauth/url \
  -H "Origin: $APP" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" -D - -o /dev/null \
  | grep -i access-control-allow-origin       # must echo your frontend origin

# OAuth callback must bounce to the FRONTEND, not localhost
curl -i "$API/api/meta/oauth/callback?error=test" | grep -i location
```

That last check catches the most common misconfiguration: a wrong
`FRONTEND_URL` sends users to localhost after they authorise with Facebook.

Then sign in on the Vercel domain, connect a Meta account, and publish one test
post to confirm the whole path end to end.

---

## Notes

- **Sessions are per-origin.** Supabase stores them in `localStorage`, so log in
  on the Vercel domain — the OAuth callback returns there. Logging in anywhere
  else means the callback lands with no session and bounces to `/login`.
- **Redeploy the frontend** after changing `VITE_API_BASE_URL`; a restart is not
  enough, since the value is baked into the bundle.
- **Adding a custom frontend domain later** means updating `ALLOWED_ORIGINS`,
  `FRONTEND_URL`, and the Meta dashboard URLs together.
