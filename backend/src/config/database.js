/**
 * Database connection configuration
 * Supports MongoDB via Mongoose. Swap for Prisma + PostgreSQL by
 * replacing this file — the rest of the app is unaffected.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

async function connectDatabase() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.warn('MONGODB_URI not set. Running without database (limited functionality).');
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    isConnected = true;
    logger.info('✅ Database connected');

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('Database disconnected — attempting reconnect...');
    });
  } catch (err) {
    logger.error('Database connection failed:', err.message);
    logger.warn('Server starting without database. Set MONGODB_URI to enable persistence.');
  }
}

function getDatabaseStatus() {
  return {
    connected: isConnected,
    state: mongoose.connection.readyState,
  };
}

module.exports = { connectDatabase, getDatabaseStatus };
