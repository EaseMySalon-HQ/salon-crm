/**
 * k6 load test for EaseMySalon API.
 *
 * Smoke (local / CI):
 *   k6 run tests/load-test.js -e BASE_URL=http://localhost:3001 -e SMOKE=1
 *
 * Staging (API host, not the Next.js /login page):
 *   k6 run tests/load-test.js -e SMOKE=1 \
 *     -e BASE_URL=https://salon-crm-backend-staging.up.railway.app \
 *     -e LOAD_TEST_EMAIL=... \
 *     -e LOAD_TEST_PASSWORD=...
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const dashboardDuration = new Trend('dashboard_duration');
const appointmentsDuration = new Trend('appointments_duration');

const isSmoke = __ENV.SMOKE === '1';

export const options = isSmoke
  ? {
      vus: 10,
      duration: '30s',
      thresholds: {
        http_req_failed: ['rate<0.05'],
        errors: ['rate<0.1'],
      },
    }
  : {
      stages: [
        { duration: '1m', target: 100 },
        { duration: '3m', target: 500 },
        { duration: '3m', target: 1000 },
        { duration: '2m', target: 2000 },
        { duration: '2m', target: 0 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<1000'],
        http_req_failed: ['rate<0.01'],
        errors: ['rate<0.01'],
      },
    };

/** Strip frontend paths (/login) and trailing slashes — must hit the API origin. */
function normalizeBaseUrl(raw) {
  const base = (raw || 'http://localhost:3001').trim().replace(/\/+$/, '');
  return base.replace(/\/login$/i, '');
}

const BASE_URL = normalizeBaseUrl(__ENV.BASE_URL);

/** Per-VU session (k6 isolates module scope per VU — login once, reuse cookies). */
let vuSession = null;

function ensureSession() {
  if (vuSession) return vuSession;

  const jar = new http.CookieJar();
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: __ENV.LOAD_TEST_EMAIL || 'admin@salon.com',
      password: __ENV.LOAD_TEST_PASSWORD || 'admin123',
    }),
    { headers: { 'Content-Type': 'application/json' }, jar }
  );

  if (login.status !== 200) {
    vuSession = { jar, headers: {}, loginFailed: true, loginStatus: login.status };
    return vuSession;
  }

  const body = JSON.parse(login.body || '{}');
  const token = body.token || body.data?.token;
  const csrfToken = body.csrfToken || body.data?.csrfToken;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  vuSession = { jar, headers, loginFailed: false };
  return vuSession;
}

function todayYmd() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, { 'health ok': (r) => r.status === 200 || r.status === 503 });

  const loginStart = Date.now();
  const session = ensureSession();
  loginDuration.add(Date.now() - loginStart);

  const loginOk = check(session, {
    'login 200': (s) => !s.loginFailed,
  });
  errorRate.add(!loginOk);
  if (session.loginFailed) {
    sleep(1);
    return;
  }

  const authed = { headers: session.headers, jar: session.jar };

  const dashStart = Date.now();
  const dashboard = http.get(
    `${BASE_URL}/api/dashboard/init?chartRange=last7days&metricsRange=today`,
    authed
  );
  dashboardDuration.add(Date.now() - dashStart);
  check(dashboard, { 'dashboard ok': (r) => [200, 403].includes(r.status) });

  const plan = http.get(`${BASE_URL}/api/business/plan`, authed);
  check(plan, { 'plan ok': (r) => r.status === 200 });

  const staff = http.get(`${BASE_URL}/api/staff?page=1&limit=20`, authed);
  check(staff, { 'staff ok': (r) => r.status === 200 });

  const services = http.get(`${BASE_URL}/api/services?page=1&limit=20`, authed);
  check(services, { 'services ok': (r) => r.status === 200 });

  const anchor = todayYmd();
  const apptStart = Date.now();
  const appointments = http.get(
    `${BASE_URL}/api/appointments?limit=200&dateFrom=${anchor}&dateTo=${anchor}&view=list`,
    authed
  );
  appointmentsDuration.add(Date.now() - apptStart);
  check(appointments, { 'appointments ok': (r) => r.status === 200 });

  sleep(isSmoke ? 0.5 : 1);
}
