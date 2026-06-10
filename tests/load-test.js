/**
 * k6 load test for EaseMySalon API.
 *
 * Smoke (local / CI):
 *   k6 run tests/load-test.js -e BASE_URL=http://localhost:3001 -e SMOKE=1
 *
 * Profile (25 VUs × 2 min — pre-prod gate):
 *   k6 run tests/load-test.js -e PROFILE=1 \
 *     -e BASE_URL=https://salon-crm-backend-staging.up.railway.app \
 *     -e LOAD_TEST_EMAIL=... -e LOAD_TEST_PASSWORD=... \
 *     -e LOAD_TEST_RATE_LIMIT_BYPASS=$RATE_LIMIT_SKIP_SECRET
 *
 * Staging note: all VUs share one login → one global rate-limit bucket (default 1200/15m).
 * Without bypass, expect 429s. Set RATE_LIMIT_SKIP_SECRET on Railway and pass it above.
 *
 * Full ramp (500→2000 VUs):
 *   k6 run tests/load-test.js -e BASE_URL=... -e LOAD_TEST_EMAIL=... -e LOAD_TEST_PASSWORD=...
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const dashboardDuration = new Trend('dashboard_duration');
const appointmentsDuration = new Trend('appointments_duration');
const authedApiDuration = new Trend('authed_api_duration', true);

const isSmoke = __ENV.SMOKE === '1';
const isProfile = __ENV.PROFILE === '1';
const rateLimitBypass = __ENV.LOAD_TEST_RATE_LIMIT_BYPASS || '';

const rateLimit429 = new Rate('rate_limit_429');

export const options = isSmoke
  ? {
      vus: 10,
      duration: '30s',
      thresholds: {
        http_req_failed: ['rate<0.05'],
        errors: ['rate<0.1'],
      },
    }
  : isProfile
    ? {
        vus: 25,
        duration: '2m',
        thresholds: {
          http_req_failed: ['rate<0.01'],
          errors: ['rate<0.01'],
          authed_api_duration: ['p(95)<800'],
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

function parseJsonSafe(res) {
  try {
    return JSON.parse(res.body || '{}');
  } catch {
    return {};
  }
}

function listFromPayload(body, keys) {
  for (const key of keys) {
    const val = body[key];
    if (Array.isArray(val) && val.length) return val;
    if (val && Array.isArray(val.data) && val.data.length) return val.data;
  }
  return [];
}

function baseHeaders(extra = {}) {
  const headers = { ...extra };
  if (rateLimitBypass) headers['x-rate-limit-bypass'] = rateLimitBypass;
  return headers;
}

function absorbCsrf(session, res) {
  const body = parseJsonSafe(res);
  const token = body.csrfToken || body.data?.csrfToken;
  if (token) session.headers['X-CSRF-Token'] = token;
}

function ensureSession() {
  if (vuSession) return vuSession;

  const jar = new http.CookieJar();
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: __ENV.LOAD_TEST_EMAIL || 'admin@salon.com',
      password: __ENV.LOAD_TEST_PASSWORD || 'admin123',
    }),
    { headers: baseHeaders({ 'Content-Type': 'application/json' }), jar }
  );

  if (login.status !== 200) {
    vuSession = {
      jar,
      headers: baseHeaders({ 'Content-Type': 'application/json' }),
      loginFailed: true,
      loginStatus: login.status,
    };
    rateLimit429.add(login.status === 429);
    return vuSession;
  }

  const body = parseJsonSafe(login);
  const token = body.token || body.data?.token;
  const csrfToken = body.csrfToken || body.data?.csrfToken;
  const headers = baseHeaders({ 'Content-Type': 'application/json' });
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  vuSession = { jar, headers, loginFailed: false, fixtures: null };
  return vuSession;
}

function authedCall(method, url, session, body) {
  const params = { headers: session.headers, jar: session.jar };
  const start = Date.now();
  let res;
  if (method === 'GET') res = http.get(url, params);
  else if (method === 'POST') res = http.post(url, body, params);
  else if (method === 'PUT') res = http.put(url, body, params);
  else if (method === 'PATCH') res = http.patch(url, body, params);
  else res = http.request(method, url, body, params);
  authedApiDuration.add(Date.now() - start);
  if (res.status === 429) rateLimit429.add(true);
  else rateLimit429.add(false);
  absorbCsrf(session, res);
  return res;
}

function ensureFixtures(session) {
  if (session.fixtures) return session.fixtures;

  const clientRes = authedCall('GET', `${BASE_URL}/api/clients?page=1&limit=1`, session);
  const staffRes = authedCall('GET', `${BASE_URL}/api/staff?page=1&limit=20`, session);
  const serviceRes = authedCall('GET', `${BASE_URL}/api/services?page=1&limit=1`, session);
  const productRes = authedCall('GET', `${BASE_URL}/api/products?page=1&limit=1`, session);

  const clients = listFromPayload(parseJsonSafe(clientRes), ['data', 'clients']);
  const staff = listFromPayload(parseJsonSafe(staffRes), ['data', 'staff']);
  const services = listFromPayload(parseJsonSafe(serviceRes), ['data', 'services']);
  const products = listFromPayload(parseJsonSafe(productRes), ['data', 'products']);

  const staffIdx = Math.max(0, (__VU - 1) % Math.max(staff.length, 1));
  const pickedStaff = staff[staffIdx] || staff[0];

  session.fixtures = {
    clientId: clients[0]?._id,
    clientName: clients[0]?.name || 'Load Test Client',
    staffId: pickedStaff?._id,
    staffName: pickedStaff?.name || 'Staff',
    serviceId: services[0]?._id,
    servicePrice: services[0]?.price || 500,
    serviceDuration: services[0]?.duration || 60,
    productId: products[0]?._id,
  };
  return session.fixtures;
}

function todayYmd() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** One non-overlapping slot per (VU, iteration); spreads across days and staff columns. */
function uniqueAppointmentSlot(serviceDuration = 45) {
  const stepMin = Math.max(Number(serviceDuration) || 45, 15);
  const slotsPerDay = Math.floor((12 * 60) / stepMin); // 08:00–20:00 window
  const slotIndex = (__VU - 1) * 100000 + __ITER;
  const dayOffset = Math.floor(slotIndex / slotsPerDay);
  const slotInDay = slotIndex % slotsPerDay;
  const minutesFromOpen = slotInDay * stepMin;
  const hour = 8 + Math.floor(minutesFromOpen / 60);
  const minute = minutesFromOpen % 60;

  const base = new Date(Date.UTC(2027, 2, 1)); // 2027-03-01
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const day = String(base.getUTCDate()).padStart(2, '0');
  const date = `${y}-${m}-${day}`;
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { date, time };
}

function buildSalePayload(fixtures, billNo) {
  const price = fixtures.servicePrice;
  return JSON.stringify({
    billNo,
    customerId: fixtures.clientId,
    customerName: fixtures.clientName,
    staffId: fixtures.staffId,
    staffName: fixtures.staffName,
    date: todayYmd(),
    status: 'completed',
    grossTotal: price,
    taxAmount: 0,
    netTotal: price,
    subtotal: price,
    total: price,
    paymentStatus: { totalAmount: price, paidAmount: price, dueAmount: 0, status: 'paid' },
    items: [
      {
        type: 'service',
        serviceId: fixtures.serviceId,
        staffId: fixtures.staffId,
        name: 'Load Test Service',
        quantity: 1,
        price,
        total: price,
        staffContributions: [
          {
            staffId: fixtures.staffId,
            staffName: fixtures.staffName,
            percentage: 100,
            amount: price,
          },
        ],
      },
    ],
    payments: [{ mode: 'Cash', amount: price }],
  });
}

export function setup() {
  const res = http.get(`${BASE_URL}/health`, { headers: baseHeaders() });
  const health = parseJsonSafe(res);
  const probe = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: __ENV.LOAD_TEST_EMAIL || 'admin@salon.com',
      password: __ENV.LOAD_TEST_PASSWORD || 'admin123',
    }),
    { headers: baseHeaders({ 'Content-Type': 'application/json' }) }
  );
  if (probe.status !== 200) {
    throw new Error(
      `Setup login failed (${probe.status}): ${(probe.body || '').slice(0, 200)} — ` +
        'if 429, wait for rate-limit window or set LOAD_TEST_RATE_LIMIT_BYPASS to staging RATE_LIMIT_SKIP_SECRET'
    );
  }
  return {
    baselineHealth: health,
    baselineAt: new Date().toISOString(),
  };
}

export function teardown(data) {
  const res = http.get(`${BASE_URL}/health`);
  return {
    baseline: data?.baselineHealth,
    final: parseJsonSafe(res),
    finishedAt: new Date().toISOString(),
  };
}

export function handleSummary(data) {
  const td = data.setup_data || {};
  const healthDelta = td.final && td.baseline ? summarizeHealth(td.baseline, td.final) : null;
  const lines = [
    '',
    '=== EaseMySalon load test summary ===',
    `Target: ${BASE_URL}`,
    `Profile: ${isProfile ? '25 VU × 2m' : isSmoke ? 'smoke' : 'full ramp'}`,
    `Rate-limit bypass: ${rateLimitBypass ? 'yes' : 'no (required for multi-VU single-account staging)'}`,
    `HTTP failures: ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    `429 rate-limit hits: ${((data.metrics.rate_limit_429?.values?.rate || 0) * 100).toFixed(2)}%`,
    `Authed API p95: ${Math.round(data.metrics.authed_api_duration?.values?.['p(95)'] || 0)}ms`,
    `Authed API p99: ${Math.round(data.metrics.authed_api_duration?.values?.['p(99)'] || 0)}ms`,
  ];
  if (healthDelta) {
    lines.push(
      `Redis: ${healthDelta.redisBaseline} → ${healthDelta.redisFinal}`,
      `Rate-limit Redis fallback uses: ${healthDelta.redisFallbackDelta}`,
      `Heap used (MB): ${healthDelta.heapBaseline} → ${healthDelta.heapFinal}`,
    );
  }
  lines.push('');
  console.log(lines.join('\n'));
  return {
    stdout: JSON.stringify(data, null, 2),
    'tests/load-test-summary.json': JSON.stringify({ metrics: data.metrics, health: td }, null, 2),
  };
}

function summarizeHealth(baseline, final) {
  const bRl = baseline.services?.rateLimit?.rateLimitMetrics || {};
  const fRl = final.services?.rateLimit?.rateLimitMetrics || {};
  return {
    redisBaseline: baseline.services?.redis,
    redisFinal: final.services?.redis,
    redisFallbackDelta: (fRl.redisFallbackUses || 0) - (bRl.redisFallbackUses || 0),
    heapBaseline: baseline.memory?.usedMb,
    heapFinal: final.memory?.usedMb,
  };
}

export default function () {
  const health = http.get(`${BASE_URL}/health`, { headers: baseHeaders() });
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

  const dashStart = Date.now();
  const dashboard = authedCall(
    'GET',
    `${BASE_URL}/api/dashboard/init?chartRange=last7days&metricsRange=today`,
    session
  );
  dashboardDuration.add(Date.now() - dashStart);
  const dashOk = check(dashboard, { 'dashboard ok': (r) => r.status === 200 });
  errorRate.add(!dashOk);

  const plan = authedCall('GET', `${BASE_URL}/api/business/plan`, session);
  check(plan, { 'plan ok': (r) => r.status === 200 });

  const staff = authedCall('GET', `${BASE_URL}/api/staff?page=1&limit=20`, session);
  check(staff, { 'staff ok': (r) => r.status === 200 });

  const services = authedCall('GET', `${BASE_URL}/api/services?page=1&limit=20`, session);
  check(services, { 'services ok': (r) => r.status === 200 });

  const anchor = todayYmd();
  const apptStart = Date.now();
  const appointments = authedCall(
    'GET',
    `${BASE_URL}/api/appointments?limit=200&dateFrom=${anchor}&dateTo=${anchor}&view=list`,
    session
  );
  appointmentsDuration.add(Date.now() - apptStart);
  check(appointments, { 'appointments list ok': (r) => r.status === 200 });

  if (isProfile) {
    const fixtures = ensureFixtures(session);
    const hasFixtures =
      fixtures.clientId && fixtures.staffId && fixtures.serviceId && fixtures.productId;

    if (hasFixtures) {
      const slot = uniqueAppointmentSlot(fixtures.serviceDuration);
      const createBody = JSON.stringify({
        clientId: fixtures.clientId,
        date: slot.date,
        time: slot.time,
        services: [
          {
            serviceId: fixtures.serviceId,
            staffId: fixtures.staffId,
            price: fixtures.servicePrice,
            duration: fixtures.serviceDuration,
          },
        ],
      });
      const created = authedCall('POST', `${BASE_URL}/api/appointments`, session, createBody);
      const createOk = check(created, {
        'appointment create ok': (r) => r.status === 201 || r.status === 409,
      });
      errorRate.add(!createOk);

      if (created.status === 201) {
        const createdBody = parseJsonSafe(created);
        const rows = Array.isArray(createdBody.data) ? createdBody.data : [];
        const apptId = rows[0]?._id;
        if (apptId) {
          const updateBody = JSON.stringify({ notes: `load-test vu${__VU} iter${__ITER}` });
          const updated = authedCall(
            'PUT',
            `${BASE_URL}/api/appointments/${apptId}`,
            session,
            updateBody
          );
          const updateOk = check(updated, { 'appointment update ok': (r) => r.status === 200 });
          errorRate.add(!updateOk);
        }
      }

      const billNo = `LT-${__VU}-${__ITER}-${Date.now()}`;
      const sale = authedCall(
        'POST',
        `${BASE_URL}/api/sales`,
        session,
        buildSalePayload(fixtures, billNo)
      );
      const saleOk = check(sale, {
        'quick sale ok': (r) => r.status === 201 || r.status === 200,
      });
      errorRate.add(!saleOk);

      const stockUp = authedCall(
        'PATCH',
        `${BASE_URL}/api/products/${fixtures.productId}/stock`,
        session,
        JSON.stringify({ quantity: 1, operation: 'increase' })
      );
      const stockOk = check(stockUp, {
        'inventory stock ok': (r) => r.status === 200,
      });
      errorRate.add(!stockOk);
    }
  }

  sleep(isSmoke ? 0.5 : isProfile ? 0.3 : 1);
}
