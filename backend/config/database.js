/**
 * config/database.js – SQLite connection and initialization
 * ─────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Every database interaction in our app flows through this module.
 *   It opens ONE shared SQLite connection, wraps the callback-based
 *   sqlite3 driver in Promises (so we can use async/await everywhere
 *   else), and orchestrates table creation + seeding at startup.
 *
 * KEY CONCEPTS FOR A BEGINNER:
 *   • sqlite3 is callback-based.  We wrap it in Promises so the rest
 *     of the codebase can use modern async/await syntax.
 *   • SQLite disables foreign key checks by default.  We turn them ON
 *     with a PRAGMA so that author_id in blogs must reference a real
 *     user (or be NULL for seed posts).
 *   • initializeDatabase() is called once when the server boots.  It
 *     creates tables IF they don't already exist, then seeds sample
 *     posts idempotently (safe to run many times).
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Resolve the database file path from the .env variable
// path.resolve turns a relative path like "./blogspace.db" into an
// absolute path anchored to the backend/ directory.
const DB_PATH = path.resolve(__dirname, '..', process.env.DB_PATH || './blogspace.db');

// We keep a single connection for the lifetime of the process.
// This avoids opening/closing the file on every query.
let db = null;

// ──────────────────────────────────────────────
// Connection
// ──────────────────────────────────────────────

/**
 * Return the shared database connection, creating it on first call.
 * Enables foreign key enforcement via PRAGMA.
 */
function getDatabase() {
  if (db) return db;

  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ Failed to connect to SQLite database:', err.message);
      process.exit(1);   // Fatal: nothing works without a DB
    }
    console.log(`📂 Connected to SQLite: ${DB_PATH}`);
  });

  // SQLite ignores foreign keys unless you explicitly turn them on
  // for each connection.  This ensures our author_id constraint works.
  db.run('PRAGMA foreign_keys = ON');

  return db;
}

// ──────────────────────────────────────────────
// Promise wrappers
// ──────────────────────────────────────────────
// The sqlite3 package uses old-style callbacks:
//   db.run(sql, params, function(err) { ... })
//
// We wrap each method so we can write:
//   const result = await dbRun('INSERT ...', [values]);
//
// This keeps controller and model code clean and readable.

/**
 * Run a SQL statement that modifies data (INSERT, UPDATE, DELETE)
 * or creates/alters structure (CREATE TABLE).
 * Resolves with { lastID, changes }.
 */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function (err) {
      if (err) reject(err);
      // `this` inside the callback gives us metadata about the operation:
      //   this.lastID  → the rowid of the last INSERT
      //   this.changes → number of rows affected by UPDATE/DELETE
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Fetch a single row.  Returns the row object or undefined.
 * Use for:  SELECT ... WHERE id = ?
 */
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Fetch all matching rows.  Returns an array (possibly empty).
 * Use for:  SELECT * FROM blogs WHERE ...
 */
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ──────────────────────────────────────────────
// Initialization (called once at server boot)
// ──────────────────────────────────────────────

/**
 * Create tables and seed sample data.
 * Safe to call on every restart — uses CREATE TABLE IF NOT EXISTS
 * and idempotent INSERT logic.
 */
async function initializeDatabase() {
  console.log('📦 Initializing database...');

  // Models are required lazily (inside this function, not at the top
  // of the file) to avoid a circular dependency:
  //   database.js  exports dbRun →  User.js requires dbRun
  //   database.js  requires User.js  (would be circular at top level)
  // By requiring here, database.js has already finished exporting by
  // the time User.js/Blog.js try to import from it.
  const { createUsersTable } = require('../models/User');
  const { createBlogsTable, seedBlogs } = require('../models/Blog');

  await createUsersTable();
  await createBlogsTable();
  await seedBlogs();

  // Confirm foreign keys are active
  const fkStatus = await dbGet('PRAGMA foreign_keys');
  console.log(`  ✓ Foreign keys: ${fkStatus.foreign_keys ? 'ON' : 'OFF'}`);

  console.log('✅ Database initialization complete');
}

// ──────────────────────────────────────────────
// Cleanup (graceful shutdown)
// ──────────────────────────────────────────────

/**
 * Close the database connection cleanly.
 * Called during tests or when the server shuts down.
 */
function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) reject(err);
      else {
        db = null;
        resolve();
      }
    });
  });
}

module.exports = {
  getDatabase,
  dbRun,
  dbGet,
  dbAll,
  initializeDatabase,
  closeDatabase
};
