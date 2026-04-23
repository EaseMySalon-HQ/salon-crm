const mongoose = require('mongoose');

/**
 * Model Factory for creating models with specific database connections
 */
class ModelFactory {
  constructor() {
    this.models = new Map(); // Cache models by connection
  }

  /**
   * Get or create a model for a specific database connection
   * @param {string} modelName - Name of the model
   * @param {mongoose.Schema} schema - Mongoose schema
   * @param {mongoose.Connection} connection - Database connection
   * @returns {mongoose.Model} - Mongoose model
   */
  getModel(modelName, schema, connection) {
    const key = `${connection.name}_${modelName}`;
    
    if (this.models.has(key)) {
      return this.models.get(key);
    }

    const model = connection.model(modelName, schema);
    this.models.set(key, model);
    return model;
  }

  /**
   * Create all business-specific models for a connection
   * @param {mongoose.Connection} connection - Database connection
   * @returns {Object} - Object containing all models
   */
  /**
   * Reuse the same model bundle per connection (avoids re-wiring models every request).
   * @param {mongoose.Connection} connection
   */
  getCachedBusinessModels(connection) {
    if (!connection.modelsCache) {
      connection.modelsCache = this.createBusinessModels(connection);
    }
    return connection.modelsCache;
  }

  createBusinessModels(connection) {
    return {
      // Client model
      Client: this.getModel('Client', require('./Client').schema, connection),

      // Parent booking (register before Appointment — refs Booking)
      Booking: this.getModel('Booking', require('./Booking').schema, connection),
      
      // Appointment model
      Appointment: this.getModel('Appointment', require('./Appointment').schema, connection),
      
      // Sale model
      Sale: this.getModel('Sale', require('./Sale').schema, connection),
      
      // Receipt model
      Receipt: this.getModel('Receipt', require('./Receipt').schema, connection),
      
      // Product model
      Product: this.getModel('Product', require('./Product').schema, connection),
      
      // Service model
      Service: this.getModel('Service', require('./Service').schema, connection),
      
      // Staff model
      Staff: this.getModel('Staff', require('./Staff').schema, connection),
      
      // CashRegistry model
      CashRegistry: this.getModel('CashRegistry', require('./CashRegistry').schema, connection),
      
      // Expense model
      Expense: this.getModel('Expense', require('./Expense').schema, connection),

      // PettyCashTransaction model
      PettyCashTransaction: this.getModel('PettyCashTransaction', require('./PettyCashTransaction').schema, connection),
      
      // InventoryTransaction model
      InventoryTransaction: this.getModel('InventoryTransaction', require('./InventoryTransaction').schema, connection),

      // Bill edit history model
      BillEditHistory: this.getModel('BillEditHistory', require('./BillEditHistory').schema, connection),

      // Bill archive model
      BillArchive: this.getModel('BillArchive', require('./BillArchive').schema, connection),
      
      // BusinessSettings model
      BusinessSettings: this.getModel('BusinessSettings', require('./BusinessSettings').schema, connection),
      
      // Supplier model
      Supplier: this.getModel('Supplier', require('./Supplier').schema, connection),

      // PurchaseOrder model
      PurchaseOrder: this.getModel('PurchaseOrder', require('./PurchaseOrder').schema, connection),

      // SupplierPayable model
      SupplierPayable: this.getModel('SupplierPayable', require('./SupplierPayable').schema, connection),

      // SupplierPayment model
      SupplierPayment: this.getModel('SupplierPayment', require('./SupplierPayment').schema, connection),
      
      // Category model
      Category: this.getModel('Category', require('./Category').schema, connection),
      
      // Commission Profile model
      CommissionProfile: this.getModel('CommissionProfile', require('./CommissionProfile').schema, connection),
      
      // Lead model
      Lead: this.getModel('Lead', require('./Lead').schema, connection),
      
      // LeadActivity model
      LeadActivity: this.getModel('LeadActivity', require('./LeadActivity').schema, connection),

      // BlockTime model
      BlockTime: this.getModel('BlockTime', require('./BlockTime').schema, connection),

      // ServiceConsumptionRule model (auto consumption)
      ServiceConsumptionRule: this.getModel('ServiceConsumptionRule', require('./ServiceConsumptionRule').schema, connection),

      // InventoryConsumptionLog model (auto consumption audit)
      InventoryConsumptionLog: this.getModel('InventoryConsumptionLog', require('./InventoryConsumptionLog').schema, connection),

      // TipPayout model (staff tip payouts)
      TipPayout: this.getModel('TipPayout', require('./TipPayout').schema, connection),

      // Membership models
      MembershipPlan: this.getModel('MembershipPlan', require('./MembershipPlan').schema, connection),
      MembershipSubscription: this.getModel('MembershipSubscription', require('./MembershipSubscription').schema, connection),
      MembershipUsage: this.getModel('MembershipUsage', require('./MembershipUsage').schema, connection),

      // Package models
      Package: this.getModel('Package', require('./Package').schema, connection),
      PackageService: this.getModel('PackageService', require('./PackageService').schema, connection),
      ClientPackage: this.getModel('ClientPackage', require('./ClientPackage').schema, connection),
      PackageRedemption: this.getModel('PackageRedemption', require('./PackageRedemption').schema, connection),
      PackageNotification: this.getModel('PackageNotification', require('./PackageNotification').schema, connection),
      PackageAuditLog: this.getModel('PackageAuditLog', require('./PackageAuditLog').schema, connection),

      // Scheduling (package sessions + holds + availability)
      PackageSession: this.getModel('PackageSession', require('./PackageSession').schema, connection),
      BookingHold: this.getModel('BookingHold', require('./BookingHold').schema, connection),
      StaffAvailability: this.getModel('StaffAvailability', require('./StaffAvailability').schema, connection),
      StaffAvailabilityException: this.getModel('StaffAvailabilityException', require('./StaffAvailabilityException').schema, connection),
      BranchHoliday: this.getModel('BranchHoliday', require('./BranchHoliday').schema, connection)
    };
  }

  /**
   * Create main database models (Business, User, Admin)
   * @param {mongoose.Connection} connection - Main database connection
   * @returns {Object} - Object containing main models
   */
  createMainModels(connection) {
    return {
      Business: this.getModel('Business', require('./Business').schema, connection),
      User: this.getModel('User', require('./User').schema, connection),
      Admin: this.getModel('Admin', require('./Admin').schema, connection),
      AdminRole: this.getModel('AdminRole', require('./AdminRole').schema, connection),
      AdminActivityLog: this.getModel('AdminActivityLog', require('./AdminActivityLog').schema, connection),
      AdminSettings: this.getModel('AdminSettings', require('./AdminSettings').schema, connection),
      PasswordResetToken: this.getModel('PasswordResetToken', require('./PasswordResetToken').schema, connection),
      PlanChangeLog: this.getModel('PlanChangeLog', require('./PlanChangeLog').schema, connection),
      PlanTemplate: this.getModel('PlanTemplate', require('./PlanTemplate').schema, connection),
      RefreshToken: this.getModel('RefreshToken', require('./RefreshToken').schema, connection),
      ActivityLog: this.getModel('ActivityLog', require('./ActivityLog').schema, connection),
      InvoiceCounter: this.getModel('InvoiceCounter', require('./InvoiceCounter').schema, connection),
      PlanInvoiceTransaction: this.getModel('PlanInvoiceTransaction', require('./PlanInvoiceTransaction').schema, connection),
      Invoice: this.getModel('Invoice', require('./Invoice').schema, connection),
      GstFiling: this.getModel('GstFiling', require('./GstFiling').schema, connection)
    };
  }

  /**
   * Clear model cache for a specific connection
   * @param {mongoose.Connection} connection - Database connection
   */
  clearModelsForConnection(connection) {
    const keysToDelete = [];
    for (const key of this.models.keys()) {
      if (key.startsWith(connection.name)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.models.delete(key));
  }
}

module.exports = new ModelFactory();
