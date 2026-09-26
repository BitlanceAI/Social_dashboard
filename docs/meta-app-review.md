# Meta App Review — Submission Pack

## `instagram_manage_engagement` (Instagram likes)

**Use case description** (paste into the form):

> Our dashboard lets an authorized user of a connected Instagram professional
> account like or unlike Instagram media and comments as that account. After the
> user connects the Instagram account through its linked Facebook Page, they open
> Post History or a post's Comments panel and click Like or Unlike. The app sends
> that specific user action to the Instagram Graph API using the connected
> account's Page access token (`POST` or `DELETE /{ig-user-id}/likes` with a
> `media_id` or `comment_id`). We do not create likes automatically or in bulk.

**Screencast steps:**

1. Sign in to the dashboard with a reviewer account that has access to a linked
   Instagram professional account and Facebook Page.
2. Connect the Meta account and grant `instagram_basic`, `pages_show_list`, and
   `instagram_manage_engagement` when prompted. Reconnect if the account was
   connected before this permission was added to OAuth.
3. Open **Post History**, find an Instagram post, and click **Like**. Show the
   success toast and the resulting like in Instagram.
4. Click **Unlike** and show that the like was removed. Optionally open that
   post's **Comments** panel and demonstrate Like/Unlike on a comment.

Before submitting, make at least one successful Like or Unlike request through
the connected app. Meta's App Review checklist will not count the permission
until it sees a successful API call. Use an account with an app role while the
app is in Development mode, and verify the call succeeds before recording.

---

The sections below also cover the original publishing review. Check the
requested permission list against the current OAuth configuration before
submitting, especially when Facebook Login for Business uses a login
configuration that supplies its own permission list.

> Every step below matches a real screen in this codebase. Do not add steps for
> features that do not exist — that is what gets submissions rejected.

---

## Permissions being requested

| Permission | Why it is in this submission |
|---|---|
| `pages_show_list` | Enumerate the user's Pages so we can find the linked Instagram Business account |
| `pages_read_engagement` | Read Page name/category/picture to display the connected account |
| `pages_manage_posts` | Publish the composed post to the selected Facebook Page |
| `instagram_basic` | Read the Instagram Business account profile and existing media |
| `instagram_content_publish` | Publish images/videos to the Instagram Business account |
| `instagram_manage_engagement` | Like or unlike Instagram media and comments as the connected account |

---

## Before you submit — checklist

- [ ] Business Verification complete (App Dashboard → Settings → Basic → Verification)
- [ ] 2FA enabled on the Business Manager account
- [ ] App deployed to a public **HTTPS** domain
- [ ] `META_APP_ID`, `META_APP_SECRET` set in the server environment
- [ ] `META_REDIRECT_URI` set to `https://<your-api-domain>/api/meta/oauth/callback` **and** added to App Dashboard → Facebook Login → Settings → Valid OAuth Redirect URIs (must match exactly)
- [ ] `FRONTEND_URL` set to your deployed client origin
- [ ] Deauthorize Callback URL set to `https://<your-api-domain>/api/meta/deauthorize`
- [ ] Data Deletion Request URL set to `https://<your-api-domain>/api/meta/data-deletion` (the signed-request callback)
- [ ] Data Deletion Instructions URL set to `https://<your-domain>/data-deletion` (the human-readable page)
- [ ] 1024×1024 app icon uploaded
- [ ] Privacy Policy URL set to `https://<your-domain>/privacy-policy`
- [ ] Terms of Service URL set to `https://<your-domain>/terms-policy`
- [ ] Migrations `022` and `023` applied in Supabase
- [ ] **At least one successful live API call per permission in the last 30 days** — connect a real account and publish one FB post and one IG post before submitting
- [ ] Reviewer test account created and confirmed working
- [ ] App still in **Development** mode (do not switch to Live until approved)

---

## Reviewer access

Replace before submitting — Meta will actually log in with these.

```
Login URL : https://<your-domain>/login
Email     : <reviewer account email>
Password  : <reviewer account password>

Test Facebook account : <username / password>
Test Instagram account: <username / password>
```

The Instagram account **must** be a Business or Creator account and **must** be
linked to the test Facebook Page. If it is a personal account,
`instagram_content_publish` cannot work and the review will fail.

---

## `instagram_basic`

**Use case description** (paste into the form):

> We use `instagram_basic` to read the profile information and existing media of
> the Instagram Business account the user has linked to their Facebook Page.
> After the user connects their Meta account, we display the Instagram username
> and profile picture so they can confirm which account they are publishing to,
> and we list their recent media so they can see what has already been posted.
> We do not access Instagram accounts the user has not connected, and we do not
> read direct messages or comments.

**Screencast steps:**

1. Open `https://<your-domain>/login` and sign in with the reviewer credentials.
2. You land on the Meta dashboard at `/socialdashboad`.
3. Click **Connect Meta Account**.
4. Complete the Facebook Login dialog and grant the requested permissions.
5. You are returned to the Meta dashboard. The **Connected Pages** section now
   lists the Facebook Page, and the linked Instagram Business account is shown
   beneath it with its `@username`.
6. Click **Schedule Post** → step 1 (**Account**) shows the Page with its linked
   Instagram account, confirming the profile data was read successfully.

---

## `instagram_content_publish`

**Use case description** (paste into the form):

> We use `instagram_content_publish` to publish photo and video posts to the
> Instagram Business account the user has connected. The user composes the post
> inside our application — uploading their own image or video and writing their
> own caption — selects Instagram as a target, and either publishes immediately
> or schedules it for a future time. We publish only content the user has
> supplied, only to accounts they have explicitly connected, and only at the
> time they choose. We use the official Content Publishing API
> (`POST /{ig-user-id}/media` followed by `POST /{ig-user-id}/media_publish`).

**Screencast steps:**

1. Open `https://<your-domain>/login` and sign in with the reviewer credentials.
2. You land on the Meta dashboard at `/socialdashboad`.
3. Click **Connect Meta Account** and complete the Facebook Login dialog (skip if
   already connected in the same recording).
4. Click **Schedule Post** to open the 4-step composer.
5. **Step 1 — Account:** select the Facebook Page. Under **Publish To**, click
   the **Instagram** tile so it is highlighted. (The tile is disabled for Pages
   with no linked Instagram Business account.)
6. **Step 2 — Content:** upload an image or video and type a caption.
   Instagram does not accept text-only posts, so the form requires media here.
7. **Step 3 — Schedule:** pick the publication date and time.
8. **Review:** confirm the summary, then submit.
10. The post appears under **Scheduled Posts** with status `pending`.
11. When the scheduled time arrives, the status changes to `published`.
12. Open the Instagram account in the mobile app or on the web and show the new
    post live on the profile.

> For a shorter recording, schedule the post 1–2 minutes ahead so the reviewer
> sees `pending → published` and the live result in one continuous take.

---

## Screencast requirements

- 1080p or higher, cursor visible
- English UI, or burned-in English captions
- One continuous take per permission — no cuts across the permission dialog
- Must show: login → the Facebook permission dialog → the feature running → the
  visible result on Facebook/Instagram
- No audio required; annotate key moments with on-screen text

---

## Data deletion / deauthorization

Meta asks how the app handles removal. Accurate answer for this app:

> We store only the encrypted Meta access token, the app-scoped Meta user ID,
> the list of Pages and linked Instagram accounts, and the posts the user has
> scheduled. We do not store messages or comments.
>
> We implement both the Deauthorize Callback and the Data Deletion Request
> Callback. Both verify Meta's `signed_request` using HMAC-SHA256 with our app
> secret before acting. On either callback we delete the user's stored Meta
> connection — including the access token — and all of their scheduled posts.
> The data deletion callback returns a status URL and confirmation code as
> required. Users can also disconnect at any time from inside the application.

Implemented at `POST /api/meta/deauthorize` and `POST /api/meta/data-deletion`
in `server/src/routes/social/metaRoutes.js`.

---

## After approval

Switch the app to **Live** mode. Then, if you want messaging and comment
features, build them first and submit `instagram_manage_messages` and
`instagram_manage_comments` as a second review — including the message-unsend
handling Meta requires for any custom inbox.
