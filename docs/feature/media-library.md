# Media library

## Status

Implemented as a paid, workspace-scoped feature.

## What it provides

- Purchase media-storage capacity.
- Upload, list, reuse, and delete media files.
- Show current usage, entitlement, and purchase history.
- Select stored media while composing a post.
- Quickly schedule a stored asset to Facebook or LinkedIn.
- Enforce quota across all of a user's workspaces.

## Storage behavior

The application uses Bunny Storage when all required Bunny settings are present and falls back to Supabase Storage otherwise. Each media record retains its actual backend URL so deletion continues to work after a backend change.

Expired storage is handled according to the administrator-configured retention period, with notifications before or after expiry as applicable.

## Implementation

- Client: `client/src/features/storage/`
- Shared picker: `client/src/features/meta/components/MediaSelector.jsx`
- Server: `server/src/modules/storage/`
- Storage adapters: `server/src/shared/storage/`

