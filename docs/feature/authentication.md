# Authentication

## Status

Implemented.

## What it provides

- Email-based account signup and login through Supabase Auth.
- Session refresh, logout, and current-user lookup.
- Protected application routes through the client `AuthGuard`.
- A user record and role used by workspace and administration features.

## Main flow

1. A visitor creates an account or signs in.
2. The client stores the Supabase session and sends its bearer token to protected APIs.
3. The server validates the token and resolves the current user.
4. Protected pages redirect unauthenticated visitors to login.

## Implementation

- Client: `client/src/features/auth/`
- Server: `server/src/modules/auth/`
- Shared authentication middleware: `server/src/middleware/auth.js`

