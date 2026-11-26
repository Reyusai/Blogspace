/**
 * test-database.js – Phase 2 & Module 03 Database Verification Script
 * ───────────────────────────────────────────────────────────────────
 * Run from the backend/ directory: node test-database.js
 *
 * Verifies MongoDB Atlas connection, User and Blog collections/models,
 * schema paths, unique constraints, status validation, and idempotent seeding.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { initializeDatabase, closeDatabase } = require('./config/database');
const { User } = require('./models/User');
const { Blog, seedBlogs } = require('./models/Blog');

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
  console.log('\n🧪 BlogSpace Phase 2 / Module 03 – Database Tests (MongoDB/Mongoose)');
  console.log('═'.repeat(60));

  // ── Test 1: Connect to MongoDB ──
  console.log('\n── Test 1: MongoDB Connection ──');
  try {
    await initializeDatabase();
    if (mongoose.connection.readyState === 1) {
      ok(`Connected to MongoDB Atlas: ${mongoose.connection.host}/${mongoose.connection.name}`);
    } else {
      fail('MongoDB connection state is not connected');
    }
  } catch (err) {
    fail('Failed to connect to MongoDB', err.message);
    process.exit(1);
  }

  // ── Test 2: Collections exist ──
  console.log('\n── Test 2: Collections / Models exist ──');
  if (mongoose.models.User) ok('User model and collection ready');
  else fail('User model missing');

  if (mongoose.models.Blog) ok('Blog model and collection ready');
  else fail('Blog model missing');

  // ── Test 3: Schema field verification ──
  console.log('\n── Test 3: Schema Path verification ──');
  const expectedUserPaths = ['name', 'email', 'password', 'created_at'];
  for (const p of expectedUserPaths) {
    if (User.schema.path(p)) ok(`User.${p} path exists in schema`);
    else fail(`User.${p} path missing`);
  }

  const expectedBlogPaths = [
    'title', 'description', 'content', 'category',
    'author_id', 'author', 'image', 'status', 'featured',
    'read_time', 'created_at', 'updated_at'
  ];
  for (const p of expectedBlogPaths) {
    if (Blog.schema.path(p)) ok(`Blog.${p} path exists in schema`);
    else fail(`Blog.${p} path missing`);
  }

  // ── Test 4: Unique email constraint ──
  console.log('\n── Test 4: Unique email constraint ──');
  await User.deleteMany({ email: 'unique-test@example.com' });
  const firstUser = new User({
    name: 'Test User',
    email: 'unique-test@example.com',
    password: 'hashedpassword123'
  });
  await firstUser.save();
  ok('First insert with email succeeded');

  try {
    const dupUser = new User({
      name: 'Duplicate User',
      email: 'unique-test@example.com',
      password: 'anotherpassword'
    });
    await dupUser.save();
    fail('Duplicate email was allowed (should have been rejected)');
  } catch (err) {
    if (err.code === 11000 || err.message.includes('E11000')) {
      ok('Duplicate email correctly rejected: E11000 duplicate key error');
    } else {
      fail('Unexpected error on duplicate email', err.message);
    }
  }
  await User.deleteMany({ email: 'unique-test@example.com' });

  // ── Test 5: Foreign key / Author reference check ──
  console.log('\n── Test 5: Author reference structure ──');
  const user = await User.create({
    name: 'Author User',
    email: 'author-check@example.com',
    password: 'password123'
  });
  ok('Created author user for blog association');

  const userBlog = await Blog.create({
    title: 'Author Associated Post',
    description: 'Post with valid author',
    author_id: user._id,
    author: user.name,
    category: 'Technology'
  });
  if (userBlog.author_id.toString() === user._id.toString()) {
    ok('author_id correctly stores and associates with User ObjectId');
  } else {
    fail('author_id mismatch');
  }
  await Blog.deleteOne({ _id: userBlog._id });
  await User.deleteOne({ _id: user._id });

  // Verify NULL author_id is allowed for seed posts
  try {
    const seedPostTest = await Blog.create({
      title: 'FK Null Test Post',
      author_id: null,
      author: 'Seed Author',
      category: 'Technology'
    });
    ok('NULL author_id allowed (correct for seed posts)');
    await Blog.deleteOne({ _id: seedPostTest._id });
  } catch (err) {
    fail('NULL author_id rejected', err.message);
  }

  // ── Test 6: Invalid blog status rejected ──
  console.log('\n── Test 6: Status enum validation ──');
  try {
    const invalidBlog = new Blog({
      title: 'Invalid Status Post',
      author: 'Tester',
      status: 'archived'
    });
    await invalidBlog.validate();
    fail('Invalid status "archived" was allowed (should be rejected by enum)');
  } catch (err) {
    if (err.name === 'ValidationError') {
      ok('Invalid status "archived" correctly rejected by Mongoose enum');
    } else {
      fail('Unexpected error on invalid status', err.message);
    }
  }

  // Verify valid statuses work
  for (const validStatus of ['published', 'draft']) {
    try {
      const b = new Blog({
        title: `Valid Status ${validStatus}`,
        author: 'Tester',
        status: validStatus
      });
      await b.validate();
      ok(`Status "${validStatus}" accepted`);
    } catch (err) {
      fail(`Status "${validStatus}" rejected`, err.message);
    }
  }

  // ── Test 7: Seed posts inserted ──
  console.log('\n── Test 7: Seed posts present ──');
  const seedPosts = await Blog.find({ author_id: null });
  if (seedPosts.length === 8) {
    ok(`All 8 seed posts present`);
  } else {
    fail(`Expected 8 seed posts, found ${seedPosts.length}`);
  }

  // Verify specific fields from the first seed post
  const first = await Blog.findOne({
    title: 'Why I stopped memorising syntax and started reading source code'
  });
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

  // ── Test 8: Idempotent seeding ──
  console.log('\n── Test 8: Idempotent seeding ──');
  const countBefore = await Blog.countDocuments({ author_id: null });
  await seedBlogs();
  const countAfter = await Blog.countDocuments({ author_id: null });
  if (countBefore === countAfter) {
    ok(`Re-seeding produced no duplicates (still ${countAfter} seed posts)`);
  } else {
    fail(`Duplicates created: ${countBefore} → ${countAfter}`);
  }

  // ── Test 9: Data persistence ──
  console.log('\n── Test 9: Data persistence ──');
  const allBlogs = await Blog.find().sort({ created_at: -1 });
  if (allBlogs.length >= 8) {
    ok(`${allBlogs.length} posts readable from database`);
    console.log('      Posts in database:');
    allBlogs.forEach(b => console.log(`        [${b._id}] ${b.category} — ${b.title.substring(0, 45)}`));
  } else {
    fail(`Expected at least 8 posts, got ${allBlogs.length}`);
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(60));
  console.log(`🏁 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed === 0) {
    console.log('🎉 All Phase 2 / Module 03 database tests passed!\n');
  } else {
    console.log('⚠️  Some tests failed. Review output above.\n');
  }

  await closeDatabase();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('💥 Test runner crashed:', err);
  process.exit(1);
});
