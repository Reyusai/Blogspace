/**
 * test-frontend-integration.js – Phase 5 End-to-End Frontend Integration Verification
 * ───────────────────────────────────────────────────────────────────────────────────
 * Tests the exact operations performed by the frontend UI:
 *   1. User registration from frontend client
 *   2. Session persistence (storing token & user)
 *   3. Profile verification (/api/auth/me)
 *   4. Public blog browsing (filters & search)
 *   5. Full article view (/api/blogs/:id)
 *   6. Article creation (published & draft)
 *   7. Article update (editing owned article)
 *   8. Article deletion (removing owned article)
 *   9. Owner-only draft view vs public draft rejection
 *  10. Session restoration & logout
 */

const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'frontend_integration_test_secret_2026';
process.env.JWT_EXPIRES_IN = '1h';

require('dotenv').config();

const http = require('http');
const { initializeDatabase, closeDatabase } = require('./config/database');
const { User } = require('./models/User');
const { Blog } = require('./models/Blog');
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

async function runFrontendIntegrationTests() {
  console.log('\n🧪 BlogSpace Phase 5 – Frontend Integration Tests');
  console.log('═'.repeat(60));

  await initializeDatabase();
  await User.deleteMany({ email: { $in: ['integration@blogspace.io', 'isha.patel@example.com'] } });
  await Blog.deleteMany({ author: { $in: ['Integration User', 'Isha Patel'] } });

  await new Promise((resolve) => {
    serverInstance = app.listen(0, () => {
      serverPort = serverInstance.address().port;
      console.log(`🚀 Ephemeral server listening on port ${serverPort}\n`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Frontend Registration Flow (register.html -> api.register)
    // -------------------------------------------------------------
    console.log('── Step 1: Frontend Registration Flow ──');
    const regRes = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        name: 'Integration User',
        email: 'integration@blogspace.io',
        password: 'Password123!'
      }
    });

    if (regRes.status === 201 && regRes.data?.token && regRes.data?.user) {
      ok('Frontend register flow returns token and user payload');
    } else fail('Frontend register flow failed', JSON.stringify(regRes.data));

    const token = regRes.data.token;
    const user = regRes.data.user;

    // -------------------------------------------------------------
    // Test 2: Frontend Session Verification (api.getMe)
    // -------------------------------------------------------------
    console.log('\n── Step 2: Session Restoration Flow ──');
    const meRes = await apiRequest({
      method: 'GET',
      path: '/api/auth/me',
      token
    });

    if (meRes.status === 200 && meRes.data?.user?.email === 'integration@blogspace.io') {
      ok('Session restoration via GET /api/auth/me succeeds with valid token');
    } else fail('Session restoration failed');

    // -------------------------------------------------------------
    // Test 3: Public Blog Browsing (index.html -> api.getBlogs)
    // -------------------------------------------------------------
    console.log('\n── Step 3: Public Homepage Browsing Flow ──');
    const blogsRes = await apiRequest({
      method: 'GET',
      path: '/api/blogs?page=1&limit=10'
    });

    let firstSeedId = null;
    if (blogsRes.status === 200 && blogsRes.data?.blogs?.length === 8) {
      firstSeedId = blogsRes.data.blogs[0].id;
      ok('Homepage loads all 8 published seed articles from backend API');
    } else fail('Homepage blog fetch failed');

    // Category filter check
    const catRes = await apiRequest({
      method: 'GET',
      path: '/api/blogs?category=Technology'
    });
    if (catRes.status === 200 && catRes.data?.blogs?.every(b => b.category === 'Technology')) {
      ok('Category filter chip correctly filters Technology articles');
    } else fail('Category filter failed');

    // Search filter check
    const searchRes = await apiRequest({
      method: 'GET',
      path: '/api/blogs?search=grid'
    });
    if (searchRes.status === 200 && searchRes.data?.blogs?.length > 0) {
      ok('Search input correctly queries backend by keyword');
    } else fail('Search query failed');

    // -------------------------------------------------------------
    // Test 4: Article Reading (article.html -> api.getBlog)
    // -------------------------------------------------------------
    console.log('\n── Step 4: Article Detail View Flow ──');
    const articleRes = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${firstSeedId}`
    });

    if (articleRes.status === 200 && articleRes.data?.blog?.id === firstSeedId) {
      ok('Full article view loads seed post with complete details');
    } else fail('Full article view failed');

    // -------------------------------------------------------------
    // Test 5: Article Creation (create-blog.html -> api.createBlog)
    // -------------------------------------------------------------
    console.log('\n── Step 5: Article Creation Flow ──');
    const createRes = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token,
      body: {
        title: 'Fullstack JavaScript Journey',
        category: 'Career',
        description: 'Reflections from frontend to backend integration.',
        content: 'Building fullstack applications requires clear data boundaries...',
        status: 'published'
      }
    });

    if (createRes.status === 201 && createRes.data?.blog?.author_id === user.id) {
      ok('Authenticated author successfully creates new published article');
    } else fail('Article creation failed');

    const createdPost = createRes.data.blog;

    // -------------------------------------------------------------
    // Test 6: Draft Article Creation (create-blog.html status=draft)
    // -------------------------------------------------------------
    console.log('\n── Step 6: Draft Creation & Privacy Flow ──');
    const draftRes = await apiRequest({
      method: 'POST',
      path: '/api/blogs',
      token,
      body: {
        title: 'Work in Progress Notes',
        category: 'Productivity',
        description: 'Unpublished thoughts.',
        content: 'Draft content...',
        status: 'draft'
      }
    });

    const draftPost = draftRes.data.blog;
    if (draftRes.status === 201 && draftPost.status === 'draft') {
      ok('Author creates draft post');
    } else fail('Draft creation failed');

    // Public cannot view draft
    const publicDraft = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${draftPost.id}`
    });
    if (publicDraft.status === 404) {
      ok('Public visitor cannot view draft post (returns 404)');
    } else fail('Privacy leak: Draft accessible publicly!');

    // Author CAN view draft
    const ownerDraft = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${draftPost.id}`,
      token
    });
    if (ownerDraft.status === 200 && ownerDraft.data?.blog?.id === draftPost.id) {
      ok('Author can view their own draft');
    } else fail('Author could not view own draft');

    // -------------------------------------------------------------
    // Test 7: Article Editing (create-blog.html?id=... -> api.updateBlog)
    // -------------------------------------------------------------
    console.log('\n── Step 7: Article Editing Flow ──');
    const updateRes = await apiRequest({
      method: 'PUT',
      path: `/api/blogs/${createdPost.id}`,
      token,
      body: {
        title: 'Fullstack JavaScript Journey (Updated)',
        category: 'Technology'
      }
    });

    if (updateRes.status === 200 && updateRes.data?.blog?.title.includes('(Updated)')) {
      ok('Author updates article title and category');
    } else fail('Article update failed');

    // -------------------------------------------------------------
    // Test 8: Article Deletion (dashboard.html -> api.deleteBlog)
    // -------------------------------------------------------------
    console.log('\n── Step 8: Article Deletion Flow ──');
    const deleteRes = await apiRequest({
      method: 'DELETE',
      path: `/api/blogs/${createdPost.id}`,
      token
    });

    if (deleteRes.status === 200 && deleteRes.data?.success === true) {
      ok('Author deletes their own article');
    } else fail('Article deletion failed');

    // Verify gone
    const verifyGone = await apiRequest({
      method: 'GET',
      path: `/api/blogs/${createdPost.id}`
    });
    if (verifyGone.status === 404) {
      ok('Deleted article is no longer reachable');
    } else fail('Deleted article still exists');

  } finally {
    try {
      await User.deleteMany({ email: { $in: ['integration@blogspace.io', 'isha.patel@example.com'] } });
      await Blog.deleteMany({ author: { $in: ['Integration User', 'Isha Patel'] } });
    } catch (e) {}
    if (serverInstance) serverInstance.close();
    await closeDatabase();
    console.log('\n🧹 Integration test data removed.');
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`🏁 Frontend Integration Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed === 0) {
    console.log('🎉 All Frontend Integration flows verified successfully!\n');
  } else {
    console.log('⚠️  Some integration flows failed.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runFrontendIntegrationTests().catch((err) => {
  console.error('Crash in frontend integration tests:', err);
  process.exit(1);
});
