# Analytics and engagement

## Status

Implemented.

## What it provides

- Delivery reporting for pending, scheduled, published, failed, and approval-related states.
- Post history for content published through the app.
- Live Facebook and Instagram history from connected Meta accounts.
- Engagement totals such as likes and comments for supported posts.
- LinkedIn metrics for app-published posts.
- Facebook Page comment listing, replies, hide/unhide, and deletion.

## Data behavior

Meta history can include posts created outside this application. LinkedIn history is limited to app-tracked posts because the broader member-history API requires restricted access. A failure in one Meta feed is reported without preventing other connected feeds from loading.

## Implementation

- Client analytics: `client/src/features/meta/components/AnalyticsPanel.jsx`
- Comment tools: `client/src/features/meta/components/CommentsModal.jsx`
- Provider APIs: `server/src/modules/meta/` and `server/src/modules/linkedin/`

