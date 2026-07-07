/**
 * Tenant-side permission middleware.
 *
 * Mirrors the frontend `hasPermission(module, feature)` semantics in
 * `lib/auth-context.tsx` so frontend gates and backend enforcement stay in sync:
 *
 *   - Business owner (User.isOwner === true) → always allowed.
 *   - role === 'admin' → always allowed.
 *   - role === 'manager' → granted the reports.view family by default
 *     (and view_financial_reports / view_staff_commission); for every
 *     other feature, falls back to the explicit `req.user.permissions[]`.
 *   - All other users (manager mutating, staff, etc.) → must have an
 *     entry with { module, feature, enabled: true } in `req.user.permissions`.
 *
 * Use AFTER `authenticateToken` so `req.user` is populated:
 *
 *   app.put(
 *     '/api/sales/:id',
 *     authenticateToken,
 *     setupBusinessDatabase,
 *     requirePermission('sales', 'edit'),
 *     handler
 *   );
 *
 * NEVER trust client-supplied role / permission fields — `req.user` is set by
 * `authenticateToken` from the JWT subject + database, so it cannot be forged.
 */

const REPORTS_VIEW_FEATURES = new Set([
  'view',
  'view_financial_reports',
  'view_staff_commission',
]);

const SETTINGS_SUB_MODULES = [
  'general_settings',
  'business_settings',
  'appointment_settings',
  'currency_settings',
  'tax_settings',
  'payment_settings',
  'payroll_settings',
  'incentive_settings',
  'pos_settings',
  'notification_settings',
  'plan_billing',
  'feedback',
  'membership',
  'services',
  'products',
];

function hasExplicitPermission(permissions, module, feature) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  return permissions.some(
    (p) => p && p.module === module && p.feature === feature && p.enabled === true
  );
}

/**
 * For users whose `permissions[]` is empty (legacy main-DB Users predating the
 * granular permissions UI), fall back to their role's default permission set
 * so existing manager / staff sessions don't suddenly start failing once we
 * switch routes from role-based to permission-based middleware.
 *
 * Mirrors the fallback already in `backend/middleware/auth.js` for Staff
 * documents (line ~110), extended here to cover main-DB Users.
 */
function effectivePermissions(user) {
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions;
  }
  if (!user.role) return [];
  try {
    const { roleDefinitions } = require('../models/Permission');
    return roleDefinitions[user.role]?.permissions || [];
  } catch {
    return [];
  }
}

/**
 * Pure helper — also exported so callers can do programmatic permission checks
 * inside route handlers (e.g. when deciding which fields to allow updating).
 */
function userHasPermission(user, module, feature) {
  if (!user) return false;
  if (user.isOwner === true) return true;
  if (user.role === 'admin') return true;

  if (
    user.role === 'manager' &&
    module === 'reports' &&
    REPORTS_VIEW_FEATURES.has(feature)
  ) {
    return true;
  }

  const perms = effectivePermissions(user);

  if (hasExplicitPermission(perms, module, feature)) return true;

  // Reports view granular fallback — having either granular report-view permission
  // counts as reports.view (mirrors frontend logic).
  if (module === 'reports' && feature === 'view') {
    return (
      hasExplicitPermission(perms, 'reports', 'view_financial_reports') ||
      hasExplicitPermission(perms, 'reports', 'view_staff_commission')
    );
  }

  // Settings parent view fallback — any settings sub-module's view counts.
  if (module === 'settings' && feature === 'view') {
    return SETTINGS_SUB_MODULES.some((m) =>
      hasExplicitPermission(perms, m, 'view')
    );
  }

  return false;
}

/**
 * Express middleware factory.
 *
 * @param {string} moduleName Permission module (e.g. 'sales', 'clients').
 * @param {string} feature    Feature within the module (e.g. 'edit', 'delete').
 */
function requirePermission(moduleName, feature) {
  if (!moduleName || !feature) {
    throw new Error('requirePermission(module, feature) requires both arguments');
  }
  return function permissionGate(req, res, next) {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, error: 'Authentication required' });
    }

    if (userHasPermission(req.user, moduleName, feature)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      requiredPermission: { module: moduleName, feature },
    });
  };
}

/**
 * Variant that accepts an array of `{ module, feature }` and allows the request
 * when the user has ANY of them — useful for endpoints whose action covers
 * multiple permission domains (e.g. a unified sales update that may also touch
 * `manage` features like refunds).
 */
function requireAnyPermission(...pairs) {
  if (!pairs.length) {
    throw new Error('requireAnyPermission(...) requires at least one pair');
  }
  const normalized = pairs.flat().map((p) => {
    if (!p || !p.module || !p.feature) {
      throw new Error(
        'requireAnyPermission expected { module, feature } objects'
      );
    }
    return p;
  });
  return function anyPermissionGate(req, res, next) {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, error: 'Authentication required' });
    }
    const ok = normalized.some(({ module, feature }) =>
      userHasPermission(req.user, module, feature)
    );
    if (ok) return next();
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      requiredAnyPermission: normalized,
    });
  };
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  userHasPermission,
};
