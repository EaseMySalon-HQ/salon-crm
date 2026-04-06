# Plan: Remove tenant access tokens from `localStorage`

## Current state

- The SPA stores the tenant access JWT in `localStorage` under `salon-auth-token` (see `lib/api.ts` and auth context).
- Refresh uses HttpOnly cookies plus optional Bearer for legacy flows; CSRF uses the non-HttpOnly `ems_csrf` cookie.

## Goals

- Stop persisting long-lived or sensitive tokens in `localStorage` (XSS can read it).
- Rely on **HttpOnly** refresh cookies + short-lived access tokens in **memory** (or opaque session handling) where possible.

## Phased approach

### Phase 1 — Read path (no user-visible change)

- Introduce an in-memory holder for the access token (e.g. module-level ref or React context) set from login/refresh responses.
- Prefer reading from memory in the axios request interceptor; fall back to `localStorage` only while migrating.
- Ensure `POST /api/auth/refresh` + cookie rotation continues to work without requiring `localStorage` for the happy path.

### Phase 2 — Stop writing to `localStorage`

- Remove `localStorage.setItem('salon-auth-token', ...)` from login, refresh, and any other writers.
- Keep a **feature flag** (e.g. `NEXT_PUBLIC_AUTH_TOKEN_MEMORY_ONLY=1`) to re-enable legacy storage for a narrow debugging window if needed.

### Phase 3 — Cleanup

- Delete reads of `salon-auth-token` and migrate any stragglers (e2e tests, scripts).
- Document that third-party API consumers must use cookies + CSRF headers or server-to-server credentials, not browser `localStorage`.

### Phase 4 — Optional hardening

- Move access token to **memory-only** exclusively and shorten access TTL if acceptable for UX.
- Consider SameSite / subdomain cookie scoping review for multi-app deployments.

## Dependencies

- CSRF on mutating API calls (`X-CSRF-Token` + `ems_csrf`) — implemented for axios and admin fetches.
- Refresh token rotation and invalidation — server-side session store + JWT claims (`jti`, `familyId`).

## Verification

- Log in, use the app, refresh the tab, confirm session survives via cookies without `salon-auth-token` present.
- Confirm logout clears cookies and memory.
- Run E2E or manual checks on login, staff login, and password reset flows.
