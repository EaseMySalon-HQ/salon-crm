const mongoose = require('mongoose');

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
      console.log(`🔄 MongoDB connection attempt ${attempt}/${maxRetries}...`);
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: serverSelectionTimeoutMs,
      });
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, error.message);
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        console.error('MongoDB connection error:', error);
        process.exit(1);
      }
    }
  }
};

module.exports = connectDB;
