# API rate limiting

Implementation: `backend/middleware/rate-limit.js`, `rate-limit-store.js`, `rate-limit-keys.js`, `rate-limit-metrics.js`, `rate-limit-alerts.js`, `rate-limit-correlation.js` (optional).

## External AI models (OpenAI, Gemini, etc.)

A full-repo search found **no** backend routes that call OpenAI, Google Gemini, Anthropic, or similar generative APIs. Billable or high-cost AI traffic should go through a **dedicated prefix** (for example `POST /api/integrations/ai/...`) protected by the AI tier in `rate-limit.js`.

## What is enforced

| Layer | Scope | Purpose |
|--------|--------|---------|
| **Global** | `/api/*` except auth bootstrap paths (see below) | Broad protection against scraping and abusive traffic |
| **Auth cluster** | `/api/auth/login`, `/api/auth/staff-login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/admin/login` | Brute-force / credential-stuffing resistance |

**Global tier does not apply** to: `/api/auth/csrf`, `/api/auth/login`, `/api/auth/staff-login`, `/api/auth/logout`, `/api/auth/refresh`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/verify-reset-token/*`, `/api/admin/login`. Those routes are still rate-limited by the **auth** tier (and its own keys) so they are not unlimited—only not double-counted against the global bucket (avoids lockout when the IP fallback is saturated).
| **Exports** | `/api/reports/export/*` | Heavy PDF/CSV generation |
| **AI (reserved)** | `/api/integrations/ai/*` | Low caps for future model proxies (billing abuse) |

## Redis and horizontal scaling

- Set **`REDIS_URL`** or **`RATE_LIMIT_REDIS_URL`** so all tiers use a **Redis-backed** store (`rate-limit-redis` + `ioredis`). Keys are prefixed per tier (`rl:global:`, `rl:auth:`, etc.).
- If Redis is missing, the server uses **in-memory** stores (not shared across instances).
- If Redis errors/timeouts exceed a **circuit breaker** threshold, the tier uses **memory until cooldown**, then **probes Redis** (half-open). **Init** failures can still force **permanent** memory for that tier. The process **does not exit**.

## Key strategy (buckets)

- **Auth routes**: Prefer identifiers from the verified request body (e.g. email, phone, staff composite where applicable, hashed reset token), then **IP**.
- **Most `/api/*` traffic**: Prefer **JWT-verified** tenant or platform admin identity from `Authorization` / cookies (`globalApiKeyGenerator`), then **IP**.
- **Public / unauthenticated**: **IP** (respect `trust proxy` for `req.ip`).

Keys are opaque strings; `req.rateLimitKey` is set internally. **Logs never print raw key material** — only a short id `rlk:` + **8 hex chars** of **SHA-256** (see `safeRateLimitKeyLog` in `rate-limit.js`).

## Bypass (internal only)

- Header **`x-rate-limit-bypass`** is honored **only** when it **exactly matches** `RATE_LIMIT_SKIP_SECRET` (timing-safe compare when lengths match).
- Invalid or missing header: **no bypass** and **no indication** in responses that a bypass exists.
- **Do not** ship this secret to browsers or mobile apps.

## Environment variables

| Variable | Role |
|----------|------|
| `REDIS_URL` / `RATE_LIMIT_REDIS_URL` | Redis for shared rate limit state |
| `RATE_LIMIT_GLOBAL_MAX` | Max requests per **`RATE_LIMIT_GLOBAL_WINDOW_MS`** for the global tier (default **1200**; override per deployment) |
| `RATE_LIMIT_GLOBAL_WINDOW_MS` | Global window in ms (default **15 minutes**) |
| `RATE_LIMIT_SKIP_SECRET` | Optional; enables internal bypass when header matches |
| `RATE_LIMIT_ENABLED` | Set to `0` or `false` to disable limiters (local/debug only) |
| `TRUST_PROXY` | `1`, `true`, hop count, or `0`/`false` — see `configureTrustProxy` in `rate-limit.js` |
| `RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS` | Per-command ceiling for ioredis + in-store race (default **4000**); avoids hanging the request cycle on a stuck Redis |
| `RATE_LIMIT_REDIS_CIRCUIT_FAILURE_THRESHOLD` | Consecutive Redis failures before opening the circuit (default **5**) |
| `RATE_LIMIT_REDIS_CIRCUIT_COOLDOWN_MS` | How long to use memory only before probing Redis again (default **60000**) |
| `RATE_LIMIT_METRICS_IN_HEALTH` | Set to **`0`** to omit `rateLimitMetrics` from `/health` responses |
| `RATE_LIMIT_ALERT_FALLBACK_SPIKE_WINDOW_MS` | Rolling window for fallback-spike alerts (default **60000**) |
| `RATE_LIMIT_ALERT_FALLBACK_SPIKE_THRESHOLD` | Redis fallback usages in that window before alert (default **100**; set **0** to disable) |
| `RATE_LIMIT_CORRELATION` | Set to **`1`** to keep in-memory **hashed key → tenant/admin id** for internal debugging only (never logged) |
| `INSTANCE_ID` | Optional stable id for this process in **alert** payloads (defaults to **hostname** if unset) |
| `SHUTDOWN_FORCE_MS` | Max wait before forced `process.exit` after SIGINT/SIGTERM (default **10000**) |

In **`NODE_ENV=production`**, disabling rate limits via `RATE_LIMIT_ENABLED` is **logged as an error**. If `trust proxy` is off in production, a **warning** is logged (client IP may be wrong behind a reverse proxy).

## Health checks (not rate limited)

`GET /health` and `GET /api/health` are registered **before** the `/api` global limiter so probes stay cheap. Responses include existing fields plus:

- **`status`**: `ok` while the process is serving
- **`rateLimit`**: `active` or `disabled` (from `RATE_LIMIT_ENABLED`)
- **`redis`**: `connected` when Redis-backed tiers report healthy circuits, otherwise **`degraded`** (no URL, circuit open, half-open probe, or permanent memory fallback)
- **`rateLimitMetrics`** (unless `RATE_LIMIT_METRICS_IN_HEALTH=0`): aggregate **`evaluations`**, **`blocked429`**, **`redisFallbackUses`**, **`fallbackRate`** (`redisFallbackUses / evaluations`, or **`null`** if no evaluations yet), plus **`tiers`**: `{ global, auth, report, ai }` each with the same fields — in-process per Node instance

Other `/api/*` routes remain behind the global limiter (auth bootstrap paths listed above are excluded from global only).

## Graceful shutdown

On **SIGINT** / **SIGTERM**, `backend/utils/shutdown.js` closes the HTTP server, runs registered tasks (including **`shutdownRateLimitInfrastructure`** to quit Redis clients used for rate limits + violation counters), then closes **mongoose**. Failures are logged and do not block exit.

## Observability

On **429**, logs include **tier** (`global`, `auth`, `report`, `ai`), **IP**, **path**, **user id when available**, **safe key id** (`rlk:` + hash), and **limit**. Duplicate **warn** lines for the same tier/path/key within a short window are **deduplicated** to reduce bursts; **repeat-offender** `error` logs are not deduplicated. Optional **repeat-offender** tracking uses a Redis counter per hashed key when Redis is available (≥5 blocks in a sliding hour).

**Metrics** (`rate-limit-metrics.js`): per-tier and **aggregate totals** for **`evaluations`**, **`blocked429`**, **`redisFallbackUses`**, and derived **`fallbackRate`**. Optional **`registerMetricsSink(event, payload)`** for custom export (events include `tier` where applicable).

**Alerts** (`rate-limit-alerts.js`): stderr JSON lines and **`registerRateLimitAlertHook(event, line)`** where **`line`** is the full emitted object: **`severity`** (`critical` for **`circuit_open`**, **`warning`** for **`redis_fallback_spike`**), **`instanceId`** (**`INSTANCE_ID`** or hostname), **`context`** (service, tier, and alert-specific fields), plus original payload fields.

**Correlation** (`rate-limit-correlation.js`, off by default): when **`RATE_LIMIT_CORRELATION=1`**, records **SHA-256(rateLimitKey) → `{ kind: tenant|admin|anon, id? }`** for internal inspection via **`lookupCorrelationByRateLimitKey`** / **`lookupCorrelationBySafeKeyLog`** — **not** written to logs or API responses. **Short-lived lookup cache** (~30s) avoids repeated work for hot keys; invalidated when a key is (re)recorded.

Disable all limiters with `RATE_LIMIT_ENABLED=0` (e.g. local debugging). Tunable window/max values remain in `backend/middleware/rate-limit.js`.

## Tests

`backend/tests/rate-limit/rate-limit.integration.test.js` exercises memory-store limits (no external Redis): under-limit **200**, **429** JSON shape, **draft-7** `RateLimit` / `RateLimit-Policy` headers, and **auth** stricter than **global** for login.
