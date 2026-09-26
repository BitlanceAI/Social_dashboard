# Facebook and Instagram inbox setup

The inbox supports Facebook Login with linked Page tokens and direct Instagram
Login with Instagram tokens. Both sources appear in the same Inbox, with separate
webhook callbacks and account records.

## Deployment

1. Apply `supabase/migrations/20260925120000_social_messages.sql` and
   `supabase/migrations/20260926120000_instagram_direct_messages.sql` to your Supabase project.
2. Set these server environment variables (do not expose them as VITE variables):

   ```env
   META_MESSAGING_ENABLED=true
   META_WEBHOOK_VERIFY_TOKEN=<a new long random secret>
   INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<another long random secret>
   # Existing META_APP_SECRET and META_APP_ID must match your Meta app.
   # Existing INSTAGRAM_APP_SECRET and INSTAGRAM_APP_ID must match Instagram Login.
   ```

3. Restart/deploy the server and client. The flag adds `pages_messaging`,
   `instagram_manage_messages`, and `pages_manage_metadata` to classic OAuth scopes.
   If META_LOGIN_CONFIG_ID is configured, add them to that login configuration too.
   Instagram Login now requests `instagram_business_manage_messages`; reconnect
   an existing direct Instagram account to grant this new permission.
4. Configure the HTTPS callback `https://YOUR_API_HOST/api/meta/webhook` in Meta.
   Enter the same verify token. Subscribe the Page object to `messages`,
   `message_deliveries`, `message_reads`. Configure the Instagram messaging object
   for `messages` and `messaging_seen`. App-level field subscriptions must be
   configured in the Meta dashboard separately from individual Page subscriptions.
   For the Instagram Login app, configure
   `https://YOUR_API_HOST/api/instagram/webhook` as the Instagram webhook callback
   with `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`. Subscribe its Instagram webhook object
   to the `messages` field. The callback verifies signatures using
   `INSTAGRAM_APP_SECRET`.
   Do not enter `/api/instagram/oauth/callback` here: that URL handles login
   redirects and cannot answer Meta's webhook verification challenge. If
   `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` is unset, the server uses
   `META_WEBHOOK_VERIFY_TOKEN` for this callback; enter the same value in Meta.
5. Enable the Messenger / Instagram messaging use cases and permissions in Meta.
   Use app-role accounts for development, then submit the working flows for review.
   Enable access to messages for connected tools in the professional Instagram account.
6. Reconnect Meta, select the Pages for this workspace, and/or reconnect the
   direct Instagram Login account. Open Inbox > Messages,
   and click **Connect messaging** as workspace owner/admin. This subscribes the
   linked Facebook Pages and direct Instagram account, preserves other Page
   subscribed fields, and registers the accounts for incoming webhooks. Repeat
   after changing the Page selection or replacing a connected account.
7. Send a fresh DM from another eligible account. The UI polls every 10–15 seconds.
   Open the conversation and reply, then verify the reply in Messenger/Instagram.

## Behavior and limitations

- Existing conversation history is not imported. Messages appear from the point
  that the workspace enables its subscription. Customer labels currently use the
  last six digits of the platform-scoped ID, not fetched personal profile details.
- Text replies are limited to 1,000 characters. Incoming attachment links are
  displayed; outgoing uploads, reactions and postbacks are not implemented.
- A server check allows ordinary replies only within 24 hours of the latest
  inbound message. Echoes and read receipts never extend that time. No broadcast,
  HUMAN_AGENT tag, or out-of-window message sending is implemented.
- Webhooks are signature-verified over their raw body and persisted before 200.
  Storage failure returns non-200 for Meta retry. Unique provider message IDs and
  an atomic database function make event replay safe. There is no in-memory queue.
- Replies reserve a request ID before calling Meta. A timeout is shown as unknown
  and never automatically resent. Confirm delivery in the platform before trying
  a new message. An interrupted send can remain in `sending` until investigated.
- Delivery/read indicators appear when Meta supplies receipts. Marking a thread
  read in Bitlance is workspace-wide and does not send a platform read action.
- Tables and RPCs are service-role-only. Routes require staff workspace membership;
  client-portal users cannot access the inbox. Sending resolves the correct Page
  or Instagram Login token and recipient from the server-owned thread, then checks
  that the account remains connected to the workspace.
- Disconnect, workspace deletion, or Page deselection cascades local message data.
  A shared Page subscription is not removed globally because it may serve other
  workspaces/features; webhooks for unregistered local accounts are discarded.
- History is retained until disconnect/deselection/workspace deletion. Update the
  published privacy policy with the included inbox data disclosure before launch.
- Live Meta delivery, Advanced Access, and provider behavior must be tested using
  your app credentials. Local tests use synthetic events and never send real DMs.

## Review video

Show connecting selected accounts, enabling the inbox, receiving a new Facebook
message, replying, and verifying it in Messenger. Repeat with Instagram. Use exact
timestamps for each permission in the review form. Show that incoming messages
arrive without using the refresh button to demonstrate webhook usage.
For `instagram_business_manage_messages`, show the separate Instagram Login grant,
the Instagram Login account in the Inbox, a new DM from another account, and a
reply sent through this app.
