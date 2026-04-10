/**
 * Unit tests for lib/auth-tokens.js — JWT signing, cookie configuration, HttpOnly flags.
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { JWT_SECRET } = require('../../config/jwt');
const {
  COOKIE,
  TOKEN_USE,
  buildTenantAccessPayload,
  signTenantAccess,
  signTenantRefresh,
  signPlatformAdminAccess,
  setTenantAuthCookies,
  clearTenantAuthCookies,
} = require('../../lib/auth-tokens');

function mockResponse() {
  const cookies = {};
  const cleared = [];
  return {
    cookies,
    cleared,
    cookie(name, value, opts) {
      cookies[name] = { value, opts };
    },
    clearCookie(name, opts) {
      cleared.push({ name, opts });
    },
  };
}

describe('COOKIE names', () => {
  it('defines expected cookie keys', () => {
    expect(COOKIE.tenantAccess).toBe('ems_tenant_access');
    expect(COOKIE.tenantRefresh).toBe('ems_tenant_refresh');
    expect(COOKIE.adminAccess).toBe('ems_admin_access');
  });
});

describe('buildTenantAccessPayload', () => {
  it('builds payload with required fields', () => {
    const user = { _id: 'u1', email: 'a@b.com', role: 'admin' };
    const p = buildTenantAccessPayload(user);
    expect(p).toEqual({
      id: 'u1',
      email: 'a@b.com',
      role: 'admin',
      tokenUse: TOKEN_USE.tenantAccess,
    });
  });

  it('includes branchId when present', () => {
    const user = { _id: 'u1', email: 'a@b.com', role: 'staff', branchId: 'b1' };
    const p = buildTenantAccessPayload(user);
    expect(p.branchId).toBe('b1');
  });

  it('includes impersonation fields when present', () => {
    const user = {
      _id: 'u1',
      email: 'a@b.com',
      role: 'admin',
      isImpersonation: true,
      impersonatedBy: 'admin-1',
    };
    const p = buildTenantAccessPayload(user);
    expect(p.isImpersonation).toBe(true);
    expect(p.impersonatedBy).toBe('admin-1');
  });
});

describe('signTenantAccess', () => {
  it('returns a valid JWT with tenant_access tokenUse', () => {
    const user = { _id: 'u1', email: 'a@b.com', role: 'admin', branchId: 'b1' };
    const token = signTenantAccess(user);
    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded.tokenUse).toBe(TOKEN_USE.tenantAccess);
    expect(decoded.id).toBe('u1');
    expect(decoded.email).toBe('a@b.com');
    expect(decoded.exp).toBeDefined();
  });

  it('respects custom expiresIn override', () => {
    const user = { _id: 'u1', email: 'a@b.com', role: 'admin' };
    const token = signTenantAccess(user, '10s');
    const decoded = jwt.verify(token, JWT_SECRET);
    const ttl = decoded.exp - decoded.iat;
    expect(ttl).toBe(10);
  });
});

describe('signTenantRefresh', () => {
  it('returns a JWT with tenant_refresh tokenUse and jti/familyId', () => {
    const id = new mongoose.Types.ObjectId().toString();
    const token = signTenantRefresh({ id, branchId: 'b1', jti: 'j1', familyId: 'f1' });
    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded.tokenUse).toBe(TOKEN_USE.tenantRefresh);
    expect(decoded.jti).toBe('j1');
    expect(decoded.familyId).toBe('f1');
  });
});

describe('signPlatformAdminAccess', () => {
  it('returns a JWT with platform_admin tokenUse', () => {
    const admin = { _id: 'a1', role: 'super_admin' };
    const token = signPlatformAdminAccess(admin);
    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded.tokenUse).toBe(TOKEN_USE.platformAdmin);
    expect(decoded.id).toBe('a1');
  });
});

describe('setTenantAuthCookies', () => {
  it('sets both access and refresh cookies with HttpOnly flag', () => {
    const res = mockResponse();
    setTenantAuthCookies(res, { accessToken: 'at', refreshToken: 'rt' });

    const access = res.cookies[COOKIE.tenantAccess];
    expect(access).toBeDefined();
    expect(access.value).toBe('at');
    expect(access.opts.httpOnly).toBe(true);
    expect(access.opts.path).toBe('/');
    expect(access.opts.maxAge).toBe(4 * 60 * 60 * 1000);

    const refresh = res.cookies[COOKIE.tenantRefresh];
    expect(refresh).toBeDefined();
    expect(refresh.value).toBe('rt');
    expect(refresh.opts.httpOnly).toBe(true);
    expect(refresh.opts.maxAge).toBe(24 * 60 * 60 * 1000);
  });

  it('uses secure=false in development by default', () => {
    const oldEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    delete process.env.COOKIE_SECURE;

    jest.resetModules();
    const fresh = require('../../lib/auth-tokens');
    const res = mockResponse();
    fresh.setTenantAuthCookies(res, { accessToken: 'at', refreshToken: 'rt' });

    expect(res.cookies[fresh.COOKIE.tenantAccess].opts.secure).toBe(false);
    process.env.NODE_ENV = oldEnv;
  });
});

describe('clearTenantAuthCookies', () => {
  it('clears both access and refresh cookies', () => {
    const res = mockResponse();
    clearTenantAuthCookies(res);

    expect(res.cleared.length).toBe(2);
    expect(res.cleared.map((c) => c.name)).toEqual(
      expect.arrayContaining([COOKIE.tenantAccess, COOKIE.tenantRefresh])
    );

    expect(res.cookies[COOKIE.tenantAccess].value).toBe('');
    expect(res.cookies[COOKIE.tenantAccess].opts.maxAge).toBe(0);
    expect(res.cookies[COOKIE.tenantRefresh].value).toBe('');
    expect(res.cookies[COOKIE.tenantRefresh].opts.maxAge).toBe(0);
  });
});
