/**
 * routes/authRoutes.js – Authentication Routes
 * ─────────────────────────────────────────────
 * Defines URL endpoints for authentication and delegates
 * request handling to `authController`.
 *
 * ENDPOINTS:
 *   POST /api/auth/register  -> Public: Register a new user
 *   POST /api/auth/login     -> Public: Login with email & password
 *   GET  /api/auth/me        -> Protected: Fetch current user profile
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Public endpoints
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected endpoints (require valid JWT)
router.get('/me', authMiddleware, authController.getMe);

// Additional routes for profile and password management
router.put('/profile', authMiddleware, authController.updateProfile);
router.put('/password', authMiddleware, authController.changePassword);

module.exports = router;
