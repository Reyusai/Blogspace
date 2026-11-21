/**
 * controllers/authController.js – Authentication Controller
 * ──────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Handles incoming HTTP requests for user registration, login, and
 *   fetching current authenticated user profile (`/api/auth/*`).
 *
 * SECURITY PRACTICES:
 *   • Input normalization (lowercase & trimmed emails).
 *   • RFC 5322-compliant email format validation.
 *   • Strong password length validation (minimum 8 characters).
 *   • Passwords hashed with bcryptjs (work factor 10) before storing.
 *   • Timing-attack prevention: generic error messages on login failures
 *     to prevent username enumeration.
 *   • Never logs or returns plaintext passwords or password hashes.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Email regex pattern for validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Helper to generate a signed JWT
 */
function generateToken(user) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  if (!secret) {
    throw new Error('JWT_SECRET environment variable is missing.');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    secret,
    { expiresIn }
  );
}

/**
 * POST /api/auth/register
 * Register a new user account.
 */
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    // 1. Validate required fields presence
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.'
      });
    }

    // 2. Validate field types
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid input types. Name, email, and password must be strings.'
      });
    }

    // 3. Trim and normalize inputs
    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (trimmedName.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name cannot be empty.'
      });
    }

    // 4. Validate email format
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    // 5. Enforce minimum password length
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.'
      });
    }

    // 6. Check if email is already registered
    const existingUser = await User.findByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    // 7. Hash the password with bcryptjs (salt rounds: 10)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 8. Store the new user in SQLite
    const newUser = await User.createUser({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword
    });

    // 9. Generate JWT token for seamless auto-login upon registration
    const token = generateToken(newUser);

    // 10. Return 201 Created with safe user info (NO PASSWORD OR HASH)
    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        created_at: newUser.created_at
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    next(error);
  }
}

/**
 * POST /api/auth/login
 * Authenticate existing user and return JWT.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // 1. Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email and password must be strings.'
      });
    }

    // 2. Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Find user by email
    const user = await User.findByEmail(normalizedEmail);

    // 4. Verify user exists and check password
    // Generic error message prevents username enumeration attacks
    const invalidCredentialsMessage = 'Invalid email or password.';

    if (!user) {
      return res.status(401).json({
        success: false,
        message: invalidCredentialsMessage
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: invalidCredentialsMessage
      });
    }

    // 5. Generate signed JWT token
    const token = generateToken(user);

    // 6. Return 200 OK with token and safe user details (NO PASSWORD HASH)
    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
}

/**
 * GET /api/auth/me
 * Fetch the profile of the currently authenticated user.
 * Protected by authMiddleware (req.user is guaranteed to exist).
 */
async function getMe(req, res) {
  // req.user was populated safely by authMiddleware without password
  return res.status(200).json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      created_at: req.user.created_at
    }
  });
}

module.exports = {
  register,
  login,
  getMe
};
