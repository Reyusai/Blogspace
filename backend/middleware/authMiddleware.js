/**
 * middleware/authMiddleware.js – JWT Authentication Verification
 * ─────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Protects private API routes by verifying the caller's JSON Web Token.
 *   Provides:
 *     1. authMiddleware: Strict protection (rejects if token is missing/invalid)
 *     2. optionalAuthMiddleware: Soft authentication (populates req.user if token
 *        is valid, but allows unauthenticated access for public routes like GET /api/blogs/:id)
 *
 * SECURITY PRACTICES:
 *   • Never trusts user-supplied IDs in request body/params. The authenticated
 *     identity ALWAYS comes from the cryptographically verified JWT payload.
 *   • Re-checks the database to ensure the user still exists (invalidating
 *     tokens of deleted accounts).
 *   • Returns clear 401 Unauthorized responses without leaking sensitive internals.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Strict authentication middleware:
 * Requires a valid Bearer token. Returns 401 if missing, invalid, or expired.
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // 1. Check if the Authorization header is present and properly formatted
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authorization token provided.'
      });
    }

    // 2. Extract token from header ("Bearer <token>")
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Malformed authorization token.'
      });
    }

    // 3. Verify the token using the server's secret key
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('CRITICAL: JWT_SECRET environment variable is not defined.');
      return res.status(500).json({
        success: false,
        message: 'Internal server configuration error.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Authentication token has expired. Please log in again.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.'
      });
    }

    // 4. Ensure decoded token contains a valid user ID
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.'
      });
    }

    // 5. Verify the user still exists in the database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account associated with this token no longer exists.'
      });
    }

    // 6. Attach the safe user object to req.user for controllers to access
    req.user = user;

    next();
  } catch (error) {
    console.error('Auth middleware unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication check failed.'
    });
  }
}

/**
 * Optional authentication middleware:
 * If an Authorization header is supplied, validates it and populates req.user.
 * If no Authorization header is present, sets req.user = null and continues.
 * If an invalid or expired token is passed, rejects with 401.
 */
async function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      req.user = null;
      return next();
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('CRITICAL: JWT_SECRET environment variable is not defined.');
      return res.status(500).json({
        success: false,
        message: 'Internal server configuration error.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Authentication token has expired. Please log in again.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.'
      });
    }

    if (decoded && decoded.id) {
      const user = await User.findById(decoded.id);
      req.user = user || null;
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(error);
  }
}

module.exports = authMiddleware;
module.exports.authMiddleware = authMiddleware;
module.exports.optionalAuthMiddleware = optionalAuthMiddleware;
