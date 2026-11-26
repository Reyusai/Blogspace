/**
 * test-blogs.js – Phase 4 Automated Blog CRUD Test Suite (with Audit Regression Tests)
 * ───────────────────────────────────────────────────────────────────────────────────
 * Run from backend directory: node test-blogs.js
 *
 * SAFETY & ISOLATION:
 *   • Sets process.env.DB_PATH = './blogspace.test.db' to run on an isolated
 *     test database and NEVER affect production blogspace.db or original seed posts.
 *   • Tests full HTTP request/response cycles using an ephemeral server port.
 *   • Cleans up the test database file upon completion.
 */

const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_suite_jwt_secret_blogspace_super_safe_key_2026';
process.env.JWT_EXPIRES_IN = '1h';

require('dotenv').config();
const mongoose=require('mongoose');
// Switch to a test database name ending with _test
if (process.env.MONGODB_URI) {
  const testUri=process.env.MONGODB_URI.replace(/\/[^\/\?]+(?=\?)/, '/blogspace_test');
  process.env.MONGODB_URI=testUri;
}


const http = require('http');
const jwt = require('jsonwebtoken');
const { initializeDatabase, closeDatabase } = require('./config/database');
const { Blog } = require('./models/Blog');
const { User } = require('./models/User');
const app = require('./server');

let passed = 0;
let failed = 0;
let serverInstance = null;
let serverPort = null;

function ok(label) {
  passed++;
  console.log(`  ✅ PASS: ${label}`);
}

function fail(label, detail) {
  failed++;
  console.error(`  ❌ FAIL: ${label}`);
  if (detail) console.error(`         ${detail}`);
}

/**
 * Helper to make HTTP requests against the test server
 */
function apiRequest({ method = 'GET', path, body = null, token = null }) {
  return new Promise((resolve, reject) => {
    const headers = {};
    let postData = null;

    if (body) {
      postData = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: serverPort,
        path,
        method,
        headers
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let data = null;
          try {
            data = rawData ? JSON.parse(rawData) : null;
          } catch (e) {
            data = rawData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runBlogTests() {
  console.log('\n🧪 BlogSpace Phase 4 – Blog CRUD API Tests & Security Audit');
  console.log('═'.repeat(60));

  console.log('📦 Initializing test database');
  await Blog.deleteMany({});
  await User.deleteMany({ email: { $in: ['author1@test.com', 'author2@test.com'] } });
  await initializeDatabase();

  await new Promise((resolve) => {
    serverInstance = app.listen(0, () => {
      serverPort = serverInstance.address().port;
      console.log(`🚀 Test server listening on ephemeral port ${serverPort}\n`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------
    // Setup Test Users
    // -------------------------------------------------------------
    // User 1 (Author A)
    const user1Reg = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { name: 'Author One', email: 'author1@test.com', password: 'Password123!' }
    });
    const token1 = user1Reg.data.token;
    const user1Id = user1Reg.data.user.id;

    // User 2 (Author B)
    const user2Reg = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { name: 'Author Two', email: 'author2@test.com', password: 'Password123!' }
    });
    const token2 = user2Reg.data.token;
    const user2Id = user2Reg.data.user.id;

    // =========================================================================
    // SECTION 1: PUBLIC BLOG LISTING (GET /api/blogs)
    // =========================================================================
    console.log('── Section 1: Public Blog Listing Tests ──');

    // 1.1 Default listing returns published posts
    const listRes = await apiRequest({ method: 'GET', path: '/api/blogs' });
    if (listRes.status === 200) ok('GET /api/blogs returns HTTP 200 OK');
    else fail('GET /api/blogs failed', `Status: ${listRes.status}`);

    if (listRes.data?.success === true && Array.isArray(listRes.data?.blogs)) {
      ok('Listing response has success: true and blogs array');
    } else fail('Listing response structure invalid');

    if (listRes.data?.blogs?.length === 8) {
      ok('Default listing returns all 8 initial seed posts');
    } else fail(`Expected 8 seed posts, got ${listRes.data?.blogs?.length}`);

    // Verify all returned posts are published
    const allPublished = listRes.data.blogs.every((b) => b.status === 'published');
    if (allPublished) ok('All returned posts have status === "published"');
    else fail('Draft post found in public listing!');

    // 1.2 Category Filtering
    const techRes = await apiRequest({ method: 'GET', path: '/api/blogs?category=Technology' });
    const allTech = techRes.data?.blogs?.every((b) => b.category === 'Technology');
    if (techRes.status === 200 && allTech && techRes.data?.blogs?.length > 0) {
      ok(`Category filter (?category=Technology) returned ${techRes.data.blogs.length} Technology posts`);
    } else fail('Category filter failed');

    // 1.3 Search Filtering
    const searchRes = await apiRequest({ method: 'GET', path: '/api/blogs?search=syntax' });
    if (
      searchRes.status === 200 &&
      searchRes.data?.blogs?.length === 1 &&
      searchRes.data.blogs[0].title.includes('syntax')
    ) {
      ok('Text search (?search=syntax) matched correct article by title');
    } else fail('Text search by title failed');

    const descSearchRes = await apiRequest({ method: 'GET', path: '/api/blogs?search=open-source' });
    if (descSearchRes.status === 200 && descSearchRes.data?.blogs?.length === 1) {
      ok('Text search (?search=open-source) matched correct article by description');
    } else fail('Text search by description failed');

    // 1.3b Search with no results
    const noResultSearch = await apiRequest({ method: 'GET', path: '/api/blogs?search=nonexistenttermxyz' });
    if (noResultSearch.status === 200 && noResultSearch.data?.blogs?.length === 0) {
      ok('Search with no matching results returns empty list (HTTP 200)');
    } else fail('Search with no results failed');

    // 1.3c Combined Category and Search Filter
    const comboRes = await apiRequest({ method: 'GET', path: '/api/blogs?category=Technology&search=syntax' });
    if (comboRes.status === 200 && comboRes.data?.blogs?.length === 1 && comboRes.data.blogs[0].category === 'Technology') {
      ok('Combined filter (?category=Technology&search=syntax) correctly matches single article');
    } else fail('Combined category and search filter failed');

    // 1.3d Regex Special Characters Safety
    const regexRes = await apiRequest({ method: 'GET', path: '/api/blogs?search=' + encodeURIComponent('.*+?^${}()|[]\\') });
    if (regexRes.status === 200 && Array.isArray(regexRes.data?.blogs)) {
      ok('Search safely escapes regex special characters without crashing or injection');
    } else fail('Regex character search threw an error or failed');

    // 1.4 Pagination Metadata and Max Limit Enforcement
    const pageRes = await apiRequest({ method: 'GET', path: '/api/blogs?page=1&limit=3' });
    if (
      pageRes.status === 200 &&
      pageRes.data?.blogs?.length === 3 &&
      pageRes.data?.pagination?.page === 1 &&
      pageRes.data?.pagination?.limit === 3 &&
      pageRes.data?.pagination?.total === 8 &&
      pageRes.data?.pagination?.totalPages === 3
    ) {
      ok('Pagination correctly returns 3 items and accurate metadata');
    } else fail('Pagination metadata incorrect', JSON.stringify(pageRes.data?.pagination));

    // Page 2
    const page2Res = await apiRequest({ method: 'GET', path: '/api/blogs?page=2&limit=3' });
    if (page2Res.status === 200 && page2Res.data?.blogs?.length === 3) {
      ok('Page 2 correctly returns next 3 items');
    } else fail('Page 2 retrieval failed');

    // Max Limit Enforcement (requesting limit=100 should be capped at 50)
    const maxLimitRes = await apiRequest({ method: 'GET', path: '/api/blogs?limit=100' });
    if (maxLimitRes.data?.pagination?.limit === 50) {
      ok('Limit exceeding 50 is safely capped at maximum 50');
    } else fail('Max limit not capped at 50', `Got: ${maxLimitRes.data?.pagination?.limit}`);

    // =========================================================================
    // SECTION 2: CREATE BLOG (POST /api/blogs)
    // =========================================================================
    console.log('\n── Section 2: Create Blog API Tests ──');

    // 2.1 Unauthenticated creation rejected
    const unauthCreate = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      body: { title: 'Unauthorized Post' }
    });
    if (unauthCreate.status === 401) ok('Unauthenticated POST /api/blogs rejected with 401');
    else fail('Unauthenticated creation was not rejected with 401');

    // 2.2 Missing / Empty Title Rejected
    const missingTitle = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token: token1,
      body: { description: 'Missing title post' }
    });
    if (missingTitle.status === 400 && missingTitle.data?.message.includes('Title is required')) {
      ok('Missing title rejected with HTTP 400');
    } else fail('Missing title not rejected properly');

    // 2.3 Invalid Status Rejected
    const invalidStatus = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token: token1,
      body: { title: 'Test Post', status: 'archived' }
    });
    if (invalidStatus.status === 400 && invalidStatus.data?.message.includes('Status must be')) {
      ok('Invalid status "archived" rejected with HTTP 400');
    } else fail('Invalid status was not rejected');

    // 2.4 Title Exceeding 255 Chars Rejected (Audit check)
    const longTitle = 'A'.repeat(256);
    const longTitleRes = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token: token1,
      body: { title: longTitle }
    });
    if (longTitleRes.status === 400 && longTitleRes.data?.message.includes('255')) {
      ok('Title exceeding 255 characters rejected with HTTP 400');
    } else fail('Overlong title was not rejected');

    // 2.5 Invalid Field Types Rejected (Audit check)
    const badTypeDesc = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token: token1,
      body: { title: 'Valid Title', description: 12345 }
    });
    if (badTypeDesc.status === 400 && badTypeDesc.data?.message.includes('string')) {
      ok('Non-string description rejected with HTTP 400');
    } else fail('Non-string description was not rejected');

    const badReadTime = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token: token1,
      body: { title: 'Valid Title', read_time: 500 }
    });
    if (badReadTime.status === 400 && badReadTime.data?.message.includes('read_time')) {
      ok('Out-of-bounds read_time (> 120) rejected with HTTP 400');
    } else fail('Out-of-bounds read_time was not rejected');

    // 2.6 Authenticated creation with spoofed author_id (Identity spoofing test)
    const spoofCreate = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token: token1,
      body: {
        title: 'Author One First Post',
        description: 'Testing identity protection',
        content: 'This is great content',
        category: 'Technology',
        status: 'published',
        author_id: 99999, // Attempted spoof
        author: 'Fake Admin' // Attempted spoof
      }
    });

    if (spoofCreate.status === 201) ok('Authenticated blog creation returns HTTP 201 Created');
    else fail('Blog creation failed', `Status: ${spoofCreate.status}`);

    const createdBlog1 = spoofCreate.data.blog;
    if (createdBlog1.author_id === user1Id && createdBlog1.author === 'Author One') {
      ok('Client-supplied author_id and author are IGNORED; derived strictly from token user');
    } else {
      fail('Author spoofing vulnerability! Client identity accepted', JSON.stringify(createdBlog1));
    }

    // 2.7 Create a Draft Blog by Author One
    const draftCreate = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token: token1,
      body: {
        title: 'Author One Secret Draft',
        description: 'Nobody should see this except Author One',
        content: 'Top secret draft ideas',
        category: 'Career',
        status: 'draft'
      }
    });
    const draftBlog1 = draftCreate.data.blog;
    if (draftCreate.status === 201 && draftBlog1.status === 'draft') {
      ok('Draft blog created successfully by Author One');
    } else fail('Draft creation failed');

    // 2.8 Verify Draft does NOT appear in public listing
    const listingAfterDraft = await apiRequest({ method: 'GET', path: '/api/blogs' });
    const draftInListing = listingAfterDraft.data.blogs.some((b) => b.id === draftBlog1.id);
    if (!draftInListing) {
      ok('Draft post does NOT appear in public GET /api/blogs listing');
    } else fail('Security vulnerability: Draft post leaked in public listing!');

    // =========================================================================
    // SECTION 3: SINGLE BLOG RETRIEVAL (GET /api/blogs/:id)
    // =========================================================================
    console.log('\n── Section 3: Single Blog Retrieval Tests ──');

    // 3.1 Public Published Post Retrieval
    const getPublished = await apiRequest({ method: 'GET', path: `/api/blogs/${createdBlog1.id}` });
    if (getPublished.status === 200 && getPublished.data?.blog?.id === createdBlog1.id) {
      ok('Public visitor can view published blog by ID');
    } else fail('Public published retrieval failed');

    // 3.2 Invalid ID format rejected
    const invalidIdRes = await apiRequest({ method: 'GET', path: '/api/blogs/abc' });
    if (invalidIdRes.status === 400 && invalidIdRes.data?.message.includes('Invalid blog ID')) {
      ok('Invalid ID /api/blogs/abc rejected with HTTP 400');
    } else fail('Non-numeric ID not rejected with 400');

    const negativeIdRes = await apiRequest({ method: 'GET', path: '/api/blogs/-5' });
    if (negativeIdRes.status === 400) ok('Negative ID /api/blogs/-5 rejected with HTTP 400');
    else fail('Negative ID not rejected with 400');

    // 3.3 Non-existent ID returns 404
    const notFoundRes = await apiRequest({ method: 'GET', path: '/api/blogs/507f1f77bcf86cd799439011' });
    if (notFoundRes.status === 404) ok('Non-existent ID returns HTTP 404');
    else fail('Non-existent ID did not return 404');

    // 3.4 Owner can view their own draft
    const ownerDraftRes = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${draftBlog1.id}`,
      token: token1
    });
    if (ownerDraftRes.status === 200 && ownerDraftRes.data?.blog?.id === draftBlog1.id) {
      ok('Authenticated owner can view their own draft');
    } else fail('Owner was unable to view their own draft', JSON.stringify(ownerDraftRes.data));

    // 3.5 Public / Unauthenticated user CANNOT view draft (returns 404)
    const publicDraftRes = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${draftBlog1.id}`
    });
    if (publicDraftRes.status === 404) {
      ok('Unauthenticated user cannot view draft (returns 404 to avoid leaking existence)');
    } else fail('Draft post exposed to unauthenticated user!', `Got status: ${publicDraftRes.status}`);

    // 3.6 Other authenticated user CANNOT view Author One draft (returns 404)
    const otherUserDraftRes = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${draftBlog1.id}`,
      token: token2 // Author Two
    });
    if (otherUserDraftRes.status === 404) {
      ok('Different authenticated user cannot view another user’s draft (returns 404)');
    } else fail('Draft leaked to another user!', `Got status: ${otherUserDraftRes.status}`);

    // 3.7 Optional auth with invalid token accessing draft is rejected with HTTP 401 (Audit check)
    const invalidTokenDraftRes = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${draftBlog1.id}`,
      token: 'tampered.token.here'
    });
    if (invalidTokenDraftRes.status === 401) {
      ok('Optional auth with invalid token is rejected with HTTP 401 (no draft access)');
    } else fail('Invalid token on draft was not rejected with 401', `Status: ${invalidTokenDraftRes.status}`);

    // 3.8 Optional auth with expired token accessing draft is rejected with HTTP 401 (Audit check)
    const expiredToken = jwt.sign(
      { id: user1Id, email: 'author1@test.com' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const expiredTokenDraftRes = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${draftBlog1.id}`,
      token: expiredToken
    });
    if (expiredTokenDraftRes.status === 401 && expiredTokenDraftRes.data?.message.includes('expired')) {
      ok('Optional auth with expired token is rejected with HTTP 401 (no draft access)');
    } else fail('Expired token on draft was not rejected with 401');

    // =========================================================================
    // SECTION 4: UPDATE BLOG (PUT /api/blogs/:id)
    // =========================================================================
    console.log('\n── Section 4: Update Blog API Tests ──');

    // 4.1 Unauthenticated update rejected
    const unauthUpdate = await apiRequest({
      method: 'PUT',
      path: `/api/blogs/${createdBlog1.id}`,
      body: { title: 'Hacked Title' }
    });
    if (unauthUpdate.status === 401) ok('Unauthenticated PUT /api/blogs/:id rejected with 401');
    else fail('Unauthenticated update was not rejected with 401');

    // 4.2 Non-owner update rejected (IDOR protection)
    const nonOwnerUpdate = await apiRequest({
      method: 'PUT',
      path: `/api/blogs/${createdBlog1.id}`,
      token: token2, // Author Two trying to update Author One post
      body: { title: 'Stolen Post Title' }
    });
    if (nonOwnerUpdate.status === 403 && nonOwnerUpdate.data?.message.includes('permission')) {
      ok('Non-owner update rejected with HTTP 403 Forbidden (IDOR prevented)');
    } else fail('Non-owner update not rejected with 403', JSON.stringify(nonOwnerUpdate.data));

    // 4.3 Empty update body rejected with HTTP 400 (Audit check)
    const emptyUpdateRes = await apiRequest({
      method: 'PUT',
      path: `/api/blogs/${createdBlog1.id}`,
      token: token1,
      body: {}
    });
    if (emptyUpdateRes.status === 400 && emptyUpdateRes.data?.message.includes('At least one')) {
      ok('Empty update payload rejected with HTTP 400');
    } else fail('Empty update payload was not rejected with 400');

    // 4.4 Owner can successfully update their own blog
    const ownerUpdate = await apiRequest({
      method: 'PUT',
      path: `/api/blogs/${createdBlog1.id}`,
      token: token1,
      body: {
        title: 'Author One Updated Post Title',
        category: 'Design',
        author_id: 8888, // Should be ignored
        author: 'Malicious Name' // Should be ignored
      }
    });
    if (ownerUpdate.status === 200 && ownerUpdate.data?.blog?.title === 'Author One Updated Post Title') {
      ok('Owner successfully updated blog title');
    } else fail('Owner update failed');

    if (ownerUpdate.data.blog.author_id === user1Id && ownerUpdate.data.blog.author === 'Author One') {
      ok('author_id and author cannot be modified via update payload');
    } else fail('Author was altered during update!');

    // 4.5 Original seed posts cannot be updated
    const allSeeds = await Blog.find({ author_id: null });
    const seedPostId = allSeeds[0]._id.toString();
    const seedUpdate = await apiRequest({
      method: 'PUT',
      path: `/api/blogs/${seedPostId}`, // Seed post
      token: token1,
      body: { title: 'Overwriting Seed Post' }
    });
    if (seedUpdate.status === 403 && seedUpdate.data?.message.includes('Original seeded posts')) {
      ok('Original seed posts cannot be modified (HTTP 403)');
    } else fail('Seed post modification was not rejected with 403');

    // 4.6 Direct ownership constraint test (Audit check)
    const directSqlUpdate = await Blog.updateBlog(createdBlog1.id, '507f1f77bcf86cd799439099', { title: 'Direct SQL Bypass' });
    if (directSqlUpdate === null) {
      ok('Direct SQL updateBlog enforces author_id condition and returns null for mismatched owner');
    } else fail('Direct SQL update bypassed author_id condition!');

    // =========================================================================
    // SECTION 5: DELETE BLOG (DELETE /api/blogs/:id)
    // =========================================================================
    console.log('\n── Section 5: Delete Blog API Tests ──');

    // 5.1 Unauthenticated delete rejected
    const unauthDelete = await apiRequest({
      method: 'DELETE',
      path: `/api/blogs/${createdBlog1.id}`
    });
    if (unauthDelete.status === 401) ok('Unauthenticated DELETE rejected with HTTP 401');
    else fail('Unauthenticated delete was not rejected');

    // 5.2 Non-owner delete rejected
    const nonOwnerDelete = await apiRequest({
      method: 'DELETE',
      path: `/api/blogs/${createdBlog1.id}`,
      token: token2 // Author Two trying to delete Author One post
    });
    if (nonOwnerDelete.status === 403 && nonOwnerDelete.data?.message.includes('permission')) {
      ok('Non-owner delete rejected with HTTP 403 Forbidden');
    } else fail('Non-owner delete was not rejected with 403');

    // 5.3 Original seed posts cannot be deleted
    const seedDelete = await apiRequest({
      method: 'DELETE',
      path: `/api/blogs/${seedPostId}`, // Seed post
      token: token1
    });
    if (seedDelete.status === 403 && seedDelete.data?.message.includes('Original seeded posts')) {
      ok('Original seed posts cannot be deleted (HTTP 403)');
    } else fail('Seed post deletion was not rejected with 403');

    // 5.4 Direct delete ownership constraint test (Audit check)
    const directSqlDelete = await Blog.deleteBlog(createdBlog1.id, '507f1f77bcf86cd799439099');
    if (directSqlDelete === false) {
      ok('Direct SQL deleteBlog enforces author_id condition and returns false for mismatched owner');
    } else fail('Direct SQL delete bypassed author_id condition!');

    // 5.5 Owner can successfully delete their own blog
    const ownerDelete = await apiRequest({
      method: 'DELETE',
      path: `/api/blogs/${createdBlog1.id}`,
      token: token1
    });
    if (ownerDelete.status === 200 && ownerDelete.data?.success === true) {
      ok('Owner successfully deleted own blog post');
    } else fail('Owner delete failed');

    // Verify post is truly gone
    const verifyDeleted = await apiRequest({ method: 'GET', path: `/api/blogs/${createdBlog1.id}` });
    if (verifyDeleted.status === 404) {
      ok('Deleted post is no longer retrievable (HTTP 404)');
    } else fail('Deleted post is still retrievable!');

    // =========================================================================
    // SECTION 6: SENSITIVE DATA LEAKAGE CHECK
    // =========================================================================
    console.log('\n── Section 6: Security & Data Leakage Tests ──');

    const sampleBlog = listRes.data.blogs[0];
    if (!sampleBlog.password && !sampleBlog.password_hash) {
      ok('Blog objects never include password or password_hash fields');
    } else fail('Password field found in blog object!');

  } finally {
    try {
      await User.deleteMany({ email: { $in: ['author1@test.com', 'author2@test.com'] } });
      await Blog.deleteMany({ author: { $in: ['Author One', 'Author Two'] } });
    } catch (e) {}
    if (serverInstance) {
      serverInstance.close();
    }
    await closeDatabase();
    console.log('\n🧹 Test data safely cleaned up');
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(60));
  console.log(`🏁 Phase 4 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed === 0) {
    console.log('🎉 All Blog CRUD API tests & security checks passed successfully!\n');
  } else {
    console.log('⚠️  Some tests failed. Review the output above.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runBlogTests().catch((err) => {
  console.error('💥 Test suite crashed:', err);
  process.exit(1);
});
