const { DEFAULT_ADMIN_ROLES } = require('../config/admin-access');
const databaseManager = require('../config/database-manager');
const { logger } = require('./logger');

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
        // Check if permissions need updating by comparing JSON strings
        const existingPermsStr = JSON.stringify(existing.permissions.sort((a, b) => 
          a.module.localeCompare(b.module) || a.actions.join(',').localeCompare(b.actions.join(','))
        ));
        const defaultPermsStr = JSON.stringify(defaultRole.permissions.sort((a, b) => 
          a.module.localeCompare(b.module) || a.actions.join(',').localeCompare(b.actions.join(','))
        ));
        
        const needsUpdate =
          existing.description !== defaultRole.description ||
          existingPermsStr !== defaultPermsStr ||
          existing.color !== (defaultRole.color || existing.color);

        if (needsUpdate) {
          existing.description = defaultRole.description;
          existing.permissions = defaultRole.permissions;
          existing.isSystem = true;
          existing.color = defaultRole.color || existing.color;
          await existing.save();
          logger.debug(`Updated role: ${defaultRole.key}`);
        }
      }
    }

    await syncAdminRoleReferences(AdminRole, Admin);
  })().catch((error) => {
    initializationPromise = null;
    logger.error('Failed to initialize admin access defaults:', error);
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

