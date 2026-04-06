# API versioning (`/api/v1`)

## Behavior

- **`/api/v1/*`** is an **alias** for **`/api/*`**: the same Express handlers, middleware, rate limits, and CSRF behavior apply.
- **Legacy clients** using **`/api/*`** are unchanged.
- Rewriting happens **early** (after `express.json` and `cookieParser`) via `backend/middleware/api-v1-alias.js`, which normalizes `req.url` and `req.originalUrl` before routing.

## Examples

| Versioned URL | Same handler as |
|---------------|-----------------|
| `GET /api/v1/health` | `GET /api/health` |
| `POST /api/v1/auth/login` | `POST /api/auth/login` |
| `GET /api/v1/clients` | `GET /api/clients` |

## Frontend

Point **`NEXT_PUBLIC_API_URL`** at your API root, e.g. `https://api.example.com/api/v1` when you want versioned URLs, or keep `https://api.example.com/api` for the legacy prefix.

## Future

If you need to **retire** `/api` without the alias, remove `apiV1AliasMiddleware` and migrate routes to a dedicated `/api/v1` router (or keep the middleware and deprecate unversioned paths in documentation only).
