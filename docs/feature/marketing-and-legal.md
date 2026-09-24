# Marketing and legal pages

## Status

Implemented as public pages.

## Marketing pages

- Landing page explaining connection, composition, scheduling, and tracking.
- Feature and audience sections for the social publishing product.
- Public pricing page backed by the current server-side plan catalog.
- Calls to action for signup and the free trial.

## Legal pages

- Privacy Policy.
- Terms of Service.
- Data Deletion instructions and contact details.
- Meta deauthorization and data-deletion callbacks on the server.

These pages support both customer transparency and Meta application-review requirements.

## Implementation

- Marketing: `client/src/features/marketing/`
- Legal: `client/src/features/legal/`
- Meta callbacks: `server/src/modules/meta/meta.routes.js`

