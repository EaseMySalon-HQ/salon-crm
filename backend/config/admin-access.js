const ADMIN_ACCESS_MODULES = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Platform level KPIs and quick actions',
    actions: ['view']
  },
  {
    id: 'businesses',
    label: 'Businesses',
    description: 'Create, update and moderate tenant accounts',
    actions: ['view', 'create', 'update', 'delete', 'export']
  },
  {
    id: 'plans',
    label: 'Plans & Billing',
    description: 'Manage subscription templates, assignments and history',
    actions: ['view', 'create', 'update', 'delete', 'assign']
  },
  {
    id: 'users',
    label: 'Admin Users',
    description: 'Invite, edit and deactivate platform admins',
    actions: ['view', 'create', 'update', 'delete', 'assign_roles', 'reset_password']
  },
  {
    id: 'roles',
    label: 'Roles & Permissions',
    description: 'Control permission templates available to admins',
    actions: ['view', 'create', 'update', 'delete']
  },
  {
    id: 'settings',
    label: 'System Settings',
    description: 'Platform wide settings, notifications and integrations',
    actions: ['view', 'update']
  },
  {
    id: 'support_tools',
    label: 'Support Tools',
    description: 'Read-only tools for support and success teams',
    actions: ['view', 'update']
  }
];

const clonePermissionsFromModules = (moduleIds) => {
  return moduleIds.map((moduleId) => {
    const moduleDef = ADMIN_ACCESS_MODULES.find((module) => module.id === moduleId);
    if (!moduleDef) {
      return null;
    }
    return { module: moduleDef.id, actions: moduleDef.actions };
  }).filter(Boolean);
};

const DEFAULT_ADMIN_ROLES = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full system access including security and data operations',
    isSystem: true,
    color: 'red',
    permissions: ADMIN_ACCESS_MODULES.map((module) => ({
      module: module.id,
      actions: module.actions
    }))
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Day-to-day administration across businesses, plans and settings',
    isSystem: true,
    color: 'blue',
    permissions: clonePermissionsFromModules(['dashboard', 'businesses', 'plans', 'settings'])
  },
  {
    key: 'support',
    name: 'Support',
    description: 'Read-only access plus targeted support tooling',
    isSystem: true,
    color: 'green',
    permissions: [
      { module: 'dashboard', actions: ['view'] },
      { module: 'businesses', actions: ['view'] },
      { module: 'users', actions: ['view'] },
      { module: 'support_tools', actions: ['view', 'update'] }
    ]
  }
];

const DEFAULT_CREATION_RULES = {
  requirePassword: true,
  requireEmailVerification: false,
  requirePhoneVerification: false,
  allowSelfRegistration: false,
  requireAdminApproval: true,
  defaultRole: 'support',
  autoActivate: false,
  sendWelcomeEmail: true
};

module.exports = {
  ADMIN_ACCESS_MODULES,
  DEFAULT_ADMIN_ROLES,
  DEFAULT_CREATION_RULES
};

