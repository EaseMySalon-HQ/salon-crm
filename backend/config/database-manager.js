const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const { registerSlowQueryMonitoring } = require('../utils/mongoose-slow-query');

class DatabaseManager {
  constructor() {
    this.connections = new Map(); // Store active connections

    const fullUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    
    logger.debug(`\n🔧 ===== DatabaseManager Initialization =====`);
    logger.debug(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.debug(`   Full URI: ${fullUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    try {
      // Parse URI and remove any database name, preserve query parameters
      const [uriWithoutQuery, queryParams] = fullUri.split('?');
      const uriParts = uriWithoutQuery.split('/');
      
      logger.debug(`   URI parts count: ${uriParts.length}`);

      if (uriParts.length > 3) {
        // Has database name, remove it
        this.baseUri = uriParts.slice(0, -1).join('/');
        logger.debug(`   ✂️  Removed database name from URI`);
      } else {
        // No database name in URI
        this.baseUri = uriWithoutQuery;
        logger.debug(`   ℹ️  No database name to remove`);
      }

      // Preserve or add query parameters
      if (queryParams) {
        this.baseUri = `${this.baseUri}?${queryParams}`;
        logger.debug(`   ✅ Preserved query parameters`);
      } else {
        // If no query params exist, add authSource=admin for Railway MongoDB
        // This is needed because Railway MongoDB users are created in the admin database
        this.baseUri = `${this.baseUri}?authSource=admin`;
        logger.debug(`   ✅ Added authSource=admin for authentication`);
      }
    } catch (error) {
      logger.error('   ⚠️  Error parsing MONGODB_URI:', error.message);
      this.baseUri = fullUri.split('?')[0];
    }

    // Validate base URI
    if (!this.baseUri || this.baseUri === 'mongodb:' || this.baseUri === 'mongodb+srv:') {
      logger.warn('   ⚠️  Invalid base URI, using fallback');
      this.baseUri = 'mongodb://localhost:27017';
    }
    
    logger.debug(`   Base URI: ${this.baseUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    logger.debug(`✅ DatabaseManager initialized`);
    logger.debug(`==========================================\n`);
  }

  /**
   * Get database name for a business
   * @param {string} businessCode - The business code (e.g., "BIZ0001")
   * @returns {string} - Database name in format: ease_my_salon_{businessCode}
   */
  getDatabaseName(businessCode) {
    return `ease_my_salon_${businessCode}`;
  }

  /**
   * Get or create a database connection for a business
   * @param {string} businessIdOrCode - The business code (preferred) or ObjectId
   * @param {object} mainConnection - Optional main database connection to look up business code
   * @returns {Promise<mongoose.Connection>} - Database connection
   */
  async getConnection(businessIdOrCode, mainConnection = null) {
    if (!businessIdOrCode) {
      throw new Error('Business ID or code is required');
    }

    logger.debug(`\n🔍 ===== Getting Business Database Connection =====`);
    logger.debug(`   Input: ${businessIdOrCode}`);

    // Determine if input is a business code (starts with letters) or ObjectId (hex string)
    const isBusinessCode = /^[A-Z]/.test(businessIdOrCode);
    let businessCode = businessIdOrCode;

    logger.debug(`   Type: ${isBusinessCode ? 'Business Code' : 'ObjectId'}`);

    // If ObjectId provided, try to look up business code
    if (!isBusinessCode && mainConnection) {
      try {
        logger.debug(`   🔍 Looking up business code for ObjectId...`);
        const Business = mainConnection.model('Business', require('../models/Business').schema);
        const business = await Business.findById(businessIdOrCode).select('code');
        
        if (business && business.code) {
          businessCode = business.code;
          logger.debug(`   ✅ Found business code: ${businessCode}`);
        } else {
          logger.warn(`   ⚠️  Business found but no code! Will use ObjectId for database name.`);
          businessCode = businessIdOrCode;
        }
      } catch (error) {
        logger.error(`   ❌ Failed to lookup business code:`, error.message);
        logger.warn(`   ⚠️  Falling back to ObjectId for database name`);
        businessCode = businessIdOrCode;
      }
    }

    const dbName = this.getDatabaseName(businessCode);
    
    // Return existing connection if available
    if (this.connections.has(dbName)) {
      logger.debug(`   ♻️  Reusing existing connection: ${dbName}`);
      logger.debug(`================================================\n`);
      return this.connections.get(dbName);
    }

    // Create new connection
    logger.debug(`   🔗 Creating new database connection`);
    logger.debug(`   Database Name: ${dbName}`);

    const uri = this.baseUri.includes('?')
      ? this.baseUri.replace('?', `/${dbName}?`)
      : `${this.baseUri}/${dbName}`;
    
    logger.debug(`   URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    let connection;
    try {
      connection = mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 60000, // 60s for Railway cold start
        monitorCommands: true,
      });
      // Properly wait for connection (not just 200ms - connection can take 30s+ on cold start)
      await connection.asPromise();
      registerSlowQueryMonitoring(connection);

      // Verify connection state
      if (connection.readyState !== 1) {
        throw new Error(`Connection not ready. State: ${connection.readyState}`);
      }
      
      // Verify the actual database name
      const actualDbName = connection.db.databaseName;
      logger.debug(`   Actual DB Name: ${actualDbName}`);
      
      if (actualDbName !== dbName) {
        logger.error(`   ❌ DATABASE NAME MISMATCH!`);
        logger.error(`   Expected: ${dbName}`);
        logger.error(`   Got: ${actualDbName}`);
        await connection.close();
        throw new Error(`Database creation failed: expected ${dbName} but got ${actualDbName}`);
      }
      
      logger.debug(`   ✅ Database name verified`);
    } catch (error) {
      logger.error(`   ❌ Connection failed:`, error.message);
      if (connection) {
        try {
          await connection.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }
      throw new Error(`Failed to connect to ${dbName}: ${error.message}`);
    }

    // Store connection
    this.connections.set(dbName, connection);
    
    logger.debug(`✅ Connected to business database: ${dbName}`);
    logger.debug(`================================================\n`);
    
    return connection;
  }

  /**
   * Get the main database connection (for businesses, users, admins)
   * @returns {Promise<mongoose.Connection>} - Main database connection
   */
  async getMainConnection() {
    const mainDbName = 'ease_my_salon_main';
    
    // Return existing connection if available
    if (this.connections.has(mainDbName)) {
      logger.debug(`♻️  Reusing existing main database connection`);
      return this.connections.get(mainDbName);
    }

    logger.debug(`\n🔗 Connecting to main database: ${mainDbName}`);

    const uri = this.baseUri.includes('?')
      ? this.baseUri.replace('?', `/${mainDbName}?`)
      : `${this.baseUri}/${mainDbName}`;
    
    logger.debug(`   URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    
    let connection;
    try {
      connection = mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 60000, // 60s for Railway cold start
        monitorCommands: true,
      });
      // Properly wait for connection (not just 200ms - Railway cold start can take 30s+)
      await connection.asPromise();
      registerSlowQueryMonitoring(connection);

      // Verify connection state
      if (connection.readyState !== 1) {
        throw new Error(`Connection not ready. State: ${connection.readyState}`);
      }
      
      // Verify the database name
      const actualDbName = connection.db.databaseName;
      logger.debug(`   Actual DB Name: ${actualDbName}`);
      
      if (actualDbName !== mainDbName) {
        logger.error(`   ❌ MAIN DATABASE NAME MISMATCH!`);
        logger.error(`   Expected: ${mainDbName}`);
        logger.error(`   Got: ${actualDbName}`);
        await connection.close();
        throw new Error(`Main database connection failed: expected ${mainDbName} but got ${actualDbName}`);
      }

      this.connections.set(mainDbName, connection);
      logger.debug(`✅ Connected to main database: ${actualDbName}\n`);
      
      return connection;
    } catch (error) {
      logger.error(`   ❌ Main connection failed:`, error.message);
      logger.error(`   Error stack:`, error.stack);
      if (connection) {
        try {
          await connection.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }
      throw new Error(`Failed to connect to main database: ${error.message}`);
    }
  }

  /**
   * Close a specific business database connection
   * @param {string} businessCode - The business code (e.g., "BIZ0001")
   */
  async closeConnection(businessCode) {
    const dbName = this.getDatabaseName(businessCode);
    if (this.connections.has(dbName)) {
      await this.connections.get(dbName).close();
      this.connections.delete(dbName);
      logger.debug(`🔌 Closed connection to: ${dbName}`);
    }
  }

  /**
   * Delete a business database completely
   * @param {string} businessCode - The business code (e.g., "BIZ0001")
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  async deleteDatabase(businessCode) {
    try {
      const dbName = this.getDatabaseName(businessCode);
      
      logger.debug(`\n🗑️  Deleting business database: ${dbName}`);
      
      // Close connection if open
      if (this.connections.has(dbName)) {
        await this.closeConnection(businessCode);
      }
      
      // Get main connection to access admin commands
      const mainConnection = await this.getMainConnection();
      
      // Use the database connection to drop it
      const dbToDelete = mainConnection.useDb(dbName);
      await dbToDelete.dropDatabase();
      
      logger.debug(`✅ Deleted business database: ${dbName}\n`);
      return true;
    } catch (error) {
      logger.error(`❌ Error deleting database ${businessCode}:`, error.message);
      throw error;
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections() {
    logger.debug(`\n🔌 Closing all database connections...`);
    for (const [dbName, connection] of this.connections) {
      await connection.close();
      logger.debug(`   Closed: ${dbName}`);
    }
    this.connections.clear();
    logger.debug(`✅ All connections closed\n`);
  }

  /**
   * Get all active connections
   * @returns {Array} - List of active database names
   */
  getActiveConnections() {
    return Array.from(this.connections.keys());
  }
}

// Export singleton instance
module.exports = new DatabaseManager();
