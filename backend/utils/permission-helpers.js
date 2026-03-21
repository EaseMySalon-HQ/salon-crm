const { ADMIN_ACCESS_MODULES } = require('../config/admin-access');

const moduleActionMap = ADMIN_ACCESS_MODULES.reduce((acc, module) => {
  acc[module.id] = new Set(module.actions);
  return acc;
}, {});

const normalizePermissionList = (permissions = []) => {
  const normalized = [];

  permissions.forEach((permission) => {
    if (!permission || !permission.module || !Array.isArray(permission.actions)) {
      return;
    }

    const moduleId = permission.module;
    const moduleActions = moduleActionMap[moduleId];
    if (!moduleActions) {
      return;
    }

    const uniqueActions = Array.from(new Set(permission.actions)).filter((action) =>
      moduleActions.has(action)
    );

    if (!uniqueActions.length) {
      return;
    }

    normalized.push({
      module: moduleId,
      actions: uniqueActions
    });
  });

  return normalized;
};

const revokeEntries = (overrides = {}) =>
  normalizePermissionList(overrides.revoke || overrides.remove || []);

const applyPermissionOverrides = (basePermissions = [], overrides = { add: [], revoke: [] }) => {
  const permissionMap = new Map();

  const addActionsToMap = (moduleId, actions) => {
    if (!permissionMap.has(moduleId)) {
      permissionMap.set(moduleId, new Set());
    }
    const actionSet = permissionMap.get(moduleId);
    actions.forEach((action) => actionSet.add(action));
  };

  const removeActionsFromMap = (moduleId, actions) => {
    if (!permissionMap.has(moduleId)) {
      return;
    }
    const actionSet = permissionMap.get(moduleId);
    actions.forEach((action) => actionSet.delete(action));
    if (actionSet.size === 0) {
      permissionMap.delete(moduleId);
    }
  };

  normalizePermissionList(basePermissions).forEach(({ module, actions }) => {
    addActionsToMap(module, actions);
  });

  revokeEntries(overrides).forEach(({ module, actions }) => {
    removeActionsFromMap(module, actions);
  });

  normalizePermissionList(overrides.add).forEach(({ module, actions }) => {
    addActionsToMap(module, actions);
  });

  return Array.from(permissionMap.entries()).map(([module, actions]) => ({
    module,
    actions: Array.from(actions).sort()
  }));
};

const normalizePermissionOverrides = (overrides = {}) => {
  return {
    add: normalizePermissionList(overrides.add || []),
    revoke: revokeEntries(overrides)
  };
};

/** API / UI still use `remove`; storage uses `revoke` (Mongoose reserves `remove`). */
const permissionOverridesForApi = (overrides = {}) => {
  const n = normalizePermissionOverrides(overrides);
  return { add: n.add, remove: n.revoke };
};

module.exports = {
  moduleActionMap,
  normalizePermissionList,
  normalizePermissionOverrides,
  permissionOverridesForApi,
  applyPermissionOverrides
};

