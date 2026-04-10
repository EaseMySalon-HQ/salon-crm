/**
 * Maps `/api/v1/*` to `/api/*` before routing so the same handlers serve both paths.
 * Keeps legacy `/api/*` unchanged; clients may migrate to `/api/v1/*` without server duplication.
 *
 * Mutates req.url and req.originalUrl (Express routing uses these). Runs early, after body/cookies.
 */

function replaceApiV1(u) {
  if (typeof u !== 'string') return u;
  if (u === '/api/v1' || u.startsWith('/api/v1/') || u.startsWith('/api/v1?')) {
    return u.replace(/^\/api\/v1/, '/api');
  }
  return u;
}

function apiV1AliasMiddleware(req, res, next) {
  req.url = replaceApiV1(req.url);
  req.originalUrl = replaceApiV1(req.originalUrl);
  next();
}

module.exports = { apiV1AliasMiddleware, replaceApiV1 };
