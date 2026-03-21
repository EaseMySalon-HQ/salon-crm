const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const { registerSlowQueryMonitoring } = require('../utils/mongoose-slow-query');

/**
 * Build MongoDB URI for main database (same logic as database-manager)
 * Railway MongoDB requires authSource=admin
 */
function buildMainDbUri() {
  const fullUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const [uriWithoutQuery, queryParams] = fullUri.split('?');
  const uriParts = uriWithoutQuery.split('/');

  let baseUri;
  if (uriParts.length > 3) {
    baseUri = uriParts.slice(0, -1).join('/');
  } else {
    baseUri = uriWithoutQuery;
  }

  if (queryParams) {
    baseUri = `${baseUri}?${queryParams}`;
  } else {
    baseUri = `${baseUri}?authSource=admin`;
  }

  return baseUri.includes('?')
    ? baseUri.replace('?', '/ease_my_salon_main?')
    : `${baseUri}/ease_my_salon_main`;
}

const connectDB = async () => {
  const uri = buildMainDbUri();
  const maxRetries = 3;
  const retryDelayMs = 5000;
  const serverSelectionTimeoutMs = 60000; // 60s for Railway cold start

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`🔄 MongoDB connection attempt ${attempt}/${maxRetries}...`);
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: serverSelectionTimeoutMs,
        monitorCommands: true,
      });
      registerSlowQueryMonitoring(mongoose.connection);
      logger.info(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${attempt} failed:`, error.message);
      if (attempt < maxRetries) {
        logger.info(`⏳ Retrying in ${retryDelayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        logger.error('MongoDB connection error:', error);
        process.exit(1);
      }
    }
  }
};

module.exports = connectDB;
