/**
 * models/User.js – User Model and Database Queries
 * ─────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Acts as the Data Access Layer (DAL) for users.
 *   Encapsulates all SQL queries related to the `users` table
 *   so controllers never write raw SQL.
 *
 * SECURITY PRACTICES:
 *   • Always uses parameterized queries (?, ?) to prevent SQL injection.
 *   • Helper methods return only safe user projections (excluding password)
 *     unless specifically querying for authentication.
 */

const { dbRun, dbGet } = require('../config/database');

/**
 * Create the users table if it does not already exist.
 * Safe to run on every server restart.
 */
async function createUsersTable() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER  PRIMARY KEY AUTOINCREMENT,
      name       TEXT     NOT NULL,
      email      TEXT     NOT NULL UNIQUE,
      password   TEXT     NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✓ users table ready');
}

/**
 * Find a user by email (returns full user record including password hash).
 * Used internally during login verification.
 * 
 * @param {string} email - Normalized lowercase email address
 * @returns {Promise<Object|null>} Full user row or null
 */
async function findByEmail(email) {
  const row = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
  return row || null;
}

/**
 * Find a safe user by ID (excludes password hash).
 * Used by auth middleware and profile lookups.
 * 
 * @param {number} id - User ID
 * @returns {Promise<Object|null>} Safe user object or null
 */
async function findById(id) {
  const row = await dbGet(
    'SELECT id, name, email, created_at FROM users WHERE id = ?',
    [id]
  );
  return row || null;
}

/**
 * Insert a new user into the database.
 * 
 * @param {Object} userData - { name, email, password (hashed) }
 * @returns {Promise<Object>} Created user object (excluding password)
 */
async function createUser({ name, email, password }) {
  const result = await dbRun(
    'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
    [name, email, password]
  );

  return {
    id: result.lastID,
    name,
    email,
    created_at: new Date().toISOString()
  };
}

/**
 * Helper to strip the password hash from a user object
 * before returning it to the client.
 */
function toSafeUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  createUsersTable,
  findByEmail,
  findById,
  createUser,
  toSafeUser
};
