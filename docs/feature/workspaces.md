# Workspaces

## Status

Implemented.

## What it provides

- Create, rename, switch, and delete workspaces.
- Isolate social connections, media, settings, and publishing activity by workspace.
- List members, change member roles, remove members, or leave a workspace.
- Create, preview, accept, list, and revoke workspace invitations.
- Carry the active workspace to server requests through the `x-workspace-id` header.

## Access model

Workspace membership determines access. Owner and member roles control management actions, while the server middleware validates every workspace-scoped request.

## Implementation

- Client: `client/src/features/workspace/`
- Server: `server/src/modules/workspace/`
- Middleware: `server/src/middleware/workspace.js`
- Database: workspace migrations in `supabase/migrations/`

