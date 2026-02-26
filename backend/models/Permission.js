const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  module: {
    type: String,
    required: true,
    enum: [
      'dashboard',
      'appointments',
      'clients',
      'membership',
      'services',
      'products',
      'staff',
      'sales',
      'reports',
      'settings',
      'payment_settings',
      'pos_settings',
      'general_settings'
    ]
  },
  feature: {
    type: String,
    required: true,
    enum: ['view', 'create', 'edit', 'delete', 'manage']
  },
  enabled: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Role definitions with their default permissions
const roleDefinitions = {
  admin: {
    name: 'Admin',
    description: 'Full access to all features and settings (Mandatory for admin users)',
    color: 'red',
    permissions: [
      // Dashboard
      { module: 'dashboard', feature: 'view', enabled: true },
      { module: 'dashboard', feature: 'manage', enabled: true },
      
      // Appointments
      { module: 'appointments', feature: 'view', enabled: true },
      { module: 'appointments', feature: 'create', enabled: true },
      { module: 'appointments', feature: 'edit', enabled: true },
      { module: 'appointments', feature: 'delete', enabled: true },
      { module: 'appointments', feature: 'manage', enabled: true },
      
      // Clients
      { module: 'clients', feature: 'view', enabled: true },
      { module: 'clients', feature: 'create', enabled: true },
      { module: 'clients', feature: 'edit', enabled: true },
      { module: 'clients', feature: 'delete', enabled: true },
      { module: 'clients', feature: 'manage', enabled: true },
      
      // Membership
      { module: 'membership', feature: 'view', enabled: true },
      { module: 'membership', feature: 'create', enabled: true },
      { module: 'membership', feature: 'edit', enabled: true },
      { module: 'membership', feature: 'delete', enabled: true },
      { module: 'membership', feature: 'manage', enabled: true },
      
      // Services
      { module: 'services', feature: 'view', enabled: true },
      { module: 'services', feature: 'create', enabled: true },
      { module: 'services', feature: 'edit', enabled: true },
      { module: 'services', feature: 'delete', enabled: true },
      { module: 'services', feature: 'manage', enabled: true },
      
      // Products
      { module: 'products', feature: 'view', enabled: true },
      { module: 'products', feature: 'create', enabled: true },
      { module: 'products', feature: 'edit', enabled: true },
      { module: 'products', feature: 'delete', enabled: true },
      { module: 'products', feature: 'manage', enabled: true },
      
      // Staff
      { module: 'staff', feature: 'view', enabled: true },
      { module: 'staff', feature: 'create', enabled: true },
      { module: 'staff', feature: 'edit', enabled: true },
      { module: 'staff', feature: 'delete', enabled: true },
      { module: 'staff', feature: 'manage', enabled: true },
      
      // Sales
      { module: 'sales', feature: 'view', enabled: true },
      { module: 'sales', feature: 'create', enabled: true },
      { module: 'sales', feature: 'edit', enabled: true },
      { module: 'sales', feature: 'delete', enabled: true },
      { module: 'sales', feature: 'manage', enabled: true },
      
      // Reports
      { module: 'reports', feature: 'view', enabled: true },
      { module: 'reports', feature: 'create', enabled: true },
      { module: 'reports', feature: 'edit', enabled: true },
      { module: 'reports', feature: 'delete', enabled: true },
      { module: 'reports', feature: 'manage', enabled: true },
      
      // Settings
      { module: 'settings', feature: 'view', enabled: true },
      { module: 'settings', feature: 'create', enabled: true },
      { module: 'settings', feature: 'edit', enabled: true },
      { module: 'settings', feature: 'delete', enabled: true },
      { module: 'settings', feature: 'manage', enabled: true },
      
      // Payment Settings
      { module: 'payment_settings', feature: 'view', enabled: true },
      { module: 'payment_settings', feature: 'create', enabled: true },
      { module: 'payment_settings', feature: 'edit', enabled: true },
      { module: 'payment_settings', feature: 'delete', enabled: true },
      { module: 'payment_settings', feature: 'manage', enabled: true },
      
      // POS Settings
      { module: 'pos_settings', feature: 'view', enabled: true },
      { module: 'pos_settings', feature: 'create', enabled: true },
      { module: 'pos_settings', feature: 'edit', enabled: true },
      { module: 'pos_settings', feature: 'delete', enabled: true },
      { module: 'pos_settings', feature: 'manage', enabled: true },
      
      // General Settings
      { module: 'general_settings', feature: 'view', enabled: true },
      { module: 'general_settings', feature: 'create', enabled: true },
      { module: 'general_settings', feature: 'edit', enabled: true },
      { module: 'general_settings', feature: 'delete', enabled: true },
      { module: 'general_settings', feature: 'manage', enabled: true }
    ]
  },
  manager: {
    name: 'Manager',
    description: 'Most features and pages, cannot access Staff Directory, Payment Settings, or POS Settings',
    color: 'blue',
    permissions: [
      // Dashboard
      { module: 'dashboard', feature: 'view', enabled: true },
      { module: 'dashboard', feature: 'manage', enabled: true },
      
      // Appointments
      { module: 'appointments', feature: 'view', enabled: true },
      { module: 'appointments', feature: 'create', enabled: true },
      { module: 'appointments', feature: 'edit', enabled: true },
      { module: 'appointments', feature: 'delete', enabled: true },
      { module: 'appointments', feature: 'manage', enabled: true },
      
      // Clients
      { module: 'clients', feature: 'view', enabled: true },
      { module: 'clients', feature: 'create', enabled: true },
      { module: 'clients', feature: 'edit', enabled: true },
      { module: 'clients', feature: 'delete', enabled: true },
      { module: 'clients', feature: 'manage', enabled: true },
      
      // Services
      { module: 'services', feature: 'view', enabled: true },
      { module: 'services', feature: 'create', enabled: true },
      { module: 'services', feature: 'edit', enabled: true },
      { module: 'services', feature: 'delete', enabled: true },
      { module: 'services', feature: 'manage', enabled: true },
      
      // Products
      { module: 'products', feature: 'view', enabled: true },
      { module: 'products', feature: 'create', enabled: true },
      { module: 'products', feature: 'edit', enabled: true },
      { module: 'products', feature: 'delete', enabled: true },
      { module: 'products', feature: 'manage', enabled: true },
      
      // Membership
      { module: 'membership', feature: 'view', enabled: true },
      { module: 'membership', feature: 'create', enabled: true },
      { module: 'membership', feature: 'edit', enabled: true },
      { module: 'membership', feature: 'delete', enabled: true },
      { module: 'membership', feature: 'manage', enabled: true },
      
      // Sales
      { module: 'sales', feature: 'view', enabled: true },
      { module: 'sales', feature: 'create', enabled: true },
      { module: 'sales', feature: 'edit', enabled: true },
      { module: 'sales', feature: 'delete', enabled: true },
      { module: 'sales', feature: 'manage', enabled: true },
      
      // Reports
      { module: 'reports', feature: 'view', enabled: true },
      { module: 'reports', feature: 'create', enabled: true },
      { module: 'reports', feature: 'edit', enabled: true },
      { module: 'reports', feature: 'delete', enabled: true },
      { module: 'reports', feature: 'manage', enabled: true },
      
      // General Settings
      { module: 'general_settings', feature: 'view', enabled: true },
      { module: 'general_settings', feature: 'create', enabled: true },
      { module: 'general_settings', feature: 'edit', enabled: true },
      { module: 'general_settings', feature: 'delete', enabled: true },
      { module: 'general_settings', feature: 'manage', enabled: true }
    ]
  },
  staff: {
    name: 'Staff',
    description: 'Limited access: Dashboard, Quick Sale, Products (View), Services (View), General Settings',
    color: 'green',
    permissions: [
      // Dashboard
      { module: 'dashboard', feature: 'view', enabled: true },
      
      // Appointments (limited)
      { module: 'appointments', feature: 'view', enabled: true },
      { module: 'appointments', feature: 'create', enabled: true },
      { module: 'appointments', feature: 'edit', enabled: true },
      
      // Clients (limited)
      { module: 'clients', feature: 'view', enabled: true },
      { module: 'clients', feature: 'create', enabled: true },
      { module: 'clients', feature: 'edit', enabled: true },
      
      // Membership (view only)
      { module: 'membership', feature: 'view', enabled: true },
      
      // Services (view only)
      { module: 'services', feature: 'view', enabled: true },
      
      // Products (view only)
      { module: 'products', feature: 'view', enabled: true },
      
      // Sales (limited)
      { module: 'sales', feature: 'view', enabled: true },
      { module: 'sales', feature: 'create', enabled: true },
      
      // General Settings (view only)
      { module: 'general_settings', feature: 'view', enabled: true }
    ]
  }
};

// Static method to get role definitions
permissionSchema.statics.getRoleDefinitions = function() {
  return roleDefinitions;
};

// Static method to get default permissions for a role
permissionSchema.statics.getDefaultPermissions = function(role) {
  return roleDefinitions[role]?.permissions || [];
};

// Export both schema and model for flexibility
module.exports = {
  schema: permissionSchema,
  model: mongoose.model('Permission', permissionSchema),
  roleDefinitions
};
