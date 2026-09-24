# Notifications and occasions

## Status

Implemented.

## Notifications

- Opt in or out of browser push notifications.
- Register and remove Firebase Cloud Messaging tokens.
- Send a test notification.
- Alert users about publishing failures, partial publishing problems, LinkedIn token expiry, storage expiry, and approval decisions.
- Show relevant alerts in the dashboard notification bell.

Push controls are hidden when Firebase is not configured.

## Occasion calendar

- Display upcoming Indian occasions in the dashboard.
- Resolve fixed and computable dates from built-in rules.
- Store verified administrator-entered dates for movable festivals.
- Allow administrators to add, replace, or remove dates by year.

The system deliberately leaves an unknown movable-festival date empty rather than guessing it.

## Implementation

- Client notifications: `client/src/features/notifications/`
- Push API: `server/src/modules/push/`
- Occasion UI: `client/src/features/occasions/`
- Occasion API: `server/src/modules/occasions/`

