const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const databaseManager = require('../config/database-manager');
const { setupMainDatabase } = require('../middleware/business-db');

const { ADMIN_ACCESS_MODULES, DEFAULT_CREATION_RULES } = require('../config/admin-access');
const { authenticateAdmin, requireAdminRole, checkAdminPermission } = require('../middleware/admin-auth');
const { logAdminActivity, getClientIp } = require('../utils/admin-logger');
const { ensureAdminAccessDefaults } = require('../utils/admin-access');
const {
  moduleActionMap,
  normalizePermissionOverrides,
  applyPermissionOverrides
} = require('../utils/permission-helpers');

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'custom_role';

const validatePermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) {
    return false;
  }

  return permissions.every((permission) => {
    if (!permission.module || !Array.isArray(permission.actions)) {
      return false;
    }

    const moduleActions = moduleActionMap[permission.module];
    if (!moduleActions) {
      return false;
    }

    return permission.actions.every((action) => moduleActions.has(action));
  });
};

const formatAdminResponse = (adminDoc, roleLookup) => {
  const role = adminDoc.roleId
    ? roleLookup.get(adminDoc.roleId.toString())
    : roleLookup.get(adminDoc.role);

  const basePermissions = role?.permissions || adminDoc.permissions || [];
  const overrides = adminDoc.permissionOverrides || { add: [], remove: [] };
  const permissions = applyPermissionOverrides(basePermissions, overrides);

  return {
    id: adminDoc._id,
    firstName: adminDoc.firstName,
    lastName: adminDoc.lastName,
    email: adminDoc.email,
    roleKey: adminDoc.role,
    roleId: adminDoc.roleId,
    roleName: role?.name || adminDoc.role,
    isActive: adminDoc.isActive,
    lastLogin: adminDoc.lastLogin,
    permissions,
    permissionOverrides: overrides,
    createdAt: adminDoc.createdAt,
    updatedAt: adminDoc.updatedAt
  };
};

const roleResponse = (role, assignedAdmins = 0) => ({
  id: role._id,
  key: role.key,
  name: role.name,
  description: role.description,
  color: role.color,
  isSystem: role.isSystem,
  permissions: role.permissions,
  assignedAdmins,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt
});

const resolveRoleByIdOrKey = async ({ roleId, roleKey }, AdminRole) => {
  if (roleId) {
    const role = await AdminRole.findById(roleId);
    if (role) return role;
  }

  if (roleKey) {
    return AdminRole.findOne({ key: roleKey });
  }

  return null;
};

const ensureUniqueRoleKey = async (name, AdminRole, existingRoleId = null) => {
  const baseKey = slugify(name);
  let keyCandidate = baseKey;
  let suffix = 1;

  // Keep iterating until we find a unique key (ignoring the current role when editing)
  while (true) {
    const query = { key: keyCandidate };
    if (existingRoleId) {
      query._id = { $ne: existingRoleId };
    }
    const existing = await AdminRole.findOne(query).lean();
    if (!existing) {
      return keyCandidate;
    }
    keyCandidate = `${baseKey}_${suffix++}`;
  }
};

router.use(async (req, res, next) => {
  try {
    await ensureAdminAccessDefaults();
    next();
  } catch (error) {
    next(error);
  }
});

router.use(authenticateAdmin);
router.use(setupMainDatabase);

router.get('/overview', async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const [roles, admins] = await Promise.all([
      AdminRole.find({}).sort({ isSystem: -1, name: 1 }).lean(),
      Admin.find({})
        .select('firstName lastName email role roleId isActive lastLogin permissions permissionOverrides createdAt updatedAt')
        .lean()
    ]);

    const roleLookup = new Map();
    roles.forEach((role) => {
      roleLookup.set(role._id.toString(), role);
      roleLookup.set(role.key, role);
    });

    const adminPayload = admins.map((adminDoc) => formatAdminResponse(adminDoc, roleLookup));
    const rolesWithCounts = roles.map((role) => roleResponse(
      role,
      adminPayload.filter((admin) => admin.roleKey === role.key).length
    ));

    const stats = {
      totalAdmins: adminPayload.length,
      activeAdmins: adminPayload.filter((admin) => admin.isActive).length,
      superAdmins: adminPayload.filter((admin) => admin.roleKey === 'super_admin' && admin.isActive).length
    };

    res.json({
      success: true,
      data: {
        modules: ADMIN_ACCESS_MODULES,
        roles: rolesWithCounts,
        admins: adminPayload,
        stats,
        creationRules: DEFAULT_CREATION_RULES
      }
    });
  } catch (error) {
    console.error('Failed to load admin access overview:', error);
    res.status(500).json({ success: false, error: 'Failed to load access overview' });
  }
});

router.get('/roles', async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const roles = await AdminRole.find({}).sort({ isSystem: -1, name: 1 }).lean();
    const adminCounts = await Admin.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    const countsByRole = adminCounts.reduce((acc, entry) => {
      acc[entry._id] = entry.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: roles.map((role) => roleResponse(role, countsByRole[role.key] || 0))
    });
  } catch (error) {
    console.error('Failed to load admin roles:', error);
    res.status(500).json({ success: false, error: 'Failed to load roles' });
  }
});

router.post('/roles', requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { AdminRole } = req.mainModels;
    const { name, description = '', permissions = [], color = 'gray' } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Role name is required' });
    }

    if (!permissions.length || !validatePermissions(permissions)) {
      return res.status(400).json({ success: false, error: 'Invalid permissions payload' });
    }

    const key = await ensureUniqueRoleKey(name, AdminRole);

    const role = await AdminRole.create({
      name,
      description,
      permissions,
      color,
      key,
      isSystem: false,
      createdBy: req.admin._id,
      updatedBy: req.admin._id
    });

    // Log activity
    logAdminActivity({
      adminId: req.admin,
      action: 'create',
      module: 'roles',
      resourceId: role._id.toString(),
      resourceType: 'AdminRole',
      details: { name: role.name, key: role.key, permissionsCount: permissions.length },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log activity:', err));

    res.status(201).json({ success: true, data: roleResponse(role, 0) });
  } catch (error) {
    console.error('Failed to create admin role:', error);
    res.status(500).json({ success: false, error: 'Failed to create role' });
  }
});

router.put('/roles/:roleId', requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const { roleId } = req.params;
    const { name, description, permissions, color } = req.body;

    const role = await AdminRole.findById(roleId);
    if (!role) {
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    // For system roles, only allow updating description, color, and permissions
    // Prevent changing name or key for system roles to maintain consistency
    if (role.isSystem) {
      if (name && name !== role.name) {
        return res.status(400).json({ 
          success: false, 
          error: 'System role names cannot be changed. You can only update description, color, and permissions.' 
        });
      }
      
      // Allow updating description, color, and permissions for system roles
      if (typeof description === 'string') {
        role.description = description;
      }
      
      if (color) {
        role.color = color;
      }
      
      if (permissions) {
        if (!validatePermissions(permissions)) {
          return res.status(400).json({ success: false, error: 'Invalid permissions payload' });
        }
        role.permissions = permissions;
      }
    } else {
      // For non-system roles, allow full editing
      if (name && name !== role.name) {
        role.key = await ensureUniqueRoleKey(name, AdminRole, role._id);
        role.name = name;
      }

      if (typeof description === 'string') {
        role.description = description;
      }

      if (color) {
        role.color = color;
      }

      if (permissions) {
        if (!validatePermissions(permissions)) {
          return res.status(400).json({ success: false, error: 'Invalid permissions payload' });
        }
        role.permissions = permissions;
      }
    }

    role.updatedBy = req.admin._id;
    await role.save();

    if (permissions) {
      await Admin.updateMany(
        { role: role.key },
        { $set: { permissions: role.permissions, roleId: role._id } }
      );
    }

    const assignmentCount = await Admin.countDocuments({ role: role.key });

    // Log activity
    const changes = [];
    if (description !== undefined) changes.push('description');
    if (color) changes.push('color');
    if (permissions) changes.push('permissions');

    logAdminActivity({
      adminId: req.admin,
      action: 'update',
      module: 'roles',
      resourceId: roleId,
      resourceType: 'AdminRole',
      details: { name: role.name, key: role.key, changes: changes, isSystem: role.isSystem },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log activity:', err));

    res.json({ success: true, data: roleResponse(role, assignmentCount) });
  } catch (error) {
    console.error('Failed to update admin role:', error);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
});

router.delete('/roles/:roleId', requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const { roleId } = req.params;
    const role = await AdminRole.findById(roleId);

    if (!role) {
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    if (role.isSystem) {
      return res.status(400).json({ success: false, error: 'System roles cannot be deleted' });
    }

    const assignedAdmins = await Admin.countDocuments({ role: role.key });
    if (assignedAdmins > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete a role with assigned admins' });
    }

    await role.deleteOne();

    // Log activity
    logAdminActivity({
      adminId: req.admin,
      action: 'delete',
      module: 'roles',
      resourceId: roleId,
      resourceType: 'AdminRole',
      details: { name: role.name, key: role.key },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log activity:', err));

    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Failed to delete admin role:', error);
    res.status(500).json({ success: false, error: 'Failed to delete role' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const admins = await Admin.find({})
      .select('firstName lastName email role roleId isActive lastLogin permissions permissionOverrides createdAt updatedAt')
      .lean();
    const roles = await AdminRole.find({}).lean();
    const roleLookup = new Map();
    roles.forEach((role) => {
      roleLookup.set(role._id.toString(), role);
      roleLookup.set(role.key, role);
    });

    const payload = admins.map((adminDoc) => formatAdminResponse(adminDoc, roleLookup));

    res.json({ success: true, data: payload });
  } catch (error) {
    console.error('Failed to load admin users:', error);
    res.status(500).json({ success: false, error: 'Failed to load admin users' });
  }
});

router.post('/users', authenticateAdmin, checkAdminPermission('users', 'create'), async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const { firstName, lastName, email, password, roleId, roleKey, permissionOverrides } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(409).json({ success: false, error: 'An admin with this email already exists' });
    }

    const role = await resolveRoleByIdOrKey({ roleId, roleKey }, AdminRole);
    if (!role) {
      return res.status(400).json({ success: false, error: 'Invalid role selection' });
    }

    // Normalize and apply permission overrides
    const normalizedOverrides = normalizePermissionOverrides(permissionOverrides);

    // Prevent creating new users with super_admin role unless the requester is already a super admin
    if (role.key === 'super_admin' && req.admin.role !== 'super_admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Cannot assign super_admin role to new users. Super admin privileges can only be granted through direct database access or initial setup.' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role.key,
      roleId: role._id,
      isActive: true,
      permissions: applyPermissionOverrides(role.permissions || [], normalizedOverrides),
      permissionOverrides: normalizedOverrides
    });

    const payload = formatAdminResponse(admin.toObject(), new Map([[role._id.toString(), role], [role.key, role]]));

    // Log activity
    logAdminActivity({
      adminId: req.admin,
      action: 'create',
      module: 'users',
      resourceId: admin._id.toString(),
      resourceType: 'Admin',
      details: { email: admin.email, role: role.key, hasOverrides: normalizedOverrides.add.length > 0 || normalizedOverrides.remove.length > 0 },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log activity:', err));

    res.status(201).json({ success: true, data: payload });
  } catch (error) {
    console.error('Failed to create admin user:', error);
    res.status(500).json({ success: false, error: 'Failed to create admin user' });
  }
});

router.put('/users/:userId', authenticateAdmin, checkAdminPermission('users', 'update'), async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const { userId } = req.params;
    const { firstName, lastName, email, roleId, roleKey, permissionOverrides } = req.body;

    const admin = await Admin.findById(userId);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    // Check if user is editing their own account or is a super admin
    const isOwnAccount = req.admin._id.toString() === userId;
    const isSuperAdmin = req.admin.role === 'super_admin';

    // Only allow editing other users' accounts if the requester is a super admin
    if (!isOwnAccount && !isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'You can only edit your own account details. Only super admins can edit other users.' 
      });
    }

    // Only super admins can change roles
    if ((roleId || roleKey) && !isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only super admins can change user roles.' 
      });
    }

    // Prevent changing a user's role to super_admin unless they're already a super admin
    // This prevents privilege escalation
    if (roleId || roleKey) {
      const role = await resolveRoleByIdOrKey({ roleId, roleKey }, AdminRole);
      if (!role) {
        return res.status(400).json({ success: false, error: 'Invalid role selection' });
      }

      // Only allow assigning super_admin role if the target user is already a super admin
      // This prevents creating new super admins
      if (role.key === 'super_admin' && admin.role !== 'super_admin') {
        return res.status(403).json({ 
          success: false, 
          error: 'Cannot assign super_admin role. Super admin privileges can only be granted through direct database access or initial setup.' 
        });
      }
    }

    if (firstName) admin.firstName = firstName;
    if (lastName) admin.lastName = lastName;
    if (email) admin.email = email.toLowerCase();

    // Only super admins can change roles
    let updatedRole = null;
    if ((roleId || roleKey) && isSuperAdmin) {
      updatedRole = await resolveRoleByIdOrKey({ roleId, roleKey }, AdminRole);
      if (!updatedRole) {
        return res.status(400).json({ success: false, error: 'Invalid role selection' });
      }

      admin.role = updatedRole.key;
      admin.roleId = updatedRole._id;
    }

    if (permissionOverrides) {
      admin.permissionOverrides = normalizePermissionOverrides(permissionOverrides);
    }

    const roleForPermissions = updatedRole
      ? updatedRole
      : admin.roleId
      ? await AdminRole.findById(admin.roleId)
      : await AdminRole.findOne({ key: admin.role });

    const basePermissions = roleForPermissions?.permissions || [];
    const overrides = admin.permissionOverrides || { add: [], remove: [] };
    admin.permissions = applyPermissionOverrides(basePermissions, overrides);

    await admin.save();

    // Log activity
    const changes = [];
    if (firstName) changes.push('firstName');
    if (lastName) changes.push('lastName');
    if (email) changes.push('email');
    if (updatedRole) changes.push(`role: ${updatedRole.key}`);
    if (permissionOverrides) changes.push('permissionOverrides');

    logAdminActivity({
      adminId: req.admin,
      action: 'update',
      module: 'users',
      resourceId: userId,
      resourceType: 'Admin',
      details: { 
        targetEmail: admin.email,
        changes: changes,
        isOwnAccount: isOwnAccount
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log activity:', err));

    const roles = await AdminRole.find({}).lean();
    const roleLookup = new Map();
    roles.forEach((role) => {
      roleLookup.set(role._id.toString(), role);
      roleLookup.set(role.key, role);
    });

    res.json({ success: true, data: formatAdminResponse(admin.toObject(), roleLookup) });
  } catch (error) {
    console.error('Failed to update admin user:', error);
    res.status(500).json({ success: false, error: 'Failed to update admin user' });
  }
});

router.patch('/users/:userId/permissions', authenticateAdmin, checkAdminPermission('users', 'update'), async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const { userId } = req.params;
    const { permissionOverrides } = req.body;

    if (!permissionOverrides) {
      return res.status(400).json({ success: false, error: 'permissionOverrides payload is required' });
    }

    const admin = await Admin.findById(userId);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    const normalizedOverrides = normalizePermissionOverrides(permissionOverrides);
    admin.permissionOverrides = normalizedOverrides;

    const role = admin.roleId
      ? await AdminRole.findById(admin.roleId)
      : await AdminRole.findOne({ key: admin.role });

    const basePermissions = role?.permissions || [];
    admin.permissions = applyPermissionOverrides(basePermissions, normalizedOverrides);

    await admin.save();

    // Log activity
    logAdminActivity({
      adminId: req.admin,
      action: 'permission_change',
      module: 'users',
      resourceId: userId,
      resourceType: 'Admin',
      details: { 
        targetEmail: admin.email,
        overridesAdded: normalizedOverrides.add.length,
        overridesRemoved: normalizedOverrides.remove.length
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log activity:', err));

    const roles = await AdminRole.find({}).lean();
    const roleLookup = new Map();
    roles.forEach((roleItem) => {
      roleLookup.set(roleItem._id.toString(), roleItem);
      roleLookup.set(roleItem.key, roleItem);
    });

    res.json({ success: true, data: formatAdminResponse(admin.toObject(), roleLookup) });
  } catch (error) {
    console.error('Failed to update admin permissions:', error);
    res.status(500).json({ success: false, error: 'Failed to update permissions' });
  }
});

router.patch('/users/:userId/status', requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { Admin, AdminRole } = req.mainModels;
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, error: 'isActive flag is required' });
    }

    const admin = await Admin.findById(userId);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    if (!isActive && admin.role === 'super_admin') {
      const activeSuperAdmins = await Admin.countDocuments({
        role: 'super_admin',
        isActive: true,
        _id: { $ne: admin._id }
      });

      if (activeSuperAdmins === 0) {
        return res.status(400).json({ success: false, error: 'At least one super admin must remain active' });
      }
    }

    admin.isActive = isActive;
    await admin.save();

    // Log activity
    logAdminActivity({
      adminId: req.admin,
      action: 'status_change',
      module: 'users',
      resourceId: userId,
      resourceType: 'Admin',
      details: { 
        targetEmail: admin.email,
        newStatus: isActive ? 'active' : 'inactive'
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log activity:', err));

    const roles = await AdminRole.find({}).lean();
    const roleLookup = new Map();
    roles.forEach((role) => {
      roleLookup.set(role._id.toString(), role);
      roleLookup.set(role.key, role);
    });

    res.json({ success: true, data: formatAdminResponse(admin.toObject(), roleLookup) });
  } catch (error) {
    console.error('Failed to update admin user status:', error);
    res.status(500).json({ success: false, error: 'Failed to update admin status' });
  }
});

router.patch('/users/:userId/password', authenticateAdmin, async (req, res) => {
  try {
    const { Admin } = req.mainModels;
    const { userId } = req.params;
    const { password } = req.body;

    if (!password || password.trim().length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
    }

    const admin = await Admin.findById(userId);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    // Allow users to change their own password, or super admins to change anyone's password
    const isOwnPassword = req.admin._id.toString() === userId;
    const isSuperAdmin = req.admin.role === 'super_admin';

    if (!isOwnPassword && !isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'You can only change your own password. Super admins can change any password.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    admin.password = hashedPassword;
    admin.passwordUpdatedAt = new Date();
    await admin.save();

    // Log activity
    logAdminActivity({
      adminId: req.admin,
      action: 'password_reset',
      module: 'users',
      resourceId: userId,
      resourceType: 'Admin',
      details: { 
        targetEmail: admin.email,
        isOwnPassword: isOwnPassword
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log activity:', err));

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Failed to reset admin password:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

module.exports = router;

