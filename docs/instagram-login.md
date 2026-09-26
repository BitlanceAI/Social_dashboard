# Direct Instagram Login setup

The **Add Profile → Instagram** option connects an Instagram Business or Creator
account directly. It does not require a Facebook Page. The Facebook option still
supports Pages and their linked Instagram accounts.

## Configure the backend

In your app on [Meta for Developers](https://developers.facebook.com/apps/), open
the Instagram product/use case and **API setup with Instagram login**. Configure
Instagram Business Login and copy the **Instagram App ID** and **Instagram App
Secret** from that section. Do not assume these are the Facebook App ID/secret.

Add these settings to `server/.env` when running the backend through the npm
workspace scripts (or to your backend host's environment settings):

```dotenv
INSTAGRAM_APP_ID=<Instagram App ID>
INSTAGRAM_APP_SECRET=<Instagram App Secret>
INSTAGRAM_REDIRECT_URI=https://<your-public-backend>/api/instagram/oauth/callback
INSTAGRAM_API_VERSION=v22.0
```

Never put the secret in a `VITE_` variable or commit it. Keep the existing
`ENCRYPTION_KEY`: rotating it makes existing connection tokens unreadable.
`INSTAGRAM_REDIRECT_URI` is optional when `PUBLIC_URL` already identifies the
public backend: the default is `${PUBLIC_URL}/api/instagram/oauth/callback`.
Register that **exact** redirect URL in Instagram Business Login settings.
Restart the backend after changing environment settings.

If Instagram shows `Invalid redirect_uri`, copy the `redirect_uri` value from
the authorization URL opened by **Add Profile → Instagram** and add that exact
HTTPS URL under **Instagram → API setup with Instagram login → Business Login →
Valid OAuth Redirect URIs** in the Meta developer dashboard. The callback ends
in `/api/instagram/oauth/callback`; the frontend URL and the Facebook Login
callback are different. A temporary ngrok hostname changes when the tunnel
changes, so update `PUBLIC_URL`, the Meta allowlist, and restart the server
whenever you start a new tunnel. Keep only one `PUBLIC_URL` line in `.env`.

The app requests `instagram_business_basic`,
`instagram_business_content_publish`, `instagram_business_manage_messages`, and
`instagram_business_manage_insights`, and `instagram_business_manage_comments`.
Configure the necessary access for these
permissions in Meta. While testing, use a professional Instagram account added
as an accepted app tester; serving other accounts requires the applicable app
review/access approval. Personal Instagram accounts cannot use this integration.
See [Meta's official Instagram API collection](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login).

Apply `supabase/migrations/20260922120000_instagram_login.sql` to the same database
used by the backend, **before deployment**. It adds server-only token/state tables,
workspace-scoped post references, and includes direct Instagram accounts in
subscription account limits. Existing migrations must already be applied.

Configure platform callbacks where requested:

- Deauthorization: `https://<your-public-backend>/api/instagram/deauthorize`
- Data deletion: `https://<your-public-backend>/api/instagram/data-deletion`
- Privacy policy and deletion instructions: the existing frontend legal pages.

## Use and verify

1. Sign into the dashboard and select the intended workspace.
2. Choose **Social Profiles → Add Profile → Instagram**.
3. Sign into Instagram with a Business or Creator account and approve publishing.
4. The dashboard shows `@username` with **Instagram · connected directly**.
5. Select that account in the composer; publish now or schedule an image, Reel,
   or carousel. Bulk CSV scheduling and content pipelines also accept it.
   Open **Analytics** to view account insights. This makes a live Insights API
   call and requires reconnecting if the account was linked before the insights
   permission was added.
   In **All Posts**, open an Instagram post's **comments** link to read its
   comments, then reply to a comment. Reconnect first if the account was linked
   before the comment permission was added. Opening the comments makes the
   API call needed for the comment permission's App Review testing checklist.
6. Disconnect from its profile card. This removes the stored connection and its
   queued/history rows; it does not delete media already published on Instagram.

One direct Instagram account is supported per workspace. Reconnecting the same
account updates its token. To switch accounts, disconnect the existing account
first so queued posts cannot silently publish to a different account.

Tokens are encrypted server-side. One-use, expiring OAuth states and handoff
tickets are bound to the app user, workspace, and a browser-session verifier.
The redirect never includes the Instagram access token. Long-lived tokens nearing
expiry are renewed during use and by the scheduler's daily maintenance pass.
Keep the backend scheduler running for unattended scheduling and renewal.

## Troubleshooting

- `INSTAGRAM_NOT_CONFIGURED`: the response names missing backend variables.
  Facebook's `META_APP_ID` / `META_APP_SECRET` do not configure this login path.
- `INSTAGRAM_ENCRYPTION_NOT_CONFIGURED`: restore the backend's existing valid key.
- `INSTAGRAM_MIGRATION_REQUIRED`: apply the Instagram migration to the backend's database.
- Redirect rejected: match the registered redirect URL, including scheme/path.
- Access denied: check the account type, app tester access, and permissions in Meta.
- Expired login/session: start **Add Profile → Instagram** again in the same browser tab.

Offline checks (no posts are sent):

```sh
node --experimental-vm-modules --test server/tests/instagram.test.mjs
npm run build -w client
```

Live OAuth and publishing require your configured Meta app and a professional
Instagram account; offline tests cannot verify the app's approval or credentials.
