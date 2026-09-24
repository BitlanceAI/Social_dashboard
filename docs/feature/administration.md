# Administration

## Status

Implemented and restricted to users with the `admin` role.

## What it provides

- Platform overview and recent activity.
- User listing and user creation.
- Social-connection visibility and LinkedIn expiry warnings.
- Scheduled-post inspection.
- Occasion-date management.
- Graphic-template catalog management.
- Subscription-plan editing and subscription reporting.
- Manual subscription-payment recording.
- Storage pricing, retention, purchase, and manual-grant management.
- Push-token inspection and direct user notifications.
- System-health checks.

## Security

The page displays an access-denied state for non-admin users, and the server independently enforces the admin role on every administration endpoint.

## Implementation

- Client: `client/src/features/admin/`
- Server: `server/src/modules/admin/`
- Authorization middleware: `server/src/modules/admin/admin.middleware.js`

