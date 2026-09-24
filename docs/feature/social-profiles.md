# Social profiles

## Status

Implemented for Facebook Pages, Instagram Business accounts, and LinkedIn profiles.

## What it provides

- Connect and disconnect Meta accounts with OAuth.
- Discover Facebook Pages and their linked Instagram Business accounts.
- Select or assign which Pages are available in a workspace.
- Connect and disconnect LinkedIn with OAuth.
- Refresh available accounts and show token-expiry warnings.
- Display all connected destinations in the Social Profiles panel.

## Important constraints

- Instagram must be a Business account linked to a Facebook Page.
- LinkedIn profile tokens expire after 60 days and cannot normally be refreshed silently.
- LinkedIn organization publishing is coded but remains unavailable until the application has the required organization scope.

## Implementation

- Client: `client/src/features/meta/components/SocialProfilesPanel.jsx`
- Meta API: `server/src/modules/meta/`
- LinkedIn API: `server/src/modules/linkedin/`

