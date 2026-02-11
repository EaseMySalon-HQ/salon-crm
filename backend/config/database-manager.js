const mongoose = require('mongoose');

class DatabaseManager {
  constructor() {
    this.connections = new Map(); // Store active connections

    const fullUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    
    console.log(`\n🔧 ===== DatabaseManager Initialization =====`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Full URI: ${fullUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    try {
      // Parse URI and remove any database name, preserve query parameters
      const [uriWithoutQuery, queryParams] = fullUri.split('?');
      const uriParts = uriWithoutQuery.split('/');
      
      console.log(`   URI parts count: ${uriParts.length}`);

      if (uriParts.length > 3) {
        // Has database name, remove it
        this.baseUri = uriParts.slice(0, -1).join('/');
        console.log(`   ✂️  Removed database name from URI`);
      } else {
        // No database name in URI
        this.baseUri = uriWithoutQuery;
        console.log(`   ℹ️  No database name to remove`);
      }

      // Preserve or add query parameters
      if (queryParams) {
        this.baseUri = `${this.baseUri}?${queryParams}`;
        console.log(`   ✅ Preserved query parameters`);
      } else {
        // If no query params exist, add authSource=admin for Railway MongoDB
        // This is needed because Railway MongoDB users are created in the admin database
        this.baseUri = `${this.baseUri}?authSource=admin`;
        console.log(`   ✅ Added authSource=admin for authentication`);
      }
    } catch (error) {
      console.error('   ⚠️  Error parsing MONGODB_URI:', error.message);
      this.baseUri = fullUri.split('?')[0];
    }

    // Validate base URI
    if (!this.baseUri || this.baseUri === 'mongodb:' || this.baseUri === 'mongodb+srv:') {
      console.warn('   ⚠️  Invalid base URI, using fallback');
      this.baseUri = 'mongodb://localhost:27017';
    }
    
    console.log(`   Base URI: ${this.baseUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    console.log(`✅ DatabaseManager initialized`);
    console.log(`==========================================\n`);
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

    console.log(`\n🔍 ===== Getting Business Database Connection =====`);
    console.log(`   Input: ${businessIdOrCode}`);

    // Determine if input is a business code (starts with letters) or ObjectId (hex string)
    const isBusinessCode = /^[A-Z]/.test(businessIdOrCode);
    let businessCode = businessIdOrCode;

    console.log(`   Type: ${isBusinessCode ? 'Business Code' : 'ObjectId'}`);

    // If ObjectId provided, try to look up business code
    if (!isBusinessCode && mainConnection) {
      try {
        console.log(`   🔍 Looking up business code for ObjectId...`);
        const Business = mainConnection.model('Business', require('../models/Business').schema);
        const business = await Business.findById(businessIdOrCode).select('code');
        
        if (business && business.code) {
          businessCode = business.code;
          console.log(`   ✅ Found business code: ${businessCode}`);
        } else {
          console.warn(`   ⚠️  Business found but no code! Will use ObjectId for database name.`);
          businessCode = businessIdOrCode;
        }
      } catch (error) {
        console.error(`   ❌ Failed to lookup business code:`, error.message);
        console.warn(`   ⚠️  Falling back to ObjectId for database name`);
        businessCode = businessIdOrCode;
      }
    }

    const dbName = this.getDatabaseName(businessCode);
    
    // Return existing connection if available
    if (this.connections.has(dbName)) {
      console.log(`   ♻️  Reusing existing connection: ${dbName}`);
      console.log(`================================================\n`);
      return this.connections.get(dbName);
    }

    // Create new connection
    console.log(`   🔗 Creating new database connection`);
    console.log(`   Database Name: ${dbName}`);

    const uri = this.baseUri.includes('?')
      ? this.baseUri.replace('?', `/${dbName}?`)
      : `${this.baseUri}/${dbName}`;
    
    console.log(`   URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    let connection;
    try {
      connection = mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 60000, // 60s for Railway cold start
      });
      // Properly wait for connection (not just 200ms - connection can take 30s+ on cold start)
      await connection.asPromise();
      
      // Verify connection state
      if (connection.readyState !== 1) {
        throw new Error(`Connection not ready. State: ${connection.readyState}`);
      }
      
      // Verify the actual database name
      const actualDbName = connection.db.databaseName;
      console.log(`   Actual DB Name: ${actualDbName}`);
      
      if (actualDbName !== dbName) {
        console.error(`   ❌ DATABASE NAME MISMATCH!`);
        console.error(`   Expected: ${dbName}`);
        console.error(`   Got: ${actualDbName}`);
        await connection.close();
        throw new Error(`Database creation failed: expected ${dbName} but got ${actualDbName}`);
      }
      
      console.log(`   ✅ Database name verified`);
    } catch (error) {
      console.error(`   ❌ Connection failed:`, error.message);
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
    
    console.log(`✅ Connected to business database: ${dbName}`);
    console.log(`================================================\n`);
    
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
      console.log(`♻️  Reusing existing main database connection`);
      return this.connections.get(mainDbName);
    }

    console.log(`\n🔗 Connecting to main database: ${mainDbName}`);

    const uri = this.baseUri.includes('?')
      ? this.baseUri.replace('?', `/${mainDbName}?`)
      : `${this.baseUri}/${mainDbName}`;
    
    console.log(`   URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    
    let connection;
    try {
      connection = mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 60000, // 60s for Railway cold start
      });
      // Properly wait for connection (not just 200ms - Railway cold start can take 30s+)
      await connection.asPromise();
      
      // Verify connection state
      if (connection.readyState !== 1) {
        throw new Error(`Connection not ready. State: ${connection.readyState}`);
      }
      
      // Verify the database name
      const actualDbName = connection.db.databaseName;
      console.log(`   Actual DB Name: ${actualDbName}`);
      
      if (actualDbName !== mainDbName) {
        console.error(`   ❌ MAIN DATABASE NAME MISMATCH!`);
        console.error(`   Expected: ${mainDbName}`);
        console.error(`   Got: ${actualDbName}`);
        await connection.close();
        throw new Error(`Main database connection failed: expected ${mainDbName} but got ${actualDbName}`);
      }

      this.connections.set(mainDbName, connection);
      console.log(`✅ Connected to main database: ${actualDbName}\n`);
      
      return connection;
    } catch (error) {
      console.error(`   ❌ Main connection failed:`, error.message);
      console.error(`   Error stack:`, error.stack);
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
      console.log(`🔌 Closed connection to: ${dbName}`);
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
      
      console.log(`\n🗑️  Deleting business database: ${dbName}`);
      
      // Close connection if open
      if (this.connections.has(dbName)) {
        await this.closeConnection(businessCode);
      }
      
      // Get main connection to access admin commands
      const mainConnection = await this.getMainConnection();
      
      // Use the database connection to drop it
      const dbToDelete = mainConnection.useDb(dbName);
      await dbToDelete.dropDatabase();
      
      console.log(`✅ Deleted business database: ${dbName}\n`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting database ${businessCode}:`, error.message);
      throw error;
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections() {
    console.log(`\n🔌 Closing all database connections...`);
    for (const [dbName, connection] of this.connections) {
      await connection.close();
      console.log(`   Closed: ${dbName}`);
    }
    this.connections.clear();
    console.log(`✅ All connections closed\n`);
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
