/**
 * config/database.js – MongoDB Atlas connection and initialization via Mongoose
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Every database interaction in our app flows through this module.
 *   It manages the shared Mongoose connection to MongoDB Atlas,
 *   initializes indexes, and orchestrates idempotent seeding at startup.
 */

const mongoose = require('mongoose');

let isConnected = false;

/**
 * Return the active Mongoose database connection
 */
function getDatabase() {
  return mongoose.connection;
}

/**
 * Initialize MongoDB connection and seed sample data.
 * Called once when the server boots.
 */
async function initializeDatabase(customUri) {
  const uri = customUri || process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Please define MONGODB_URI in backend/.env with your MongoDB Atlas connection string.'
    );
  }

  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return mongoose.connection;
  }

  console.log('📦 Initializing database...');
  await mongoose.connect(uri);
  isConnected = true;
  console.log('📂 Connected to MongoDB Atlas via Mongoose');

  const { createUsersTable } = require('../models/User');
  const { createBlogsTable, seedBlogs } = require('../models/Blog');

  await createUsersTable();
  await createBlogsTable();
  await seedBlogs();

  console.log('✅ Database initialization complete');
  return mongoose.connection;
}

/**
 * Close the database connection cleanly.
 * Called during tests or when the server shuts down.
 */
async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    isConnected = false;
  }
}

// Stubs for backward compatibility with any direct query calls
async function dbRun() {
  throw new Error('dbRun is deprecated. Use Mongoose models directly.');
}
async function dbGet() {
  throw new Error('dbGet is deprecated. Use Mongoose models directly.');
}
async function dbAll() {
  throw new Error('dbAll is deprecated. Use Mongoose models directly.');
}

module.exports = {
  getDatabase,
  initializeDatabase,
  closeDatabase,
  dbRun,
  dbGet,
  dbAll
};
