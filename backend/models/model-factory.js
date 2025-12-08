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
  createBusinessModels(connection) {
    return {
      // Client model
      Client: this.getModel('Client', require('./Client').schema, connection),
      
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
      
      // InventoryTransaction model
      InventoryTransaction: this.getModel('InventoryTransaction', require('./InventoryTransaction').schema, connection),
      
      // BusinessSettings model
      BusinessSettings: this.getModel('BusinessSettings', require('./BusinessSettings').schema, connection),
      
      // Supplier model
      Supplier: this.getModel('Supplier', require('./Supplier').schema, connection),
      
      // Category model
      Category: this.getModel('Category', require('./Category').schema, connection),
      
      // Commission Profile model
      CommissionProfile: this.getModel('CommissionProfile', require('./CommissionProfile').schema, connection)
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
      PlanTemplate: this.getModel('PlanTemplate', require('./PlanTemplate').schema, connection)
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
