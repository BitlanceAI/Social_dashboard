# Instagram repost setup

The Social Dashboard server owns watches, scraping, imported media, approvals, and publishing. The Bitlance Automation server is not used at runtime.

1. Apply `supabase/migrations/20260925000000_instagram_reposts.sql` to the Social Dashboard database.
2. Set `APIFY_TOKEN` in the Social Dashboard **server** environment. `APIFY_IG_ACTOR` defaults to `apify/instagram-post-scraper` (the API form `apify~instagram-post-scraper` also works). Requests use this actor's `username` array for profile handles and individual post URLs. Keep the token off the client.
3. Ensure the existing public `post-media` Supabase Storage bucket and Meta connections work. The server copies scraped media there before queueing any delivery.
4. Restart the Social Dashboard server. Its existing scheduler checks active repost watches every five minutes, while each watch's `checks_per_day` setting determines when it is due. **Run now** uses the same worker.

Scrapes run only while the workspace billing owner has an active subscription. Apify calls are capped at 12 checks per day and 100 posts per check for each watch.

Create a watch under Social Dashboard → Instagram Repost. The first successful run imports existing source posts for review, even if automatic posting or WhatsApp approval is selected. Later runs process only new posts. Each destination receives its own `scheduled_posts` delivery, so the standard Approval Queue, scheduler, and Post History remain authoritative for delivery status. Failed delivery rows can be retried; a queued or published delivery is never recreated for the same source post and destination Page.

Only public Instagram profiles can be watched. Repost content you own or have permission to republish.
