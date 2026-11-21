/**
 * test-database.js – Phase 2 verification script
 * ───────────────────────────────────────────────
 * Run from the backend/ directory:   node test-database.js
 *
 * This script tests every requirement from Phase 2 Task 5.
 * It uses the REAL database (blogspace.db) so results reflect
 * actual production behaviour, not a mock.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { dbRun, dbGet, dbAll, initializeDatabase, closeDatabase } = require('./config/database');

const DB_PATH = path.resolve(__dirname, process.env.DB_PATH || './blogspace.db');

let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  ✅ PASS: ${label}`);
}

function fail(label, detail) {
  failed++;
  console.error(`  ❌ FAIL: ${label}`);
  if (detail) console.error(`         ${detail}`);
}

async function runTests() {
  console.log('\n🧪 BlogSpace Phase 2 – Database Tests');
  console.log('═'.repeat(50));

  // ── Test 1: Database file created ──
  console.log('\n── Test 1: Database file exists ──');
  await initializeDatabase();

  if (fs.existsSync(DB_PATH)) {
    const stats = fs.statSync(DB_PATH);
    ok(`Database file exists (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    fail('Database file does not exist at ' + DB_PATH);
  }

  // ── Test 2: Both tables exist ──
  console.log('\n── Test 2: Tables exist ──');
  const tables = await dbAll(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'blogs') ORDER BY name"
  );
  const tableNames = tables.map(t => t.name);

  if (tableNames.includes('users')) ok('users table exists');
  else fail('users table missing');

  if (tableNames.includes('blogs')) ok('blogs table exists');
  else fail('blogs table missing');

  // ── Test 3: All expected columns exist ──
  console.log('\n── Test 3: Column verification ──');

  const userCols = await dbAll("PRAGMA table_info(users)");
  const userColNames = userCols.map(c => c.name);
  const expectedUserCols = ['id', 'name', 'email', 'password', 'created_at'];
  for (const col of expectedUserCols) {
    if (userColNames.includes(col)) ok(`users.${col} exists`);
    else fail(`users.${col} missing`);
  }

  const blogCols = await dbAll("PRAGMA table_info(blogs)");
  const blogColNames = blogCols.map(c => c.name);
  const expectedBlogCols = [
    'id', 'title', 'description', 'content', 'category',
    'author_id', 'author', 'image', 'status', 'featured',
    'read_time', 'created_at', 'updated_at'
  ];
  for (const col of expectedBlogCols) {
    if (blogColNames.includes(col)) ok(`blogs.${col} exists`);
    else fail(`blogs.${col} missing`);
  }

  // ── Test 4: Unique email constraint ──
  console.log('\n── Test 4: Unique email constraint ──');
  // Insert a test user
  await dbRun(
    'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
    ['Test User', 'unique-test@example.com', 'hashedpassword123']
  );
  ok('First insert with email succeeded');

  try {
    await dbRun(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      ['Duplicate User', 'unique-test@example.com', 'anotherpassword']
    );
    fail('Duplicate email was allowed (should have been rejected)');
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      ok('Duplicate email correctly rejected: ' + err.message);
    } else {
      fail('Unexpected error on duplicate email', err.message);
    }
  }

  // Clean up test user
  await dbRun('DELETE FROM users WHERE email = ?', ['unique-test@example.com']);

  // ── Test 5: Foreign key constraint ──
  console.log('\n── Test 5: Foreign key constraint ──');
  // Verify PRAGMA is on
  const fk = await dbGet('PRAGMA foreign_keys');
  if (fk.foreign_keys === 1) ok('Foreign keys are ON');
  else fail('Foreign keys are OFF');

  // Try inserting a blog with a non-existent author_id
  try {
    await dbRun(
      `INSERT INTO blogs (title, author_id, author) VALUES (?, ?, ?)`,
      ['FK Test Post', 99999, 'Nobody']
    );
    fail('Foreign key violation was allowed (author_id=99999 should not exist)');
  } catch (err) {
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      ok('Foreign key constraint enforced: ' + err.message);
    } else {
      fail('Unexpected error on FK violation', err.message);
    }
  }

  // Verify NULL author_id is allowed (for seed posts)
  try {
    await dbRun(
      `INSERT INTO blogs (title, author_id, author) VALUES (?, NULL, ?)`,
      ['FK Null Test', 'Test Author']
    );
    ok('NULL author_id allowed (correct for seed posts)');
    // Clean up
    await dbRun('DELETE FROM blogs WHERE title = ?', ['FK Null Test']);
  } catch (err) {
    fail('NULL author_id rejected', err.message);
  }

  // ── Test 6: Invalid blog status rejected ──
  console.log('\n── Test 6: Status CHECK constraint ──');
  try {
    await dbRun(
      `INSERT INTO blogs (title, status) VALUES (?, ?)`,
      ['Status Test', 'archived']
    );
    fail('Invalid status "archived" was allowed (should be rejected by CHECK)');
    await dbRun('DELETE FROM blogs WHERE title = ?', ['Status Test']);
  } catch (err) {
    if (err.message.includes('CHECK constraint failed')) {
      ok('Invalid status "archived" correctly rejected');
    } else {
      fail('Unexpected error on invalid status', err.message);
    }
  }

  // Verify valid statuses work
  for (const validStatus of ['published', 'draft']) {
    try {
      await dbRun(
        `INSERT INTO blogs (title, status) VALUES (?, ?)`,
        [`Valid Status ${validStatus}`, validStatus]
      );
      ok(`Status "${validStatus}" accepted`);
      await dbRun('DELETE FROM blogs WHERE title = ?', [`Valid Status ${validStatus}`]);
    } catch (err) {
      fail(`Status "${validStatus}" rejected`, err.message);
    }
  }

  // ── Test 7: Seed posts inserted ──
  console.log('\n── Test 7: Seed posts present ──');
  const seedPosts = await dbAll('SELECT * FROM blogs WHERE author_id IS NULL');
  if (seedPosts.length === 8) {
    ok(`All 8 seed posts present`);
  } else {
    fail(`Expected 8 seed posts, found ${seedPosts.length}`);
  }

  // Verify specific fields from the first seed post
  const first = await dbGet(
    'SELECT * FROM blogs WHERE title = ?',
    ['Why I stopped memorising syntax and started reading source code']
  );
  if (first) {
    ok(`First seed post found: "${first.title.substring(0, 40)}..."`);
    if (first.category === 'Technology') ok('Category preserved: Technology');
    else fail('Category mismatch', `Expected Technology, got ${first.category}`);
    if (first.author === 'Ananya Rawat') ok('Author preserved: Ananya Rawat');
    else fail('Author mismatch', `Expected Ananya Rawat, got ${first.author}`);
    if (first.featured === 1) ok('Featured flag preserved: 1');
    else fail('Featured mismatch', `Expected 1, got ${first.featured}`);
    if (first.read_time === 6) ok('Read time preserved: 6');
    else fail('Read time mismatch', `Expected 6, got ${first.read_time}`);
  } else {
    fail('Could not find first seed post by title');
  }

  // ── Test 8: Idempotent seeding (no duplicates on restart) ──
  console.log('\n── Test 8: Idempotent seeding ──');
  const countBefore = await dbGet('SELECT COUNT(*) as count FROM blogs WHERE author_id IS NULL');

  // Run seeding again
  const { seedBlogs } = require('./models/Blog');
  await seedBlogs();

  const countAfter = await dbGet('SELECT COUNT(*) as count FROM blogs WHERE author_id IS NULL');
  if (countBefore.count === countAfter.count) {
    ok(`Re-seeding produced no duplicates (still ${countAfter.count} seed posts)`);
  } else {
    fail(`Duplicates created: ${countBefore.count} → ${countAfter.count}`);
  }

  // ── Test 9: Data persists (verify by reading back) ──
  console.log('\n── Test 9: Data persistence ──');
  const allBlogs = await dbAll('SELECT id, title, category FROM blogs ORDER BY id');
  if (allBlogs.length >= 8) {
    ok(`${allBlogs.length} posts readable from database`);
    console.log('      Posts in database:');
    allBlogs.forEach(b => console.log(`        [${b.id}] ${b.category} — ${b.title.substring(0, 50)}`));
  } else {
    fail(`Expected at least 8 posts, got ${allBlogs.length}`);
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(50));
  console.log(`🏁 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed === 0) {
    console.log('🎉 All Phase 2 tests passed!\n');
  } else {
    console.log('⚠️  Some tests failed. Review the output above.\n');
  }

  await closeDatabase();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('💥 Test runner crashed:', err);
  process.exit(1);
});
