const { DEFAULT_ADMIN_ROLES } = require('../config/admin-access');
const databaseManager = require('../config/database-manager');

let initializationPromise = null;

async function ensureAdminAccessDefaults() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const mainConnection = await databaseManager.getMainConnection();
    const AdminRole = mainConnection.model('AdminRole', require('../models/AdminRole').schema);
    const Admin = mainConnection.model('Admin', require('../models/Admin').schema);

    for (const defaultRole of DEFAULT_ADMIN_ROLES) {
      const existing = await AdminRole.findOne({ key: defaultRole.key });
      if (!existing) {
        await AdminRole.create(defaultRole);
      } else {
        const needsUpdate =
          existing.description !== defaultRole.description ||
          existing.permissions.length !== defaultRole.permissions.length;

        if (needsUpdate) {
          existing.description = defaultRole.description;
          existing.permissions = defaultRole.permissions;
          existing.isSystem = true;
          existing.color = defaultRole.color || existing.color;
          await existing.save();
        }
      }
    }

    await syncAdminRoleReferences(AdminRole, Admin);
  })().catch((error) => {
    initializationPromise = null;
    console.error('Failed to initialize admin access defaults:', error);
    throw error;
  });

  return initializationPromise;
}

async function syncAdminRoleReferences(AdminRole, Admin) {
  const roles = await AdminRole.find({});
  if (!roles.length) {
    return;
  }

  const roleKeyMap = new Map();
  const roleIdMap = new Map();

  roles.forEach((role) => {
    roleKeyMap.set(role.key, role._id);
    roleIdMap.set(role._id.toString(), role);
  });

  const bulkOperations = [];

  for (const [roleKey, roleId] of roleKeyMap.entries()) {
    bulkOperations.push({
      updateMany: {
        filter: {
          role: roleKey,
          $or: [{ roleId: { $exists: false } }, { roleId: null }]
        },
        update: { $set: { roleId } }
      }
    });
  }

  if (bulkOperations.length) {
    await Admin.bulkWrite(bulkOperations);
  }
}

module.exports = {
  ensureAdminAccessDefaults
};

