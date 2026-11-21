/**
 * test-auth.js – Phase 3 Automated Authentication Test Suite
 * ───────────────────────────────────────────────────────────
 * Run from backend directory: node test-auth.js
 *
 * SAFETY & ISOLATION:
 *   • Sets process.env.DB_PATH = './blogspace.test.db' so it runs on an
 *     isolated test database and NEVER affects production data or seed posts in blogspace.db.
 *   • Tests full HTTP request/response cycles using an ephemeral server port.
 *   • Cleans up test database upon completion.
 */

const path = require('path');
const fs = require('fs');

// Point to dedicated test database BEFORE requiring any application code
const TEST_DB_PATH = './blogspace.test.db';
process.env.DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_suite_jwt_secret_blogspace_super_safe_key_2026';
process.env.JWT_EXPIRES_IN = '1h';

require('dotenv').config();

const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { initializeDatabase, closeDatabase, dbGet } = require('./config/database');
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

async function runAuthTests() {
  console.log('\n🧪 BlogSpace Phase 3 – Authentication API Tests');
  console.log('═'.repeat(60));

  // Initialize test database
  console.log('📦 Initializing isolated test database at', TEST_DB_PATH);
  await initializeDatabase();

  // Start test HTTP server on random free port
  await new Promise((resolve) => {
    serverInstance = app.listen(0, () => {
      serverPort = serverInstance.address().port;
      console.log(`🚀 Test server listening on ephemeral port ${serverPort}\n`);
      resolve();
    });
  });

  try {
    // =========================================================================
    // SECTION 1: REGISTRATION TESTS (POST /api/auth/register)
    // =========================================================================
    console.log('── Section 1: Registration API Tests ──');

    // 1.1 Successful Registration
    const regRes = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        name: 'Aarav Sharma',
        email: 'Aarav.Sharma@Example.COM', // Test case-insensitive normalization
        password: 'Password123!'
      }
    });

    if (regRes.status === 201) ok('Registration returned HTTP 201 Created');
    else fail('Registration did not return 201', `Got status ${regRes.status}`);

    if (regRes.data?.success === true) ok('Registration response includes success: true');
    else fail('Registration response missing success: true');

    if (regRes.data?.token) ok('Registration response includes JWT token');
    else fail('Registration response missing JWT token');

    if (regRes.data?.user && regRes.data.user.email === 'aarav.sharma@example.com') {
      ok('Email was properly normalized to lowercase');
    } else {
      fail('Email normalization failed', `Got ${regRes.data?.user?.email}`);
    }

    if (regRes.data?.user && !regRes.data.user.password && !regRes.data.user.password_hash) {
      ok('Password and password hash are NEVER exposed in registration response');
    } else {
      fail('Password leaked in registration response!');
    }

    // 1.2 Verify Password is stored as a Bcrypt hash in DB
    const dbUser = await dbGet('SELECT * FROM users WHERE email = ?', ['aarav.sharma@example.com']);
    if (dbUser && dbUser.password.startsWith('$2') && dbUser.password !== 'Password123!') {
      ok('Password stored in database as a secure bcrypt hash');
    } else {
      fail('Password not stored as bcrypt hash in DB!');
    }

    // 1.3 Missing Fields Validation
    const missingName = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { email: 'test@example.com', password: 'Password123!' }
    });
    if (missingName.status === 400 && missingName.data?.success === false) {
      ok('Missing name rejected with HTTP 400');
    } else fail('Missing name was not rejected with 400');

    const missingEmail = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { name: 'Test', password: 'Password123!' }
    });
    if (missingEmail.status === 400 && missingEmail.data?.success === false) {
      ok('Missing email rejected with HTTP 400');
    } else fail('Missing email was not rejected with 400');

    const missingPassword = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { name: 'Test', email: 'test@example.com' }
    });
    if (missingPassword.status === 400 && missingPassword.data?.success === false) {
      ok('Missing password rejected with HTTP 400');
    } else fail('Missing password was not rejected with 400');

    // 1.4 Invalid Email Validation
    const invalidEmail = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { name: 'Test', email: 'not-an-email', password: 'Password123!' }
    });
    if (invalidEmail.status === 400 && invalidEmail.data?.message.includes('valid email')) {
      ok('Invalid email format rejected with HTTP 400');
    } else fail('Invalid email format was not rejected');

    // 1.5 Weak Password Validation (< 8 characters)
    const weakPass = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { name: 'Test', email: 'valid@example.com', password: '123' }
    });
    if (weakPass.status === 400 && weakPass.data?.message.includes('8 characters')) {
      ok('Weak password (< 8 chars) rejected with HTTP 400');
    } else fail('Weak password was not rejected with 400');

    // 1.6 Duplicate Email Rejection
    const duplicateEmail = await apiRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        name: 'Another Aarav',
        email: 'aarav.sharma@example.com', // Duplicate
        password: 'AnotherPassword123!'
      }
    });
    if (duplicateEmail.status === 409 && duplicateEmail.data?.success === false) {
      ok('Duplicate email registration correctly rejected with HTTP 409 Conflict');
    } else {
      fail('Duplicate email not rejected with 409', `Got status ${duplicateEmail.status}`);
    }

    // =========================================================================
    // SECTION 2: LOGIN TESTS (POST /api/auth/login)
    // =========================================================================
    console.log('\n── Section 2: Login API Tests ──');

    // 2.1 Successful Login
    const loginRes = await apiRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: 'AARAV.SHARMA@EXAMPLE.COM', // Test case-insensitive login
        password: 'Password123!'
      }
    });

    if (loginRes.status === 200) ok('Login with valid credentials returned HTTP 200 OK');
    else fail('Login did not return 200', `Got status ${loginRes.status}`);

    if (loginRes.data?.token) ok('Login response contains valid JWT token');
    else fail('Login response missing JWT token');

    if (loginRes.data?.user && !loginRes.data.user.password) {
      ok('Password and hash are NEVER exposed in login response');
    } else fail('Password hash exposed in login response');

    // 2.2 Verify JWT claims
    const decodedToken = jwt.verify(loginRes.data?.token, process.env.JWT_SECRET);
    if (decodedToken && decodedToken.email === 'aarav.sharma@example.com') {
      ok('JWT payload contains correct user claims');
    } else fail('JWT payload is missing expected claims');

    // 2.3 Incorrect Password
    const wrongPass = await apiRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: 'aarav.sharma@example.com',
        password: 'WrongPassword999!'
      }
    });
    if (wrongPass.status === 401 && wrongPass.data?.message === 'Invalid email or password.') {
      ok('Incorrect password rejected with 401 and generic message');
    } else fail('Incorrect password not handled properly', JSON.stringify(wrongPass.data));

    // 2.4 Unknown Email
    const unknownEmail = await apiRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: 'nonexistent.user@example.com',
        password: 'AnyPassword123!'
      }
    });
    if (unknownEmail.status === 401 && unknownEmail.data?.message === 'Invalid email or password.') {
      ok('Unknown email rejected with exact same generic message (anti-enumeration)');
    } else fail('Unknown email gave different error message');

    // 2.5 Missing Credentials
    const missingCreds = await apiRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'aarav.sharma@example.com' }
    });
    if (missingCreds.status === 400) ok('Missing password rejected with HTTP 400');
    else fail('Missing password was not rejected with 400');

    // =========================================================================
    // SECTION 3: AUTHENTICATION MIDDLEWARE TESTS
    // =========================================================================
    console.log('\n── Section 3: Authentication Middleware Tests ──');

    const validToken = loginRes.data?.token;

    // 3.1 Valid Token Request
    const meValid = await apiRequest({
      method: 'GET',
      path: '/api/auth/me',
      token: validToken
    });
    if (meValid.status === 200 && meValid.data?.user?.email === 'aarav.sharma@example.com') {
      ok('Valid token allows access to protected route GET /api/auth/me');
    } else fail('Valid token was rejected', JSON.stringify(meValid.data));

    // 3.2 Missing Token
    const meMissingToken = await apiRequest({
      method: 'GET',
      path: '/api/auth/me'
    });
    if (meMissingToken.status === 401) ok('Missing token rejected with HTTP 401');
    else fail('Missing token was not rejected with 401');

    // 3.3 Invalid / Tampered Token
    const meInvalidToken = await apiRequest({
      method: 'GET',
      path: '/api/auth/me',
      token: 'this.is.a.completely.tampered.token'
    });
    if (meInvalidToken.status === 401 && meInvalidToken.data?.message.includes('Invalid')) {
      ok('Tampered/malformed token rejected with HTTP 401');
    } else fail('Tampered token was not rejected with 401');

    // 3.4 Expired Token Test
    const expiredToken = jwt.sign(
      { id: dbUser.id, email: dbUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // Expired 1 second ago
    );
    const meExpiredToken = await apiRequest({
      method: 'GET',
      path: '/api/auth/me',
      token: expiredToken
    });
    if (meExpiredToken.status === 401 && meExpiredToken.data?.message.includes('expired')) {
      ok('Expired token explicitly rejected with HTTP 401 and expiration message');
    } else fail('Expired token not rejected properly', JSON.stringify(meExpiredToken.data));

    // =========================================================================
    // SECTION 4: CURRENT USER PROFILE TESTS (GET /api/auth/me)
    // =========================================================================
    console.log('\n── Section 4: Current User API (GET /api/auth/me) Tests ──');

    if (meValid.data?.user?.id === dbUser.id) ok('User ID matches authenticated user');
    else fail('User ID mismatch in /api/auth/me');

    if (meValid.data?.user?.name === 'Aarav Sharma') ok('User name matches authenticated user');
    else fail('User name mismatch in /api/auth/me');

    if (meValid.data?.user?.created_at) ok('User created_at timestamp is present');
    else fail('created_at is missing in /api/auth/me');

    if (!meValid.data?.user?.password && !meValid.data?.user?.password_hash) {
      ok('Password and hash are NEVER returned in GET /api/auth/me');
    } else fail('Password hash exposed in GET /api/auth/me!');

  } finally {
    // Teardown test server and database
    if (serverInstance) {
      serverInstance.close();
    }
    await closeDatabase();

    // Clean up the isolated test database file
    const resolvedTestDb = path.resolve(__dirname, TEST_DB_PATH);
    if (fs.existsSync(resolvedTestDb)) {
      try {
        fs.unlinkSync(resolvedTestDb);
        console.log('\n🧹 Isolated test database safely removed:', TEST_DB_PATH);
      } catch (err) {
        console.warn('Note: Could not remove test database file:', err.message);
      }
    }
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(60));
  console.log(`🏁 Phase 3 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed === 0) {
    console.log('🎉 All Authentication API tests passed successfully!\n');
  } else {
    console.log('⚠️  Some tests failed. Review the output above.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAuthTests().catch((err) => {
  console.error('💥 Test suite crashed:', err);
  process.exit(1);
});
